import Stripe from "stripe";
import { storage } from "../storage";
import { decrypt, redactEmail } from "../utils/crypto";
import { determineRecoveryStrategy } from "./ghostHunter";

const TEST_MERCHANT_ID = "395d4e40-7daf-4d55-9843-78403f2bc9fd";
const PRODUCT_NAME = "PHANTOM Test Tier";

// ============================================================
// THE SYNTHETIC CHAOS ENGINE
// Procedural generator for realistic payment failure scenarios
// ============================================================

// SaaS Pricing Tiers (Weighted Distribution)
const PRICING_TIERS = [
  { label: "Starter", amount: 2900, weight: 0.45 },
  { label: "Pro", amount: 9900, weight: 0.35 },
  { label: "Business", amount: 29900, weight: 0.15 },
  { label: "Enterprise", amount: 249900, weight: 0.05 },
];

// Failure Scenarios (Diagnostic DNA)
const SCENARIOS = [
  { code: "insufficient_funds", category: "Wallet Friction", strategy: "smart_retry", declineType: "soft" as const, weight: 0.4 },
  { code: "expired_card", category: "Card Attrition", strategy: "card_refresh", declineType: "hard" as const, weight: 0.3 },
  { code: "do_not_honor", category: "High-Risk", strategy: "manual_review", declineType: "soft" as const, weight: 0.1 },
  { code: "generic_decline", category: "Technical Bottleneck", strategy: "technical_bridge", declineType: "soft" as const, weight: 0.15 },
  { code: "stolen_card", category: "Fraud/Security", strategy: "block_and_alert", declineType: "hard" as const, weight: 0.05 },
];

// Card Brands (weighted by market share)
const CARD_BRANDS = [
  { brand: "visa", weight: 0.50 },
  { brand: "mastercard", weight: 0.30 },
  { brand: "amex", weight: 0.15 },
  { brand: "discover", weight: 0.05 },
];

// Card Funding Types
const CARD_FUNDING = [
  { funding: "credit", weight: 0.60 },
  { funding: "debit", weight: 0.35 },
  { funding: "prepaid", weight: 0.05 },
];

// Country Codes (weighted by SaaS customer distribution)
const COUNTRY_CODES = [
  { code: "us", weight: 0.40 },
  { code: "gb", weight: 0.20 },
  { code: "ca", weight: 0.10 },
  { code: "de", weight: 0.08 },
  { code: "au", weight: 0.07 },
  { code: "fr", weight: 0.05 },
  { code: "nl", weight: 0.04 },
  { code: "ie", weight: 0.03 },
  { code: "se", weight: 0.02 },
  { code: "jp", weight: 0.01 },
];

// Multi-Currency Support (mapped to regions)
const CURRENCIES: ("gbp" | "usd" | "eur")[] = ["usd", "gbp", "eur"];

// Realistic first names
const FIRST_NAMES = [
  "James", "Emma", "Oliver", "Sophia", "William", "Isabella", "Benjamin", "Mia",
  "Lucas", "Charlotte", "Henry", "Amelia", "Alexander", "Harper", "Daniel", "Evelyn",
  "Michael", "Abigail", "Sebastian", "Emily", "Jack", "Elizabeth", "Aiden", "Sofia",
  "Owen", "Avery", "Samuel", "Ella", "Ryan", "Scarlett", "Nathan", "Grace", "Leo",
  "Chloe", "Isaac", "Victoria", "Thomas", "Riley", "Charles", "Aria", "Caleb",
  "Lily", "Joshua", "Zoey", "Ethan", "Penelope", "Mason", "Layla", "David", "Nora"
];

// Realistic last names
const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
  "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter"
];

// Ghost statuses for variety
const GHOST_STATUSES = [
  { status: "pending" as const, weight: 0.50 },
  { status: "engaged" as const, weight: 0.25 },
  { status: "exhausted" as const, weight: 0.10 },
  { status: "recovered" as const, weight: 0.10 },
  { status: "protected" as const, weight: 0.05 },
];

// Configuration
const SYNTHETIC_GHOST_COUNT = 150;

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

// Weighted random selection helper
function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  
  return items[items.length - 1];
}

