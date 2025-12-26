import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { encrypt, selfTest } from "./utils/crypto";
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
