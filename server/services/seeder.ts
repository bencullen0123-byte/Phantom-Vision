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

// Generate random start date for subscription (around 150 days ago with some variance)
function randomSubscriptionStartDate(): Date {
  const now = Date.now();
  // Random offset between 120-180 days ago (roughly 150 days)
  const minDaysAgo = 120;
  const maxDaysAgo = 180;
  const daysAgo = minDaysAgo + Math.floor(Math.random() * (maxDaysAgo - minDaysAgo + 1));
  const offsetMs = daysAgo * 24 * 60 * 60 * 1000;
  return new Date(now - offsetMs);
}

// Calculate invoice date for a specific month in a subscription chain
function calculateMonthDate(startDate: Date, monthIndex: number): string {
  const date = new Date(startDate.getTime());
  date.setDate(date.getDate() + (monthIndex * 30)); // Add 30 days per month
  return date.toISOString();
}

// Random amount between min and max cents (subscription tiers)
function randomSubscriptionAmount(): number {
  // Subscription tiers: £19, £49, £99, £199, £299 (in cents)
  const tiers = [1900, 4900, 9900, 19900, 29900];
  return tiers[Math.floor(Math.random() * tiers.length)];
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

// Subscription simulation constants
const CUSTOMER_COUNT = 10;        // Number of subscription customers
const MONTHS_PER_CUSTOMER = 5;    // Months of billing history per customer
const TOTAL_INVOICES = CUSTOMER_COUNT * MONTHS_PER_CUSTOMER; // 50 total invoices

export async function seedStripeData(merchantId: string): Promise<SeedStripeResult> {
  console.log(`[CHAOS ENGINE v3] Starting Subscription Simulator for merchant ${merchantId}...`);
  
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
  
  console.log("[CHAOS ENGINE v3] Safety interlock passed: Stripe Test Mode confirmed.");
  
  // Step 4: Initialize Stripe client
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-12-15.clover" });
  
  // Verify connection by fetching account
  const account = await stripe.accounts.retrieve();
  console.log(`[CHAOS ENGINE v3] Connected to Stripe account: ${account.id}`);
  
  // Step 5: Subscription Lifecycle Simulation
  const errors: string[] = [];
  let customersCreated = 0;
  let invoicesCreated = 0;
  let successfulPayments = 0;
  let failedPayments = 0;
  
  console.log(`[CHAOS ENGINE v3] Beginning subscription simulation: ${CUSTOMER_COUNT} customers x ${MONTHS_PER_CUSTOMER} months = ${TOTAL_INVOICES} invoices...`);
  
  // OUTER LOOP: Create 10 subscription customers
  for (let customerIndex = 1; customerIndex <= CUSTOMER_COUNT; customerIndex++) {
    try {
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
          customer_index: String(customerIndex),
          billing_type: "subscription",
        }
      });
      customersCreated++;
      
      // Generate subscription start date (~150 days ago)
      const subscriptionStartDate = randomSubscriptionStartDate();
      
      // Generate consistent subscription amount for this customer
      const subscriptionAmount = randomSubscriptionAmount();
      
      console.log(`[CHAOS ENGINE v3] [Customer ${customerIndex}/${CUSTOMER_COUNT}] ${customerName} - Starting ${MONTHS_PER_CUSTOMER}-month lifecycle (£${(subscriptionAmount / 100).toFixed(2)}/mo)`);
      
      // INNER LOOP: Create 5 monthly invoices for this customer
      for (let monthIndex = 0; monthIndex < MONTHS_PER_CUSTOMER; monthIndex++) {
        const monthNumber = monthIndex + 1;
        
        try {
          // PASSIVE CHURN LOGIC:
          // Months 1-2: Always succeed (tok_visa) - representing initial "happy path"
          // Months 3-5: Use random scenario selection - representing natural churn patterns
          let scenario: typeof CHAOS_SCENARIOS[0];
          if (monthNumber <= 2) {
            // Guaranteed success for first 2 months (honeymoon period)
            scenario = CHAOS_SCENARIOS[0]; // tok_visa - Success
          } else {
            // Random outcome for months 3-5 (churn territory)
            scenario = selectChaosScenario();
          }
          
          // Calculate simulated date for this month's invoice
          const simulatedCreatedAt = calculateMonthDate(subscriptionStartDate, monthIndex);
          
          // EXPLICIT LINKING PATTERN (fixes zero-value invoice race condition):
          // Step 1: Create invoice shell FIRST with auto_advance: false
          const invoice = await stripe.invoices.create({
            customer: customer.id,
            auto_advance: false,
            metadata: {
              simulated_created_at: simulatedCreatedAt,
              phantom_chaos_engine: "true",
              billing_type: "subscription",
              billing_month: String(monthNumber),
              scenario: scenario.name,
            }
          });
          
          // Step 2: Create invoice item with EXPLICIT invoice linking
          await stripe.invoiceItems.create({
            customer: customer.id,
            invoice: invoice.id, // CRITICAL: explicit linking prevents race condition
            amount: subscriptionAmount,
            currency: "gbp",
            description: `Subscription Renewal: Professional Plan (Month ${monthNumber})`,
          });
          invoicesCreated++;
          
          // Step 3: Finalize the invoice (now guaranteed to have the line item)
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
            console.log(`  [Month ${monthNumber}] Payment SUCCESS (${scenario.name})`);
            
          } catch (payError: any) {
            // Expected failure for decline scenarios
            failedPayments++;
            const declineCode = payError.raw?.decline_code || payError.code || "unknown";
            console.log(`  [Month ${monthNumber}] Payment DECLINED - ${scenario.name} (${declineCode})`);
          }
          
        } catch (monthErr: any) {
          const msg = `Customer ${customerIndex} Month ${monthNumber} failed: ${monthErr.message}`;
          console.error(`[CHAOS ENGINE v3] ERROR: ${msg}`);
          errors.push(msg);
        }
      }
      
      // Progress log after each customer
      console.log(`[CHAOS ENGINE v3] Progress: ${customerIndex}/${CUSTOMER_COUNT} customers complete - ${successfulPayments} paid, ${failedPayments} declined`);
      
    } catch (err: any) {
      const msg = `Customer ${customerIndex} creation failed: ${err.message}`;
      console.error(`[CHAOS ENGINE v3] ERROR: ${msg}`);
      errors.push(msg);
    }
  }
  
  console.log("[CHAOS ENGINE v3] ===== SUBSCRIPTION SIMULATION COMPLETE =====");
  console.log(`[CHAOS ENGINE v3] Customers created: ${customersCreated}`);
  console.log(`[CHAOS ENGINE v3] Invoices created: ${invoicesCreated}`);
  console.log(`[CHAOS ENGINE v3] Successful payments: ${successfulPayments}`);
  console.log(`[CHAOS ENGINE v3] Failed payments: ${failedPayments}`);
  console.log(`[CHAOS ENGINE v3] Errors: ${errors.length}`);
  
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
