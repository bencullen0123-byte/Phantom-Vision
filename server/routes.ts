import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { encrypt, selfTest } from "./utils/crypto";
import { runAuditForMerchant } from "./services/ghostHunter";
import { processQueue } from "./services/pulseEngine";
import { handleWebhookEvent } from "./services/webhookHandler";
import { randomBytes } from "crypto";
import Stripe from "stripe";

// Cookie name for OAuth state
const OAUTH_STATE_COOKIE = "phantom_oauth_state";

// Track vault status
let vaultActive = false;

// Run security check on module load
function runSecurityCheck(): void {
  vaultActive = selfTest();
  if (!vaultActive) {
    console.error("[SECURITY] Critical security failure - shutting down");
    process.exit(1);
  }
}

runSecurityCheck();

// Validate Stripe secrets on startup (but don't crash - log warning)
function validateStripeSecrets(): boolean {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const clientId = process.env.STRIPE_CLIENT_ID;
  
  if (!secretKey) {
    console.error("[CONFIG] STRIPE_SECRET_KEY is not set - Stripe integration will be unavailable");
    return false;
  }
  
  if (!clientId) {
    console.error("[CONFIG] STRIPE_CLIENT_ID is not set - Stripe Connect will be unavailable");
    return false;
  }
  
  console.log("[CONFIG] Stripe secrets validated successfully");
  return true;
}

// Lazy initialization of Stripe client
let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe | null {
  if (stripeClient) return stripeClient;
  
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  
  stripeClient = new Stripe(secretKey, {
    apiVersion: "2025-12-15.clover",
  });
  
  return stripeClient;
}

// Generate cryptographically secure random state
function generateState(): string {
  return randomBytes(32).toString("hex");
}

