// Webhook Handler - Processes Stripe webhook events
import Stripe from "stripe";
import { storage } from "../storage";

interface WebhookResult {
  success: boolean;
  message: string;
  ghostRecovered?: boolean;
  amountRecovered?: number;
}

function getPaymentTimingFromTimestamp(timestamp: number): { dayOfWeek: number; hourOfDay: number } {
  const date = new Date(timestamp * 1000);
  return {
    dayOfWeek: date.getUTCDay(),
    hourOfDay: date.getUTCHours(),
  };
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

  await storage.markGhostRecovered(ghost.id);
  console.log(`[WEBHOOK] Ghost ${ghost.id} marked as recovered`);

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

  return {
    success: true,
    message: `Ghost ${ghost.id} exorcised successfully`,
    ghostRecovered: true,
    amountRecovered: ghost.amount,
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

    default:
      console.log(`[WEBHOOK] Ignoring event type: ${event.type}`);
      return {
        success: true,
        message: `Event type ${event.type} not handled`,
        ghostRecovered: false,
      };
  }
}
