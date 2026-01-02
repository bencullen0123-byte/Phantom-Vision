import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, bigint, boolean, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// API REQUEST VALIDATION SCHEMAS
// ============================================================================

// POST /api/scan request body validation
export const scanRequestSchema = z.object({
  forceSync: z.boolean().optional().default(false),
});

export type ScanRequest = z.infer<typeof scanRequestSchema>;

// PATCH /api/merchant/branding request body validation
export const merchantBrandingUpdateSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  supportEmail: z.string().email().optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color").optional(),
  autoPilotEnabled: z.boolean().optional(),
});

export type MerchantBrandingUpdate = z.infer<typeof merchantBrandingUpdateSchema>;

// POST /api/merchant/email-template request body validation
export const emailTemplateUpdateSchema = z.object({
  customEmailTemplate: z.string().max(10000).optional().nullable(),
});

export type EmailTemplateUpdate = z.infer<typeof emailTemplateUpdateSchema>;

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
  // Merchant Branding
  brandColor: text("brand_color").default("#6366f1"),
  autoPilotEnabled: boolean("auto_pilot_enabled").default(false).notNull(),
  // Gross Ecosystem Volume: Total invoiced (paid + unpaid) from last scan
  grossInvoicedCents: bigint("gross_invoiced_cents", { mode: "number" }).default(0).notNull(),
  // Async Audit Status: tracks background scan state
  lastAuditStatus: text("last_audit_status").default("idle").notNull(),
  // Cumulative Audit Proof: Total invoices ever vetted by Ghost Hunter
  totalVettedCount: integer("total_vetted_count").default(0).notNull(),
});

export const insertMerchantSchema = createInsertSchema(merchants).omit({
  id: true,
});

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;

// PII Vault table - GDPR-compliant segregated PII storage
// Decouples personal data from financial ledger for "Right to be Forgotten" compliance
// while respecting tax retention laws on transaction records
export const piiVault = pgTable("pii_vault", {
  id: serial("id").primaryKey(),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id),
  emailCiphertext: text("email_ciphertext").notNull(),
  emailIv: text("email_iv").notNull(),
  emailTag: text("email_tag").notNull(),
  nameCiphertext: text("name_ciphertext"),
  nameIv: text("name_iv"),
  nameTag: text("name_tag"),
  keyId: text("key_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPiiVaultSchema = createInsertSchema(piiVault).omit({
  id: true,
  createdAt: true,
});

export type InsertPiiVault = z.infer<typeof insertPiiVaultSchema>;
export type PiiVault = typeof piiVault.$inferSelect;

