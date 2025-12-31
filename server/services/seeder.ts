import Stripe from "stripe";
import { storage } from "../storage";
import { decrypt } from "../utils/crypto";

const TEST_MERCHANT_ID = "8543bb9f-cda8-4631-951d-70fc7c01ec01";
const PRODUCT_NAME = "PHANTOM Test Tier";
const PRICE_AMOUNT = 5000; // £50.00 in pence
const EMAIL_BASE = "bencullen0123+phantom";

interface SeederResult {
  success: boolean;
  productId: string;
  priceId: string;
  created: {
    ghosts: number;
    risks: number;
    successes: number;
  };
  errors: string[];
}

async function getOrCreateProduct(stripe: Stripe): Promise<{ productId: string; priceId: string }> {
  console.log("[SEEDER] Checking for existing PHANTOM Test Tier product...");
  
  // Search for existing product
  const products = await stripe.products.list({ limit: 100 });
  let product = products.data.find(p => p.name === PRODUCT_NAME);
  
  if (!product) {
    console.log("[SEEDER] Creating PHANTOM Test Tier product...");
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      metadata: { phantom_test: "true" }
    });
    console.log(`[SEEDER] Product created: ${product.id}`);
  } else {
    console.log(`[SEEDER] Product found: ${product.id}`);
  }
  
  // Get or create price
  const prices = await stripe.prices.list({ product: product.id, limit: 10 });
  let price = prices.data.find(p => 
    p.unit_amount === PRICE_AMOUNT && 
    p.currency === "gbp" && 
    p.recurring?.interval === "month"
  );
  
  if (!price) {
    console.log("[SEEDER] Creating £50/month price...");
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: PRICE_AMOUNT,
      currency: "gbp",
      recurring: { interval: "month" },
      metadata: { phantom_test: "true" }
    });
    console.log(`[SEEDER] Price created: ${price.id}`);
  } else {
    console.log(`[SEEDER] Price found: ${price.id}`);
  }
  
  return { productId: product.id, priceId: price.id };
}

async function createGhostScenario(
  stripe: Stripe,
  priceId: string,
  index: number
): Promise<void> {
  const email = `${EMAIL_BASE}_ghost_${index}@gmail.com`;
  console.log(`[SEEDER] Creating Ghost #${index}: ${email}`);
  
  // Create customer with declined card token
  const customer = await stripe.customers.create({
    email,
    name: `Ghost Customer ${index}`,
    source: "tok_chargeDeclined",
    metadata: {
      phantom_test: "true",
      scenario: "ghost"
    }
  });
  console.log(`[SEEDER] Ghost customer created: ${customer.id}`);
  
  // Create subscription - this will fail to charge and create invoice.payment_failed
  try {
    await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      metadata: {
        phantom_test: "true",
        scenario: "ghost"
      },
      payment_behavior: "error_if_incomplete",
    });
  } catch (err: any) {
    // Expected - the subscription creation will fail due to declined card
    console.log(`[SEEDER] Ghost #${index} subscription failed (expected): ${err.message}`);
  }
}

async function createRiskScenario(
  stripe: Stripe,
  priceId: string,
  index: number
): Promise<void> {
  const email = `${EMAIL_BASE}_risk_${index}@gmail.com`;
  // Alternate between January and February 2026
  const expMonth = index % 2 === 0 ? 1 : 2;
  console.log(`[SEEDER] Creating Risk #${index}: ${email} (expires ${expMonth}/2026)`);
  
  // Create customer with payment method
  const customer = await stripe.customers.create({
    email,
    name: `Risk Customer ${index}`,
    metadata: {
      phantom_test: "true",
      scenario: "risk"
    }
  });
  
  // Create payment method with expiring card
  const paymentMethod = await stripe.paymentMethods.create({
    type: "card",
    card: {
      token: "tok_visa",
    },
  });
  
  // Update the payment method's card details to expire in 2026
  // Note: We can't directly set expiry on tok_visa, so we'll attach and use it
  // The expiry tracking will be handled by Stripe's card.exp_month and card.exp_year
  await stripe.paymentMethods.attach(paymentMethod.id, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethod.id }
  });
  
  console.log(`[SEEDER] Risk customer created: ${customer.id}`);
  
  // Create subscription
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    default_payment_method: paymentMethod.id,
    metadata: {
      phantom_test: "true",
      scenario: "risk",
      simulated_exp_month: String(expMonth),
      simulated_exp_year: "2026"
    }
  });
  console.log(`[SEEDER] Risk #${index} subscription created: ${subscription.id}`);
}

async function createSuccessScenario(
  stripe: Stripe,
  priceId: string,
  index: number
): Promise<void> {
  const email = `${EMAIL_BASE}_success_${index}@gmail.com`;
  console.log(`[SEEDER] Creating Success #${index}: ${email}`);
  
  // Create customer with working card
  const customer = await stripe.customers.create({
    email,
    name: `Success Customer ${index}`,
    source: "tok_visa",
    metadata: {
      phantom_test: "true",
      scenario: "success"
    }
  });
  console.log(`[SEEDER] Success customer created: ${customer.id}`);
  
  // Create subscription
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    metadata: {
      phantom_test: "true",
      scenario: "success"
    }
  });
  console.log(`[SEEDER] Success #${index} subscription created: ${subscription.id}`);
}

export async function runSeeder(): Promise<SeederResult> {
  const errors: string[] = [];
  let ghostsCreated = 0;
  let risksCreated = 0;
  let successesCreated = 0;
  
  console.log("[SEEDER] ===== SCENARIO SEEDER STARTING =====");
  
  // Get merchant and decrypt their Stripe key
  const merchant = await storage.getMerchant(TEST_MERCHANT_ID);
  if (!merchant) {
    throw new Error("Test merchant not found. Run onboard-test-merchant first.");
  }
  
  const stripeKey = decrypt(merchant.encryptedToken, merchant.iv, merchant.tag);
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-12-15.clover" });
  
  // Get or create product and price
  const { productId, priceId } = await getOrCreateProduct(stripe);
  
  console.log("[SEEDER] Beginning Manufacturing Loop...");
  
  // Create 10 Ghosts
  for (let i = 1; i <= 10; i++) {
    try {
      await createGhostScenario(stripe, priceId, i);
      ghostsCreated++;
    } catch (err: any) {
      const msg = `Ghost #${i} failed: ${err.message}`;
      console.error(`[SEEDER] ${msg}`);
      errors.push(msg);
    }
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }
  
  // Create 5 Risks
  for (let i = 1; i <= 5; i++) {
    try {
      await createRiskScenario(stripe, priceId, i);
      risksCreated++;
    } catch (err: any) {
      const msg = `Risk #${i} failed: ${err.message}`;
      console.error(`[SEEDER] ${msg}`);
      errors.push(msg);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  
  // Create 5 Successes
  for (let i = 1; i <= 5; i++) {
    try {
      await createSuccessScenario(stripe, priceId, i);
      successesCreated++;
    } catch (err: any) {
      const msg = `Success #${i} failed: ${err.message}`;
      console.error(`[SEEDER] ${msg}`);
      errors.push(msg);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log("[SEEDER] ===== SCENARIO SEEDER COMPLETE =====");
  console.log(`[SEEDER] Ghosts: ${ghostsCreated}/10, Risks: ${risksCreated}/5, Successes: ${successesCreated}/5`);
  
  return {
    success: errors.length === 0,
    productId,
    priceId,
    created: {
      ghosts: ghostsCreated,
      risks: risksCreated,
      successes: successesCreated
    },
    errors
  };
}
