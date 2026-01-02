import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { encrypt, decrypt, selfTest } from "./utils/crypto";
import { runAuditForMerchant } from "./services/ghostHunter";
import { processQueue } from "./services/pulseEngine";
import { handleWebhookEvent } from "./services/webhookHandler";
import { startScheduler, getSystemHealth, runGhostHunterJob, runPulseEngineJob } from "./services/scheduler";
import { runSeeder } from "./services/seeder";
import { requireMerchant } from "./middleware/auth";
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

  // Auth status endpoint - checks if user has active session
  app.get("/api/auth/status", (req: Request, res: Response) => {
    const merchantId = req.session?.merchantId;
    
    if (merchantId) {
      return res.json({
        authenticated: true,
        merchantId
      });
    }
    
    return res.json({
      authenticated: false
    });
  });

  // Logout endpoint - destroys session and clears cookies
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("[AUTH] Session destruction error:", err);
        return res.status(500).json({ status: "error", message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      return res.json({ status: "ok", message: "Logged out successfully" });
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
        req.session.merchantId = existingMerchant.id;
        return req.session.save((err) => {
          if (err) {
            console.error("[AUTH] Session save error:", err);
          }
          res.redirect("/");
        });
      }

      // Encrypt the access token using the Vault
      const { encryptedData, iv, tag } = encrypt(access_token);

      // Store encrypted token in database
      const newMerchant = await storage.createMerchant({
        stripeUserId: stripe_user_id,
        encryptedToken: encryptedData,
        iv: iv,
        tag: tag,
      });

      console.log("[AUTH] New merchant authorized and stored:", stripe_user_id);
      
      req.session.merchantId = newMerchant.id;
      req.session.save((err) => {
        if (err) {
          console.error("[AUTH] Session save error:", err);
        }
        res.redirect("/");
      });

    } catch (err: any) {
      console.error("[AUTH] Token exchange failed:", err);
      const errorCode = err?.code || "exchange_failed";
      const errorMessage = err?.message || "Failed to complete authorization";
      return res.redirect(`/api/auth/error?reason=token_exchange_failed&code=${encodeURIComponent(errorCode)}&description=${encodeURIComponent(errorMessage)}`);
    }
  });

  // Audit endpoint - creates a scan job for async processing (secured by session)
  // Returns 202 Accepted immediately with job ID for status polling
  app.post("/api/audit/run", requireMerchant, async (req: Request, res: Response) => {
    const merchantId = req.merchantId!;
    const forceSync = req.body?.forceSync === true;
    
    const merchant = await storage.getMerchant(merchantId);
    if (!merchant) {
      return res.status(404).json({
        status: "error",
        message: "Merchant not found"
      });
    }

    // Check if audit is already in progress
    if (merchant.lastAuditStatus === 'in_progress') {
      return res.status(409).json({
        status: "in_progress",
        message: "Audit already in progress"
      });
    }

    console.log(`[AUDIT] Creating scan job for merchant: ${merchant.id} (forceSync: ${forceSync})`);

    // Create a scan job - the worker will pick it up
    const job = await storage.createScanJob(merchantId);
    
    console.log(`[AUDIT] Scan job ${job.id} created for merchant: ${merchantId}`);

    // Return 202 Accepted with job ID for polling
    return res.status(202).json({
      status: "pending",
      jobId: job.id,
      message: "Scan job created. Poll /api/scan/:id for status.",
      forceSync
    });
  });

  // Scan job status endpoint - returns progress and status
  app.get("/api/scan/:id", async (req: Request, res: Response) => {
    const jobId = parseInt(req.params.id, 10);
    
    if (isNaN(jobId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid job ID"
      });
    }
    
    const job = await storage.getScanJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        status: "error",
        message: "Job not found"
      });
    }
    
    return res.json({
      id: job.id,
      merchantId: job.merchantId,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      error: job.error
    });
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

  // Merchant Branding Update - PATCH endpoint for updating branding settings
  app.patch("/api/merchant/branding", requireMerchant, async (req: Request, res: Response) => {
    const merchantId = req.merchantId!;

    try {
      const { businessName, supportEmail, brandColor, autoPilotEnabled } = req.body;
      
      const updateData: Record<string, any> = {};
      if (businessName !== undefined) updateData.businessName = businessName;
      if (supportEmail !== undefined) updateData.supportEmail = supportEmail;
      if (brandColor !== undefined) updateData.brandColor = brandColor;
      if (autoPilotEnabled !== undefined) updateData.autoPilotEnabled = autoPilotEnabled;

      const updated = await storage.updateMerchantBranding(merchantId, updateData);
      
      if (!updated) {
        return res.status(404).json({ status: "error", message: "Merchant not found" });
      }

      return res.json({
        status: "success",
        message: "Branding updated successfully",
        merchant: {
          businessName: updated.businessName,
          supportEmail: updated.supportEmail,
          brandColor: updated.brandColor,
          autoPilotEnabled: updated.autoPilotEnabled,
        }
      });
    } catch (error: any) {
      console.error("[BRANDING] Failed to update branding:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to update branding",
        error: error.message
      });
    }
  });

  // Merchant Stats API - returns Historical Revenue Intelligence (secured by session)
  app.get("/api/merchant/stats", requireMerchant, async (req: Request, res: Response) => {
    const merchantId = req.merchantId!;

    const merchant = await storage.getMerchant(merchantId);
    if (!merchant) {
      return res.status(404).json({
        status: "error",
        message: "Merchant not found"
      });
    }

    try {
      const historicalStats = await storage.getHistoricalRevenueStats(merchantId);

      // Build leakage distribution for donut chart
      const ghosts = await storage.getGhostTargetsByMerchant(merchantId);
      const activeGhosts = ghosts.filter(g => g.status === "pending" || g.status === "impending");
      const { aggregateByCategory, getCategoryRecoverability } = await import("@shared/leakageCategories");
      const categoryData = aggregateByCategory(activeGhosts);
      const totalValue = categoryData.reduce((sum, cat) => sum + cat.value, 0);
      
      const dominant = categoryData[0];
      let insight = "";
      if (dominant) {
        const recoverability = getCategoryRecoverability(dominant.category);
        insight = `${dominant.percentage}% of your leakage is '${dominant.category}'. These are ${recoverability}% recoverable with Pulse Retries.`;
      }

      // Build conversion funnel metrics
      const totalGhosts = ghosts.length;
      const nudgedCount = ghosts.filter(g => (g.emailCount || 0) > 0).length;
      const clickedCount = ghosts.filter(g => (g.clickCount || 0) > 0).length;
      const recoveredCount = ghosts.filter(g => g.status === "recovered").length;
      const recoveryRate = totalGhosts > 0 ? Math.round((recoveredCount / totalGhosts) * 100) : 0;

      return res.json({
        id: merchant.id,
        lastAuditAt: merchant.lastAuditAt,
        tierLimit: merchant.tierLimit,
        recoveryStrategy: merchant.recoveryStrategy,
        lifetime: historicalStats.lifetime,
        defaultCurrency: historicalStats.defaultCurrency,
        impendingLeakageCents: historicalStats.impendingLeakageCents,
        totalProtectedCents: historicalStats.totalProtectedCents,
        monthlyTrend: historicalStats.monthlyTrend,
        dailyPulse: historicalStats.dailyPulse,
        grossInvoicedCents: historicalStats.grossInvoicedCents,
        businessName: merchant.businessName,
        supportEmail: merchant.supportEmail,
        brandColor: merchant.brandColor,
        autoPilotEnabled: merchant.autoPilotEnabled,
        leakageDistribution: {
          categories: categoryData,
          totalValue,
          activeGhostCount: activeGhosts.length,
          insight,
        },
        funnel: {
          totalGhosts,
          nudgedCount,
          clickedCount,
          recoveredCount,
        },
        recoveryRate,
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

  // Diagnostic Pulse API - returns funnel metadata from last Ghost Hunter run
  app.get("/api/diagnostic-pulse", requireMerchant, async (req: Request, res: Response) => {
    const merchantId = req.merchantId!;

    try {
      const pulse = await storage.getDiagnosticPulse(merchantId);
      return res.json(pulse);
    } catch (error: any) {
      console.error("[DIAGNOSTIC PULSE] Failed to retrieve pulse:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to retrieve diagnostic pulse",
        error: error.message
      });
    }
  });

  // Golden Hour API - returns count of pending ghosts within optimal recovery window
  app.get("/api/golden-hour", requireMerchant, async (req: Request, res: Response) => {
    const merchantId = req.merchantId!;

    try {
      const goldenHourData = await storage.getGoldenHourGhosts(merchantId);
      return res.json(goldenHourData);
    } catch (error: any) {
      console.error("[GOLDEN HOUR] Failed to retrieve golden hour data:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to retrieve golden hour data",
        error: error.message
      });
    }
  });

  // Ghost Targets API - returns decrypted ghost targets for authenticated merchant
  app.get("/api/merchant/ghosts", requireMerchant, async (req: Request, res: Response) => {
    const merchantId = req.merchantId!;

    try {
      const ghosts = await storage.getGhostTargetsByMerchant(merchantId);
      
      // Sort by discoveredAt descending (most recent first)
      ghosts.sort((a, b) => {
        const dateA = a.discoveredAt ? new Date(a.discoveredAt).getTime() : 0;
        const dateB = b.discoveredAt ? new Date(b.discoveredAt).getTime() : 0;
        return dateB - dateA;
      });

      // Map to API response format (hide internal encryption fields)
      const response = ghosts.map(ghost => ({
        id: ghost.id,
        email: ghost.email,
        customerName: ghost.customerName,
        amount: ghost.amount,
        invoiceId: ghost.invoiceId,
        discoveredAt: ghost.discoveredAt,
        lastEmailedAt: ghost.lastEmailedAt,
        emailCount: ghost.emailCount,
        status: ghost.status,
        recoveredAt: ghost.recoveredAt,
        recoveryType: ghost.recoveryType,
        declineType: ghost.declineType,
        failureCode: ghost.failureCode,
        failureMessage: ghost.failureMessage,
        cardBrand: ghost.cardBrand,
        cardFunding: ghost.cardFunding,
        countryCode: ghost.countryCode,
        stripeErrorCode: ghost.stripeErrorCode,
        recoveryStrategy: ghost.recoveryStrategy,
        clickCount: ghost.clickCount,
        lastClickedAt: ghost.lastClickedAt,
      }));

      return res.json(response);
    } catch (error: any) {
      console.error("[GHOSTS] Failed to get ghost targets:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to retrieve ghost targets",
        error: error.message
      });
    }
  });

  // Leakage Forensics - aggregated failure categories for donut chart
  app.get("/api/merchant/leakage-forensics", requireMerchant, async (req: Request, res: Response) => {
    const merchantId = req.merchantId!;

    try {
      const ghosts = await storage.getGhostTargetsByMerchant(merchantId);
      
      // Filter to active ghosts only (pending or impending)
      const activeGhosts = ghosts.filter(g => g.status === "pending" || g.status === "impending");
      
      // Import dynamically to avoid circular deps
      const { aggregateByCategory, getCategoryRecoverability } = await import("@shared/leakageCategories");
      const categoryData = aggregateByCategory(activeGhosts);
      
      // Calculate total value
      const totalValue = categoryData.reduce((sum, cat) => sum + cat.value, 0);
      
      // Find dominant category for insight
      const dominant = categoryData[0];
      let insight = "";
      if (dominant) {
        const recoverability = getCategoryRecoverability(dominant.category);
        insight = `${dominant.percentage}% of your leakage is '${dominant.category}'. These are ${recoverability}% recoverable with Pulse Retries.`;
      }

      return res.json({
        categories: categoryData,
        totalValue,
        activeGhostCount: activeGhosts.length,
        insight,
      });
    } catch (error: any) {
      console.error("[FORENSICS] Failed to get leakage forensics:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to retrieve leakage forensics",
        error: error.message
      });
    }
  });

  // Intelligence Logs - returns decision transparency feed for merchant
  app.get("/api/merchant/logs", requireMerchant, async (req: Request, res: Response) => {
    const merchantId = req.merchantId!;
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    try {
      const logs = await storage.getIntelligenceLogs(merchantId, limit);
      return res.json(logs);
    } catch (error: any) {
      console.error("[LOGS] Failed to get intelligence logs:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to retrieve logs",
        error: error.message
      });
    }
  });

  // System Health endpoint - returns scheduler status and recent logs
  app.get("/api/system/health", async (_req: Request, res: Response) => {
    try {
      const health = await getSystemHealth();
      
      return res.json({
        status: "success",
        sentinel_active: true,
        last_ghost_hunter: health.lastGhostHunterRun,
        last_pulse_engine: health.lastPulseEngineRun,
        recent_logs: health.recentLogs.map(log => ({
          job: log.jobName,
          status: log.status,
          details: log.details,
          error: log.errorMessage,
          run_at: log.runAt,
        })),
      });
    } catch (error: any) {
      console.error("[HEALTH] Failed to get system health:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to retrieve health status",
        error: error.message,
      });
    }
  });

  // Manual trigger endpoints for testing
  app.post("/api/sentinel/ghost-hunter", async (req: Request, res: Response) => {
    const forceSync = req.body?.forceSync === true;
    console.log(`[SENTINEL] Manual Ghost Hunter trigger (forceSync: ${forceSync})`);
    try {
      await runGhostHunterJob(forceSync);
      return res.json({ status: "success", message: "Ghost Hunter job triggered", forceSync });
    } catch (error: any) {
      return res.status(500).json({ status: "error", error: error.message });
    }
  });

  app.post("/api/sentinel/pulse-engine", async (_req: Request, res: Response) => {
    console.log("[SENTINEL] Manual Pulse Engine trigger");
    try {
      await runPulseEngineJob();
      return res.json({ status: "success", message: "Pulse Engine job triggered" });
    } catch (error: any) {
      return res.status(500).json({ status: "error", error: error.message });
    }
  });

  // Attribution Proxy Link - tracks clicks and redirects to Stripe (Sprint 2.5.2 Enhanced)
  // Sets phantom_attribution cookie (24h), logs click in ghost_targets, routes by recovery strategy
  // Fetches actual Stripe URLs and logs redirect verification
  app.get("/api/l/:targetId", async (req: Request, res: Response) => {
    const { targetId } = req.params;
    
    // SECURITY: Log only anonymized identifier
    console.log(`[ATTRIBUTION] Link click received for target: ${targetId}`);

    // Helper: graceful fallback redirect based on merchant or generic support
    const gracefulFallback = async (merchantId?: string) => {
      if (merchantId) {
        try {
          const merchant = await storage.getMerchant(merchantId);
          if (merchant?.supportEmail) {
            console.log(`[ATTRIBUTION] Fallback to merchant support: ${merchant.supportEmail}`);
            return res.redirect(302, `mailto:${merchant.supportEmail}?subject=Payment%20Assistance`);
          }
        } catch (e) {
          // Ignore errors, fall through to generic
        }
      }
      console.log(`[ATTRIBUTION] Fallback to generic Stripe help`);
      return res.redirect(302, "https://support.stripe.com/contact");
    };

    // Helper: log redirect verification to system_logs
    const logRedirectVerification = async (strategy: string | null, destinationType: "Portal" | "Invoice" | "Success", targetId: string) => {
      await storage.createSystemLog({
        jobName: "redirect_verification",
        status: "success",
        details: JSON.stringify({
          targetId,
          strategy: strategy || "none",
          destinationType,
          timestamp: new Date().toISOString()
        }),
        errorMessage: null
      });
    };

    try {
      const ghost = await storage.getGhostTarget(targetId);
      
      if (!ghost) {
        console.warn(`[ATTRIBUTION] Invalid target ID: ${targetId}`);
        return gracefulFallback();
      }

      // Check if ghost is expired (past purge date)
      if (ghost.purgeAt && new Date() > new Date(ghost.purgeAt)) {
        console.warn(`[ATTRIBUTION] Expired target: ${targetId}`);
        return gracefulFallback(ghost.merchantId);
      }

      // Sprint 2.5.2: Data Integrity Check - if already recovered/protected, redirect to success page
      if (ghost.status === "recovered" || ghost.status === "protected") {
        console.log(`[ATTRIBUTION] Ghost already ${ghost.status}, redirecting to success page`);
        await logRedirectVerification(ghost.recoveryStrategy, "Success", targetId);
        return res.redirect(302, `${getBaseUrl(req)}/payment-received?status=${ghost.status}`);
      }

      // Sprint 2.5.1: Record click in ghost_targets (atomic increment)
      await storage.recordGhostClick(ghost.id);

      // Set phantom_attribution cookie (24-hour expiry)
      const cookieExpiry = new Date();
      cookieExpiry.setHours(cookieExpiry.getHours() + 24);
      
      res.cookie("phantom_attribution", targetId, {
        expires: cookieExpiry,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
      });

      // Set database attribution flag
      await storage.setGhostAttributionFlag(ghost.id, cookieExpiry);

      // Log click event to system_logs (for analytics dashboard)
      await storage.createSystemLog({
        jobName: "email_click",
        status: "success",
        details: `Target ${targetId} clicked (strategy: ${ghost.recoveryStrategy || 'none'}, status: ${ghost.status})`,
        errorMessage: null
      });

      console.log(`[ATTRIBUTION] Cookie set for target ${ghost.id}, click #${(ghost.clickCount || 0) + 1}, expires: ${cookieExpiry.toISOString()}`);

      // Sprint 2.5.2: Dynamic redirect based on recoveryStrategy with real Stripe URLs
      const stripe = getStripeClient();
      const merchant = await storage.getMerchant(ghost.merchantId);
      const successReturnUrl = `${getBaseUrl(req)}/payment-received?targetId=${targetId}`;

      // Helper: fetch hosted_invoice_url from Stripe Invoice object
      const fetchHostedInvoiceUrl = async (): Promise<string | null> => {
        if (!stripe || !merchant?.stripeUserId) return null;
        try {
          const invoice = await stripe.invoices.retrieve(
            ghost.invoiceId,
            { stripeAccount: merchant.stripeUserId }
          );
          return invoice.hosted_invoice_url || null;
        } catch (err: any) {
          console.error(`[ATTRIBUTION] Failed to fetch invoice URL:`, err.message);
          return null;
        }
      };

      // Strategy-based routing with real Stripe URLs
      if (ghost.recoveryStrategy === "technical_bridge") {
        // 3DS authentication required - fetch hosted invoice URL from Stripe
        const hostedUrl = await fetchHostedInvoiceUrl();
        const redirectUrl = hostedUrl || `https://invoice.stripe.com/i/${ghost.invoiceId}`;
        console.log(`[ATTRIBUTION] technical_bridge -> Invoice (3DS auth)`);
        await logRedirectVerification(ghost.recoveryStrategy, "Invoice", targetId);
        return res.redirect(302, redirectUrl);
      }

      if (ghost.recoveryStrategy === "card_refresh" || ghost.status === "impending") {
        // Card needs updating - generate Customer Portal session
        if (stripe && ghost.stripeCustomerId && merchant?.stripeUserId) {
          try {
            const session = await stripe.billingPortal.sessions.create(
              {
                customer: ghost.stripeCustomerId,
                return_url: successReturnUrl,
              },
              { stripeAccount: merchant.stripeUserId }
            );
            console.log(`[ATTRIBUTION] card_refresh/impending -> Customer Portal`);
            await logRedirectVerification(ghost.recoveryStrategy, "Portal", targetId);
            return res.redirect(302, session.url);
          } catch (portalError: any) {
            console.error(`[ATTRIBUTION] Portal creation failed:`, portalError.message);
            // Fall through to invoice redirect
          }
        }
      }

      // smart_retry, high_value_manual, or fallback: fetch hosted invoice URL
      const hostedUrl = await fetchHostedInvoiceUrl();
      const redirectUrl = hostedUrl || `https://invoice.stripe.com/i/${ghost.invoiceId}`;
      console.log(`[ATTRIBUTION] ${ghost.recoveryStrategy || 'default'} -> Invoice`);
      await logRedirectVerification(ghost.recoveryStrategy, "Invoice", targetId);
      return res.redirect(302, redirectUrl);
      
    } catch (error: any) {
      console.error(`[ATTRIBUTION] Error processing target ${targetId}:`, error.message);
      return gracefulFallback();
    }
  });

  // Sprint 2.5.2: Payment Received / Success confirmation page
  app.get("/payment-received", async (_req: Request, res: Response) => {
    // Simple HTML confirmation page for successful payment redirects
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Received</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; max-width: 400px; padding: 40px; }
    .icon { font-size: 64px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin-bottom: 16px; color: #10b981; }
    p { font-size: 16px; color: #94a3b8; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">&#10003;</div>
    <h1>Thank You!</h1>
    <p>Your payment has been received or your payment method has been updated successfully. You can close this window.</p>
  </div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  });

  // ============================================================
  // DEV-ONLY: Bridge Status Check
  // ============================================================
  app.get("/api/dev/bridge-status/:merchantId", async (req: Request, res: Response) => {
    // Safety check: Only allow in development
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ 
        error: "This endpoint is not available in production" 
      });
    }

    const { merchantId } = req.params;

    try {
      const merchant = await storage.getMerchant(merchantId);
      if (!merchant) {
        return res.status(404).json({
          status: "error",
          error: "Merchant not found"
        });
      }

      // Decrypt the stored token
      const decryptedKey = decrypt(
        merchant.encryptedToken,
        merchant.iv,
        merchant.tag
      );

      // Test the Stripe connection
      const testStripe = new Stripe(decryptedKey, {
        apiVersion: "2025-12-15.clover",
      });

      const customers = await testStripe.customers.list({ limit: 1 });

      return res.json({
        status: "active",
        merchantId: merchant.id,
        businessName: merchant.businessName || "Unknown",
        customersFound: customers.data.length,
        checkedAt: new Date().toISOString()
      });

    } catch (error: any) {
      console.error(`[DEV] Bridge check failed for ${merchantId}:`, error.message);
      return res.status(500).json({
        status: "broken",
        merchantId,
        error: error.message
      });
    }
  });

  // ============================================================
  // DEV-ONLY: Test Merchant Onboarding
  // ============================================================
  app.post("/api/dev/onboard-test-merchant", async (req: Request, res: Response) => {
    // Safety check: Only allow in development
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ 
        error: "This endpoint is not available in production" 
      });
    }

    const testKey = process.env.TEST_MERCHANT_STRIPE_KEY;
    if (!testKey) {
      return res.status(500).json({ 
        error: "TEST_MERCHANT_STRIPE_KEY is not configured" 
      });
    }

    try {
      // Check if test merchant already exists
      const existing = await storage.getMerchantByStripeUserId("acct_test_merchant_B");
      if (existing) {
        return res.json({
          status: "already_exists",
          merchantId: existing.id,
          message: "Test merchant already onboarded"
        });
      }

      // Encrypt the test key using existing vault
      const { encryptedData, iv, tag } = encrypt(testKey);

      // Create the test merchant record
      const merchant = await storage.createMerchant({
        stripeUserId: "acct_test_merchant_B",
        encryptedToken: encryptedData,
        iv: iv,
        tag: tag,
        businessName: "Found Factory Test Merchant",
      });

      // Verify the bridge by making a simple Stripe call
      const testStripe = new Stripe(testKey, {
        apiVersion: "2025-12-15.clover",
      });

      const customers = await testStripe.customers.list({ limit: 1 });
      
      console.log(`[DEV] Test merchant onboarded: ${merchant.id}`);
      console.log(`[DEV] Stripe bridge verified: ${customers.data.length} customer(s) found`);

      return res.json({
        status: "success",
        merchantId: merchant.id,
        bridgeVerified: true,
        customersFound: customers.data.length
      });

    } catch (error: any) {
      console.error("[DEV] Test merchant onboarding failed:", error.message);
      return res.status(500).json({
        error: "Onboarding failed",
        details: error.message
      });
    }
  });

  // ============================================================
  // DEV-ONLY: Scenario Seeder
  // ============================================================
  app.post("/api/dev/seed-scenarios", async (req: Request, res: Response) => {
    // Safety check: Only allow in development
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ 
        error: "This endpoint is not available in production" 
      });
    }

    try {
      console.log("[DEV] Scenario seeder triggered via API");
      const result = await runSeeder();
      return res.json(result);
    } catch (error: any) {
      console.error("[DEV] Scenario seeder failed:", error.message);
      return res.status(500).json({
        error: "Seeder failed",
        details: error.message
      });
    }
  });

  // Start the Sentinel scheduler
  startScheduler();

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