// Ghost targets table - stores transient PII for recovery
// Status values: 'pending', 'recovered', 'exhausted', 'impending'
// - 'pending': ghost user with failed payment requiring recovery
// - 'impending': proactive detection - active subscription with expiring card
// PII (email, customerName) is encrypted with AES-256-GCM before storage
export const ghostTargets = pgTable("ghost_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id),
  // PII Vault reference (GDPR-compliant segregated storage)
  piiVaultId: integer("pii_vault_id").references(() => piiVault.id),
  // DEPRECATED: Legacy encrypted email fields - use piiVaultId instead
  // Retained for data migration, will be removed in future release
  emailCiphertext: text("email_ciphertext"),
  emailIv: text("email_iv"),
  emailTag: text("email_tag"),
  // DEPRECATED: Legacy encrypted customer name fields - use piiVaultId instead
  // Retained for data migration, will be removed in future release
  customerNameCiphertext: text("customer_name_ciphertext"),
  customerNameIv: text("customer_name_iv"),
  customerNameTag: text("customer_name_tag"),
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
  // Universal Revenue Intelligence: ML metadata (non-PII, queryable)
  cardBrand: text("card_brand"), // e.g., Visa, Mastercard, Amex
  cardFunding: text("card_funding"), // e.g., credit, debit, prepaid
  countryCode: text("country_code"), // Customer/Issuer ISO country
  requires3ds: boolean("requires_3ds"), // Technical vs. Financial failure flag
  stripeErrorCode: text("stripe_error_code"), // Raw decline/error code for ML features
  originalInvoiceDate: timestamp("original_invoice_date"), // Temporal anchor for recovery velocity
  // Recovery Strategy Selector (Sprint 2.3): categorizes ghost for Sentinel recovery approach
  // Values: 'technical_bridge', 'smart_retry', 'card_refresh', 'high_value_manual'
  recoveryStrategy: text("recovery_strategy"),
  // Attribution Link Tracking (Sprint 2.5.1): click analytics for recovery links
  clickCount: integer("click_count").default(0).notNull(),
  lastClickedAt: timestamp("last_clicked_at"),
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
  discoveredAt?: Date; // Optional: for time-travel seeding (backdating records)
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
  // Universal Revenue Intelligence: ML metadata (non-PII)
  cardBrand?: string | null;
  cardFunding?: string | null;
  countryCode?: string | null;
  requires3ds?: boolean | null;
  stripeErrorCode?: string | null;
  originalInvoiceDate?: Date | null;
  // Recovery Strategy Selector (Sprint 2.3)
  recoveryStrategy?: string | null;
  // Attribution Link Tracking (Sprint 2.5.1)
  clickCount?: number;
  lastClickedAt?: Date | null;
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
  // Universal Revenue Intelligence: ML metadata (non-PII)
  cardBrand: string | null;
  cardFunding: string | null;
  countryCode: string | null;
  requires3ds: boolean | null;
  stripeErrorCode: string | null;
  originalInvoiceDate: Date | null;
  // Recovery Strategy Selector (Sprint 2.3)
  recoveryStrategy: string | null;
  // Attribution Link Tracking (Sprint 2.5.1)
  clickCount: number;
  lastClickedAt: Date | null;
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

// Scan Jobs table - database-backed job queue for async scanning
// Prevents HTTP timeouts on serverless by decoupling initiation from execution
export const scanJobs = pgTable("scan_jobs", {
  id: serial("id").primaryKey(),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id),
  status: text("status").default("pending").notNull(), // 'pending', 'processing', 'completed', 'failed'
  progress: integer("progress").default(0).notNull(), // 0-100
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  error: text("error"),
});

export const insertScanJobSchema = createInsertSchema(scanJobs).omit({
  id: true,
  createdAt: true,
});

export type InsertScanJob = z.infer<typeof insertScanJobSchema>;
export type ScanJob = typeof scanJobs.$inferSelect;

// Audit Logs table - comprehensive audit trail for compliance and debugging
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id),
  actorId: varchar("actor_id").notNull(),
  action: text("action").notNull(),
  entityId: varchar("entity_id"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============================================================================
// DRIZZLE RELATIONS - Define table relationships for type-safe joins
// ============================================================================

// Merchant relations
export const merchantsRelations = relations(merchants, ({ many }) => ({
  ghostTargets: many(ghostTargets),
  piiVaultEntries: many(piiVault),
  liquidityOracle: many(liquidityOracle),
  auditLogs: many(auditLogs),
}));

// Audit logs relations
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  merchant: one(merchants, {
    fields: [auditLogs.merchantId],
    references: [merchants.id],
  }),
}));

// PII Vault relations (One-to-One with ghost_targets, Many-to-One with merchants)
export const piiVaultRelations = relations(piiVault, ({ one }) => ({
  merchant: one(merchants, {
    fields: [piiVault.merchantId],
    references: [merchants.id],
  }),
  ghostTarget: one(ghostTargets, {
    fields: [piiVault.id],
    references: [ghostTargets.piiVaultId],
  }),
}));

// Ghost targets relations
export const ghostTargetsRelations = relations(ghostTargets, ({ one }) => ({
  merchant: one(merchants, {
    fields: [ghostTargets.merchantId],
    references: [merchants.id],
  }),
  piiVault: one(piiVault, {
    fields: [ghostTargets.piiVaultId],
    references: [piiVault.id],
  }),
}));

// Liquidity oracle relations
export const liquidityOracleRelations = relations(liquidityOracle, ({ one }) => ({
  merchant: one(merchants, {
    fields: [liquidityOracle.merchantId],
    references: [merchants.id],
  }),
}));
