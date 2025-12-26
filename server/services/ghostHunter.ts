import Stripe from "stripe";
import { storage } from "../storage";
import { decrypt } from "../utils/crypto";
import type { Merchant } from "@shared/schema";

const RATE_LIMIT_DELAY_MS = 100;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

interface GhostResult {
  email: string;
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

  console.log(`[GHOST HUNTER] Starting scan for merchant: ${merchantId}`);

  const merchant = await storage.getMerchant(merchantId);
  if (!merchant) {
    result.errors.push("Merchant not found");
    return result;
  }

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
  let invoicesFetched = 0;
  const maxInvoices = 100;

  while (hasMore && invoicesFetched < maxInvoices) {
    try {
      const params: Stripe.InvoiceListParams = {
        limit: 25,
      };
      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const invoices = await withRetry(() => stripe.invoices.list(params));

      for (const invoice of invoices.data) {
        invoicesFetched++;

        if (invoice.status === "open" || invoice.status === "uncollectible") {
          const customerId = typeof invoice.customer === "string" 
            ? invoice.customer 
            : invoice.customer?.id;

          if (customerId) {
            await delay(RATE_LIMIT_DELAY_MS);
            
            const hasActiveSub = await checkCustomerHasActiveSubscription(stripe, customerId);

            if (hasActiveSub) {
              const existingGhost = await storage.getGhostByInvoiceId(invoice.id);
              
              if (!existingGhost) {
                const email = invoice.customer_email || "unknown";
                const amount = invoice.amount_due || 0;

                const purgeAt = new Date();
                purgeAt.setDate(purgeAt.getDate() + 90);

                await storage.createGhostTarget({
                  merchantId,
                  email,
                  amount,
                  invoiceId: invoice.id,
                  purgeAt,
                });

                result.ghostsFound.push({
                  email,
                  amount,
                  invoiceId: invoice.id,
                  customerId,
                });

                result.totalRevenueAtRisk += amount;

                console.log(`[GHOST HUNTER] Ghost found: ${email}, amount: ${amount / 100}`);
              }
            }
          }
        } else if (invoice.status === "paid") {
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

        if (invoicesFetched >= maxInvoices) {
          break;
        }
      }

      hasMore = invoices.has_more && invoicesFetched < maxInvoices;
      if (hasMore && invoices.data.length > 0) {
        startingAfter = invoices.data[invoices.data.length - 1].id;
        await delay(RATE_LIMIT_DELAY_MS);
      }

    } catch (error: any) {
      result.errors.push(`Failed to fetch invoices: ${error.message}`);
      console.error("[GHOST HUNTER] Invoice fetch error:", error);
      break;
    }
  }

  console.log(`[GHOST HUNTER] Scan complete. Ghosts: ${result.ghostsFound.length}, Oracle points: ${result.oracleDataPoints}`);

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
