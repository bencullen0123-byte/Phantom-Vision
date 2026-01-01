import Stripe from "stripe";
import { storage } from "../storage";
import { decrypt, vaultDiagnostic } from "../utils/crypto";
import type { Merchant } from "@shared/schema";

// Diagnostic Shell Constants
const THROTTLE_BATCH_SIZE = 50;        // Log telemetry every N records
const THROTTLE_DELAY_MS = 200;         // Delay after every THROTTLE_BATCH_SIZE records
const RATE_LIMIT_RETRY_MS = 2000;      // 2-second sleep on rate limit
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// Telemetry State
interface TelemetryState {
  startTime: number;
  recordsProcessed: number;
  peakRssMb: number;
  lastEncryptMs: number;
  totalUpsertMs: number;
  upsertCount: number;
  totalPaymentEvents: number;
  subscriptionLinked: number;
  subscriptionFailed: number;
  impendingRiskTally: number;
  impendingCount: number;
}

// Intelligent Decline Branching: Categorize Stripe decline codes
// Soft codes: temporary issues that may resolve (retry-friendly)
const SOFT_CODES = new Set([
  "insufficient_funds",
  "card_velocity_exceeded",
  "try_again_later",
  "processing_error",
  "reenter_transaction",
  "do_not_honor", // Often temporary
]);

// Hard codes: permanent issues requiring customer card update
const HARD_CODES = new Set([
  "expired_card",
  "lost_card",
  "stolen_card",
  "incorrect_number",
  "invalid_cvc",
  "card_not_supported",
  "card_declined", // Generic decline, treat as hard
  "pickup_card",
]);

function categorizeDeclineCode(code: string | null | undefined): { declineType: 'soft' | 'hard' | null; failureReason: string | null } {
  if (!code) {
    return { declineType: null, failureReason: null };
  }
  
  if (SOFT_CODES.has(code)) {
    return { declineType: 'soft', failureReason: code };
  }
  
  if (HARD_CODES.has(code)) {
    return { declineType: 'hard', failureReason: code };
  }
  
  // Unknown codes default to soft (more conservative approach)
  return { declineType: 'soft', failureReason: code };
}

interface FailureDetails {
  failureCode: string | null;
  failureMessage: string | null;
}

interface GhostResult {
  email: string;
  customerName: string;
  amount: number;
  invoiceId: string;
  customerId: string;
  failureCode?: string | null;
  failureMessage?: string | null;
}

interface ScanResult {
  merchantId: string;
  ghostsFound: GhostResult[];
  oracleDataPoints: number;
  totalRevenueAtRisk: number;
  grossInvoicedCents: number;
  errors: string[];
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRssMb(): number {
  const usage = process.memoryUsage();
  return Math.round(usage.rss / (1024 * 1024) * 10) / 10;
}

function logTelemetryHeartbeat(telemetry: TelemetryState): void {
  const elapsed = Date.now() - telemetry.startTime;
  const avgUpsertMs = telemetry.upsertCount > 0 
    ? Math.round(telemetry.totalUpsertMs / telemetry.upsertCount * 100) / 100 
    : 0;
  
  console.log(
    `[PHANTOM-CORE] Index: ${telemetry.recordsProcessed} | ` +
    `RAM: ${getRssMb()}MB | ` +
    `Encrypt: ${telemetry.lastEncryptMs}ms | ` +
    `Avg UPSERT: ${avgUpsertMs}ms | ` +
    `Elapsed: ${elapsed}ms`
  );
  
  // Update peak RSS
  const currentRss = getRssMb();
  if (currentRss > telemetry.peakRssMb) {
    telemetry.peakRssMb = currentRss;
  }
}

function isStripeRateLimitError(error: any): boolean {
  return error?.statusCode === 429 || 
         error?.type === 'StripeRateLimitError' ||
         error?.code === 'rate_limit';
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  backoff: number = INITIAL_BACKOFF_MS
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && isStripeRateLimitError(error)) {
      console.log(`[GHOST HUNTER] StripeRateLimitError detected, sleeping ${RATE_LIMIT_RETRY_MS}ms before retry...`);
      await delay(RATE_LIMIT_RETRY_MS);
      return withRetry(fn, retries - 1, backoff * 2);
    }
    throw error;
  }
}

