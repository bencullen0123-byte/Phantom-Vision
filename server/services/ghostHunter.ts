import Stripe from "stripe";
import { storage } from "../storage";
import { decrypt } from "../utils/crypto";
import type { Merchant } from "@shared/schema";

const RATE_LIMIT_DELAY_MS = 100;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

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

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  backoff: number = INITIAL_BACKOFF_MS
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && error?.statusCode === 429) {
      console.log(`[GHOST HUNTER] Rate limited, retrying in ${backoff}ms...`);
      await delay(backoff);
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

export async function scanMerchant(merchantId: string): Promise<ScanResult> {
  const result: ScanResult = {
    merchantId,
    ghostsFound: [],
    oracleDataPoints: 0,
    totalRevenueAtRisk: 0,
    errors: [],
  };

  console.log(`[GHOST HUNTER] Starting DEEP HARVEST scan for merchant: ${merchantId}`);

  const merchant = await storage.getMerchant(merchantId);
  if (!merchant) {
    result.errors.push("Merchant not found");
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

  // Recursive cursor-based pagination - no invoice limit
  while (hasMore) {
    batchNumber++;
    
    try {
      const params: Stripe.InvoiceListParams = {
        limit: 100, // Maximum allowed by Stripe API
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

        // STRICT EXCLUSION: void status invoices are never processed
        // Only open or uncollectible invoices qualify for Ghost detection
        if (invoice.status === "open" || invoice.status === "uncollectible") {
          const customerId = typeof invoice.customer === "string" 
            ? invoice.customer 
            : invoice.customer?.id;

          if (customerId) {
            await delay(RATE_LIMIT_DELAY_MS);
            
            // Dead Ghost Filter: only process if customer has active/past_due subscription
            const hasActiveSub = await checkCustomerHasActiveSubscription(stripe, customerId);

            if (hasActiveSub) {
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

              // UPSERT on invoiceId prevents duplicates (PII encrypted before storage)
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

              console.log(`[GHOST HUNTER] Ghost upserted: ${email}, amount: $${(amount / 100).toFixed(2)}${isNewGhost ? ` (${remainingCapacity} slots remaining)` : ' (update)'}`);
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
      }
      // Batch processed - memory released for this batch

      // Update cursor for next page
      hasMore = invoices.has_more;
      if (hasMore && invoices.data.length > 0) {
        startingAfter = invoices.data[invoices.data.length - 1].id;
        await delay(RATE_LIMIT_DELAY_MS); // Rate limit between pagination calls
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
      });
      console.log(`[GHOST HUNTER] Shadow Revenue updated: $${(shadowRevenueTally / 100).toFixed(2)} across ${ghostCountTally} ghosts`);
    } catch (error: any) {
      result.errors.push(`Failed to persist Shadow Revenue: ${error.message}`);
      console.error(`[GHOST HUNTER] Shadow Revenue persistence error:`, error);
    }
  } else {
    console.log(`[GHOST HUNTER] Skipping Shadow Revenue update due to scan errors`);
  }

  // Summary logging
  console.log(`[GHOST HUNTER] ═══════════════════════════════════════════════════`);
  console.log(`[GHOST HUNTER] DEEP HARVEST COMPLETE for merchant: ${merchantId}`);
  console.log(`[GHOST HUNTER] Total invoices scanned: ${totalInvoicesScanned}`);
  console.log(`[GHOST HUNTER] Total batches processed: ${batchNumber}`);
  console.log(`[GHOST HUNTER] Ghosts found: ${result.ghostsFound.length}`);
  console.log(`[GHOST HUNTER] Revenue at risk: $${(result.totalRevenueAtRisk / 100).toFixed(2)}`);
  console.log(`[GHOST HUNTER] Shadow Revenue (all-time): $${(shadowRevenueTally / 100).toFixed(2)}`);
  console.log(`[GHOST HUNTER] Oracle data points: ${result.oracleDataPoints}`);
  console.log(`[GHOST HUNTER] ═══════════════════════════════════════════════════`);

  return result;
}

export async function runAuditForMerchant(merchantId: string): Promise<{
  total_ghosts_found: number;
  total_revenue_at_risk: number;
  oracle_data_points: number;
  errors: string[];
}> {
  const scanResult = await scanMerchant(merchantId);

  return {
    total_ghosts_found: scanResult.ghostsFound.length,
    total_revenue_at_risk: scanResult.totalRevenueAtRisk,
    oracle_data_points: scanResult.oracleDataPoints,
    errors: scanResult.errors,
  };
}
