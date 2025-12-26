import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { encrypt, runSecurityCheck } from "./utils/crypto";
import Stripe from "stripe";

// Run security check on module load
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

// Log configuration status on startup
const stripeConfigured = validateStripeSecrets();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ 
      status: "ok", 
      service: "phantom", 
      stage: "titanium-gate",
      stripeConfigured: stripeConfigured
    });
  });

  // Stripe OAuth initiation - redirects to Stripe Connect authorization
  app.get("/api/auth/stripe", (_req, res) => {
    const clientId = process.env.STRIPE_CLIENT_ID;
    
    if (!clientId) {
      console.error("[AUTH] STRIPE_CLIENT_ID is not configured");
      return res.status(500).json({ 
        status: "error", 
        message: "Stripe Connect is not configured" 
      });
    }

    const redirectUri = `${getBaseUrl()}/api/auth/callback`;
    
    const authUrl = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=read_write&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    console.log("[AUTH] Redirecting to Stripe Connect authorization");
    res.redirect(authUrl);
  });

  // Stripe OAuth callback - receives authorization code and exchanges for token
  app.get("/api/auth/callback", async (req, res) => {
    const { code, error, error_description } = req.query;

    // Check Stripe client availability first
    const stripe = getStripeClient();
    if (!stripe) {
      console.error("[AUTH] Stripe client unavailable - STRIPE_SECRET_KEY not configured");
      return res.status(500).json({ 
        status: "error", 
        message: "Stripe integration is not configured" 
      });
    }

    if (error) {
      console.error("[AUTH] Stripe OAuth error:", error, error_description);
      return res.status(400).json({ 
        status: "error", 
        message: error_description || "Authorization failed" 
      });
    }

    if (!code || typeof code !== "string") {
      console.error("[AUTH] No authorization code received");
      return res.status(400).json({ 
        status: "error", 
        message: "No authorization code received" 
      });
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
        return res.status(500).json({ 
          status: "error", 
          message: "Invalid token response from Stripe" 
        });
      }

      // Check if merchant already exists
      const existingMerchant = await storage.getMerchantByStripeUserId(stripe_user_id);
      
      if (existingMerchant) {
        console.log("[AUTH] Merchant already authorized:", stripe_user_id);
        return res.json({ 
          status: "success", 
          message: "Merchant Authorized" 
        });
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
      
      res.json({ 
        status: "success", 
        message: "Merchant Authorized" 
      });

    } catch (err) {
      console.error("[AUTH] Token exchange failed:", err);
      res.status(500).json({ 
        status: "error", 
        message: "Failed to complete authorization" 
      });
    }
  });

  return httpServer;
}

function getBaseUrl(): string {
  // In production, use the Replit URL
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  // Fallback for local development
  return "http://localhost:5000";
}