function createMerchantStripeClient(accessToken: string): Stripe {
  return new Stripe(accessToken, {
    apiVersion: "2025-12-15.clover",
  });
}

// Extract failure details from Payment Intent's last_payment_error
async function extractFailureFromPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string | null
): Promise<FailureDetails> {
  if (!paymentIntentId) {
    return { failureCode: null, failureMessage: null };
  }

  try {
    const paymentIntent = await withRetry(() =>
      stripe.paymentIntents.retrieve(paymentIntentId)
    );

    const lastError = paymentIntent.last_payment_error;
    if (!lastError) {
      return { failureCode: null, failureMessage: null };
    }

    // Extract code: prefer decline_code, fallback to code
    const failureCode = lastError.decline_code || lastError.code || null;
    const failureMessage = lastError.message || null;

    return { failureCode, failureMessage };
  } catch (error: any) {
    console.log(`[GHOST HUNTER] Could not fetch PaymentIntent ${paymentIntentId}: ${error.message}`);
    return { failureCode: null, failureMessage: null };
  }
}

async function getDecryptedToken(merchant: Merchant): Promise<string> {
  return decrypt(merchant.encryptedToken, merchant.iv, merchant.tag);
}

async function checkCustomerHasActiveSubscription(
  stripe: Stripe,
  customerId: string
): Promise<boolean> {
  try {
    const subscriptions = await withRetry(() =>
      stripe.subscriptions.list({
        customer: customerId,
        limit: 10,
      })
    );

    return subscriptions.data.some(
      sub => sub.status === "active" || sub.status === "past_due"
    );
  } catch (error: any) {
    console.error(`[GHOST HUNTER] Failed to check subscriptions for ${customerId}:`, error.message);
    return false;
  }
}

function extractPaymentTimingData(invoice: Stripe.Invoice): { dayOfWeek: number; hourOfDay: number } | null {
  if (invoice.status !== "paid" || !invoice.status_transitions?.paid_at) {
    return null;
  }

  const paidAt = new Date(invoice.status_transitions.paid_at * 1000);
  return {
    dayOfWeek: paidAt.getUTCDay(),
    hourOfDay: paidAt.getUTCHours(),
  };
}

// Proactive Expiry Detection: Check if card expires this month or next
function isCardExpiringWithinWindow(expMonth: number, expYear: number): boolean {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // JS months are 0-indexed
  const currentYear = now.getFullYear();
  
  // Check if expiring this month
  if (expYear === currentYear && expMonth === currentMonth) {
    return true;
  }
  
  // Check if expiring next month (handle year rollover)
  let nextMonth = currentMonth + 1;
  let nextYear = currentYear;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear = currentYear + 1;
  }
  
  if (expYear === nextYear && expMonth === nextMonth) {
    return true;
  }
  
  return false;
}

interface ImpendingRiskResult {
  email: string;
  customerName: string;
  amount: number;
  subscriptionId: string;
  customerId: string;
  expMonth: number;
  expYear: number;
}