// Log configuration status on startup
const stripeConfigured = validateStripeSecrets();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check endpoint with vault status
  app.get("/api/health", (_req, res) => {
    res.json({ 
      status: "ok", 
      service: "phantom", 
      stage: "titanium-gate",
      stripeConfigured: stripeConfigured,
      vaultActive: vaultActive
    });
  });

  // Success endpoint - clean JSON response after OAuth
  app.get("/api/auth/success", (req: Request, res: Response) => {
    const { merchant_id } = req.query;
    
    res.json({
      status: "authorized",
      merchant_id: merchant_id || "unknown"
    });
  });

  // Error endpoint - logs error and returns structured response
  app.get("/api/auth/error", (req: Request, res: Response) => {
    const { reason, code, description } = req.query;
    
    // Log detailed error for review
    console.error("[AUTH ERROR] Reason:", reason);
    if (code) console.error("[AUTH ERROR] Stripe Code:", code);
    if (description) console.error("[AUTH ERROR] Description:", description);
    
    res.status(400).json({
      status: "error",
      reason: reason || "unknown_error",
      message: description || getErrorMessage(reason as string)
    });
  });

  // Stripe OAuth initiation - redirects to Stripe Connect authorization
  app.get("/api/auth/stripe", (req: Request, res: Response) => {
    const clientId = process.env.STRIPE_CLIENT_ID;
    
    if (!clientId) {
      console.error("[AUTH] STRIPE_CLIENT_ID is not configured");
      return res.redirect(`/api/auth/error?reason=config_error&description=${encodeURIComponent("Stripe Connect is not configured")}`);
    }

    // Generate random state for CSRF protection
    const state = generateState();
    
    // Store state in secure HTTP-only cookie with sameSite: none for cross-domain
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 10 * 60 * 1000, // 10 minutes expiry
      path: "/",
    });

    const redirectUri = `${getBaseUrl(req)}/api/auth/callback`;
    console.log("[AUTH] Callback URL:", redirectUri);
    console.log("[AUTH] State generated for CSRF protection");
    
    const authUrl = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=read_write&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    
    console.log("[AUTH] Redirecting to Stripe Connect authorization");
    res.redirect(authUrl);
  });

  // Stripe OAuth callback - receives authorization code and exchanges for token
  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    const { code, error, error_description, state } = req.query;

    // Validate state parameter for CSRF protection
    const storedState = req.cookies?.[OAUTH_STATE_COOKIE];
    
    // Clear the state cookie immediately
    res.clearCookie(OAUTH_STATE_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });

    if (!state || typeof state !== "string") {
      console.error("[AUTH] Missing state parameter - possible CSRF attack");
      return res.redirect("/api/auth/error?reason=missing_state&description=" + encodeURIComponent("Invalid request - missing state parameter"));
    }

    if (!storedState) {
      console.error("[AUTH] Missing stored state cookie - session may have expired");
      return res.redirect("/api/auth/error?reason=session_expired&description=" + encodeURIComponent("Session expired - please try connecting again"));
    }

    if (state !== storedState) {
      console.error("[AUTH] State mismatch - possible CSRF attack");
      return res.redirect("/api/auth/error?reason=state_mismatch&description=" + encodeURIComponent("Security check failed - please try again"));
    }

    console.log("[AUTH] State validation passed");

    // Check Stripe client availability
    const stripe = getStripeClient();
    if (!stripe) {
      console.error("[AUTH] Stripe client unavailable - STRIPE_SECRET_KEY not configured");
      return res.redirect("/api/auth/error?reason=config_error&description=" + encodeURIComponent("Stripe integration is not configured"));
    }

    if (error) {
      console.error("[AUTH] Stripe OAuth error:", error, error_description);
      return res.redirect(`/api/auth/error?reason=stripe_error&code=${encodeURIComponent(error as string)}&description=${encodeURIComponent((error_description as string) || "Authorization failed")}`);
    }

    if (!code || typeof code !== "string") {
      console.error("[AUTH] No authorization code received");
      return res.redirect("/api/auth/error?reason=no_code&description=" + encodeURIComponent("No authorization code received"));
    }

    try {
      // Exchange authorization code for access token
      const response = await stripe.oauth.token({
        grant_type: "authorization_code",
        code: code,
      });

      const { access_token, stripe_user_id } = response;

      if (!access_token || !stripe_user_id) {
        console.error("[AUTH] Invalid token response from Stripe");
        return res.redirect("/api/auth/error?reason=invalid_token&description=" + encodeURIComponent("Invalid token response from Stripe"));
      }

      // Check if merchant already exists
      const existingMerchant = await storage.getMerchantByStripeUserId(stripe_user_id);
      
      if (existingMerchant) {
        console.log("[AUTH] Merchant already authorized:", stripe_user_id);
        return res.redirect(`/api/auth/success?merchant_id=${encodeURIComponent(stripe_user_id)}`);
      }

      // Encrypt the access token using the Vault
      const { encryptedData, iv, tag } = encrypt(access_token);

      // Store encrypted token in database
      await storage.createMerchant({
        stripeUserId: stripe_user_id,
        encryptedToken: encryptedData,
        iv: iv,
        tag: tag,
      });

      console.log("[AUTH] New merchant authorized and stored:", stripe_user_id);
      
      res.redirect(`/api/auth/success?merchant_id=${encodeURIComponent(stripe_user_id)}`);

    } catch (err: any) {
      console.error("[AUTH] Token exchange failed:", err);
      const errorCode = err?.code || "exchange_failed";
      const errorMessage = err?.message || "Failed to complete authorization";
      return res.redirect(`/api/auth/error?reason=token_exchange_failed&code=${encodeURIComponent(errorCode)}&description=${encodeURIComponent(errorMessage)}`);
    }
  });

  // Audit endpoint - runs ghost scan for a merchant
  app.get("/api/audit/run", async (req: Request, res: Response) => {
    const { merchant_id } = req.query;

    if (!merchant_id || typeof merchant_id !== "string") {
      // If no merchant_id provided, try to get the first connected merchant
      const merchants = await storage.getAllMerchants();
      
      if (merchants.length === 0) {
        return res.status(400).json({
          status: "error",
          message: "No connected merchants found. Please connect a Stripe account first."
        });
      }

      // Use the first merchant for now
      const targetMerchant = merchants[0];
      console.log(`[AUDIT] Running audit for merchant: ${targetMerchant.id}`);

      try {
        const result = await runAuditForMerchant(targetMerchant.id);
        
        if (result.errors.length > 0) {
          console.error("[AUDIT] Errors during scan:", result.errors);
        }

        return res.json({
          status: "success",
          merchant_id: targetMerchant.stripeUserId,
          total_ghosts_found: result.total_ghosts_found,
          total_revenue_at_risk: result.total_revenue_at_risk,
          total_revenue_at_risk_formatted: `$${(result.total_revenue_at_risk / 100).toFixed(2)}`,
          oracle_data_points: result.oracle_data_points,
          errors: result.errors
        });
      } catch (error: any) {
        console.error("[AUDIT] Scan failed:", error);
        return res.status(500).json({
          status: "error",
          message: "Audit scan failed",
          error: error.message
        });
      }
    }

    // If merchant_id is provided, look up by internal ID
    const merchant = await storage.getMerchant(merchant_id);
    
    if (!merchant) {
      return res.status(404).json({
        status: "error",
        message: "Merchant not found"
      });
    }

    console.log(`[AUDIT] Running audit for merchant: ${merchant.id}`);

    try {
      const result = await runAuditForMerchant(merchant.id);
      
      if (result.errors.length > 0) {
        console.error("[AUDIT] Errors during scan:", result.errors);
      }

      return res.json({
        status: "success",
        merchant_id: merchant.stripeUserId,
        total_ghosts_found: result.total_ghosts_found,
        total_revenue_at_risk: result.total_revenue_at_risk,
        total_revenue_at_risk_formatted: `$${(result.total_revenue_at_risk / 100).toFixed(2)}`,
        oracle_data_points: result.oracle_data_points,
        errors: result.errors
      });
    } catch (error: any) {
      console.error("[AUDIT] Scan failed:", error);
      return res.status(500).json({
        status: "error",
        message: "Audit scan failed",
        error: error.message
      });
    }
  });

  // Pulse endpoint - triggers recovery email queue processing
  app.get("/api/pulse/run", async (_req: Request, res: Response) => {
    console.log("[PULSE] Manual trigger initiated");

    try {
      const result = await processQueue();

      return res.json({
        status: "success",
        emails_sent: result.emailsSent,
        emails_failed: result.emailsFailed,
        ghosts_processed: result.ghostsProcessed,
        next_golden_hour: result.nextGoldenHour,
        errors: result.errors
      });
    } catch (error: any) {
      console.error("[PULSE] Queue processing failed:", error);
      return res.status(500).json({
        status: "error",
        message: "Pulse processing failed",
        error: error.message
      });
    }
  });

  // Stripe Webhook endpoint - receives payment events
  app.post("/api/webhooks/stripe", async (req: Request, res: Response) => {
    console.log("[WEBHOOK] Received Stripe webhook");

    const stripe = getStripeClient();
    if (!stripe) {
      console.error("[WEBHOOK] Stripe client unavailable");
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[WEBHOOK] STRIPE_WEBHOOK_SECRET not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    const signature = req.headers["stripe-signature"];
    if (!signature) {
      console.error("[WEBHOOK] Missing stripe-signature header");
      return res.status(400).json({ error: "Missing signature" });
    }

    let event: Stripe.Event;

    try {
      const rawBody = req.rawBody as Buffer;
      if (!rawBody) {
        console.error("[WEBHOOK] Raw body not available");
        return res.status(400).json({ error: "Raw body not available" });
      }

      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
    } catch (err: any) {
      console.error("[WEBHOOK] Signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }

    try {
      const result = await handleWebhookEvent(event);
      
      return res.json({
        received: true,
        ...result
      });
    } catch (error: any) {
      console.error("[WEBHOOK] Event processing failed:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Merchant Stats API - returns recovery dashboard data
  app.get("/api/merchant/stats", async (req: Request, res: Response) => {
    const { merchant_id } = req.query;

    let targetMerchantId: string;

    if (!merchant_id || typeof merchant_id !== "string") {
      const merchants = await storage.getAllMerchants();
      
      if (merchants.length === 0) {
        return res.status(400).json({
          status: "error",
          message: "No connected merchants found"
        });
      }

      targetMerchantId = merchants[0].id;
    } else {
      targetMerchantId = merchant_id;
    }

    const merchant = await storage.getMerchant(targetMerchantId);
    if (!merchant) {
      return res.status(404).json({
        status: "error",
        message: "Merchant not found"
      });
    }

    try {
      const stats = await storage.getMerchantStats(targetMerchantId);

      return res.json({
        status: "success",
        merchant_id: merchant.stripeUserId,
        total_ghosts_found: stats.totalGhostsFound,
        active_ghosts: stats.activeGhosts,
        recovered_count: stats.recoveredCount,
        revenue_recovered_cents: stats.totalRecoveredCents,
        revenue_recovered_formatted: `$${(stats.totalRecoveredCents / 100).toFixed(2)}`,
        recovery_rate: stats.recoveryRate,
        recovery_rate_formatted: `${stats.recoveryRate.toFixed(2)}%`
      });
    } catch (error: any) {
      console.error("[STATS] Failed to get merchant stats:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to retrieve stats",
        error: error.message
      });
    }
  });

  return httpServer;
}

// Helper function to get user-friendly error messages
function getErrorMessage(reason: string): string {
  const messages: Record<string, string> = {
    config_error: "The system is not properly configured. Please contact support.",
    missing_state: "Invalid request. Please try connecting again.",
    session_expired: "Your session has expired. Please try connecting again.",
    state_mismatch: "Security check failed. Please try connecting again.",
    stripe_error: "Stripe authorization failed. Please try again.",
    no_code: "Authorization was not completed. Please try again.",
    invalid_token: "Could not verify your Stripe account. Please try again.",
    token_exchange_failed: "Failed to complete the connection. Please try again.",
  };
  
  return messages[reason] || "An unexpected error occurred. Please try again.";
}

function getBaseUrl(req?: { headers?: { host?: string } }): string {
  // Use REPLIT_DEV_DOMAIN for development URLs (modern Replit format)
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // Fallback to request host header if available
  if (req?.headers?.host) {
    const protocol = req.headers.host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${req.headers.host}`;
  }
  
  // Legacy Replit URL format
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  
  // Fallback for local development
  return "http://localhost:5000";
}
