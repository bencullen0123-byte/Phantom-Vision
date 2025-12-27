# PHANTOM Revenue Intelligence - Current State

## Project Overview

PHANTOM is a headless revenue intelligence engine that identifies "Ghost Users"—customers who retain active SaaS access despite failed payments—and executes automated recovery operations. The system operates autonomously, scanning for unpaid invoices, orchestrating recovery emails, and tracking successful payment recoveries.

**Core Value Proposition:** Recover lost revenue from failed subscription payments without manual intervention.

---

## Current Tech Stack

| Layer | Technology |
|-------|------------|
| **Language** | TypeScript (ESM modules) |
| **Frontend** | React 18 + Vite |
| **Backend** | Node.js + Express |
| **Database** | PostgreSQL (Drizzle ORM) |
| **UI Components** | shadcn/ui + Radix UI + Tailwind CSS |
| **State Management** | TanStack React Query |
| **Routing** | Wouter (frontend) |
| **Email Service** | Resend |
| **Payment Provider** | Stripe Connect |
| **Scheduler** | node-cron |
| **Encryption** | AES-256-GCM (crypto module) |

---

## Implemented Features

### Stage 1: The Titanium Gate (Security Foundation)
- [x] AES-256-GCM encryption vault with 12-byte IV generation
- [x] Boot-time self-test validation (fails server if encryption broken)
- [x] Master key validation (minimum 32 characters)
- [x] Stripe Connect OAuth flow with CSRF state protection
- [x] Encrypted token storage in database

### Stage 2: The Ghost Hunter (Forensic Audit)
- [x] Scan merchant's Stripe account for unpaid invoices
- [x] Cross-reference with active/past_due subscriptions
- [x] Filter out "Dead Ghosts" (canceled subscriptions)
- [x] UPSERT logic on unique invoiceId (prevents duplicates)
- [x] Backup recovery detection (marks paid invoices during scans)

### Stage 3: The Pulse (Email Orchestration)
- [x] Recovery email templates via Resend
- [x] Oracle timing intelligence (Golden Hour strategy)
- [x] 2-hour buffer around optimal send times
- [x] Email tracking (strikes count, lastEmailedAt)

### Stage 4: The Handshake (Webhook Infrastructure)
- [x] Stripe webhook endpoint with signature verification
- [x] `invoice.paid` event handler
- [x] Mark ghosts as "recovered" on payment
- [x] Update merchant's totalRecoveredCents

### Stage 5: The Sentinel (Autonomous Operation)
- [x] Ghost Hunter cron job (every 12 hours)
- [x] Pulse Engine cron job (every hour)
- [x] 4-hour grace period before first email
- [x] Max 3 strikes then mark "exhausted"
- [x] System logs for health monitoring
- [x] Manual trigger endpoints for testing

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/stripe` | Initiate Stripe OAuth |
| GET | `/api/auth/callback` | Handle OAuth callback |
| GET | `/api/merchants/:id` | Get merchant details |
| GET | `/api/merchants/:id/stats` | Get recovery statistics |
| POST | `/api/ghost-hunter/:merchantId` | Trigger ghost scan |
| POST | `/api/pulse/:merchantId` | Trigger recovery emails |
| POST | `/api/webhooks/stripe` | Stripe webhook receiver |
| GET | `/api/system/health` | View scheduler status |
| POST | `/api/sentinel/ghost-hunter` | Manual Ghost Hunter trigger |
| POST | `/api/sentinel/pulse-engine` | Manual Pulse Engine trigger |

### Database Tables

| Table | Purpose |
|-------|---------|
| `merchants` | Encrypted Stripe tokens, totalRecoveredCents |
| `ghost_targets` | PII, status (pending/recovered/exhausted), invoiceId |
| `liquidity_oracle` | Anonymized timing metadata |
| `system_logs` | Job execution logs for health monitoring |

---

## File Structure Map

```
├── client/                    # React Frontend
│   └── src/
│       ├── components/ui/     # shadcn/ui components (40+ components)
│       ├── hooks/             # Custom hooks (use-toast, use-mobile)
│       ├── lib/               # Utilities (queryClient, utils)
│       ├── pages/             # Route pages (home, not-found)
│       ├── App.tsx            # Main app with routing
│       └── index.css          # Tailwind + theme variables
│
├── server/                    # Express Backend
│   ├── services/              # Core business logic
│   │   ├── ghostHunter.ts     # Invoice scanning + ghost detection
│   │   ├── pulseEngine.ts     # Email orchestration logic
│   │   ├── pulseMailer.ts     # Resend email delivery
│   │   ├── scheduler.ts       # node-cron job management
│   │   └── webhookHandler.ts  # Stripe webhook processing
│   ├── utils/
│   │   └── crypto.ts          # AES-256-GCM encryption vault
│   ├── db.ts                  # Drizzle database connection
│   ├── routes.ts              # API route definitions
│   ├── storage.ts             # Database access layer (IStorage)
│   └── index.ts               # Server entry point
│
├── shared/                    # Shared Types
│   └── schema.ts              # Drizzle schema + Zod validators
│
├── replit.md                  # Project documentation
├── design_guidelines.md       # UI/UX design system
└── ACTIVE_SPEC.md             # Feature specifications (empty)
```

---

## Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Master encryption key (32+ chars) |
| `STRIPE_CLIENT_ID` | Stripe Connect app ID |
| `STRIPE_SECRET_KEY` | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `RESEND_API_KEY` | Email service API key |

---

*Last Updated: December 27, 2025*
