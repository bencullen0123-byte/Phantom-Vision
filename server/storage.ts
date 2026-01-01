import { merchants, ghostTargets, liquidityOracle, systemLogs, cronLocks, type Merchant, type InsertMerchant, type GhostTarget, type InsertGhostTarget, type GhostTargetDb, type LiquidityOracle, type InsertLiquidityOracle, type SystemLog, type InsertSystemLog, type CronLock } from "@shared/schema";
import { db } from "./db";
import { eq, count, isNull, and, or, sql, desc, lt, ne } from "drizzle-orm";
import { encrypt, decrypt } from "./utils/crypto";

// Rate limiting for Sentinel Auto-Pilot (Safety Valve: 50 emails/hour/merchant)
const RATE_LIMIT_PER_HOUR = 50;
const rateLimitTracker = new Map<string, { count: number; windowStart: number }>();

function getHourlyEmailCount(merchantId: string): number {
  const now = Date.now();
  const hourInMs = 60 * 60 * 1000;
  const record = rateLimitTracker.get(merchantId);
  
  if (!record || (now - record.windowStart) > hourInMs) {
    return 0;
  }
  return record.count;
}

function incrementHourlyEmailCount(merchantId: string): void {
  const now = Date.now();
  const hourInMs = 60 * 60 * 1000;
  const record = rateLimitTracker.get(merchantId);
  
  if (!record || (now - record.windowStart) > hourInMs) {
    rateLimitTracker.set(merchantId, { count: 1, windowStart: now });
  } else {
    record.count++;
  }
}

function canSendEmail(merchantId: string): boolean {
  return getHourlyEmailCount(merchantId) < RATE_LIMIT_PER_HOUR;
}

export { getHourlyEmailCount, incrementHourlyEmailCount, canSendEmail, RATE_LIMIT_PER_HOUR };

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
  defaultCurrency: string;
  impendingLeakageCents: number;
  totalProtectedCents: number;
  monthlyTrend: MonthlyTrendPoint[];
  dailyPulse: DailyPulsePoint[];
}

export interface ShadowRevenueUpdate {
  allTimeLeakedCents: number;
  totalGhostCount: number;
  lastAuditAt: Date;
  defaultCurrency?: string;
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
    stripeCustomerId: dbRecord.stripeCustomerId,
    failureCode: dbRecord.failureCode,
    failureMessage: dbRecord.failureMessage,
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
  stripeCustomerId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
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
    stripeCustomerId: target.stripeCustomerId,
    failureCode: target.failureCode,
    failureMessage: target.failureMessage,
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
  incrementMerchantProtection(id: string, amountCents: number): Promise<Merchant | undefined>;
  getMerchantStats(merchantId: string): Promise<MerchantStats>;
  updateMerchantShadowRevenue(id: string, data: ShadowRevenueUpdate): Promise<Merchant | undefined>;
  updateMerchantImpendingLeakage(id: string, impendingLeakageCents: number): Promise<Merchant | undefined>;
  updateMerchantBranding(id: string, data: { businessName?: string; supportEmail?: string; brandColor?: string; autoPilotEnabled?: boolean }): Promise<Merchant | undefined>;
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
  markGhostProtected(id: string): Promise<GhostTarget | undefined>;
  markGhostExhausted(id: string): Promise<GhostTarget | undefined>;
  getImpendingGhostByStripeCustomerId(stripeCustomerId: string): Promise<GhostTarget | undefined>;
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

