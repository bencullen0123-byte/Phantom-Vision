import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

export function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const headerSecret = req.headers["x-cron-secret"];
  const envSecret = process.env.CRON_SECRET;

  if (!envSecret) {
    console.error("[SECURITY] CRON_SECRET not configured - cron trigger disabled");
    return res.status(503).json({ error: "Cron trigger not configured" });
  }

  if (typeof headerSecret !== "string") {
    console.warn("[SECURITY] Invalid cron secret format");
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Constant-time comparison using SHA-256 to ensure equal buffer lengths
  // Prevents timing side-channel attacks
  const expected = crypto.createHash("sha256").update(envSecret).digest();
  const actual = crypto.createHash("sha256").update(headerSecret).digest();

  if (!crypto.timingSafeEqual(expected, actual)) {
    console.warn("[SECURITY] Invalid cron secret attempt");
    return res.status(401).json({ error: "Unauthorized" });
  }

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