async function scanForImpendingRisks(
  stripe: Stripe,
  merchantId: string,
  telemetry: TelemetryState
): Promise<{ risks: ImpendingRiskResult[]; currency: string | null }> {
  const risks: ImpendingRiskResult[] = [];
  let detectedCurrency: string | null = null;
  
  console.log(`[GHOST HUNTER] Starting PROACTIVE EXPIRY DETECTION for merchant: ${merchantId}`);
  
  let hasMore = true;
  let startingAfter: string | undefined;
  
  while (hasMore) {
    try {
      const params: Stripe.SubscriptionListParams = {
        status: 'active',
        limit: 100,
        expand: ['data.default_payment_method', 'data.customer'],
      };
      if (startingAfter) {
        params.starting_after = startingAfter;
      }
      
      const subscriptions = await withRetry(() => stripe.subscriptions.list(params));
      
      for (const subscription of subscriptions.data) {
        // Get payment method details
        const paymentMethod = subscription.default_payment_method;
        
        if (!paymentMethod || typeof paymentMethod === 'string') {
          continue; // Need expanded payment method object
        }
        
        // Only process card payment methods
        if (paymentMethod.type !== 'card' || !paymentMethod.card) {
          continue;
        }
        
        const { exp_month, exp_year } = paymentMethod.card;
        
        // Check if card is expiring within window
        if (!isCardExpiringWithinWindow(exp_month, exp_year)) {
          continue;
        }
        
        // Extract customer details
        const customer = subscription.customer;
        let email = 'unknown';
        let customerName = 'Unknown Customer';
        
        if (typeof customer === 'object' && customer) {
          email = (customer as Stripe.Customer).email || 'unknown';
          customerName = (customer as Stripe.Customer).name || email || 'Unknown Customer';
        }
        
        // Calculate MRR from subscription items
        let mrr = 0;
        for (const item of subscription.items.data) {
          const price = item.price;
          if (price.recurring) {
            const amount = price.unit_amount || 0;
            const quantity = item.quantity || 1;
            
            // Normalize to monthly amount
            if (price.recurring.interval === 'month') {
              mrr += amount * quantity;
            } else if (price.recurring.interval === 'year') {
              mrr += Math.round((amount * quantity) / 12);
            } else if (price.recurring.interval === 'week') {
              mrr += Math.round((amount * quantity) * 4.33);
            } else if (price.recurring.interval === 'day') {
              mrr += Math.round((amount * quantity) * 30);
            }
          }
        }
        
        // Capture currency from subscription
        if (!detectedCurrency && subscription.currency) {
          detectedCurrency = subscription.currency.toLowerCase();
        }
        
        const customerId = typeof customer === 'string' ? customer : customer?.id || 'unknown';
        
        risks.push({
          email,
          customerName,
          amount: mrr,
          subscriptionId: subscription.id,
          customerId,
          expMonth: exp_month,
          expYear: exp_year,
        });
        
        telemetry.impendingCount++;
        telemetry.impendingRiskTally += mrr;
        
        console.log(`[GHOST HUNTER] Impending risk detected: ${email}, MRR: ${(mrr / 100).toFixed(2)}, card expires ${exp_month}/${exp_year}`);
      }
      
      hasMore = subscriptions.has_more;
      if (hasMore && subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
      }
      
    } catch (error: any) {
      console.error(`[GHOST HUNTER] Error scanning subscriptions for impending risks:`, error.message);
      break;
    }
  }
  
  console.log(`[GHOST HUNTER] Proactive scan complete: ${risks.length} impending risks, ${(telemetry.impendingRiskTally / 100).toFixed(2)} MRR at risk`);
  
  return { risks, currency: detectedCurrency };
}

