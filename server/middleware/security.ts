import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

export function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers["x-cron-secret"];
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    console.error("[SECURITY] CRON_SECRET not configured - cron trigger disabled");
    return res.status(503).json({ error: "Cron trigger not configured" });
  }

  if (secret !== expectedSecret) {
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
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://*.clerk.accounts.dev",
        "https://*.clerk.com",
        "https://*.stripe.com",
      ],
      fontSrc: ["'self'", "data:"],
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
