// Webhook Handler - Processes Stripe webhook events
import Stripe from "stripe";
import { storage } from "../storage";
import { decrypt, redactEmail } from "../utils/crypto";
import { determineRecoveryStrategy } from "./ghostHunter";
import { sendGoldenHourEmail } from "./pulseMailer";

interface WebhookResult {
  success: boolean;
  message: string;
  ghostRecovered?: boolean;
  ghostProtected?: boolean;
  ghostCreated?: boolean;
  amountRecovered?: number;
  amountProtected?: number;
  amountAtRisk?: number;
}

// Intelligent Decline Branching: Categorize Stripe decline codes
const SOFT_CODES = new Set([
  "insufficient_funds", "card_velocity_exceeded", "try_again_later",
  "processing_error", "reenter_transaction", "do_not_honor",
]);

const HARD_CODES = new Set([
  "expired_card", "lost_card", "stolen_card", "incorrect_number",
  "invalid_cvc", "card_not_supported", "card_declined", "pickup_card",
]);

function categorizeDeclineCode(code: string | null | undefined): { declineType: 'soft' | 'hard' | null; failureReason: string | null } {
  if (!code) return { declineType: null, failureReason: null };
  if (SOFT_CODES.has(code)) return { declineType: 'soft', failureReason: code };
  if (HARD_CODES.has(code)) return { declineType: 'hard', failureReason: code };
  return { declineType: 'soft', failureReason: code }; // Unknown defaults to soft
}

// ML Metadata extraction for real-time forensic capture
interface MLMetadata {
  cardBrand: string | null;
  cardFunding: string | null;
  countryCode: string | null;
  requires3ds: boolean | null;
  stripeErrorCode: string | null;
  originalInvoiceDate: Date | null;
}

async function extractMLMetadataFromInvoice(
  stripe: Stripe,
  invoice: Stripe.Invoice
): Promise<MLMetadata> {
  const result: MLMetadata = {
    cardBrand: null,
    cardFunding: null,
    countryCode: null,
    requires3ds: null,
    stripeErrorCode: null,
    originalInvoiceDate: invoice.created ? new Date(invoice.created * 1000) : null,
  };

  // Get payment intent ID from invoice
  const invoiceAny = invoice as any;
  const paymentIntentId = typeof invoiceAny.payment_intent === 'string'
    ? invoiceAny.payment_intent
    : invoiceAny.payment_intent?.id || null;

  if (!paymentIntentId) return result;

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['payment_method'],
    });

    // Check for 3DS requirement
    if (paymentIntent.last_payment_error?.code === 'authentication_required' ||
        paymentIntent.status === 'requires_action') {
      result.requires3ds = true;
    }

    // Extract card details from payment method (NORMALIZED to lowercase)
    const pm = paymentIntent.payment_method;
    if (pm && typeof pm !== 'string' && pm.card) {
      result.cardBrand = pm.card.brand?.toLowerCase() || null;
      result.cardFunding = pm.card.funding?.toLowerCase() || null;
      result.countryCode = pm.card.country?.toLowerCase() || null;
    }

    // Extract error code
    if (paymentIntent.last_payment_error) {
      result.stripeErrorCode = paymentIntent.last_payment_error.decline_code ||
                               paymentIntent.last_payment_error.code || null;
    }
  } catch (error: any) {
    console.log(`[WEBHOOK] Could not fetch PaymentIntent ${paymentIntentId}: ${error.message}`);
  }

  // Fallback: country from customer address
  if (!result.countryCode && invoice.customer && typeof invoice.customer !== 'string') {
    const customer = invoice.customer as Stripe.Customer;
    if (customer.address?.country) {
      result.countryCode = customer.address.country.toLowerCase();
    }
  }

  return result;
}

function getPaymentTimingFromTimestamp(timestamp: number): { dayOfWeek: number; hourOfDay: number } {
  const date = new Date(timestamp * 1000);
  return {
    dayOfWeek: date.getUTCDay(),
    hourOfDay: date.getUTCHours(),
  };
}

