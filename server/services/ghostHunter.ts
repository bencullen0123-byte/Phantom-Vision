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

interface GhostResult {
  email: string;
  customerName: string;
  amount: number;
  invoiceId: string;
  customerId: string;
}

interface ScanResult {
  merchantId: string;
  ghostsFound: GhostResult[];
  oracleDataPoints: number;
  totalRevenueAtRisk: number;
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

export async function scanMerchant(merchantId: string, forceSync: boolean = false): Promise<ScanResult & { telemetry?: TelemetryState }> {
  const result: ScanResult & { telemetry?: TelemetryState } = {
    merchantId,
    ghostsFound: [],
    oracleDataPoints: 0,
    totalRevenueAtRisk: 0,
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
  
  // Shadow Revenue Calculator: running tallies
  let shadowRevenueTally = 0;
  let ghostCountTally = 0;
  let scanCompletedSuccessfully = false;
  
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

        // STRICT EXCLUSION: void status invoices are never processed
        // Only open or uncollectible invoices qualify for Ghost detection
        if (invoice.status === "open" || invoice.status === "uncollectible") {
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
              });

              result.totalRevenueAtRisk += amount;
              
              // Shadow Revenue Calculator: increment running tallies
              shadowRevenueTally += amount;
              ghostCountTally++;
              
              // Decrement remaining capacity only for newly ingested ghosts
              if (isNewGhost) {
                remainingCapacity--;
              }

              console.log(`[GHOST HUNTER] Ghost upserted: ${email}, amount: $${(amount / 100).toFixed(2)}${isNewGhost ? ` (${remainingCapacity} slots remaining)` : ' (update)'} [${upsertMs}ms]`);
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
  scanCompletedSuccessfully = result.errors.length === 0;

  // Shadow Revenue Calculator: Atomic persistence on successful scan completion
  if (scanCompletedSuccessfully) {
    try {
      await storage.updateMerchantShadowRevenue(merchantId, {
        allTimeLeakedCents: shadowRevenueTally,
        totalGhostCount: ghostCountTally,
        lastAuditAt: new Date(),
        defaultCurrency: detectedCurrency,
      });
      const currencySymbol = detectedCurrency?.toUpperCase() || 'GBP';
      console.log(`[GHOST HUNTER] Shadow Revenue updated: ${currencySymbol} ${(shadowRevenueTally / 100).toFixed(2)} across ${ghostCountTally} ghosts`);
    } catch (error: any) {
      result.errors.push(`Failed to persist Shadow Revenue: ${error.message}`);
      console.error(`[GHOST HUNTER] Shadow Revenue persistence error:`, error);
    }
  } else {
    console.log(`[GHOST HUNTER] Skipping Shadow Revenue update due to scan errors`);
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
  console.log(`[GHOST HUNTER] Shadow Revenue (all-time): $${(shadowRevenueTally / 100).toFixed(2)}`);
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
