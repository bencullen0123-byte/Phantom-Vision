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
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
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
  businessCategory: text("business_category").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  hourOfDay: integer("hour_of_day").notNull(),
});

export const insertLiquidityOracleSchema = createInsertSchema(liquidityOracle).omit({
  id: true,
});

export type InsertLiquidityOracle = z.infer<typeof insertLiquidityOracleSchema>;
export type LiquidityOracle = typeof liquidityOracle.$inferSelect;