// Create Stripe client for merchant API calls using their decrypted token
function createMerchantStripeClient(accessToken: string): Stripe {
  return new Stripe(accessToken, {
    apiVersion: "2025-12-15.clover",
  });
}

// Real-time ghost discovery from invoice.payment_failed webhook
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  connectedAccountId?: string
): Promise<WebhookResult> {
  console.log(`[WEBHOOK] Processing invoice.payment_failed for invoice ${invoice.id}`);

  // Check if ghost already exists (avoid duplicates)
  const existingGhost = await storage.getGhostByInvoiceId(invoice.id);
  if (existingGhost) {
    console.log(`[WEBHOOK] Ghost already exists for invoice ${invoice.id} - updating`);
  }

  // Identify merchant by connected account ID or customer lookup
  let merchant = null;
  
  if (connectedAccountId) {
    merchant = await storage.getMerchantByStripeUserId(connectedAccountId);
    console.log(`[WEBHOOK] Merchant lookup by account ${connectedAccountId}: ${merchant ? 'found' : 'not found'}`);
  }

  if (!merchant) {
    // Fallback: try to find merchant from existing ghost
    if (existingGhost) {
      merchant = await storage.getMerchant(existingGhost.merchantId);
    }
  }

  if (!merchant) {
    console.log(`[WEBHOOK] No merchant found for invoice ${invoice.id} - cannot create ghost`);
    return {
      success: true,
      message: "No merchant mapping found for this Stripe account",
      ghostCreated: false,
    };
  }

  // Extract invoice details
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id || null;
  const email = invoice.customer_email || "unknown";
  let customerName = invoice.customer_name || email || "Unknown Customer";
  if (typeof invoice.customer !== "string" && invoice.customer && "name" in invoice.customer) {
    customerName = (invoice.customer as { name?: string | null }).name || customerName;
  }
  const amount = invoice.amount_due || 0;
  const currency = invoice.currency?.toLowerCase() || 'gbp';

  // Decrypt merchant token for Stripe API calls
  let stripe: Stripe;
  try {
    const accessToken = decrypt(merchant.encryptedToken, merchant.iv, merchant.tag);
    stripe = createMerchantStripeClient(accessToken);
  } catch (error: any) {
    console.error(`[WEBHOOK] Failed to decrypt merchant token: ${error.message}`);
    return {
      success: false,
      message: "Failed to decrypt merchant credentials",
      ghostCreated: false,
    };
  }

  // Extract ML metadata for forensic intelligence
  const mlMetadata = await extractMLMetadataFromInvoice(stripe, invoice);

  // Extract decline code for branching strategy
  const lastPaymentError = (invoice as any).last_payment_error;
  const declineCode = lastPaymentError?.decline_code || mlMetadata.stripeErrorCode || null;
  const { declineType, failureReason } = categorizeDeclineCode(declineCode);

  // Extract failure details
  const failureCode = declineCode;
  const failureMessage = lastPaymentError?.message || null;

  // 90-day purge timestamp
  const purgeAt = new Date();
  purgeAt.setDate(purgeAt.getDate() + 90);

  // Determine recovery strategy based on ML metadata (Sprint 2.3)
  const recoveryStrategy = determineRecoveryStrategy({
    requires3ds: mlMetadata.requires3ds,
    declineType,
    amount,
  });

  // UPSERT ghost target with forensic metadata
  await storage.upsertGhostTarget({
    merchantId: merchant.id,
    email,
    customerName,
    amount,
    invoiceId: invoice.id,
    purgeAt,
    status: "pending",
    stripeCustomerId: customerId,
    failureReason,
    declineType,
    failureCode,
    failureMessage,
    // ML metadata (non-PII, normalized to lowercase)
    cardBrand: mlMetadata.cardBrand,
    cardFunding: mlMetadata.cardFunding,
    countryCode: mlMetadata.countryCode,
    requires3ds: mlMetadata.requires3ds,
    stripeErrorCode: mlMetadata.stripeErrorCode,
    originalInvoiceDate: mlMetadata.originalInvoiceDate,
    // Recovery Strategy Selector (Sprint 2.3)
    recoveryStrategy,
  });

  console.log(`[WEBHOOK] Ghost ${existingGhost ? 'updated' : 'created'} for invoice ${invoice.id}`);

  // Get the upserted ghost for triggering Golden Hour email
  const upsertedGhost = await storage.getGhostByInvoiceId(invoice.id);

  // Update merchant ledger if this is a new invoice
  if (!existingGhost) {
    // Increment gross invoiced cents (new invoice discovered)
    await storage.incrementMerchantGrossInvoiced(merchant.id, amount);
    console.log(`[WEBHOOK] Incremented grossInvoicedCents by ${amount} for merchant ${merchant.id}`);

    // Increment all-time leaked cents
    await storage.incrementMerchantLeakedCents(merchant.id, amount);
    console.log(`[WEBHOOK] Incremented allTimeLeakedCents by ${amount} for merchant ${merchant.id}`);
    
    // Sprint 3.1: Trigger Golden Hour email for new ghosts
    // Guardrails are checked inside sendGoldenHourEmail (emailCount === 0, status === pending)
    if (upsertedGhost) {
      console.log(`[WEBHOOK] Triggering Golden Hour email for new ghost ${upsertedGhost.id}`);
      // Fire-and-forget to avoid blocking webhook response
      sendGoldenHourEmail(upsertedGhost.id, storage).catch((err: any) => {
        console.error(`[WEBHOOK] Golden Hour email failed:`, err.message);
      });
    }
  }

  // Update lastAuditAt to trigger UI refresh
  await storage.updateMerchant(merchant.id, { lastAuditAt: new Date() });
  console.log(`[WEBHOOK] Updated lastAuditAt for merchant ${merchant.id}`);

  // Log to system for Intelligence Feed
  const ghostPayload = {
    type: "ghost_discovered",
    source: "webhook",
    invoiceId: invoice.id,
    amount,
    currency,
    declineType,
    failureCode,
    cardBrand: mlMetadata.cardBrand,
  };
  await storage.createSystemLog({
    jobName: "webhook_ghost_discovery",
    status: "success",
    details: JSON.stringify(ghostPayload),
    errorMessage: null,
  });

  const formattedAmount = formatCentsToDisplay(amount, currency);
  console.log(`[WEBHOOK] Real-time ghost discovery: inv_${invoice.id.slice(-8)} - ${formattedAmount} at risk (${declineType || 'unknown'} decline)`);

  return {
    success: true,
    message: `Ghost ${existingGhost ? 'updated' : 'created'} for invoice ${invoice.id}`,
    ghostCreated: !existingGhost,
    amountAtRisk: amount,
  };
}

