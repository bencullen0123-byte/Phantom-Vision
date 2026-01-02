// The Sentinel - Scheduled heartbeat jobs for autonomous operation
import cron from "node-cron";
import { storage } from "../storage";
import { processQueue } from "./pulseEngine";

const LOCK_TTL_MINUTES = 60; // Lock expires after 60 minutes (allows lock stealing from stale processes)

interface JobResult {
  jobName: string;
  status: "success" | "failure";
  details: string;
  errorMessage?: string;
}

async function logJobResult(result: JobResult): Promise<void> {
  try {
    await storage.createSystemLog({
      jobName: result.jobName,
      status: result.status,
      details: result.details,
      errorMessage: result.errorMessage || null,
    });
  } catch (error: any) {
    console.error(`[SENTINEL] Failed to log job result: ${error.message}`);
  }
}

/**
 * Dispatch scan jobs for all active merchants.
 * This is a lightweight operation that just creates jobs - the worker processes them.
 */
async function dispatchMerchantScans(): Promise<{ jobsCreated: number; merchantIds: string[] }> {
  const merchants = await storage.getAllMerchants();
  const jobsCreated: string[] = [];
  
  for (const merchant of merchants) {
    try {
      // Check if merchant already has a pending/processing job
      // This prevents duplicate jobs from stacking up
      const existingJob = await storage.getMerchantPendingJob(merchant.id);
      if (existingJob) {
        console.log(`[SENTINEL] Skipping merchant ${merchant.id} - job ${existingJob.id} already ${existingJob.status}`);
        continue;
      }
      
      const job = await storage.createScanJob(merchant.id);
      jobsCreated.push(merchant.id);
      console.log(`[SENTINEL] Created scan job ${job.id} for merchant ${merchant.id}`);
    } catch (error: any) {
      console.error(`[SENTINEL] Failed to create job for merchant ${merchant.id}:`, error.message);
    }
  }
  
  return { jobsCreated: jobsCreated.length, merchantIds: jobsCreated };
}

async function runGhostHunterJob(): Promise<void> {
  console.log("[SENTINEL] Ghost Hunter heartbeat triggered");
  
  // Pre-flight: Attempt to acquire atomic lock (prevents duplicate dispatches)
  const lockResult = await storage.acquireJobLock("ghost_hunter", LOCK_TTL_MINUTES);
  
  if (!lockResult) {
    console.log("[SENTINEL] Ghost Hunter blocked - lock held by healthy process");
    await logJobResult({
      jobName: "ghost_hunter",
      status: "success",
      details: "Skipped - another instance is running",
    });
    return;
  }
  
  const { holderId, wasStolen } = lockResult;
  
  if (wasStolen) {
    console.log(`[SENTINEL] Ghost Hunter lock STOLEN from stale process (holderId: ${holderId})`);
  } else {
    console.log(`[SENTINEL] Ghost Hunter lock acquired (holderId: ${holderId})`);
  }
  
  const startTime = Date.now();
  
  try {
    // Dispatch scan jobs for all merchants (non-blocking)
    const { jobsCreated, merchantIds } = await dispatchMerchantScans();
    
    const duration = Date.now() - startTime;
    const details = `Dispatched ${jobsCreated} scan jobs in ${duration}ms. Worker will process asynchronously.`;
    
    await logJobResult({
      jobName: "ghost_hunter",
      status: "success",
      details,
    });
    
    console.log(`[SENTINEL] Ghost Hunter complete: ${details}`);
    
  } catch (error: any) {
    console.error("[SENTINEL] Ghost Hunter dispatch failed:", error);
    await logJobResult({
      jobName: "ghost_hunter",
      status: "failure",
      details: "Job dispatch failed",
      errorMessage: error.message,
    });
  } finally {
    // Identity-safe release
    const released = await storage.releaseJobLock("ghost_hunter", holderId);
    if (released) {
      console.log(`[SENTINEL] Ghost Hunter lock released (holderId: ${holderId})`);
    } else {
      console.log(`[SENTINEL] Ghost Hunter lock was stolen by another process - no release needed`);
    }
  }
}

