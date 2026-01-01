# PHANTOM Revenue Intelligence

## Overview

PHANTOM is a revenue intelligence platform designed to identify "Ghost Users"—customers who retain active SaaS access despite failed payments—and execute recovery operations. The application is a fully autonomous, headless backend capable of handling merchant identities, encryption, ghost detection, recovery email orchestration, and payment tracking.

The project follows a staged development approach:
- **Stage 1:** Foundation & Security (complete) - OAuth, encryption vault, secure data storage
- **Stage 2:** Ghost Hunter (complete) - Historical audit & forensic data extraction
- **Stage 3:** The Pulse (complete) - Recovery email orchestration via Resend with Oracle timing
- **Stage 4:** The Handshake (complete) - Webhook infrastructure tracking successful recoveries
- **Stage 5:** The Sentinel (complete) - Autonomous operation with scheduled jobs and health monitoring

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework:** React with TypeScript
- **Build Tool:** Vite with custom configuration
- **Routing:** Wouter (lightweight React router)
- **State Management:** TanStack React Query for server state
- **UI Components:** shadcn/ui component library built on Radix UI primitives
- **Styling:** Tailwind CSS with CSS variables for theming (Fluent Design System approach)
- **Design Philosophy:** Enterprise security-first, minimal UI in Stage 1, Inter font family

### Backend Architecture
- **Runtime:** Node.js with Express
- **Language:** TypeScript (ESM modules)
- **API Pattern:** RESTful routes with JSON responses
- **Development:** tsx for TypeScript execution, Vite middleware for HMR
- **Production Build:** esbuild bundles server, Vite builds client

### Security Vault
- **Algorithm:** AES-256-GCM authenticated encryption
- **IV Generation:** 12-byte (96-bit) random IV per encryption operation
- **Key Management:** Master secret via `ENCRYPTION_KEY` environment variable (minimum 32 characters)
- **Self-Test:** Mandatory encrypt/decrypt validation on server boot; fails with `process.exit(1)` if mismatch

### Data Storage
- **Database:** PostgreSQL via Drizzle ORM
- **Schema Location:** `shared/schema.ts`
- **Tables:**
  - `merchants` - Encrypted Stripe access tokens with IV, auth tag, totalRecoveredCents, and multi-currency support (defaultCurrency, impendingLeakageCents, totalProtectedCents, grossInvoicedCents, lastAuditAt)
  - `ghost_targets` - Transient PII (email, amount), status (pending/impending/recovered/exhausted), 90-day purge timestamp, unique invoiceId, stripeCustomerId for portal redirects
  - `liquidity_oracle` - Anonymized metadata (business category, timing data)
  - `system_logs` - Heartbeat job monitoring (job name, status, details, error messages)

### Universal Revenue Intelligence (ML Metadata)
- **Non-PII Fields** (queryable for cross-merchant learning):
  - `cardBrand` - Card network (visa, mastercard, amex, etc.) - normalized to lowercase
  - `cardFunding` - Card type (credit, debit, prepaid) - normalized to lowercase
  - `countryCode` - Customer/issuer ISO country code - normalized to lowercase
  - `requires3ds` - Whether 3D Secure was required (technical vs financial failure)
  - `stripeErrorCode` - Raw Stripe decline/error code for ML features
  - `originalInvoiceDate` - Temporal anchor for recovery velocity analysis
- **Extraction Flow** (Sprint 2.1):
  - Ghost Hunter expands `payment_intent.payment_method` from Stripe
  - Extracts card brand, funding type, country from `pm.card` object
  - Detects 3DS requirement from `requires_action` status or `authentication_required` error
  - All string values normalized to lowercase for consistent ML training
  - Fields updated on both INSERT (new ghosts) and UPDATE (re-scanned ghosts)
- **Real-Time Sentinel Webhooks** (Sprint 2.2):
  - `invoice.payment_failed` handler creates ghosts instantly instead of waiting for batch scans
  - Merchant lookup via connected account ID from Stripe Connect
  - ML metadata extraction with lowercase normalization for real-time forensic capture
  - Atomic ledger updates: grossInvoicedCents, allTimeLeakedCents, lastAuditAt
  - Intelligent decline branching: soft vs hard decline categorization for recovery strategy

### Multi-Currency Revenue Firewall
- **Currency Detection:** Automatically captures currency from first Stripe invoice during scan
- **Storage Fields:**
  - `default_currency` - Merchant's detected currency (e.g., 'usd', 'eur', 'gbp')
  - `impending_leakage_cents` - Revenue at risk from expiring cards (proactive protection)
  - `total_protected_cents` - Revenue saved by proactive outreach

### Authentication Flow
- **OAuth Provider:** Stripe Connect
- **Routes:**
  - `/api/auth/stripe` - Redirects to Stripe authorization
  - `/api/auth/callback` - Exchanges code for token, encrypts, stores in database
- **Required Secrets:** `STRIPE_CLIENT_ID`, `STRIPE_SECRET_KEY`

### Project Structure
```
client/          # React frontend
  src/
    components/  # UI components (shadcn/ui)
    pages/       # Route components
    hooks/       # Custom React hooks
    lib/         # Utilities and query client
server/          # Express backend
  utils/         # Crypto vault and helpers
  routes.ts      # API route definitions
  storage.ts     # Database access layer
shared/          # Shared types and schema
  schema.ts      # Drizzle database schema
```

## External Dependencies

### Third-Party Services
- **Stripe Connect:** OAuth-based merchant authorization for accessing payment data
- **PostgreSQL:** Relational database (Replit Managed Postgres recommended)

