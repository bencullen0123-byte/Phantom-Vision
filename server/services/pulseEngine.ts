// Pulse Engine - Orchestrates recovery email timing using Oracle data
import { storage } from "../storage";
import { sendRecoveryEmail } from "./pulseMailer";
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
  ghostsProcessed: number;
  nextGoldenHour: string | null;
  errors: string[];
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
  // Use REPLIT_DEV_DOMAIN for development URLs (modern Replit format)
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // Legacy Replit URL format
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  
  // Fallback for local development
  return "http://localhost:5000";
}

function buildProxyUrl(ghostId: string): string {
  // Attribution Proxy Link: tracks clicks and sets 24-hour attribution window
  return `${getBaseUrl()}/api/l/${ghostId}`;
}

async function processGhostWithMerchant(
  ghost: GhostTarget, 
  merchant: Merchant,
  goldenHour: GoldenHour | null
): Promise<{ sent: boolean; error?: string }> {
  
  if (merchant.recoveryStrategy === 'oracle' && goldenHour) {
    if (!isWithinGoldenHour(goldenHour)) {
      return { sent: false, error: 'Outside golden hour window' };
    }
  }
  
  // Use proxy URL for attribution tracking instead of direct Stripe link
  const invoiceUrl = buildProxyUrl(ghost.id);
  
  const result = await sendRecoveryEmail(
    ghost.email,
    ghost.customerName,
    ghost.amount,
    invoiceUrl,
    merchant
  );
  
  if (result.success) {
    await storage.updateGhostEmailStatus(ghost.id);
    return { sent: true };
  }
  
  return { sent: false, error: result.error };
}

export async function processQueue(): Promise<ProcessQueueResult> {
  console.log("[PULSE ENGINE] Starting queue processing...");
  
  const result: ProcessQueueResult = {
    emailsSent: 0,
    emailsFailed: 0,
    ghostsProcessed: 0,
    nextGoldenHour: null,
    errors: []
  };
  
  try {
    const eligibleGhosts = await storage.getEligibleGhostsForEmail();
    console.log(`[PULSE ENGINE] Found ${eligibleGhosts.length} eligible ghosts (pending, <3 emails, >4h grace)`);
    
    if (eligibleGhosts.length === 0) {
      result.nextGoldenHour = "No eligible ghosts to process";
      return result;
    }
    
    const merchantCache = new Map<string, Merchant>();
    const goldenHourCache = new Map<string, GoldenHour | null>();
    
    for (const ghost of eligibleGhosts) {
      result.ghostsProcessed++;
      
      let merchant = merchantCache.get(ghost.merchantId);
      if (!merchant) {
        const fetched = await storage.getMerchant(ghost.merchantId);
        if (!fetched) {
          result.errors.push(`Merchant not found for ghost ${ghost.id}`);
          result.emailsFailed++;
          continue;
        }
        merchant = fetched;
        merchantCache.set(ghost.merchantId, merchant);
      }
      
      let goldenHour = goldenHourCache.get(ghost.merchantId);
      if (goldenHour === undefined) {
        goldenHour = await storage.getGoldenHour(ghost.merchantId);
        goldenHourCache.set(ghost.merchantId, goldenHour);
      }
      
      if (!result.nextGoldenHour && goldenHour) {
        result.nextGoldenHour = getNextGoldenHourWindow(goldenHour);
      }
      
      const processResult = await processGhostWithMerchant(ghost, merchant, goldenHour);
      
      if (processResult.sent) {
        result.emailsSent++;
        
        const newEmailCount = ghost.emailCount + 1;
        if (newEmailCount >= 3) {
          await storage.markGhostExhausted(ghost.id);
          console.log(`[PULSE ENGINE] Ghost ${ghost.id} exhausted after 3 emails`);
        }
      } else {
        if (processResult.error !== 'Outside golden hour window') {
          result.emailsFailed++;
          if (processResult.error) {
            result.errors.push(`Ghost ${ghost.id}: ${processResult.error}`);
          }
        }
      }
    }
    
    if (!result.nextGoldenHour) {
      result.nextGoldenHour = "No oracle data available - using immediate timing";
    }
    
    console.log(`[PULSE ENGINE] Queue processing complete. Sent: ${result.emailsSent}, Failed: ${result.emailsFailed}`);
    
  } catch (error: any) {
    console.error("[PULSE ENGINE] Queue processing failed:", error);
    result.errors.push(`Queue processing error: ${error.message}`);
  }
  
  return result;
}
