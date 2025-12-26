import { merchants, ghostTargets, liquidityOracle, type Merchant, type InsertMerchant, type GhostTarget, type InsertGhostTarget, type LiquidityOracle, type InsertLiquidityOracle } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Merchants
  getMerchant(id: string): Promise<Merchant | undefined>;
  getMerchantByStripeUserId(stripeUserId: string): Promise<Merchant | undefined>;
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  
  // Ghost Targets
  getGhostTarget(id: string): Promise<GhostTarget | undefined>;
  getGhostTargetsByMerchant(merchantId: string): Promise<GhostTarget[]>;
  createGhostTarget(target: InsertGhostTarget): Promise<GhostTarget>;
  
  // Liquidity Oracle
  getLiquidityOracleEntry(id: string): Promise<LiquidityOracle | undefined>;
  createLiquidityOracleEntry(entry: InsertLiquidityOracle): Promise<LiquidityOracle>;
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
}

export const storage = new DatabaseStorage();
