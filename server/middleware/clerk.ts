import { Request, Response, NextFunction } from "express";
import { clerkClient, ClerkExpressWithAuth, WithAuthProp } from "@clerk/clerk-sdk-node";
import { storage } from "../storage";
import type { Merchant } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string | null;
        sessionId: string | null;
        orgId?: string | null;
      };
      merchant?: Merchant;
    }
  }
}

export const clerkAuth = ClerkExpressWithAuth();

export async function syncClerkMerchant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const orgId = req.auth?.orgId;
    const userId = req.auth?.userId;
    
    let merchant: Merchant | undefined;
    
    // IDOR Prevention: Resolve merchant ONLY from verified token claims
    // Priority: Organization ID > User ID (supports B2B multi-tenant scenarios)
    // CRITICAL: Never source merchantId from req.body or req.query
    
    if (orgId) {
      // B2B path: Organization-based resolution
      merchant = await storage.getMerchantByOrgId(orgId);
    }
    
    if (!merchant && userId) {
      // Fallback: Individual user resolution
      merchant = await storage.getMerchantByClerkId(userId);
    }
    
    if (merchant) {
      req.merchant = merchant;
      req.merchantId = merchant.id;
    }
    
    next();
  } catch (error) {
    console.error("[CLERK] Error syncing merchant:", error);
    next();
  }
}

export function requireClerkMerchant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.auth?.userId) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized - not signed in",
    });
  }

  if (!req.merchant) {
    return res.status(403).json({
      status: "error",
      message: "Forbidden - no merchant linked. Please connect your Stripe account.",
    });
  }

  next();
}
