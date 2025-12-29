import { merchants, ghostTargets, liquidityOracle, systemLogs, cronLocks, type Merchant, type InsertMerchant, type GhostTarget, type InsertGhostTarget, type GhostTargetDb, type LiquidityOracle, type InsertLiquidityOracle, type SystemLog, type InsertSystemLog, type CronLock } from "@shared/schema";
import { db } from "./db";
import { eq, count, isNull, and, or, sql, desc, lt, ne } from "drizzle-orm";
import { encrypt, decrypt } from "./utils/crypto";

export interface MerchantStats {
  totalGhostsFound: number;
  activeGhosts: number;
  recoveredCount: number;
  totalRecoveredCents: number;
  recoveryRate: number;
}

export interface MonthlyTrendPoint {
  month: string; // YYYY-MM
  leaked: number;
  recovered: number;
}

export interface DailyPulsePoint {
  date: string; // YYYY-MM-DD
  leaked: number;
  recovered: number;
}

export interface HistoricalRevenueStats {
  lifetime: {
    allTimeLeakedCents: number;
    totalGhostCount: number;
    totalRecoveredCents: number;
  };
  monthlyTrend: MonthlyTrendPoint[];
  dailyPulse: DailyPulsePoint[];
}

export interface ShadowRevenueUpdate {
  allTimeLeakedCents: number;
  totalGhostCount: number;
  lastAuditAt: Date;
}

// TITANIUM: Decryption error placeholder - prevents system-wide crash on key mismatch
const ENCRYPTION_ERROR_PLACEHOLDER = "ENCRYPTION_ERROR";

/**
 * Decrypt a GhostTargetDb record to application-level GhostTarget with plaintext PII.
 * Titanium Requirement: If decryption fails, returns placeholder values instead of crashing.
 */
function decryptGhostTarget(dbRecord: GhostTargetDb): GhostTarget {
  let email = ENCRYPTION_ERROR_PLACEHOLDER;
  let customerName = ENCRYPTION_ERROR_PLACEHOLDER;
  
  try {
    email = decrypt(dbRecord.emailCiphertext, dbRecord.emailIv, dbRecord.emailTag);
  } catch (error: any) {
    console.error(`[SECURITY] Email decryption failed for ghost ${dbRecord.id}: ${error.message}`);
  }
  
  try {
    customerName = decrypt(dbRecord.customerNameCiphertext, dbRecord.customerNameIv, dbRecord.customerNameTag);
  } catch (error: any) {
    console.error(`[SECURITY] CustomerName decryption failed for ghost ${dbRecord.id}: ${error.message}`);
  }
  
  return {
    id: dbRecord.id,
    merchantId: dbRecord.merchantId,
    email,
    customerName,
    amount: dbRecord.amount,
    invoiceId: dbRecord.invoiceId,
    discoveredAt: dbRecord.discoveredAt,
    purgeAt: dbRecord.purgeAt,
    lastEmailedAt: dbRecord.lastEmailedAt,
    emailCount: dbRecord.emailCount,
    status: dbRecord.status,
    recoveredAt: dbRecord.recoveredAt,
    attributionExpiresAt: dbRecord.attributionExpiresAt,
    recoveryType: dbRecord.recoveryType,
    failureReason: dbRecord.failureReason,
    declineType: dbRecord.declineType,
  };
}

/**
 * Encrypt plaintext PII fields and prepare database insert payload.
 */