async function runPulseEngineJob(): Promise<void> {
  console.log("[SENTINEL] Pulse Engine heartbeat triggered");
  
  // Pre-flight: Attempt to acquire atomic lock
  const lockResult = await storage.acquireJobLock("pulse_engine", LOCK_TTL_MINUTES);
  
  if (!lockResult) {
    console.log("[SENTINEL] Pulse Engine blocked - lock held by healthy process");
    await logJobResult({
      jobName: "pulse_engine",
      status: "success",
      details: "Skipped - another instance is running",
    });
    return;
  }
  
  const { holderId, wasStolen } = lockResult;
  
  // Log lock acquisition status
  if (wasStolen) {
    console.log(`[SENTINEL] Pulse Engine lock STOLEN from stale process (holderId: ${holderId})`);
    await logJobResult({
      jobName: "pulse_engine",
      status: "success",
      details: `Lock stolen from stale process, starting fresh run`,
    });
  } else {
    console.log(`[SENTINEL] Pulse Engine lock acquired (holderId: ${holderId})`);
  }
  
  const startTime = Date.now();
  
  try {
    const result = await processQueue();
    const duration = Date.now() - startTime;
    
    const details = `Processed ${result.targetsProcessed} targets, sent ${result.emailsSent} emails, ${result.emailsFailed} failed in ${duration}ms`;
    
    await logJobResult({
      jobName: "pulse_engine",
      status: result.emailsFailed === 0 ? "success" : "failure",
      details,
      errorMessage: result.errors.length > 0 ? result.errors.join("; ") : undefined,
    });
    
    console.log(`[SENTINEL] Pulse Engine complete: ${details}`);
    
  } catch (error: any) {
    console.error("[SENTINEL] Pulse Engine failed:", error);
    await logJobResult({
      jobName: "pulse_engine",
      status: "failure",
      details: "Job execution failed",
      errorMessage: error.message,
    });
  } finally {
    // Identity-safe release: only release if we still own the lock
    const released = await storage.releaseJobLock("pulse_engine", holderId);
    if (released) {
      console.log(`[SENTINEL] Pulse Engine lock released (holderId: ${holderId})`);
    } else {
      console.log(`[SENTINEL] Pulse Engine lock was stolen by another process - no release needed`);
    }
  }
}

export function startScheduler(): void {
  console.log("[SENTINEL] Initializing scheduler...");
  
  cron.schedule("0 */12 * * *", () => {
    runGhostHunterJob().catch(err => {
      console.error("[SENTINEL] Ghost Hunter cron error:", err);
    });
  });
  console.log("[SENTINEL] Ghost Hunter scheduled: every 12 hours (at minute 0)");
  
  cron.schedule("0 * * * *", () => {
    runPulseEngineJob().catch(err => {
      console.error("[SENTINEL] Pulse Engine cron error:", err);
    });
  });
  console.log("[SENTINEL] Pulse Engine scheduled: every hour (at minute 0)");
  
  console.log("[SENTINEL] Scheduler active - The Sentinel is watching");
}

export async function getSystemHealth(): Promise<{
  recentLogs: Awaited<ReturnType<typeof storage.getRecentSystemLogs>>;
  lastGhostHunterRun: { status: string; runAt: Date } | null;
  lastPulseEngineRun: { status: string; runAt: Date } | null;
}> {
  const recentLogs = await storage.getRecentSystemLogs(20);
  
  const lastGhostHunter = recentLogs.find(log => log.jobName === "ghost_hunter");
  const lastPulse = recentLogs.find(log => log.jobName === "pulse_engine");
  
  return {
    recentLogs,
    lastGhostHunterRun: lastGhostHunter 
      ? { status: lastGhostHunter.status, runAt: lastGhostHunter.runAt } 
      : null,
    lastPulseEngineRun: lastPulse 
      ? { status: lastPulse.status, runAt: lastPulse.runAt } 
      : null,
  };
}

export { runGhostHunterJob, runPulseEngineJob };
