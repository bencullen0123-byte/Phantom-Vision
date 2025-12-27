import { merchants, ghostTargets, liquidityOracle, type Merchant, type InsertMerchant, type GhostTarget, type InsertGhostTarget, type LiquidityOracle, type InsertLiquidityOracle } from "@shared/schema";
import { db } from "./db";
import { eq, count, isNull, and, sql, desc } from "drizzle-orm";

export interface MerchantStats {
  totalGhostsFound: number;
  activeGhosts: number;
  recoveredCount: number;
  totalRecoveredCents: number;
  recoveryRate: number;
}

export interface IStorage {
  // Merchants
  getMerchant(id: string): Promise<Merchant | undefined>;
  getMerchantByStripeUserId(stripeUserId: string): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  getAllMerchants(): Promise<Merchant[]>;
  updateMerchant(id: string, updates: Partial<InsertMerchant>): Promise<Merchant | undefined>;
  incrementMerchantRecovery(id: string, amountCents: number): Promise<Merchant | undefined>;
  getMerchantStats(merchantId: string): Promise<MerchantStats>;
  
  // Ghost Targets
  getGhostTarget(id: string): Promise<GhostTarget | undefined>;
  getGhostTargetsByMerchant(merchantId: string): Promise<GhostTarget[]>;
  createGhostTarget(target: InsertGhostTarget): Promise<GhostTarget>;
  countGhostsByMerchant(merchantId: string): Promise<number>;
  getGhostByInvoiceId(invoiceId: string): Promise<GhostTarget | undefined>;
  getUnprocessedGhosts(): Promise<GhostTarget[]>;
  updateGhostEmailStatus(id: string): Promise<GhostTarget | undefined>;
  markGhostRecovered(id: string): Promise<GhostTarget | undefined>;
  countRecoveredGhostsByMerchant(merchantId: string): Promise<number>;
  countActiveGhostsByMerchant(merchantId: string): Promise<number>;
  
  // Liquidity Oracle
  getLiquidityOracleEntry(id: string): Promise<LiquidityOracle | undefined>;
  createLiquidityOracleEntry(entry: InsertLiquidityOracle): Promise<LiquidityOracle>;
  countOracleEntriesByMerchant(merchantId: string): Promise<number>;
  getGoldenHour(merchantId: string): Promise<{ dayOfWeek: number; hourOfDay: number; frequency: number } | null>;
}

