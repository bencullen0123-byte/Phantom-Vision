import Stripe from "stripe";
import { faker } from "@faker-js/faker";
import { storage } from "../storage";
import { decrypt } from "../utils/crypto";

// ============================================================
// STRIPE LOAD GENERATOR (Chaos Engine v2)
// Creates real customers and invoices in Stripe Test Mode
// ============================================================

// Weighted scenarios for realistic payment failure distribution
const CHAOS_SCENARIOS = [
  { name: "Success", token: "tok_visa", weight: 0.40, expectsFailure: false },
  { name: "Wallet Friction", token: "tok_chargeDeclinedInsufficientFunds", weight: 0.20, expectsFailure: true },
  { name: "Card Attrition", token: "tok_chargeDeclinedExpiredCard", weight: 0.15, expectsFailure: true },
  { name: "Fraud/Risk", token: "tok_chargeDeclinedStolenCard", weight: 0.10, expectsFailure: true },
  { name: "Generic Decline", token: "tok_chargeDeclined", weight: 0.15, expectsFailure: true },
];

// Weighted random selection for chaos scenarios
function selectChaosScenario(): typeof CHAOS_SCENARIOS[0] {
  const totalWeight = CHAOS_SCENARIOS.reduce((sum, s) => sum + s.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const scenario of CHAOS_SCENARIOS) {
    random -= scenario.weight;
    if (random <= 0) return scenario;
  }
  
  return CHAOS_SCENARIOS[CHAOS_SCENARIOS.length - 1];
}

// Generate random date within last N days (ISO string)
function randomBackdateISO(maxDays: number = 365): string {
  const now = Date.now();
  const maxMs = maxDays * 24 * 60 * 60 * 1000;
  const randomOffset = Math.floor(Math.random() * maxMs);
  return new Date(now - randomOffset).toISOString();
}

// Random amount between min and max cents
function randomAmount(minCents: number = 1000, maxCents: number = 50000): number {
  return Math.floor(Math.random() * (maxCents - minCents + 1)) + minCents;
}

export interface SeedStripeResult {
  success: boolean;
  message: string;
  customersCreated?: number;
  invoicesCreated?: number;
  successfulPayments?: number;
  failedPayments?: number;
  errors?: string[];
}

const CHAOS_ITERATION_COUNT = 50;

