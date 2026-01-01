import Stripe from "stripe";
import { storage } from "../storage";
import { decrypt } from "../utils/crypto";

const TEST_MERCHANT_ID = "395d4e40-7daf-4d55-9843-78403f2bc9fd";
const PRODUCT_NAME = "PHANTOM Test Tier";
const EMAIL_BASE = "bencullen0123+phantom";

// High-Velocity Data Scaling: Variable Pricing Tiers (in cents)
const PRICE_TIERS = [2500, 4900, 9900, 19900, 49900];

// Multi-Currency Support
const CURRENCIES: ("gbp" | "usd" | "eur")[] = ["gbp", "usd", "eur"];

// HAMMER DIRECTIVE: 30 Ghosts + 20 Risks = 50 ledger records
const GHOST_COUNT = 30;
const RISK_COUNT = 20;
const SUCCESS_COUNT = 50;

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

// Time-Travel Logic: Generate random date within last 90 days
function randomBackdate(): Date {
  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const randomOffset = Math.floor(Math.random() * ninetyDaysMs);
  return new Date(now - randomOffset);
}

// Random selection helpers
function randomPrice(): number {
  return PRICE_TIERS[Math.floor(Math.random() * PRICE_TIERS.length)];
}

function randomCurrency(): "gbp" | "usd" | "eur" {
  return CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)];
}

// Cache for prices per currency (we need different Stripe prices for each currency)
const priceCache: Map<string, string> = new Map();

async function getOrCreateProduct(stripe: Stripe): Promise<{ productId: string }> {
  console.log("[SEEDER] Checking for existing PHANTOM Test Tier product...");
  
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
  
  return { productId: product.id };
}

async function getOrCreatePrice(
  stripe: Stripe, 
  productId: string, 
  amount: number, 
  currency: string
): Promise<string> {
  const cacheKey = `${productId}_${amount}_${currency}`;
  
  if (priceCache.has(cacheKey)) {
    return priceCache.get(cacheKey)!;
  }
  
  // Search for existing price
  const prices = await stripe.prices.list({ product: productId, limit: 100 });
  let price = prices.data.find(p => 
    p.unit_amount === amount && 
    p.currency === currency && 
    p.recurring?.interval === "month"
  );
  
  if (!price) {
    console.log(`[SEEDER] Creating ${currency.toUpperCase()} ${amount/100} price...`);
    price = await stripe.prices.create({
      product: productId,
      unit_amount: amount,
      currency: currency,
      recurring: { interval: "month" },
      metadata: { phantom_test: "true" }
    });
  }
  
  priceCache.set(cacheKey, price.id);
  return price.id;
}

async function createGhostScenario(
  stripe: Stripe,
  productId: string,
  index: number,
  merchantId: string
): Promise<void> {
  const email = `${EMAIL_BASE}_ghost_${index}@gmail.com`;
  const customerName = `Ghost Customer ${index}`;
  const amount = randomPrice();
  const currency = randomCurrency();
  const discoveredAt = randomBackdate();
  
  console.log(`[SEEDER] Creating Ghost #${index}: ${email} (${currency.toUpperCase()} ${amount/100}, discovered: ${discoveredAt.toISOString().split('T')[0]})`);
  
  let customerId = `cus_mock_ghost_${index}`;
  let invoiceId = `inv_mock_ghost_${index}_${Date.now()}`;
  let invoiceAmount = amount;
  
  // HAMMER DIRECTIVE: Stripe operations inside try/catch, persistence guaranteed outside
  try {
    const priceId = await getOrCreatePrice(stripe, productId, amount, currency);
    
    const customer = await stripe.customers.create({
      email,
      name: customerName,
      metadata: {
        phantom_test: "true",
        scenario: "ghost"
      }
    });
    customerId = customer.id;
    
    try {
      await stripe.customers.createSource(customer.id, { source: "tok_chargeDeclined" });
    } catch (err: any) {
      // Expected - card will be declined
    }
    
    try {
      await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        metadata: {
          phantom_test: "true",
          scenario: "ghost"
        },
        payment_behavior: "allow_incomplete",
      });
    } catch (err: any) {
      // Expected - subscription may fail
    }
    
    const invoices = await stripe.invoices.list({ customer: customer.id, limit: 1 });
    if (invoices.data.length > 0) {
      invoiceId = invoices.data[0].id;
      invoiceAmount = invoices.data[0].amount_due || amount;
    }
  } catch (stripeErr: any) {
    console.log(`[SEEDER] Ghost #${index} Stripe failed (${stripeErr.message}), using mock IDs`);
  }
  
  // GUARANTEED PERSISTENCE: Always inject to ledger regardless of Stripe status
  const purgeAt = new Date();
  purgeAt.setDate(purgeAt.getDate() + 90);
  
  await storage.upsertGhostTarget({
    merchantId,
    email,
    customerName,
    amount: invoiceAmount,
    invoiceId,
    purgeAt,
    discoveredAt,
    status: "pending",
    stripeCustomerId: customerId,
    failureReason: "card_declined",
    declineType: "hard",
  });
  
  console.log(`[SEEDER] Ghost #${index} injected: ${invoiceId}, ${currency.toUpperCase()} ${invoiceAmount/100}`);
}

