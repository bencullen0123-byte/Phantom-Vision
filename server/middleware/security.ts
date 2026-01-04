import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

// Maximum age for cron timestamp (prevents replay attacks)
const MAX_TIMESTAMP_AGE_MS = 60 * 1000; // 60 seconds

export function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const headerSecret = req.headers["x-cron-secret"];
  const headerTimestamp = req.headers["x-cron-timestamp"];
  const envSecret = process.env.CRON_SECRET;

  if (!envSecret) {
    console.error("[SECURITY] CRON_SECRET not configured - cron trigger disabled");
    return res.status(503).json({ error: "Cron trigger not configured" });
  }

  if (typeof headerSecret !== "string") {
    console.warn("[SECURITY] Invalid cron secret format");
    return res.status(401).json({ error: "Unauthorized" });
  }

  // REPLAY ATTACK PROTECTION: Validate timestamp freshness
  if (typeof headerTimestamp !== "string") {
    console.warn("[SECURITY] Missing x-cron-timestamp header");
    return res.status(403).json({ error: "Timestamp required" });
  }

  const timestamp = parseInt(headerTimestamp, 10);
  if (isNaN(timestamp)) {
    console.warn("[SECURITY] Invalid x-cron-timestamp format");
    return res.status(403).json({ error: "Invalid timestamp" });
  }

  const now = Date.now();
  const age = now - timestamp;

  if (age > MAX_TIMESTAMP_AGE_MS) {
    console.warn(`[SECURITY] Stale cron timestamp rejected (age: ${age}ms, max: ${MAX_TIMESTAMP_AGE_MS}ms)`);
    return res.status(403).json({ error: "Timestamp expired" });
  }

  if (age < -MAX_TIMESTAMP_AGE_MS) {
    // Timestamp is in the future (clock skew attack)
    console.warn(`[SECURITY] Future cron timestamp rejected (drift: ${-age}ms)`);
    return res.status(403).json({ error: "Invalid timestamp" });
  }

  // Constant-time comparison using SHA-256 to ensure equal buffer lengths
  // Prevents timing side-channel attacks
  const expected = crypto.createHash("sha256").update(envSecret).digest();
  const actual = crypto.createHash("sha256").update(headerSecret).digest();

  if (!crypto.timingSafeEqual(expected, actual)) {
    console.warn("[SECURITY] Invalid cron secret attempt");
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log(`[SECURITY] Cron request authenticated (timestamp age: ${age}ms)`);
  next();
}

export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://*.clerk.accounts.dev",
        "https://*.clerk.com",
        "https://js.stripe.com",
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://*.clerk.accounts.dev",
        "https://*.clerk.com",
        "https://fonts.googleapis.com",
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.clerk.accounts.dev",
        "https://*.clerk.com",
        "https://*.stripe.com",
      ],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      connectSrc: [
        "'self'",
        "https://*.clerk.accounts.dev",
        "https://*.clerk.com",
        "https://api.stripe.com",
        "https://*.replit.dev",
        "wss://*.replit.dev",
      ],
      frameSrc: [
        "'self'",
        "https://*.clerk.accounts.dev",
        "https://*.clerk.com",
        "https://js.stripe.com",
      ],
      workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
});

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests. Please try again later.",
  },
});

export const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Ghost Hunter is cooling down. Please try again in an hour.",
  },
});
