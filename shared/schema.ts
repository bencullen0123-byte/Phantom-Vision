import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Merchants table - stores encrypted Stripe access tokens
export const merchants = pgTable("merchants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stripeUserId: text("stripe_user_id").notNull().unique(),
  encryptedToken: text("encrypted_token").notNull(),
  iv: text("iv").notNull(),
  tag: text("tag").notNull(),
  customEmailTemplate: text("custom_email_template"),
  recoveryStrategy: text("recovery_strategy").default("oracle").notNull(),
  businessName: text("business_name"),
  supportEmail: text("support_email"),
  totalRecoveredCents: bigint("total_recovered_cents", { mode: "number" }).default(0).notNull(),
  // Shadow Revenue Intelligence columns
  allTimeLeakedCents: bigint("all_time_leaked_cents", { mode: "number" }).default(0).notNull(),
  totalGhostCount: integer("total_ghost_count").default(0).notNull(),
  lastAuditAt: timestamp("last_audit_at"),
  // Tiered Capacity Gating: max pending ghosts allowed per subscription tier
  tierLimit: integer("tier_limit").default(50).notNull(),
  // Multi-Currency Revenue Firewall
  defaultCurrency: text("default_currency").default("gbp").notNull(),
  // Proactive Revenue Protection: tracks revenue from expiring cards
  impendingLeakageCents: bigint("impending_leakage_cents", { mode: "number" }).default(0).notNull(),
  // Revenue saved by proactive outreach
  totalProtectedCents: bigint("total_protected_cents", { mode: "number" }).default(0).notNull(),
});

export const insertMerchantSchema = createInsertSchema(merchants).omit({
  id: true,
});

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;

// Ghost targets table - stores transient PII for recovery
// Status values: 'pending', 'recovered', 'exhausted', 'impending'
// - 'pending': ghost user with failed payment requiring recovery
// - 'impending': proactive detection - active subscription with expiring card
// PII (email, customerName) is encrypted with AES-256-GCM before storage
export const ghostTargets = pgTable("ghost_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id),
  // Encrypted email fields (AES-256-GCM)
  emailCiphertext: text("email_ciphertext").notNull(),
  emailIv: text("email_iv").notNull(),
  emailTag: text("email_tag").notNull(),
  // Encrypted customer name fields (AES-256-GCM)
  customerNameCiphertext: text("customer_name_ciphertext").notNull(),
  customerNameIv: text("customer_name_iv").notNull(),
  customerNameTag: text("customer_name_tag").notNull(),
  amount: integer("amount").notNull(),
  invoiceId: text("invoice_id").notNull().unique(),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  purgeAt: timestamp("purge_at").notNull(),
  lastEmailedAt: timestamp("last_emailed_at"),
  emailCount: integer("email_count").default(0).notNull(),
  status: text("status").default("pending").notNull(),
  recoveredAt: timestamp("recovered_at"),
  // Attribution tracking: when set, payment within window is directly attributed to PHANTOM
  attributionExpiresAt: timestamp("attribution_expires_at"),
  // Recovery type: 'direct' (PHANTOM-attributed) or 'organic' (independent payment)
  recoveryType: text("recovery_type"),
  // Intelligent Decline Branching: raw Stripe decline code
  failureReason: text("failure_reason"),
  // Decline type: 'soft' (retriable) or 'hard' (requires card update)
  declineType: text("decline_type"),
  // Stripe Customer ID for customer portal redirects
  stripeCustomerId: text("stripe_customer_id"),
  // Failure Capture Expansion: detailed Stripe failure info from Payment Intent
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
});

// Internal schema for database operations (uses encrypted fields)
export const insertGhostTargetDbSchema = createInsertSchema(ghostTargets).omit({
  id: true,
  discoveredAt: true,
});

export type InsertGhostTargetDb = z.infer<typeof insertGhostTargetDbSchema>;

// Application-level type with plaintext PII (used in business logic)
export interface InsertGhostTarget {
  merchantId: string;
  email: string;
  customerName: string;
  amount: number;
  invoiceId: string;
  purgeAt: Date;
  lastEmailedAt?: Date | null;
  emailCount?: number;
  status?: string;
  recoveredAt?: Date | null;
  attributionExpiresAt?: Date | null;
  recoveryType?: string | null;
  failureReason?: string | null;
  declineType?: string | null;
  stripeCustomerId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

// Application-level type with plaintext PII (returned by storage layer)
export interface GhostTarget {
  id: string;
  merchantId: string;
  email: string;
  customerName: string;
  amount: number;
  invoiceId: string;
  discoveredAt: Date;
  purgeAt: Date;
  lastEmailedAt: Date | null;
  emailCount: number;
  status: string;
  recoveredAt: Date | null;
  attributionExpiresAt: Date | null;
  recoveryType: string | null;
  failureReason: string | null;
  declineType: string | null;
  stripeCustomerId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

// Raw database type (encrypted fields)
export type GhostTargetDb = typeof ghostTargets.$inferSelect;

// Liquidity oracle table - stores anonymized metadata
export const liquidityOracle = pgTable("liquidity_oracle", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id),
  businessCategory: text("business_category").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  hourOfDay: integer("hour_of_day").notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertLiquidityOracleSchema = createInsertSchema(liquidityOracle).omit({
  id: true,
  recordedAt: true,
});

export type InsertLiquidityOracle = z.infer<typeof insertLiquidityOracleSchema>;
export type LiquidityOracle = typeof liquidityOracle.$inferSelect;

// System logs table - records heartbeat runs for health monitoring
export const systemLogs = pgTable("system_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobName: text("job_name").notNull(),
  status: text("status").notNull(),
  details: text("details"),
  errorMessage: text("error_message"),
  runAt: timestamp("run_at").defaultNow().notNull(),
});

export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({
  id: true,
  runAt: true,
});

export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;
export type SystemLog = typeof systemLogs.$inferSelect;

// Cron locks table - industrial-grade job locking to prevent overlaps
export const cronLocks = pgTable("cron_locks", {
  jobName: text("job_name").primaryKey(),
  holderId: text("holder_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CronLock = typeof cronLocks.$inferSelect;