export async function seedStripeData(merchantId: string): Promise<SeedStripeResult> {
  console.log(`[CHAOS ENGINE v2] Starting Stripe Load Generator for merchant ${merchantId}...`);
  
  // Step 1: Retrieve merchant record
  const merchant = await storage.getMerchant(merchantId);
  if (!merchant) {
    throw new Error(`Merchant with ID ${merchantId} not found.`);
  }
  
  if (!merchant.encryptedToken || !merchant.iv || !merchant.tag) {
    throw new Error("Merchant has no Stripe credentials stored. Complete OAuth first.");
  }
  
  // Step 2: Decrypt the Stripe access token
  const stripeKey = decrypt(merchant.encryptedToken, merchant.iv, merchant.tag);
  
  // Step 3: CRITICAL SAFETY INTERLOCK
  // This is the most important check in the entire system.
  // The Chaos Engine MUST NEVER pollute a live Stripe ledger.
  if (!stripeKey.startsWith("sk_test_")) {
    throw new Error(
      "ABORT: Chaos Engine is restricted to Stripe Test Mode (sk_test_ keys) to prevent live ledger pollution. " +
      "This operation requires a Stripe TEST mode API key. Production keys (sk_live_) are blocked."
    );
  }
  
  console.log("[CHAOS ENGINE v2] Safety interlock passed: Stripe Test Mode confirmed.");
  
  // Step 4: Initialize Stripe client
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-12-15.clover" });
  
  // Verify connection by fetching account
  const account = await stripe.accounts.retrieve();
  console.log(`[CHAOS ENGINE v2] Connected to Stripe account: ${account.id}`);
  
  // Step 5: The Chaos Loop - 50 iterations
  const errors: string[] = [];
  let customersCreated = 0;
  let invoicesCreated = 0;
  let successfulPayments = 0;
  let failedPayments = 0;
  
  console.log(`[CHAOS ENGINE v2] Beginning ${CHAOS_ITERATION_COUNT} chaos iterations...`);
  
  for (let i = 1; i <= CHAOS_ITERATION_COUNT; i++) {
    try {
      // Select scenario for this iteration
      const scenario = selectChaosScenario();
      
      // Generate realistic customer data using faker
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const customerName = `${firstName} ${lastName}`;
      const email = faker.internet.email({ firstName, lastName, provider: "chaos-test.phantom.io" });
      
      // Create customer in Stripe
      const customer = await stripe.customers.create({
        name: customerName,
        email: email,
        metadata: {
          phantom_chaos_engine: "true",
          iteration: String(i),
          scenario: scenario.name,
        }
      });
      customersCreated++;
      
      // Generate time-traveled date (within last 365 days)
      const simulatedCreatedAt = randomBackdateISO(365);
      
      // Generate random amount (1000 to 50000 cents = £10 to £500)
      const amount = randomAmount(1000, 50000);
      
      // Create invoice item
      await stripe.invoiceItems.create({
        customer: customer.id,
        amount: amount,
        currency: "gbp",
        description: `PHANTOM Chaos Test - ${scenario.name} Scenario`,
      });
      
      // Create invoice with simulated_created_at metadata
      const invoice = await stripe.invoices.create({
        customer: customer.id,
        auto_advance: false,
        metadata: {
          simulated_created_at: simulatedCreatedAt,
          phantom_chaos_engine: "true",
          scenario: scenario.name,
        }
      });
      invoicesCreated++;
      
      // Finalize the invoice
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
      
      // Attempt to pay with scenario token
      try {
        // Create a payment source for the customer
        const paymentSource = await stripe.customers.createSource(customer.id, {
          source: scenario.token,
        });
        
        // Pay the invoice
        await stripe.invoices.pay(finalizedInvoice.id, {
          source: paymentSource.id,
        });
        
        successfulPayments++;
        console.log(`[CHAOS ENGINE v2] [${i}/${CHAOS_ITERATION_COUNT}] ${customerName}: Payment SUCCESS (${scenario.name})`);
        
      } catch (payError: any) {
        // Expected failure for most scenarios
        failedPayments++;
        const declineCode = payError.raw?.decline_code || payError.code || "unknown";
        console.log(`[CHAOS ENGINE v2] [${i}/${CHAOS_ITERATION_COUNT}] ${customerName}: Payment DECLINED - ${scenario.name} (${declineCode})`);
      }
      
      // Progress log every 10 iterations
      if (i % 10 === 0) {
        console.log(`[CHAOS ENGINE v2] Progress: ${i}/${CHAOS_ITERATION_COUNT} - ${successfulPayments} paid, ${failedPayments} declined`);
      }
      
    } catch (err: any) {
      const msg = `Iteration ${i} failed: ${err.message}`;
      console.error(`[CHAOS ENGINE v2] ERROR: ${msg}`);
      errors.push(msg);
    }
  }
  
  console.log("[CHAOS ENGINE v2] ===== CHAOS GENERATION COMPLETE =====");
  console.log(`[CHAOS ENGINE v2] Customers created: ${customersCreated}`);
  console.log(`[CHAOS ENGINE v2] Invoices created: ${invoicesCreated}`);
  console.log(`[CHAOS ENGINE v2] Successful payments: ${successfulPayments}`);
  console.log(`[CHAOS ENGINE v2] Failed payments: ${failedPayments}`);
  console.log(`[CHAOS ENGINE v2] Errors: ${errors.length}`);
  
  return {
    success: errors.length === 0,
    message: `Chaos complete. ${customersCreated} customers, ${invoicesCreated} invoices, ${successfulPayments} paid, ${failedPayments} declined.`,
    customersCreated,
    invoicesCreated,
    successfulPayments,
    failedPayments,
    errors
  };
}