function formatCentsToDisplay(cents: number, currency: string = 'gbp'): string {
  const symbols: Record<string, string> = {
    gbp: '£', usd: '$', eur: '€', aud: 'A$', cad: 'C$'
  };
  const symbol = symbols[currency.toLowerCase()] || currency.toUpperCase() + ' ';
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<WebhookResult> {
  console.log(`[WEBHOOK] Processing invoice.paid for invoice ${invoice.id}`);

  const ghost = await storage.getGhostByInvoiceId(invoice.id);
  
  if (!ghost) {
    console.log(`[WEBHOOK] No ghost target found for invoice ${invoice.id} - ignoring`);
    return {
      success: true,
      message: "Invoice not tracked as ghost target",
      ghostRecovered: false,
    };
  }

  if (ghost.status === "recovered") {
    console.log(`[WEBHOOK] Ghost ${ghost.id} already recovered - skipping`);
    return {
      success: true,
      message: "Ghost already recovered",
      ghostRecovered: false,
    };
  }

  console.log(`[WEBHOOK] Found ghost target: ${ghost.id}, amount: ${ghost.amount}`);

  // Determine recovery type based on attribution window
  // Direct: payment occurred within 24h attribution window (PHANTOM-attributed)
  // Organic: payment occurred independently (no attribution or expired)
  const now = new Date();
  const recoveryType: 'direct' | 'organic' = 
    ghost.attributionExpiresAt && ghost.attributionExpiresAt > now 
      ? 'direct' 
      : 'organic';
  
  console.log(`[WEBHOOK] Recovery type: ${recoveryType} (attribution expires: ${ghost.attributionExpiresAt?.toISOString() || 'null'})`);

  await storage.markGhostRecovered(ghost.id, recoveryType);
  console.log(`[WEBHOOK] Ghost ${ghost.id} marked as recovered (${recoveryType})`);

  await storage.incrementMerchantRecovery(ghost.merchantId, ghost.amount);
  console.log(`[WEBHOOK] Incremented merchant ${ghost.merchantId} recovery by ${ghost.amount} cents`);

  const paidAt = invoice.status_transitions?.paid_at || Math.floor(Date.now() / 1000);
  const timing = getPaymentTimingFromTimestamp(paidAt);
  
  await storage.createLiquidityOracleEntry({
    merchantId: ghost.merchantId,
    businessCategory: "recovery",
    dayOfWeek: timing.dayOfWeek,
    hourOfDay: timing.hourOfDay,
  });
  console.log(`[WEBHOOK] Added oracle data point: day=${timing.dayOfWeek}, hour=${timing.hourOfDay}`);

  // Get merchant for currency formatting
  const merchant = await storage.getMerchant(ghost.merchantId);
  const currency = merchant?.defaultCurrency || 'gbp';
  const formattedAmount = formatCentsToDisplay(ghost.amount, currency);

  // Victory Log - Structured payload for Intelligence Feed
  const victoryPayload = {
    type: "recovery",
    direct: recoveryType === "direct",
    amount: ghost.amount,
    currency: currency,
    invoiceId: invoice.id,
    ghostId: ghost.id,
  };
  await storage.createSystemLog({
    jobName: "recovery_victory",
    status: "success",
    details: JSON.stringify(victoryPayload),
    errorMessage: null,
  });
  console.log(`[WEBHOOK] Victory logged: ${formattedAmount} recovered (${recoveryType})`, victoryPayload);

  return {
    success: true,
    message: `Ghost ${ghost.id} exorcised successfully`,
    ghostRecovered: true,
    amountRecovered: ghost.amount,
  };
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<WebhookResult> {
  console.log(`[WEBHOOK] Processing customer.subscription.updated for subscription ${subscription.id}`);

  const customerId = typeof subscription.customer === 'string' 
    ? subscription.customer 
    : subscription.customer.id;

  // Check if this customer has an impending ghost target (expiring card warning sent)
  const ghost = await storage.getImpendingGhostByStripeCustomerId(customerId);
  
  if (!ghost) {
    console.log(`[WEBHOOK] No impending ghost target found for customer ${customerId} - ignoring`);
    return {
      success: true,
      message: "No impending risk tracked for this customer",
      ghostProtected: false,
    };
  }

  // Check if payment method was updated (default_payment_method changed)
  const defaultPaymentMethod = subscription.default_payment_method;
  if (!defaultPaymentMethod) {
    console.log(`[WEBHOOK] Subscription updated but no payment method change detected`);
    return {
      success: true,
      message: "Subscription updated, no payment method change",
      ghostProtected: false,
    };
  }

  console.log(`[WEBHOOK] Found impending ghost target: ${ghost.id}, amount: ${ghost.amount}`);
  console.log(`[WEBHOOK] Customer ${customerId} updated their payment method - marking as protected`);

  // Mark the ghost as protected
  await storage.markGhostProtected(ghost.id);
  console.log(`[WEBHOOK] Ghost ${ghost.id} marked as protected`);

  // Increment merchant's protected revenue (and reduce impending leakage)
  await storage.incrementMerchantProtection(ghost.merchantId, ghost.amount);
  console.log(`[WEBHOOK] Incremented merchant ${ghost.merchantId} protection by ${ghost.amount} cents`);

  // Get merchant for currency formatting
  const merchant = await storage.getMerchant(ghost.merchantId);
  const currency = merchant?.defaultCurrency || 'gbp';
  const formattedAmount = formatCentsToDisplay(ghost.amount, currency);

  // Victory Log - Structured payload for Intelligence Feed
  const victoryPayload = {
    type: "protection",
    direct: true,
    amount: ghost.amount,
    currency: currency,
    subscriptionId: subscription.id,
    ghostId: ghost.id,
  };
  await storage.createSystemLog({
    jobName: "protection_victory",
    status: "success",
    details: JSON.stringify(victoryPayload),
    errorMessage: null,
  });
  console.log(`[WEBHOOK] Victory logged: ${formattedAmount} protected`, victoryPayload);

  return {
    success: true,
    message: `Ghost ${ghost.id} protected successfully`,
    ghostProtected: true,
    amountProtected: ghost.amount,
  };
}

// Handle checkout.session.completed - upgrades merchant to Pro tier
export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<WebhookResult> {
  console.log(`[WEBHOOK] Processing checkout.session.completed for session ${session.id}`);

  const merchantId = session.client_reference_id;
  if (!merchantId) {
    console.error(`[WEBHOOK] No client_reference_id in checkout session ${session.id}`);
    return {
      success: false,
      message: "Missing merchant reference in checkout session",
    };
  }

  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id || null;

  if (!subscriptionId) {
    console.error(`[WEBHOOK] No subscription ID in checkout session ${session.id}`);
    return {
      success: false,
      message: "Missing subscription in checkout session",
    };
  }

  console.log(`[WEBHOOK] Upgrading merchant ${merchantId} to Pro tier`);

  try {
    await storage.updateMerchant(merchantId, {
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: 'active',
      planTier: 'pro',
      tierLimit: 1000,
    });

    console.log(`[WEBHOOK] Merchant ${merchantId} upgraded to Pro (tierLimit: 1000)`);

    await storage.createSystemLog({
      jobName: "billing_upgrade",
      status: "success",
      details: JSON.stringify({
        type: "pro_upgrade",
        merchantId,
        subscriptionId,
        newTierLimit: 1000,
      }),
      errorMessage: null,
    });

    return {
      success: true,
      message: `Merchant ${merchantId} upgraded to Pro`,
    };
  } catch (error: any) {
    console.error(`[WEBHOOK] Failed to upgrade merchant ${merchantId}:`, error.message);
    return {
      success: false,
      message: `Failed to upgrade merchant: ${error.message}`,
    };
  }
}

export async function handleWebhookEvent(
  event: Stripe.Event
): Promise<WebhookResult> {
  console.log(`[WEBHOOK] Received event: ${event.type}`);

  // Extract connected account ID for merchant lookup (Stripe Connect)
  const connectedAccountId = (event as any).account || undefined;

  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_succeeded":
      const paidInvoice = event.data.object as Stripe.Invoice;
      return handleInvoicePaid(paidInvoice);

    case "invoice.payment_failed":
      const failedInvoice = event.data.object as Stripe.Invoice;
      return handleInvoicePaymentFailed(failedInvoice, connectedAccountId);

    case "customer.subscription.updated":
      const subscription = event.data.object as Stripe.Subscription;
      return handleSubscriptionUpdated(subscription);

    case "checkout.session.completed":
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      return handleCheckoutSessionCompleted(checkoutSession);

    default:
      console.log(`[WEBHOOK] Ignoring event type: ${event.type}`);
      return {
        success: true,
        message: `Event type ${event.type} not handled`,
        ghostRecovered: false,
        ghostProtected: false,
      };
  }
}