// Generate random date within last N days
function randomBackdate(maxDays: number = 90): Date {
  const now = Date.now();
  const maxMs = maxDays * 24 * 60 * 60 * 1000;
  const randomOffset = Math.floor(Math.random() * maxMs);
  return new Date(now - randomOffset);
}

// Generate synthetic Stripe-like invoice ID
function generateInvoiceId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "in_synth_";
  for (let i = 0; i < 14; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Generate synthetic Stripe-like customer ID
function generateCustomerId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "cus_synth_";
  for (let i = 0; i < 14; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Generate random customer name
function generateCustomerName(): string {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${firstName} ${lastName}`;
}

// Generate random email from name
function generateEmail(name: string, index: number): string {
  const nameParts = name.toLowerCase().split(" ");
  const variations = [
    `${nameParts[0]}.${nameParts[1]}`,
    `${nameParts[0]}${nameParts[1]}`,
    `${nameParts[0]}_${nameParts[1]}`,
    `${nameParts[0][0]}${nameParts[1]}`,
  ];
  const emailBase = variations[Math.floor(Math.random() * variations.length)];
  const domains = ["gmail.com", "outlook.com", "yahoo.com", "icloud.com", "proton.me"];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${emailBase}+synth${index}@${domain}`;
}

// Generate email send count based on status
function generateEmailsSent(status: string): number {
  switch (status) {
    case "pending": return 0;
    case "engaged": return Math.floor(Math.random() * 2) + 1;
    case "exhausted": return 3;
    case "recovered": return Math.floor(Math.random() * 3) + 1;
    case "protected": return Math.floor(Math.random() * 2) + 1;
    default: return 0;
  }
}

// Generate last email date based on status and discovery
function generateLastEmailAt(status: string, discoveredAt: Date): Date | null {
  if (status === "pending") return null;
  
  const daysSinceDiscovery = Math.floor((Date.now() - discoveredAt.getTime()) / (24 * 60 * 60 * 1000));
  const emailDaysAfter = Math.min(Math.floor(Math.random() * daysSinceDiscovery) + 1, daysSinceDiscovery);
  
  const emailDate = new Date(discoveredAt);
  emailDate.setDate(emailDate.getDate() + emailDaysAfter);
  return emailDate;
}

// Generate random currency based on country
function getCurrencyForCountry(countryCode: string): "gbp" | "usd" | "eur" {
  if (countryCode === "gb") return "gbp";
  if (["us", "ca", "au"].includes(countryCode)) return "usd";
  if (["de", "fr", "nl", "ie", "se"].includes(countryCode)) return "eur";
  return CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)];
}

interface SyntheticGhost {
  merchantId: string;
  email: string;
  customerName: string;
  amount: number;
  invoiceId: string;
  purgeAt: Date;
  status: "pending" | "engaged" | "exhausted" | "recovered" | "protected";
  stripeCustomerId: string | null;
  failureReason: string | null;
  declineType: "soft" | "hard" | null;
  failureCode: string | null;
  failureMessage: string | null;
  cardBrand: string | null;
  cardFunding: string | null;
  countryCode: string | null;
  requires3ds: boolean | null;
  recoveryStrategy: string | null;
  emailsSent: number;
  lastEmailAt: Date | null;
  currency: string;
}

// Generate a single synthetic ghost
function generateSyntheticGhost(merchantId: string, index: number): SyntheticGhost {
  const pricingTier = weightedRandom(PRICING_TIERS);
  const scenario = weightedRandom(SCENARIOS);
  const cardBrand = weightedRandom(CARD_BRANDS);
  const cardFunding = weightedRandom(CARD_FUNDING);
  const country = weightedRandom(COUNTRY_CODES);
  const statusObj = weightedRandom(GHOST_STATUSES);
  
  const customerName = generateCustomerName();
  const email = generateEmail(customerName, index);
  const discoveredAt = randomBackdate(90);
  const currency = getCurrencyForCountry(country.code);
  
  const purgeAt = new Date(discoveredAt);
  purgeAt.setDate(purgeAt.getDate() + 90);
  
  const requires3ds = Math.random() < 0.15;
  
  const recoveryStrategy = determineRecoveryStrategy({
    requires3ds,
    declineType: scenario.declineType,
    amount: pricingTier.amount,
  });
  
  const emailsSent = generateEmailsSent(statusObj.status);
  const lastEmailAt = generateLastEmailAt(statusObj.status, discoveredAt);
  
  return {
    merchantId,
    email,
    customerName,
    amount: pricingTier.amount,
    invoiceId: generateInvoiceId(),
    purgeAt,
    status: statusObj.status,
    stripeCustomerId: generateCustomerId(),
    failureReason: scenario.code,
    declineType: scenario.declineType,
    failureCode: scenario.code,
    failureMessage: `Your card was declined (${scenario.code}).`,
    cardBrand: cardBrand.brand,
    cardFunding: cardFunding.funding,
    countryCode: country.code,
    requires3ds,
    recoveryStrategy,
    emailsSent,
    lastEmailAt,
    currency,
  };
}

