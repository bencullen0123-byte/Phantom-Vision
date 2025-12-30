// Pulse Engine - Orchestrates recovery and protection email timing using Oracle data
import { storage } from "../storage";
import { sendPulseEmail } from "./pulseMailer";
import type { GhostTarget, Merchant } from "@shared/schema";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface GoldenHour {
  dayOfWeek: number;
  hourOfDay: number;
  frequency: number;
}

interface ProcessQueueResult {
  emailsSent: number;
  emailsFailed: number;
  targetsProcessed: number;
  recoveryEmails: number;
  protectionEmails: number;
  nextGoldenHour: string | null;
  errors: string[];
  dryRunMode: boolean;
}

function isWithinGoldenHour(goldenHour: GoldenHour | null): boolean {
  if (!goldenHour) {
    return true;
  }
  
  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();
  
  const isGoldenDay = currentDay === goldenHour.dayOfWeek;
  const hourBuffer = 2;
  const isNearGoldenHour = 
    currentHour >= goldenHour.hourOfDay - hourBuffer && 
    currentHour <= goldenHour.hourOfDay + hourBuffer;
  
  return isGoldenDay && isNearGoldenHour;
}

function getNextGoldenHourWindow(goldenHour: GoldenHour | null): string | null {
  if (!goldenHour) {
    return null;
  }
  
  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();
  
  let daysUntil = goldenHour.dayOfWeek - currentDay;
  if (daysUntil < 0) {
    daysUntil += 7;
  } else if (daysUntil === 0 && currentHour > goldenHour.hourOfDay + 2) {
    daysUntil = 7;
  }
  
  const nextDate = new Date(now);
  nextDate.setUTCDate(nextDate.getUTCDate() + daysUntil);
  nextDate.setUTCHours(goldenHour.hourOfDay, 0, 0, 0);
  
  const dayName = DAY_NAMES[goldenHour.dayOfWeek];
  const hourFormatted = goldenHour.hourOfDay.toString().padStart(2, '0') + ':00 UTC';
  
  return `${dayName} at ${hourFormatted} (${nextDate.toISOString()})`;
}

function getBaseUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  
  return "http://localhost:5000";
}

function buildProxyUrl(targetId: string): string {
  return `${getBaseUrl()}/api/l/${targetId}`;
}

async function processTargetWithMerchant(
  target: GhostTarget, 
  merchant: Merchant,
  goldenHour: GoldenHour | null
): Promise<{ sent: boolean; error?: string; dryRun?: boolean }> {
  
  // Intelligent Decline Branching: Hard declines bypass Oracle timing (immediate priority)
  const isHardDecline = target.declineType === 'hard';
  const isProtection = target.status === 'impending';
  
  // Protection emails always send immediately (no Oracle timing)
  if (!isProtection && !isHardDecline && merchant.recoveryStrategy === 'oracle' && goldenHour) {
    if (!isWithinGoldenHour(goldenHour)) {
      return { sent: false, error: 'Outside golden hour window' };
    }
  }
  
  // Use proxy URL for attribution tracking
  const trackingUrl = buildProxyUrl(target.id);
  
  const result = await sendPulseEmail(target, merchant, trackingUrl);
  
  if (result.success) {
    await storage.updateGhostEmailStatus(target.id);
    return { sent: true, dryRun: result.dryRun };
  }
  
  return { sent: false, error: result.error };
}

export async function processQueue(): Promise<ProcessQueueResult> {
  console.log("[PULSE ENGINE] Starting queue processing...");
  
  const result: ProcessQueueResult = {
    emailsSent: 0,
    emailsFailed: 0,
    targetsProcessed: 0,
    recoveryEmails: 0,
    protectionEmails: 0,
    nextGoldenHour: null,
    errors: [],
    dryRunMode: false
  };
  
  try {
    // Fetch both pending (failed payments) and impending (expiring cards)
    const eligibleTargets = await storage.getEligibleGhostsForEmail();
    
    const pendingCount = eligibleTargets.filter(t => t.status === 'pending').length;
    const impendingCount = eligibleTargets.filter(t => t.status === 'impending').length;
    
    console.log(`[PULSE ENGINE] Found ${eligibleTargets.length} eligible targets:`);
    console.log(`[PULSE ENGINE]   - Recovery (pending): ${pendingCount}`);
    console.log(`[PULSE ENGINE]   - Protection (impending): ${impendingCount}`);
    
    if (eligibleTargets.length === 0) {
      result.nextGoldenHour = "No eligible targets to process";
      return result;
    }
    
    const merchantCache = new Map<string, Merchant>();
    const goldenHourCache = new Map<string, GoldenHour | null>();
    
    for (const target of eligibleTargets) {
      result.targetsProcessed++;
      
      let merchant = merchantCache.get(target.merchantId);
      if (!merchant) {
        const fetched = await storage.getMerchant(target.merchantId);
        if (!fetched) {
          result.errors.push(`Merchant not found for target ${target.id}`);
          result.emailsFailed++;
          continue;
        }
        merchant = fetched;
        merchantCache.set(target.merchantId, merchant);
      }
      
      let goldenHour = goldenHourCache.get(target.merchantId);
      if (goldenHour === undefined) {
        goldenHour = await storage.getGoldenHour(target.merchantId);
        goldenHourCache.set(target.merchantId, goldenHour);
      }
      
      if (!result.nextGoldenHour && goldenHour) {
        result.nextGoldenHour = getNextGoldenHourWindow(goldenHour);
      }
      
      const processResult = await processTargetWithMerchant(target, merchant, goldenHour);
      
      if (processResult.dryRun) {
        result.dryRunMode = true;
      }
      
      if (processResult.sent) {
        result.emailsSent++;
        
        if (target.status === 'pending') {
          result.recoveryEmails++;
        } else if (target.status === 'impending') {
          result.protectionEmails++;
        }
        
        const newEmailCount = target.emailCount + 1;
        if (newEmailCount >= 3) {
          await storage.markGhostExhausted(target.id);
          console.log(`[PULSE ENGINE] Target ${target.id} exhausted after 3 emails`);
        }
      } else {
        if (processResult.error !== 'Outside golden hour window') {
          result.emailsFailed++;
          if (processResult.error) {
            result.errors.push(`Target ${target.id}: ${processResult.error}`);
          }
        }
      }
    }
    
    if (!result.nextGoldenHour) {
      result.nextGoldenHour = "No oracle data available - using immediate timing";
    }
    
    console.log(`[PULSE ENGINE] Queue processing complete:`);
    console.log(`[PULSE ENGINE]   - Sent: ${result.emailsSent} (Recovery: ${result.recoveryEmails}, Protection: ${result.protectionEmails})`);
    console.log(`[PULSE ENGINE]   - Failed: ${result.emailsFailed}`);
    if (result.dryRunMode) {
      console.log(`[PULSE ENGINE]   - Mode: DRY RUN (Resend not connected)`);
    }
    
  } catch (error: any) {
    console.error("[PULSE ENGINE] Queue processing failed:", error);
    result.errors.push(`Queue processing error: ${error.message}`);
  }
  
  return result;
}