async function createRiskScenario(
  stripe: Stripe,
  productId: string,
  index: number,
  merchantId: string
): Promise<void> {
  const email = `${EMAIL_BASE}_risk_${index}@gmail.com`;
  const customerName = `Risk Customer ${index}`;
  const amount = randomPrice();
  const currency = randomCurrency();
  const discoveredAt = randomBackdate();
  const expMonth = index % 2 === 0 ? 1 : 2;
  
  console.log(`[SEEDER] Creating Risk #${index}: ${email} (${currency.toUpperCase()} ${amount/100}, expires ${expMonth}/2026, discovered: ${discoveredAt.toISOString().split('T')[0]})`);
  
  let customerId = `cus_mock_risk_${index}`;
  let subscriptionId = `sub_mock_risk_${index}_${Date.now()}`;
  
  // HAMMER DIRECTIVE: Stripe operations inside try/catch, persistence guaranteed outside
  try {
    const priceId = await getOrCreatePrice(stripe, productId, amount, currency);
    
    const customer = await stripe.customers.create({
      email,
      name: customerName,
      source: "tok_visa",
      metadata: {
        phantom_test: "true",
        scenario: "risk",
        simulated_exp_month: String(expMonth),
        simulated_exp_year: "2026"
      }
    });
    customerId = customer.id;
    
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      metadata: {
        phantom_test: "true",
        scenario: "risk",
        simulated_exp_month: String(expMonth),
        simulated_exp_year: "2026"
      }
    });
    subscriptionId = subscription.id;
  } catch (stripeErr: any) {
    console.log(`[SEEDER] Risk #${index} Stripe failed (${stripeErr.message}), using mock IDs`);
  }
  
  // GUARANTEED PERSISTENCE: Always inject to ledger regardless of Stripe status
  const purgeAt = new Date();
  purgeAt.setDate(purgeAt.getDate() + 90);
  
  await storage.upsertGhostTarget({
    merchantId,
    email,
    customerName,
    amount,
    invoiceId: `impending_${subscriptionId}`,
    purgeAt,
    discoveredAt,
    status: "impending",
    stripeCustomerId: customerId,
  });
  
  console.log(`[SEEDER] Risk #${index} injected: ${subscriptionId}, ${currency.toUpperCase()} ${amount/100}`);
}

async function createSuccessScenario(
  stripe: Stripe,
  productId: string,
  index: number
): Promise<void> {
  const email = `${EMAIL_BASE}_success_${index}@gmail.com`;
  const amount = randomPrice();
  const currency = randomCurrency();
  
  console.log(`[SEEDER] Creating Success #${index}: ${email} (${currency.toUpperCase()} ${amount/100})`);
  
  const priceId = await getOrCreatePrice(stripe, productId, amount, currency);
  
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
  
  // Create subscription (these are healthy, don't inject to ledger)
  await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    metadata: {
      phantom_test: "true",
      scenario: "success"
    }
  });
  
  console.log(`[SEEDER] Success #${index} subscription created`);
}

export async function runSeeder(): Promise<SeederResult> {
  const errors: string[] = [];
  let ghostsCreated = 0;
  let risksCreated = 0;
  let successesCreated = 0;
  
  console.log("[SEEDER] ===== HIGH-VELOCITY SCENARIO SEEDER STARTING =====");
  console.log(`[SEEDER] Target: ${GHOST_COUNT} Ghosts, ${RISK_COUNT} Risks, ${SUCCESS_COUNT} Successes`);
  console.log(`[SEEDER] Price Tiers: ${PRICE_TIERS.map(p => p/100).join(', ')}`);
  console.log(`[SEEDER] Currencies: ${CURRENCIES.join(', ').toUpperCase()}`);
  
  // Get merchant and decrypt their Stripe key
  const merchant = await storage.getMerchant(TEST_MERCHANT_ID);
  if (!merchant) {
    throw new Error("Test merchant not found. Run onboard-test-merchant first.");
  }
  
  const stripeKey = decrypt(merchant.encryptedToken, merchant.iv, merchant.tag);
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-12-15.clover" });
  
  // Get or create product
  const { productId } = await getOrCreateProduct(stripe);
  
  console.log("[SEEDER] Beginning Manufacturing Loop...");
  
  // Create Ghosts
  for (let i = 1; i <= GHOST_COUNT; i++) {
    try {
      await createGhostScenario(stripe, productId, i, TEST_MERCHANT_ID);
      ghostsCreated++;
    } catch (err: any) {
      const msg = `Ghost #${i} failed: ${err.message}`;
      console.error(`[SEEDER] ${msg}`);
      errors.push(msg);
    }
    await new Promise(r => setTimeout(r, 150));
  }
  
  // Create Risks
  for (let i = 1; i <= RISK_COUNT; i++) {
    try {
      await createRiskScenario(stripe, productId, i, TEST_MERCHANT_ID);
      risksCreated++;
    } catch (err: any) {
      const msg = `Risk #${i} failed: ${err.message}`;
      console.error(`[SEEDER] ${msg}`);
      errors.push(msg);
    }
    await new Promise(r => setTimeout(r, 150));
  }
  
  // Create Successes
  for (let i = 1; i <= SUCCESS_COUNT; i++) {
    try {
      await createSuccessScenario(stripe, productId, i);
      successesCreated++;
    } catch (err: any) {
      const msg = `Success #${i} failed: ${err.message}`;
      console.error(`[SEEDER] ${msg}`);
      errors.push(msg);
    }
    await new Promise(r => setTimeout(r, 150));
  }
  
  console.log("[SEEDER] ===== HIGH-VELOCITY SEEDER COMPLETE =====");
  console.log(`[SEEDER] Ghosts: ${ghostsCreated}/${GHOST_COUNT}, Risks: ${risksCreated}/${RISK_COUNT}, Successes: ${successesCreated}/${SUCCESS_COUNT}`);
  
  return {
    success: errors.length === 0,
    productId,
    priceId: "dynamic",
    created: {
      ghosts: ghostsCreated,
      risks: risksCreated,
      successes: successesCreated
    },
    errors
  };
}