// Generate all synthetic ghosts
async function generateAndInsertSyntheticGhosts(merchantId: string): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
  
  console.log(`[CHAOS ENGINE] Generating ${SYNTHETIC_GHOST_COUNT} synthetic ghosts...`);
  
  for (let i = 1; i <= SYNTHETIC_GHOST_COUNT; i++) {
    try {
      const ghost = generateSyntheticGhost(merchantId, i);
      
      await storage.upsertGhostTarget(ghost);
      created++;
      
      if (i % 25 === 0) {
        console.log(`[CHAOS ENGINE] Progress: ${i}/${SYNTHETIC_GHOST_COUNT} ghosts created`);
      }
    } catch (err: any) {
      const msg = `Ghost #${i} failed: ${err.message}`;
      console.error(`[CHAOS ENGINE] ${msg}`);
      errors.push(msg);
    }
  }
  
  return { created, errors };
}

// Print distribution statistics
function printDistributionStats(): void {
  console.log("[CHAOS ENGINE] Expected Distribution:");
  console.log("  Pricing Tiers:");
  PRICING_TIERS.forEach(t => console.log(`    ${t.label} ($${t.amount/100}): ${(t.weight * 100).toFixed(0)}%`));
  console.log("  Failure Scenarios:");
  SCENARIOS.forEach(s => console.log(`    ${s.category} (${s.code}): ${(s.weight * 100).toFixed(0)}%`));
  console.log("  Ghost Statuses:");
  GHOST_STATUSES.forEach(s => console.log(`    ${s.status}: ${(s.weight * 100).toFixed(0)}%`));
}

// Cache for prices per currency
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

export async function runSeeder(): Promise<SeederResult> {
  const errors: string[] = [];
  
  console.log("[CHAOS ENGINE] ===== SYNTHETIC CHAOS ENGINE STARTING =====");
  console.log(`[CHAOS ENGINE] Target: ${SYNTHETIC_GHOST_COUNT} procedurally generated ghosts`);
  printDistributionStats();
  
  const merchant = await storage.getMerchant(TEST_MERCHANT_ID);
  if (!merchant) {
    throw new Error("Test merchant not found. Run onboard-test-merchant first.");
  }
  
  const stripeKey = decrypt(merchant.encryptedToken, merchant.iv, merchant.tag);
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-12-15.clover" });
  
  const { productId } = await getOrCreateProduct(stripe);
  
  console.log("[CHAOS ENGINE] Beginning Synthetic Ghost Generation...");
  
  const result = await generateAndInsertSyntheticGhosts(TEST_MERCHANT_ID);
  errors.push(...result.errors);
  
  console.log("[CHAOS ENGINE] ===== SYNTHETIC CHAOS ENGINE COMPLETE =====");
  console.log(`[CHAOS ENGINE] Created: ${result.created}/${SYNTHETIC_GHOST_COUNT} ghosts`);
  console.log(`[CHAOS ENGINE] Errors: ${errors.length}`);
  
  if (result.created > 0) {
    await storage.updateMerchant(TEST_MERCHANT_ID, {
      impendingLeakageCents: result.created * 5000,
    });
    console.log(`[CHAOS ENGINE] Updated merchant leakage estimate`);
  }
  
  return {
    success: errors.length === 0,
    productId,
    priceId: "synthetic",
    created: {
      ghosts: result.created,
      risks: 0,
      successes: 0
    },
    errors
  };
}
