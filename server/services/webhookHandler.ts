// Webhook Handler - Processes Stripe webhook events
import Stripe from "stripe";
import { storage } from "../storage";

interface WebhookResult {
  success: boolean;
  message: string;
  ghostRecovered?: boolean;
  ghostProtected?: boolean;
  amountRecovered?: number;
  amountProtected?: number;
}

function getPaymentTimingFromTimestamp(timestamp: number): { dayOfWeek: number; hourOfDay: number } {
  const date = new Date(timestamp * 1000);
  return {
    dayOfWeek: date.getUTCDay(),
    hourOfDay: date.getUTCHours(),
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

  // Victory Log - Log to system_logs for Intelligence Feed
  await storage.createSystemLog({
    jobName: "recovery_victory",
    status: "success",
    details: `Revenue Recovered: ${formattedAmount} (${recoveryType})`,
    errorMessage: null,
  });
  console.log(`[WEBHOOK] Victory logged: ${formattedAmount} recovered (${recoveryType})`);

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

  // Victory Log - Log to system_logs for Intelligence Feed
  await storage.createSystemLog({
    jobName: "protection_victory",
    status: "success",
    details: `Revenue Protected: ${formattedAmount} (proactive card update)`,
    errorMessage: null,
  });
  console.log(`[WEBHOOK] Victory logged: ${formattedAmount} protected`);

  return {
    success: true,
    message: `Ghost ${ghost.id} protected successfully`,
    ghostProtected: true,
    amountProtected: ghost.amount,
  };
}

export async function handleWebhookEvent(
  event: Stripe.Event
): Promise<WebhookResult> {
  console.log(`[WEBHOOK] Received event: ${event.type}`);

  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_succeeded":
      const invoice = event.data.object as Stripe.Invoice;
      return handleInvoicePaid(invoice);

    case "customer.subscription.updated":
      const subscription = event.data.object as Stripe.Subscription;
      return handleSubscriptionUpdated(subscription);

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