  async incrementMerchantProtection(id: string, amountCents: number): Promise<Merchant | undefined> {
    const [updated] = await db
      .update(merchants)
      .set({
        totalProtectedCents: sql`${merchants.totalProtectedCents} + ${amountCents}`,
        impendingLeakageCents: sql`GREATEST(0, ${merchants.impendingLeakageCents} - ${amountCents})`,
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
    // Atomic transaction: update Shadow Revenue fields + optional currency detection
    const updatePayload: Record<string, any> = {
      allTimeLeakedCents: data.allTimeLeakedCents,
      totalGhostCount: data.totalGhostCount,
      lastAuditAt: data.lastAuditAt,
    };
    
    // Include currency update if detected during scan
    if (data.defaultCurrency) {
      updatePayload.defaultCurrency = data.defaultCurrency;
    }
    
    const [updated] = await db
      .update(merchants)
      .set(updatePayload)
      .where(eq(merchants.id, id))
      .returning();
    return updated || undefined;
  }

  async updateMerchantImpendingLeakage(id: string, impendingLeakageCents: number): Promise<Merchant | undefined> {
    const [updated] = await db
      .update(merchants)
      .set({ impendingLeakageCents })
      .where(eq(merchants.id, id))
      .returning();
    return updated || undefined;
  }

  async updateMerchantBranding(id: string, data: { businessName?: string; supportEmail?: string; brandColor?: string; autoPilotEnabled?: boolean }): Promise<Merchant | undefined> {
    const updatePayload: Record<string, any> = {};
    if (data.businessName !== undefined) updatePayload.businessName = data.businessName;
    if (data.supportEmail !== undefined) updatePayload.supportEmail = data.supportEmail;
    if (data.brandColor !== undefined) updatePayload.brandColor = data.brandColor;
    if (data.autoPilotEnabled !== undefined) updatePayload.autoPilotEnabled = data.autoPilotEnabled;

    if (Object.keys(updatePayload).length === 0) {
      return this.getMerchant(id);
    }

    const [updated] = await db
      .update(merchants)
      .set(updatePayload)
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
      defaultCurrency: merchant?.defaultCurrency || 'gbp',
      impendingLeakageCents: Number(merchant?.impendingLeakageCents || 0),
      totalProtectedCents: Number(merchant?.totalProtectedCents || 0),
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
          failureReason: encryptedPayload.failureReason,
          declineType: encryptedPayload.declineType,
          failureCode: encryptedPayload.failureCode,
          failureMessage: encryptedPayload.failureMessage,
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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    
    // Fetch both 'pending' (failed payments) and 'impending' (expiring cards)
    // Conditions:
    // - Status is pending or impending
    // - Less than 3 emails sent
    // - Not purged yet
    // - Grace period: discovered more than 4 hours ago
    // - Not emailed in the last 7 days (or never emailed)
    const dbRecords = await db
      .select()
      .from(ghostTargets)
      .where(and(
        or(
          eq(ghostTargets.status, "pending"),
          eq(ghostTargets.status, "impending")
        ),
        lt(ghostTargets.emailCount, 3),
        sql`${ghostTargets.purgeAt} > ${now}`,
        sql`${ghostTargets.discoveredAt} < ${fourHoursAgo}`,
        or(
          isNull(ghostTargets.lastEmailedAt),
          sql`${ghostTargets.lastEmailedAt} < ${sevenDaysAgo}`
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

  async markGhostProtected(id: string): Promise<GhostTarget | undefined> {
    const [dbRecord] = await db
      .update(ghostTargets)
      .set({
        status: "protected",
        recoveredAt: new Date(),
      })
      .where(and(
        eq(ghostTargets.id, id),
        eq(ghostTargets.status, "impending")
      ))
      .returning();
    if (!dbRecord) return undefined;
    return decryptGhostTarget(dbRecord);
  }

  async getImpendingGhostByStripeCustomerId(stripeCustomerId: string): Promise<GhostTarget | undefined> {
    const [dbRecord] = await db
      .select()
      .from(ghostTargets)
      .where(and(
        eq(ghostTargets.stripeCustomerId, stripeCustomerId),
        eq(ghostTargets.status, "impending")
      ))
      .limit(1);
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
    isDirect?: boolean;
  }[]> {
    const ghosts = await this.getGhostTargetsByMerchant(merchantId);
    
    const logs: {
      id: string;
      timestamp: Date;
      type: "discovery" | "action" | "success" | "info";
      message: string;
      amount: number | null;
      isDirect?: boolean;
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
        const isDirect = ghost.recoveryType === "direct";
        const attribution = isDirect ? "Direct attribution confirmed" : "Organic recovery detected";
        logs.push({
          id: `${ghost.id}-recovery`,
          timestamp: ghost.recoveredAt,
          type: "success",
          message: `${attribution} - Payment received for invoice ${ghost.invoiceId.slice(0, 12)}...`,
          amount: ghost.amount,
          isDirect,
        });
      }

      // Protection success event
      if (ghost.status === "protected" && ghost.recoveredAt) {
        logs.push({
          id: `${ghost.id}-protection`,
          timestamp: ghost.recoveredAt,
          type: "success",
          message: `Proactive protection confirmed - Card updated before expiration for invoice ${ghost.invoiceId.slice(0, 12)}...`,
          amount: ghost.amount,
          isDirect: true,
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

    // Job Log Integration: Fetch recent ghost_hunter system logs with funnel data
    const recentSystemLogs = await db
      .select()
      .from(systemLogs)
      .where(eq(systemLogs.jobName, "ghost_hunter"))
      .orderBy(desc(systemLogs.runAt))
      .limit(10);

    for (const log of recentSystemLogs) {
      if (log.details) {
        try {
          const data = JSON.parse(log.details);
          if (data.funnel) {
            logs.push({
              id: `system-${log.id}`,
              timestamp: log.runAt,
              type: "info",
              message: `Diagnostic: Processed ${data.funnel.total} invoices. ${data.funnel.recurring} linked to subscriptions, ${data.funnel.skipped} excluded.`,
              amount: null,
            });
          }
        } catch {
          // Details not valid JSON, skip
        }
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
