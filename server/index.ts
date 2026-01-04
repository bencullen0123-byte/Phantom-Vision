import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { startJobWorker } from "./services/ghostHunter";
import { logger } from "./utils/logger";

const app = express();

// Strict routing: prevents case-manipulation bypasses (e.g., /API/health vs /api/health)
app.set("case sensitive routing", true);
app.set("strict routing", true);

const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    merchantId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      merchantId?: string;
      traceId?: string;
    }
  }
}

// Cookie parser for OAuth state validation
app.use(cookieParser());

// =============================================================================
// REQUEST TRACING MIDDLEWARE - Correlation IDs for debugging
// =============================================================================
// Attaches a unique Trace-ID to every request for log correlation.
// The Trace-ID is returned in the X-Trace-Id response header.
// =============================================================================
app.use((req: Request, res: Response, next: NextFunction) => {
  const traceId = uuidv4();
  req.traceId = traceId;
  res.setHeader("X-Trace-Id", traceId);
  
  logger.info("Incoming Request", {
    method: req.method,
    url: req.url,
    traceId,
    userAgent: req.get("user-agent"),
  });
  
  next();
});

// Session configuration with PostgreSQL store
const PgSession = connectPgSimple(session);
const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(
  session({
    store: new PgSession({
      pool: sessionPool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "phantom-dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    name: "phantom.sid",
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const traceId = req.traceId || "unknown";

    logger.error("Unhandled Error", {
      traceId,
      status,
      message,
      error: err.message,
      stack: err.stack,
      method: req.method,
      url: req.url,
    });

    res.status(status).json({ message, traceId });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Start the background job worker for async scan processing
  startJobWorker();

  // Environment validation warnings
  if (!process.env.CRON_SECRET) {
    logger.warn("CRON_SECRET not set - external cron trigger API disabled", { service: "phantom" });
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