### Key NPM Packages
- **Database:** `drizzle-orm`, `pg`, `drizzle-zod` for type-safe queries
- **API:** `express`, `stripe` SDK
- **Frontend:** `react`, `@tanstack/react-query`, `wouter`
- **UI:** `@radix-ui/*` primitives, `tailwindcss`, `class-variance-authority`
- **Build:** `vite`, `esbuild`, `tsx`

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `ENCRYPTION_KEY` - Master encryption key (32+ characters)
- `STRIPE_CLIENT_ID` - Stripe Connect application ID
- `STRIPE_SECRET_KEY` - Stripe API secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret for payment confirmation

### The Outreach Pipe (Email & Tracking)
- **Email Service:** `server/services/pulseMailer.ts` with Resend SDK integration
- **Templates:**
  - Recovery (pending): Failed payment notification with invoice link
  - Protection (impending): Expiring card warning with portal link
- **Branding:** Uses merchant's `businessName` for "From" and `supportEmail` for "Reply-To"
- **Attribution Tracking:** `/api/l/:targetId` route sets `attribution_expires_at` (24h window) in database, logs clicks, redirects to Stripe
- **Dry-Run Mode:** Logs full HTML to console when Resend is not connected

### The Handshake (Webhook Infrastructure)
- **Endpoint:** `/api/webhooks/stripe` with signature verification via `STRIPE_WEBHOOK_SECRET`
- **Handler:** `server/services/webhookHandler.ts`
- **Events Processed:**
  - `invoice.paid` - Marks ghost as "recovered", increments `totalRecoveredCents`
  - `customer.subscription.updated` - Marks impending ghost as "protected", increments `totalProtectedCents`
- **Attribution Logic:**
  - Compares `current_time` against `attribution_expires_at` timestamp
  - If within 24h window → "direct" (PHANTOM-attributed recovery)
  - If outside window or null → "organic" (independent payment)
- **Victory Logging:** Writes structured JSON to `system_logs`:
  ```json
  { "type": "recovery"|"protection", "direct": boolean, "amount": number, "currency": string }
  ```

### Ghost Target Status Flow
- **pending** → Failed payment detected, awaiting recovery emails
- **impending** → Expiring card detected, awaiting protection emails  
- **recovered** → Payment received (via webhook)
- **protected** → Card updated proactively (via webhook)
- **exhausted** → Max 3 emails sent without success, no further outreach

### The Sentinel (Autonomous Scheduler)
- **Ghost Hunter:** Runs every 12 hours at minute 0
- **Pulse Engine:** Runs every hour at minute 0, processes both pending and impending targets
- **Defensive Rules:**
  - 4-hour grace period before emailing new targets
  - 7-day cooldown between emails to same target
  - Max 3 emails per ghost (then marked as "exhausted")
- **Health Endpoints:**
  - `GET /api/system/health` - View scheduler status and logs
  - `POST /api/sentinel/ghost-hunter` - Manual trigger
  - `POST /api/sentinel/pulse-engine` - Manual trigger

### Diagnostic Shell (Performance Validation)
- **Pre-Flight Vault Check:** Encrypts/decrypts "PHANTOM_INTEGRITY_TEST" before Stripe API calls
- **Throttling Strategy:** 200ms delay every 50 records (vs 100ms per call)
- **Rate Limit Detection:** Checks statusCode 429, StripeRateLimitError type, rate_limit code
- **Telemetry Heartbeat:** Logs every 50 records - index, RSS memory, encrypt timing, avg UPSERT latency
- **Final Summary:** Writes to system_logs with total records, duration, peak RSS, avg UPSERT latency

### Frontend Pages
- **DashboardPage** (`/`) - Landing and connection status (container component)
- **SystemPage** (`/system`) - Financial Command Center with CFO KPIs
- **RecoveriesPage** (`/recoveries`) - Ghost target management
- **GrowthPage** (`/growth`) - Analytics and trends
- **SettingsPage** (`/settings`) - Merchant configuration

### Modular Dashboard Components
- **MoneyHero** (`client/src/components/MoneyHero.tsx`) - Hero section with revenue metrics, leakage rate health status, and Auto-Pilot toggle
  - Consumes `stats.grossInvoicedCents` for health calculation
  - Health Status: Green (<5%), Amber (5-10%), Critical Red (>10%)
- **ForensicCharts** (`client/src/components/ForensicCharts.tsx`) - Chart wrapper for MonthlyTrendChart and DailyPulseChart
  - Passes `stats.monthlyTrend` and `stats.dailyPulse` to Recharts components
- **LeakageDonut** (`client/src/components/charts/LeakageDonut.tsx`) - Donut chart for leakage category distribution
  - Accepts optional `data` prop for injected data, falls back to internal fetch
  - DashboardPage passes `stats.leakageDistribution` directly

### Financial Command Center (SystemPage)
- **CFO Headline KPIs:**
  - Revenue Guarded (Protected + Recovered)
  - Shadow Leakage (all-time leaked revenue)
  - Impending Risk (expiring cards detected)
  - Integrity Score (Guarded / Total Exposure %)
- **Intelligence Log Feed:** Real-time system logs with 10s auto-refresh
- **Pulse-Verified Badge:** Emerald glow indicator for direct PHANTOM-attributed recoveries
- **Social Sharing:**
  - Share button on individual Pulse-Verified log entries
  - "Share Integrity Report" button generates social media post with revenue metrics
  - `generateSuccessPost()` - Formats individual recovery wins
  - `generateIntegritySharePost()` - Formats overall integrity report
  - Clipboard copy with toast confirmation