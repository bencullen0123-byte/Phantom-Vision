import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
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
});

export const insertMerchantSchema = createInsertSchema(merchants).omit({
  id: true,
});

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;

// Ghost targets table - stores transient PII for recovery
export const ghostTargets = pgTable("ghost_targets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull().references(() => merchants.id),
  email: text("email").notNull(),
  amount: integer("amount").notNull(),
  invoiceId: text("invoice_id").notNull(),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  purgeAt: timestamp("purge_at").notNull(),
  lastEmailedAt: timestamp("last_emailed_at"),
  emailCount: integer("email_count").default(0).notNull(),
});

export const insertGhostTargetSchema = createInsertSchema(ghostTargets).omit({
  id: true,
  discoveredAt: true,
});

export type InsertGhostTarget = z.infer<typeof insertGhostTargetSchema>;
export type GhostTarget = typeof ghostTargets.$inferSelect;

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