export class DatabaseStorage implements IStorage {
  // Merchants
  async getMerchant(id: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, id));
    return merchant || undefined;
  }

  async getMerchantByStripeUserId(stripeUserId: string): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.stripeUserId, stripeUserId));
    return merchant || undefined;
  }

  async createMerchant(insertMerchant: InsertMerchant): Promise<Merchant> {
    const [merchant] = await db
      .insert(merchants)
      .values(insertMerchant)
      .returning();
    return merchant;
  }

  async getAllMerchants(): Promise<Merchant[]> {
    return await db.select().from(merchants);
  }

  async updateMerchant(id: string, updates: Partial<InsertMerchant>): Promise<Merchant | undefined> {
    const [updated] = await db
      .update(merchants)
      .set(updates)
      .where(eq(merchants.id, id))
      .returning();
    return updated || undefined;
  }

  async incrementMerchantRecovery(id: string, amountCents: number): Promise<Merchant | undefined> {
    const [updated] = await db
      .update(merchants)
      .set({
        totalRecoveredCents: sql`${merchants.totalRecoveredCents} + ${amountCents}`,
      })
      .where(eq(merchants.id, id))
      .returning();
    return updated || undefined;
  }

  async getMerchantStats(merchantId: string): Promise<MerchantStats> {
    const totalGhosts = await this.countGhostsByMerchant(merchantId);
    const activeGhosts = await this.countActiveGhostsByMerchant(merchantId);
    const recoveredCount = await this.countRecoveredGhostsByMerchant(merchantId);
    
    const merchant = await this.getMerchant(merchantId);
    const totalRecoveredCents = merchant?.totalRecoveredCents || 0;
    
    const recoveryRate = totalGhosts > 0 ? (recoveredCount / totalGhosts) * 100 : 0;
    
    return {
      totalGhostsFound: totalGhosts,
      activeGhosts,
      recoveredCount,
      totalRecoveredCents,
      recoveryRate: Math.round(recoveryRate * 100) / 100,
    };
  }

  // Ghost Targets
  async getGhostTarget(id: string): Promise<GhostTarget | undefined> {
    const [target] = await db.select().from(ghostTargets).where(eq(ghostTargets.id, id));
    return target || undefined;
  }

  async getGhostTargetsByMerchant(merchantId: string): Promise<GhostTarget[]> {
    return await db.select().from(ghostTargets).where(eq(ghostTargets.merchantId, merchantId));
  }

  async createGhostTarget(insertTarget: InsertGhostTarget): Promise<GhostTarget> {
    const [target] = await db
      .insert(ghostTargets)
      .values(insertTarget)
      .returning();
    return target;
  }

  async countGhostsByMerchant(merchantId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(ghostTargets)
      .where(eq(ghostTargets.merchantId, merchantId));
    return result?.count || 0;
  }

  async getGhostByInvoiceId(invoiceId: string): Promise<GhostTarget | undefined> {
    const [target] = await db.select().from(ghostTargets).where(eq(ghostTargets.invoiceId, invoiceId));
    return target || undefined;
  }

  async getUnprocessedGhosts(): Promise<GhostTarget[]> {
    const now = new Date();
    return await db
      .select()
      .from(ghostTargets)
      .where(and(
        isNull(ghostTargets.lastEmailedAt),
        sql`${ghostTargets.purgeAt} > ${now}`
      ));
  }

  async updateGhostEmailStatus(id: string): Promise<GhostTarget | undefined> {
    const [updated] = await db
      .update(ghostTargets)
      .set({
        lastEmailedAt: new Date(),
        emailCount: sql`${ghostTargets.emailCount} + 1`,
      })
      .where(eq(ghostTargets.id, id))
      .returning();
    return updated || undefined;
  }

  async markGhostRecovered(id: string): Promise<GhostTarget | undefined> {
    const [updated] = await db
      .update(ghostTargets)
      .set({
        status: "recovered",
        recoveredAt: new Date(),
      })
      .where(eq(ghostTargets.id, id))
      .returning();
    return updated || undefined;
  }

  async countRecoveredGhostsByMerchant(merchantId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(ghostTargets)
      .where(and(
        eq(ghostTargets.merchantId, merchantId),
        eq(ghostTargets.status, "recovered")
      ));
    return result?.count || 0;
  }

  async countActiveGhostsByMerchant(merchantId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(ghostTargets)
      .where(and(
        eq(ghostTargets.merchantId, merchantId),
        eq(ghostTargets.status, "pending")
      ));
    return result?.count || 0;
  }

  // Liquidity Oracle
  async getLiquidityOracleEntry(id: string): Promise<LiquidityOracle | undefined> {
    const [entry] = await db.select().from(liquidityOracle).where(eq(liquidityOracle.id, id));
    return entry || undefined;
  }

  async createLiquidityOracleEntry(insertEntry: InsertLiquidityOracle): Promise<LiquidityOracle> {
    const [entry] = await db
      .insert(liquidityOracle)
      .values(insertEntry)
      .returning();
    return entry;
  }

  async countOracleEntriesByMerchant(merchantId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(liquidityOracle)
      .where(eq(liquidityOracle.merchantId, merchantId));
    return result?.count || 0;
  }

  async getGoldenHour(merchantId: string): Promise<{ dayOfWeek: number; hourOfDay: number; frequency: number } | null> {
    const result = await db
      .select({
        dayOfWeek: liquidityOracle.dayOfWeek,
        hourOfDay: liquidityOracle.hourOfDay,
        frequency: count(),
      })
      .from(liquidityOracle)
      .where(eq(liquidityOracle.merchantId, merchantId))
      .groupBy(liquidityOracle.dayOfWeek, liquidityOracle.hourOfDay)
      .orderBy(desc(count()))
      .limit(1);
    
    if (result.length === 0) return null;
    return result[0];
  }
}

export const storage = new DatabaseStorage();