function encryptGhostTargetForInsert(target: InsertGhostTarget): {
  merchantId: string;
  emailCiphertext: string;
  emailIv: string;
  emailTag: string;
  customerNameCiphertext: string;
  customerNameIv: string;
  customerNameTag: string;
  amount: number;
  invoiceId: string;
  purgeAt: Date;
  lastEmailedAt?: Date | null;
  emailCount?: number;
  status?: string;
  recoveredAt?: Date | null;
  failureReason?: string | null;
  declineType?: string | null;
} {
  const encryptedEmail = encrypt(target.email);
  const encryptedCustomerName = encrypt(target.customerName);
  
  return {
    merchantId: target.merchantId,
    emailCiphertext: encryptedEmail.encryptedData,
    emailIv: encryptedEmail.iv,
    emailTag: encryptedEmail.tag,
    customerNameCiphertext: encryptedCustomerName.encryptedData,
    customerNameIv: encryptedCustomerName.iv,
    customerNameTag: encryptedCustomerName.tag,
    amount: target.amount,
    invoiceId: target.invoiceId,
    purgeAt: target.purgeAt,
    lastEmailedAt: target.lastEmailedAt,
    emailCount: target.emailCount,
    status: target.status,
    recoveredAt: target.recoveredAt,
    failureReason: target.failureReason,
    declineType: target.declineType,
  };
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
  updateMerchantShadowRevenue(id: string, data: ShadowRevenueUpdate): Promise<Merchant | undefined>;
  getHistoricalRevenueStats(merchantId: string): Promise<HistoricalRevenueStats>;
  getMonthlyTrend(merchantId: string): Promise<MonthlyTrendPoint[]>;
  getDailyPulse(merchantId: string): Promise<DailyPulsePoint[]>;
  
  // Ghost Targets
  getGhostTarget(id: string): Promise<GhostTarget | undefined>;
  getGhostTargetsByMerchant(merchantId: string): Promise<GhostTarget[]>;
  createGhostTarget(target: InsertGhostTarget): Promise<GhostTarget>;
  upsertGhostTarget(target: InsertGhostTarget): Promise<GhostTarget>;
  countGhostsByMerchant(merchantId: string): Promise<number>;
  getGhostByInvoiceId(invoiceId: string): Promise<GhostTarget | undefined>;
  getUnprocessedGhosts(): Promise<GhostTarget[]>;
  getEligibleGhostsForEmail(): Promise<GhostTarget[]>;
  updateGhostEmailStatus(id: string): Promise<GhostTarget | undefined>;
  markGhostRecovered(id: string, recoveryType: 'direct' | 'organic'): Promise<GhostTarget | undefined>;
  markGhostExhausted(id: string): Promise<GhostTarget | undefined>;
  countRecoveredGhostsByMerchant(merchantId: string): Promise<number>;
  countActiveGhostsByMerchant(merchantId: string): Promise<number>;
  setGhostAttributionFlag(id: string, expiresAt: Date): Promise<GhostTarget | undefined>;
  
  // Liquidity Oracle
  getLiquidityOracleEntry(id: string): Promise<LiquidityOracle | undefined>;
  createLiquidityOracleEntry(entry: InsertLiquidityOracle): Promise<LiquidityOracle>;
  countOracleEntriesByMerchant(merchantId: string): Promise<number>;
  getGoldenHour(merchantId: string): Promise<{ dayOfWeek: number; hourOfDay: number; frequency: number } | null>;
  
  // System Logs
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;
  getRecentSystemLogs(limit: number): Promise<SystemLog[]>;
  
  // Cron Locks (Atomic Job Locking)
  acquireJobLock(jobName: string, ttlMinutes: number): Promise<{ holderId: string; wasStolen: boolean } | null>;
  releaseJobLock(jobName: string, holderId: string): Promise<boolean>;
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

  async updateMerchantShadowRevenue(id: string, data: ShadowRevenueUpdate): Promise<Merchant | undefined> {
    // Atomic transaction: update all three Shadow Revenue fields simultaneously
    const [updated] = await db
      .update(merchants)
      .set({
        allTimeLeakedCents: data.allTimeLeakedCents,
        totalGhostCount: data.totalGhostCount,
        lastAuditAt: data.lastAuditAt,
      })
      .where(eq(merchants.id, id))
      .returning();
    return updated || undefined;
  }

  async getMonthlyTrend(merchantId: string): Promise<MonthlyTrendPoint[]> {
    const results = await db.execute(sql`
      SELECT 
        TO_CHAR(DATE_TRUNC('month', discovered_at), 'YYYY-MM') AS month,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'exhausted') THEN amount ELSE 0 END), 0)::bigint AS leaked,
        COALESCE(SUM(CASE WHEN status = 'recovered' THEN amount ELSE 0 END), 0)::bigint AS recovered
      FROM ghost_targets
      WHERE merchant_id = ${merchantId}
      GROUP BY DATE_TRUNC('month', discovered_at)
      ORDER BY month ASC
    `);
    
    return (results.rows as any[]).map(row => ({
      month: row.month as string,
      leaked: Number(row.leaked),
      recovered: Number(row.recovered),
    }));
  }

  async getDailyPulse(merchantId: string): Promise<DailyPulsePoint[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const results = await db.execute(sql`
      SELECT 
        TO_CHAR(DATE_TRUNC('day', discovered_at), 'YYYY-MM-DD') AS date,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'exhausted') THEN amount ELSE 0 END), 0)::bigint AS leaked,
        COALESCE(SUM(CASE WHEN status = 'recovered' THEN amount ELSE 0 END), 0)::bigint AS recovered
      FROM ghost_targets
      WHERE merchant_id = ${merchantId}
        AND discovered_at >= ${thirtyDaysAgo}
      GROUP BY DATE_TRUNC('day', discovered_at)
      ORDER BY date ASC
    `);
    
    return (results.rows as any[]).map(row => ({
      date: row.date as string,
      leaked: Number(row.leaked),
      recovered: Number(row.recovered),
    }));
  }

  async getHistoricalRevenueStats(merchantId: string): Promise<HistoricalRevenueStats> {
    const merchant = await this.getMerchant(merchantId);
    const monthlyTrend = await this.getMonthlyTrend(merchantId);
    const dailyPulse = await this.getDailyPulse(merchantId);
    
    return {
      lifetime: {
        allTimeLeakedCents: Number(merchant?.allTimeLeakedCents || 0),
        totalGhostCount: merchant?.totalGhostCount || 0,
        totalRecoveredCents: Number(merchant?.totalRecoveredCents || 0),
      },
      monthlyTrend,
      dailyPulse,
    };
  }

  // Ghost Targets (with AES-256-GCM encryption for PII)
  async getGhostTarget(id: string): Promise<GhostTarget | undefined> {
    const [dbRecord] = await db.select().from(ghostTargets).where(eq(ghostTargets.id, id));
    if (!dbRecord) return undefined;
    return decryptGhostTarget(dbRecord);
  }

  async getGhostTargetsByMerchant(merchantId: string): Promise<GhostTarget[]> {
    const dbRecords = await db.select().from(ghostTargets).where(eq(ghostTargets.merchantId, merchantId));
    return dbRecords.map(decryptGhostTarget);
  }

  async createGhostTarget(insertTarget: InsertGhostTarget): Promise<GhostTarget> {
    const encryptedPayload = encryptGhostTargetForInsert(insertTarget);
    const [dbRecord] = await db
      .insert(ghostTargets)
      .values(encryptedPayload)
      .returning();
    return decryptGhostTarget(dbRecord);
  }

  async upsertGhostTarget(insertTarget: InsertGhostTarget): Promise<GhostTarget> {
    const encryptedPayload = encryptGhostTargetForInsert(insertTarget);
    const [dbRecord] = await db
      .insert(ghostTargets)
      .values(encryptedPayload)
      .onConflictDoUpdate({
        target: ghostTargets.invoiceId,
        set: {
          // Re-encrypt on update (new IV for forward secrecy)
          emailCiphertext: encryptedPayload.emailCiphertext,
          emailIv: encryptedPayload.emailIv,
          emailTag: encryptedPayload.emailTag,
          customerNameCiphertext: encryptedPayload.customerNameCiphertext,
          customerNameIv: encryptedPayload.customerNameIv,
          customerNameTag: encryptedPayload.customerNameTag,
          amount: encryptedPayload.amount,
          purgeAt: encryptedPayload.purgeAt,
        },
      })
      .returning();
    return decryptGhostTarget(dbRecord);
  }

  async countGhostsByMerchant(merchantId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(ghostTargets)
      .where(eq(ghostTargets.merchantId, merchantId));
    return result?.count || 0;
  }

  async getGhostByInvoiceId(invoiceId: string): Promise<GhostTarget | undefined> {
    const [dbRecord] = await db.select().from(ghostTargets).where(eq(ghostTargets.invoiceId, invoiceId));
    if (!dbRecord) return undefined;
    return decryptGhostTarget(dbRecord);
  }

  async getUnprocessedGhosts(): Promise<GhostTarget[]> {
    const now = new Date();
    const dbRecords = await db
      .select()
      .from(ghostTargets)
      .where(and(
        isNull(ghostTargets.lastEmailedAt),
        sql`${ghostTargets.purgeAt} > ${now}`
      ));
    return dbRecords.map(decryptGhostTarget);
  }

  async getEligibleGhostsForEmail(): Promise<GhostTarget[]> {
    const now = new Date();
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    
    // Intelligent Decline Branching: Hard declines bypass 4-hour grace period (immediate priority)
    const dbRecords = await db
      .select()
      .from(ghostTargets)
      .where(and(
        eq(ghostTargets.status, "pending"),
        lt(ghostTargets.emailCount, 3),
        sql`${ghostTargets.purgeAt} > ${now}`,
        or(
          // Standard path: Soft declines or null respect 4-hour grace period
          lt(ghostTargets.discoveredAt, fourHoursAgo),
          // Priority path: Hard declines bypass grace period
          eq(ghostTargets.declineType, "hard")
        )
      ));
    return dbRecords.map(decryptGhostTarget);
  }

  async updateGhostEmailStatus(id: string): Promise<GhostTarget | undefined> {
    const [dbRecord] = await db
      .update(ghostTargets)
      .set({
        lastEmailedAt: new Date(),
        emailCount: sql`${ghostTargets.emailCount} + 1`,
      })
      .where(eq(ghostTargets.id, id))
      .returning();
    if (!dbRecord) return undefined;
    return decryptGhostTarget(dbRecord);
  }

  async markGhostRecovered(id: string, recoveryType: 'direct' | 'organic'): Promise<GhostTarget | undefined> {
    // IMMUTABILITY: Only update if not already recovered (prevents timestamp/type jitter)
    const [dbRecord] = await db
      .update(ghostTargets)
      .set({
        status: "recovered",
        recoveredAt: new Date(),
        recoveryType: recoveryType,
      })
      .where(and(
        eq(ghostTargets.id, id),
        ne(ghostTargets.status, "recovered")
      ))
      .returning();
    if (!dbRecord) return undefined;
    return decryptGhostTarget(dbRecord);
  }

  async markGhostExhausted(id: string): Promise<GhostTarget | undefined> {
    const [dbRecord] = await db
      .update(ghostTargets)
      .set({
        status: "exhausted",
      })
      .where(eq(ghostTargets.id, id))
      .returning();
    if (!dbRecord) return undefined;
    return decryptGhostTarget(dbRecord);
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

  async setGhostAttributionFlag(id: string, expiresAt: Date): Promise<GhostTarget | undefined> {
    const [dbRecord] = await db
      .update(ghostTargets)
      .set({
        attributionExpiresAt: expiresAt,
      })
      .where(eq(ghostTargets.id, id))
      .returning();
    if (!dbRecord) return undefined;
    return decryptGhostTarget(dbRecord);
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

  // System Logs
  async createSystemLog(insertLog: InsertSystemLog): Promise<SystemLog> {
    const [log] = await db
      .insert(systemLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  async getRecentSystemLogs(limit: number): Promise<SystemLog[]> {
    return await db
      .select()
      .from(systemLogs)
      .orderBy(desc(systemLogs.runAt))
      .limit(limit);
  }

  // Cron Locks (Atomic Job Locking)
  async acquireJobLock(jobName: string, ttlMinutes: number): Promise<{ holderId: string; wasStolen: boolean } | null> {
    const holderId = crypto.randomUUID();
    const now = new Date();
    const ttlThreshold = new Date(now.getTime() - ttlMinutes * 60 * 1000);
    
    // Atomic UPSERT: Insert lock, or steal if existing lock is stale (older than TTL)
    // This prevents the "check-then-set" race condition
    const result = await db.execute(sql`
      INSERT INTO cron_locks (job_name, holder_id, created_at)
      VALUES (${jobName}, ${holderId}, ${now})
      ON CONFLICT (job_name) DO UPDATE
      SET holder_id = ${holderId},
          created_at = ${now}
      WHERE cron_locks.created_at < ${ttlThreshold}
      RETURNING holder_id, 
        CASE WHEN cron_locks.holder_id != ${holderId} THEN true ELSE false END as was_stolen
    `);
    
    // If no rows returned, the lock is held by a healthy (non-expired) process
    if (!result.rows || result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0] as { holder_id: string; was_stolen: boolean };
    
    // Verify we actually got the lock (our holderId matches)
    if (row.holder_id === holderId) {
      return { holderId, wasStolen: row.was_stolen };
    }
    
    return null;
  }

  async releaseJobLock(jobName: string, holderId: string): Promise<boolean> {
    // Identity-safe release: only delete if BOTH jobName AND holderId match
    // Prevents zombie jobs from accidentally deleting locks they no longer own
    const result = await db
      .delete(cronLocks)
      .where(and(
        eq(cronLocks.jobName, jobName),
        eq(cronLocks.holderId, holderId)
      ))
      .returning();
    
    return result.length > 0;
  }

  // Intelligence Logs - synthesizes decision events from ghost targets
  async getIntelligenceLogs(merchantId: string, limit: number = 50): Promise<{
    id: string;
    timestamp: Date;
    type: "discovery" | "action" | "success" | "info";
    message: string;
    amount: number | null;
  }[]> {
    const ghosts = await this.getGhostTargetsByMerchant(merchantId);
    
    const logs: {
      id: string;
      timestamp: Date;
      type: "discovery" | "action" | "success" | "info";
      message: string;
      amount: number | null;
    }[] = [];

    for (const ghost of ghosts) {
      // Discovery event
      logs.push({
        id: `${ghost.id}-discovery`,
        timestamp: ghost.discoveredAt,
        type: "discovery",
        message: `Deep Harvest identified uncollected revenue from invoice ${ghost.invoiceId.slice(0, 12)}...`,
        amount: ghost.amount,
      });

      // Email action events
      if (ghost.emailCount > 0 && ghost.lastEmailedAt) {
        const declineStrategy = this.getDeclineStrategy(ghost.declineType);
        logs.push({
          id: `${ghost.id}-email`,
          timestamp: ghost.lastEmailedAt,
          type: "action",
          message: declineStrategy,
          amount: null,
        });
      }

      // Recovery success event
      if (ghost.status === "recovered" && ghost.recoveredAt) {
        const attribution = ghost.recoveryType === "direct" ? "Direct attribution confirmed" : "Organic recovery detected";
        logs.push({
          id: `${ghost.id}-recovery`,
          timestamp: ghost.recoveredAt,
          type: "success",
          message: `${attribution} - Payment received for invoice ${ghost.invoiceId.slice(0, 12)}...`,
          amount: ghost.amount,
        });
      }

      // Exhausted event
      if (ghost.status === "exhausted") {
        logs.push({
          id: `${ghost.id}-exhausted`,
          timestamp: ghost.lastEmailedAt || ghost.discoveredAt,
          type: "info",
          message: `Recovery sequence complete. Maximum outreach attempts reached for ${ghost.invoiceId.slice(0, 12)}...`,
          amount: null,
        });
      }
    }

    // Sort by timestamp descending and limit
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return logs.slice(0, limit);
  }

  private getDeclineStrategy(declineType: string | null): string {
    switch (declineType) {
      case "expired_card":
        return "Strategy: Immediate Outreach triggered. Bypassing Oracle timing for Expired Card.";
      case "insufficient_funds":
        return "Strategy: Intelligent Hold. Retrying in 24h based on high-probability liquidity window.";
      case "card_declined":
        return "Strategy: Standard Recovery initiated. Card declined - generic failure code.";
      case "processing_error":
        return "Strategy: Delayed Retry. Processing error detected - temporary issue likely.";
      case "fraudulent":
        return "Strategy: Case Flagged. Potential fraud indicator - manual review recommended.";
      default:
        return "Strategy: Recovery Pulse dispatched. Email sequence initiated.";
    }
  }
}

export const storage = new DatabaseStorage();
