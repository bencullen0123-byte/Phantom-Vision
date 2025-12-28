// The Sentinel - Scheduled heartbeat jobs for autonomous operation
import cron from "node-cron";
import { storage } from "../storage";
import { scanMerchant } from "./ghostHunter";
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

async function runGhostHunterJob(): Promise<void> {
  console.log("[SENTINEL] Ghost Hunter heartbeat triggered");
  
  // Pre-flight: Attempt to acquire atomic lock
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
  
  // Log lock acquisition status
  if (wasStolen) {
    console.log(`[SENTINEL] Ghost Hunter lock STOLEN from stale process (holderId: ${holderId})`);
    await logJobResult({
      jobName: "ghost_hunter",
      status: "success",
      details: `Lock stolen from stale process, starting fresh scan`,
    });
  } else {
    console.log(`[SENTINEL] Ghost Hunter lock acquired (holderId: ${holderId})`);
  }
  
  const startTime = Date.now();
  
  try {
    const merchants = await storage.getAllMerchants();
    
    if (merchants.length === 0) {
      await logJobResult({
        jobName: "ghost_hunter",
        status: "success",
        details: "No merchants to scan",
      });
      return;
    }
    
    let totalGhosts = 0;
    let totalOraclePoints = 0;
    const errors: string[] = [];
    
    for (const merchant of merchants) {
      try {
        const result = await scanMerchant(merchant.id);
        totalGhosts += result.ghostsFound.length;
        totalOraclePoints += result.oracleDataPoints;
        
        if (result.errors.length > 0) {
          errors.push(...result.errors.map(e => `${merchant.id}: ${e}`));
        }
      } catch (error: any) {
        errors.push(`${merchant.id}: ${error.message}`);
      }
    }
    
    const duration = Date.now() - startTime;
    const details = `Scanned ${merchants.length} merchants, found ${totalGhosts} ghosts, ${totalOraclePoints} oracle points in ${duration}ms`;
    
    await logJobResult({
      jobName: "ghost_hunter",
      status: errors.length === 0 ? "success" : "failure",
      details,
      errorMessage: errors.length > 0 ? errors.join("; ") : undefined,
    });
    
    console.log(`[SENTINEL] Ghost Hunter complete: ${details}`);
    
  } catch (error: any) {
    console.error("[SENTINEL] Ghost Hunter failed:", error);
    await logJobResult({
      jobName: "ghost_hunter",
      status: "failure",
      details: "Job execution failed",
      errorMessage: error.message,
    });
  } finally {
    // Identity-safe release: only release if we still own the lock
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
    
    const details = `Processed ${result.ghostsProcessed} ghosts, sent ${result.emailsSent} emails, ${result.emailsFailed} failed in ${duration}ms`;
    
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