export async function scanMerchant(merchantId: string, forceSync: boolean = false): Promise<ScanResult & { telemetry?: TelemetryState }> {
  const result: ScanResult & { telemetry?: TelemetryState } = {
    merchantId,
    ghostsFound: [],
    oracleDataPoints: 0,
    totalRevenueAtRisk: 0,
    grossInvoicedCents: 0,
    errors: [],
  };

  // Initialize telemetry state
  const telemetry: TelemetryState = {
    startTime: Date.now(),
    recordsProcessed: 0,
    peakRssMb: getRssMb(),
    lastEncryptMs: 0,
    totalUpsertMs: 0,
    upsertCount: 0,
    totalPaymentEvents: 0,
    subscriptionLinked: 0,
    subscriptionFailed: 0,
    impendingRiskTally: 0,
    impendingCount: 0,
  };

  console.log(`[GHOST HUNTER] Starting DEEP HARVEST scan for merchant: ${merchantId}`);
  console.log(`[PHANTOM-CORE] ═══════════════════════════════════════════════════`);
  console.log(`[PHANTOM-CORE] DIAGNOSTIC SHELL ACTIVE`);
  console.log(`[PHANTOM-CORE] Throttle: ${THROTTLE_DELAY_MS}ms every ${THROTTLE_BATCH_SIZE} records`);
  console.log(`[PHANTOM-CORE] Rate Limit Retry: ${RATE_LIMIT_RETRY_MS}ms`);
  console.log(`[PHANTOM-CORE] ═══════════════════════════════════════════════════`);

  // PRE-FLIGHT VAULT INTEGRITY CHECK
  try {
    const vaultCheck = vaultDiagnostic();
    telemetry.lastEncryptMs = vaultCheck.encryptMs;
    console.log(`[PHANTOM-CORE] Vault Pre-Flight: PASS | Encrypt: ${vaultCheck.encryptMs}ms | Decrypt: ${vaultCheck.decryptMs}ms`);
  } catch (error: any) {
    console.error(`[PHANTOM-CORE] CRITICAL_VAULT_ERROR: ${error.message}`);
    result.errors.push(error.message);
    result.telemetry = telemetry;
    return result;
  }

  const merchant = await storage.getMerchant(merchantId);
  if (!merchant) {
    result.errors.push("Merchant not found");
    result.telemetry = telemetry;
    return result;
  }

  // TIERED CAPACITY GATE: Check if merchant has reached their ghost limit
  const tierLimit = merchant.tierLimit;
  const currentPendingCount = await storage.countActiveGhostsByMerchant(merchantId);
  
  if (currentPendingCount >= tierLimit) {
    const skipMessage = `Scan skipped: Tier limit of ${tierLimit} reached.`;
    console.log(`[GHOST HUNTER] ${skipMessage}`);
    await storage.createSystemLog({
      jobName: "ghost_hunter",
      status: "skipped",
      details: skipMessage,
    });
    result.errors.push(skipMessage);
    return result;
  }
  
  // Calculate remaining capacity for this scan
  let remainingCapacity = tierLimit - currentPendingCount;
  console.log(`[GHOST HUNTER] Tier capacity: ${currentPendingCount}/${tierLimit} used, ${remainingCapacity} slots available`);

  let accessToken: string;
  try {
    accessToken = await getDecryptedToken(merchant);
  } catch (error: any) {
    result.errors.push(`Failed to decrypt token: ${error.message}`);
    return result;
  }

  const stripe = createMerchantStripeClient(accessToken);

  let hasMore = true;
  let startingAfter: string | undefined;
  let totalInvoicesScanned = 0;
  let batchNumber = 0;
  
  // Overflow Rule: Track if we hit tier limit mid-scan
  let tierLimitReached = false;
  
  // Multi-Currency Detection: capture currency from first invoice
  let detectedCurrency: string | undefined;

  // Recursive cursor-based pagination - no invoice limit
  while (hasMore) {
    batchNumber++;
    
    try {
      // Fetch ALL invoices - no status filter, no time filter
      // This ensures we see every invoice including open, paid, draft, void, uncollectible
      const params: Stripe.InvoiceListParams = {
        limit: 100, // Maximum allowed by Stripe API
        expand: ['data.customer'], // Pre-expand customer for faster lookups
      };
      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const invoices = await withRetry(() => stripe.invoices.list(params));
      const batchSize = invoices.data.length;
      
      console.log(`[GHOST HUNTER] Processing batch ${batchNumber}: ${batchSize} invoices (cursor: ${startingAfter || 'start'})`);

      // Process each invoice in this batch immediately (memory-safe)
      for (const invoice of invoices.data) {
        totalInvoicesScanned++;
        telemetry.recordsProcessed++;
        telemetry.totalPaymentEvents++;
        
        // Multi-Currency Detection: capture currency from first invoice
        if (!detectedCurrency && invoice.currency) {
          detectedCurrency = invoice.currency.toLowerCase();
          console.log(`[GHOST HUNTER] Currency detected: ${detectedCurrency.toUpperCase()}`);
        }

        // THROTTLE: Delay every THROTTLE_BATCH_SIZE records
        if (telemetry.recordsProcessed % THROTTLE_BATCH_SIZE === 0) {
          await delay(THROTTLE_DELAY_MS);
          logTelemetryHeartbeat(telemetry);
        }

        // GROSS INVOICED: Accumulate total invoiced (paid + unpaid) for leakage rate calculation
        result.grossInvoicedCents += invoice.amount_due || 0;

        // HAMMER DIRECTIVE: Relaxed Status Firewall
        // Include incomplete and draft statuses to capture test scenarios and real-world failed initial payments
        if (invoice.status === "open" || invoice.status === "uncollectible" || 
            invoice.status === "draft" || (invoice as any).status === "incomplete") {
          const customerId = typeof invoice.customer === "string" 
            ? invoice.customer 
            : invoice.customer?.id;

          if (customerId) {
            // Dead Ghost Filter: only process if customer has active/past_due subscription
            // Force-Mode Toggle: bypass subscription check when forceSync is true
            const hasActiveSub = forceSync ? true : await checkCustomerHasActiveSubscription(stripe, customerId);

            if (hasActiveSub) {
              telemetry.subscriptionLinked++;
              // OVERFLOW RULE: Check if we still have capacity before ingesting new ghost
              // Note: We check if this invoice already exists - updates don't count against capacity
              const existingGhost = await storage.getGhostByInvoiceId(invoice.id);
              const isNewGhost = !existingGhost;
              
              if (isNewGhost && remainingCapacity <= 0) {
                // Hit tier limit mid-scan - stop ingesting new ghosts
                if (!tierLimitReached) {
                  tierLimitReached = true;
                  console.log(`[GHOST HUNTER] Tier limit of ${tierLimit} reached mid-scan. Completing current batch but skipping new ghosts.`);
                }
                continue; // Skip this ghost but continue processing the batch
              }
              
              const email = invoice.customer_email || "unknown";
              // Extract customer name from Stripe invoice (fallback to customer email or "Unknown")
              let customerName = invoice.customer_name || email || "Unknown Customer";
              // If invoice.customer is expanded object (not just ID), try to get name
              if (typeof invoice.customer !== "string" && invoice.customer && "name" in invoice.customer) {
                customerName = (invoice.customer as { name?: string | null }).name || customerName;
              }
              const amount = invoice.amount_due || 0;

              // Intelligent Decline Branching: Extract decline code from last payment error
              const lastPaymentError = (invoice as any).last_payment_error;
              const declineCode = lastPaymentError?.decline_code || null;
              const { declineType, failureReason } = categorizeDeclineCode(declineCode);

              // Failure Capture Expansion: Extract detailed failure info from Payment Intent
              const invoiceAny = invoice as any;
              const paymentIntentId = typeof invoiceAny.payment_intent === 'string' 
                ? invoiceAny.payment_intent 
                : invoiceAny.payment_intent?.id || null;
              const { failureCode, failureMessage } = await extractFailureFromPaymentIntent(stripe, paymentIntentId);

              const purgeAt = new Date();
              purgeAt.setDate(purgeAt.getDate() + 90);

              // UPSERT with latency tracking
              const upsertStart = Date.now();
              await storage.upsertGhostTarget({
                merchantId,
                email,
                customerName,
                amount,
                invoiceId: invoice.id,
                purgeAt,
                status: "pending",
                failureReason,
                declineType,
                failureCode,
                failureMessage,
              });
              const upsertMs = Date.now() - upsertStart;
              telemetry.totalUpsertMs += upsertMs;
              telemetry.upsertCount++;

              result.ghostsFound.push({
                email,
                customerName,
                amount,
                invoiceId: invoice.id,
                customerId,
                failureCode,
                failureMessage,
              });

              result.totalRevenueAtRisk += amount;
              
              // Decrement remaining capacity only for newly ingested ghosts
              if (isNewGhost) {
                remainingCapacity--;
              }

              // Log ghost with failure reason
              const reasonLog = failureCode ? ` - Reason: ${failureCode}` : '';
              console.log(`[GHOST HUNTER] Found Ghost: ${email}${reasonLog}, amount: $${(amount / 100).toFixed(2)}${isNewGhost ? ` (${remainingCapacity} slots remaining)` : ' (update)'} [${upsertMs}ms]`);
            } else {
              telemetry.subscriptionFailed++;
              console.log('[FORENSIC] Invoice ' + invoice.id + ' failed subscription check for customer ' + customerId);
            }
          }
        } else if (invoice.status === "paid") {
          // Backup recovery detection
          const existingGhost = await storage.getGhostByInvoiceId(invoice.id);
          if (existingGhost && existingGhost.status === "pending") {
            // Backup recovery is always organic (discovered during scan, not via PHANTOM email)
            await storage.markGhostRecovered(existingGhost.id, 'organic');
            await storage.incrementMerchantRecovery(merchantId, existingGhost.amount);
            console.log(`[GHOST HUNTER] Backup recovery detected for invoice ${invoice.id}`);
          }
          
          // Extract Oracle timing data from paid invoices
          const timingData = extractPaymentTimingData(invoice);
          if (timingData) {
            await storage.createLiquidityOracleEntry({
              merchantId,
              businessCategory: "default",
              dayOfWeek: timingData.dayOfWeek,
              hourOfDay: timingData.hourOfDay,
            });
            result.oracleDataPoints++;
          }
        }
        // Note: "void" and "draft" status invoices are strictly excluded (not counted as leaked revenue)
        
        // Update peak RSS memory
        const currentRss = getRssMb();
        if (currentRss > telemetry.peakRssMb) {
          telemetry.peakRssMb = currentRss;
        }
      }
      // Batch processed - memory released for this batch

      // Update cursor for next page
      hasMore = invoices.has_more;
      if (hasMore && invoices.data.length > 0) {
        startingAfter = invoices.data[invoices.data.length - 1].id;
      }

    } catch (error: any) {
      result.errors.push(`Failed to fetch invoices at batch ${batchNumber}: ${error.message}`);
      console.error(`[GHOST HUNTER] Invoice fetch error at batch ${batchNumber}:`, error);
      break;
    }
  }

  // Check if scan completed without breaking due to errors
  const scanCompletedSuccessfully = result.errors.length === 0;

  // PROACTIVE EXPIRY DETECTION: Scan for subscriptions with expiring cards
  if (scanCompletedSuccessfully) {
    try {
      const { risks, currency: impendingCurrency } = await scanForImpendingRisks(stripe, merchantId, telemetry);
      
      // Use detected currency from impending scan if invoice scan didn't find one
      if (!detectedCurrency && impendingCurrency) {
        detectedCurrency = impendingCurrency;
      }
      
      // Upsert impending ghosts
      for (const risk of risks) {
        const purgeAt = new Date();
        purgeAt.setDate(purgeAt.getDate() + 90);
        
        await storage.upsertGhostTarget({
          merchantId,
          email: risk.email,
          customerName: risk.customerName,
          amount: risk.amount,
          invoiceId: `impending_${risk.subscriptionId}`, // Use subscription ID as unique identifier
          purgeAt,
          status: "impending",
          failureReason: `card_expiring_${risk.expMonth}_${risk.expYear}`,
          declineType: null,
        });
      }
      
      // Impending leakage now calculated live from ghost_targets via getHistoricalRevenueStats
      if (telemetry.impendingCount > 0) {
        console.log(`[GHOST HUNTER] Impending risks detected: ${telemetry.impendingCount} expiring cards, $${(telemetry.impendingRiskTally / 100).toFixed(2)} MRR at risk`);
      }
      
    } catch (error: any) {
      console.error(`[GHOST HUNTER] Proactive scan error:`, error.message);
      result.errors.push(`Proactive scan failed: ${error.message}`);
    }
  }

  // Update lastAuditAt, defaultCurrency, and grossInvoicedCents (leakage calculated from ghost_targets)
  if (scanCompletedSuccessfully) {
    try {
      await storage.updateMerchant(merchantId, {
        lastAuditAt: new Date(),
        defaultCurrency: detectedCurrency,
        grossInvoicedCents: result.grossInvoicedCents,
      });
      console.log(`[GHOST HUNTER] Audit timestamp updated, currency: ${detectedCurrency?.toUpperCase() || 'GBP'}, grossInvoiced: $${(result.grossInvoicedCents / 100).toFixed(2)}`);
    } catch (error: any) {
      result.errors.push(`Failed to update merchant: ${error.message}`);
      console.error(`[GHOST HUNTER] Merchant update error:`, error);
    }
  }

  // DIAGNOSTIC SHELL: Final telemetry summary
  const totalDurationMs = Date.now() - telemetry.startTime;
  const avgUpsertMs = telemetry.upsertCount > 0 
    ? Math.round(telemetry.totalUpsertMs / telemetry.upsertCount * 100) / 100 
    : 0;

  // Summary logging
  console.log(`[PHANTOM-CORE] ═══════════════════════════════════════════════════`);
  console.log(`[PHANTOM-CORE] DIAGNOSTIC SUMMARY`);
  console.log(`[PHANTOM-CORE] Total Records: ${telemetry.recordsProcessed}`);
  console.log(`[PHANTOM-CORE] Total Duration: ${totalDurationMs}ms`);
  console.log(`[PHANTOM-CORE] Peak RSS Memory: ${telemetry.peakRssMb}MB`);
  console.log(`[PHANTOM-CORE] Avg UPSERT Latency: ${avgUpsertMs}ms (${telemetry.upsertCount} operations)`);
  console.log(`[PHANTOM-CORE] ═══════════════════════════════════════════════════`);
  
  console.log(`[GHOST HUNTER] ═══════════════════════════════════════════════════`);
  console.log(`[GHOST HUNTER] DEEP HARVEST COMPLETE for merchant: ${merchantId}`);
  console.log(`[GHOST HUNTER] Total invoices scanned: ${totalInvoicesScanned}`);
  console.log(`[GHOST HUNTER] Total batches processed: ${batchNumber}`);
  console.log(`[GHOST HUNTER] Ghosts found: ${result.ghostsFound.length}`);
  console.log(`[GHOST HUNTER] Revenue at risk: $${(result.totalRevenueAtRisk / 100).toFixed(2)}`);
  console.log(`[GHOST HUNTER] Impending risks: ${telemetry.impendingCount} cards expiring, $${(telemetry.impendingRiskTally / 100).toFixed(2)} MRR at risk`);
  console.log(`[GHOST HUNTER] Oracle data points: ${result.oracleDataPoints}`);
  console.log(`[GHOST HUNTER] ═══════════════════════════════════════════════════`);

  // Serialize the Funnel for JSON Detail Persistence
  const funnelData = {
    total: telemetry.totalPaymentEvents,
    recurring: telemetry.subscriptionLinked,
    skipped: telemetry.subscriptionFailed,
  };
  
  const humanSummary = `Scan complete: ${totalInvoicesScanned} invoices, ${result.ghostsFound.length} ghosts, $${(result.totalRevenueAtRisk / 100).toFixed(2)} at risk`;
  
  await storage.createSystemLog({
    jobName: "ghost_hunter",
    status: result.errors.length === 0 ? "success" : "failure",
    details: JSON.stringify({ funnel: funnelData, summary: humanSummary }),
    errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
  });

  // Attach telemetry to result
  result.telemetry = telemetry;

  return result;
}

export async function runAuditForMerchant(merchantId: string, forceSync: boolean = false): Promise<{
  total_ghosts_found: number;
  total_revenue_at_risk: number;
  oracle_data_points: number;
  errors: string[];
}> {
  const scanResult = await scanMerchant(merchantId, forceSync);

  return {
    total_ghosts_found: scanResult.ghostsFound.length,
    total_revenue_at_risk: scanResult.totalRevenueAtRisk,
    oracle_data_points: scanResult.oracleDataPoints,
    errors: scanResult.errors,
  };
}
