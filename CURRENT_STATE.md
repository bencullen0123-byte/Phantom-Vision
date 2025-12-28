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

### Stage 1: The Titanium Gate (Security Foundation) ✅ HARDENED
- [x] AES-256-GCM encryption vault with 12-byte IV generation
- [x] Boot-time self-test validation (fails server if encryption broken)
- [x] Master key validation (minimum 32 characters)
- [x] Stripe Connect OAuth flow with CSRF state protection
- [x] Encrypted token storage in database
- [x] **Identity Encryption Wrapper** (email + customerName encrypted at rest)
- [x] **Titanium Error Handling** (decryption failures return placeholder, not crash)

### Stage 2: The Ghost Hunter (Forensic Audit) ✅ HARDENED
- [x] Scan merchant's Stripe account for unpaid invoices
- [x] Cross-reference with active/past_due subscriptions
- [x] Filter out "Dead Ghosts" (canceled subscriptions)
- [x] UPSERT logic on unique invoiceId (prevents duplicates)
- [x] Backup recovery detection (marks paid invoices during scans)
- [x] **Recursive All-Time Pagination** (Deep Harvest mode - no invoice limit)
- [x] **Shadow Revenue Calculator** (allTimeLeakedCents, totalGhostCount, lastAuditAt)
- [x] **Customer Name Extraction** (from Stripe invoice with fallback chain)

### Stage 3: The Pulse (Email Orchestration) ✅ HARDENED
- [x] Recovery email templates via Resend
- [x] Oracle timing intelligence (Golden Hour strategy)
- [x] 2-hour buffer around optimal send times
- [x] Email tracking (strikes count, lastEmailedAt)
- [x] **Personalized Greeting** (Hi [Name] using decrypted customerName)
- [x] **PII-Safe Logging** (no plaintext email/name in logs - only anonymized identifiers)
- [x] **Transient Decryption** (PII decrypted on-demand, no persistent caching)

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
- [x] **Atomic Job Locking** (database-level mutex preventing overlapping job executions)

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
| `merchants` | Encrypted Stripe tokens, totalRecoveredCents, Shadow Revenue Intelligence |
| `ghost_targets` | Encrypted PII (email, customerName), status (pending/recovered/exhausted), invoiceId |
| `liquidity_oracle` | Anonymized timing metadata |
| `system_logs` | Job execution logs for health monitoring |
| `cron_locks` | Atomic job locking to prevent overlapping cron executions |

#### Revenue Intelligence Columns (merchants table)

| Column | Type | Description |
|--------|------|-------------|
| `allTimeLeakedCents` | `bigint` | All-time revenue at risk from detected ghosts |
| `totalGhostCount` | `integer` | Total number of ghosts detected in last scan |
| `lastAuditAt` | `timestamp` | Timestamp of last successful Ghost Hunter scan |
| `totalRecoveredCents` | `bigint` | Cumulative recovered revenue from ghost payments |

**Shadow Revenue Calculation:**
- Running tallies computed during Deep Harvest scan
- Only counts `open` or `uncollectible` invoices (void strictly excluded)
- Only counts invoices belonging to customers with active/past_due subscriptions
- Atomic transaction updates all three fields simultaneously on scan completion
- Updates only occur on successful scan (no partial scans persisted)

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

## Technical Manifest

### 1. Data Flow & Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           PHANTOM DATA PIPELINE                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   STRIPE     │───▶│   GHOST      │───▶│   PULSE      │───▶│   RESEND     │      │
│  │   CONNECT    │    │   HUNTER     │    │   ENGINE     │    │   MAILER     │      │
│  │   (OAuth)    │    │   (Scan)     │    │   (Timing)   │    │   (Deliver)  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │                   │              │
│         ▼                   ▼                   ▼                   ▼              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  merchants   │    │ghost_targets │    │liquidity_    │    │   WEBHOOK    │      │
│  │  (tokens)    │    │  (ghosts)    │    │oracle        │    │   HANDLER    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                      │              │
│                                          ┌───────────────────────────┘              │
│                                          ▼                                          │
│                                   ┌──────────────┐                                  │
│                                   │   RECOVERY   │                                  │
│                                   │   CONFIRMED  │                                  │
│                                   └──────────────┘                                  │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Invoice-to-Ghost Promotion Criteria

An invoice is promoted from raw Stripe record to `ghost_targets` entry when ALL of the following are true:

| Criterion | Implementation | Location |
|-----------|----------------|----------|
| **Invoice Status** | `status === "open"` OR `status === "uncollectible"` | `ghostHunter.ts:135` |
| **Has Customer ID** | `invoice.customer` is not null/undefined | `ghostHunter.ts:136-138` |
| **Active Subscription** | Customer has subscription with `status === "active"` OR `status === "past_due"` | `ghostHunter.ts:68-69` |

**Dead Ghost Filter:** Invoices from customers with ONLY canceled subscriptions are ignored (not inserted).

---

### 2. Logical Constraints & Hard-Codes

#### Rate Limiting & Pagination (`ghostHunter.ts`)

| Constant | Value | Purpose |
|----------|-------|---------|
| `RATE_LIMIT_DELAY_MS` | `100` ms | Delay between Stripe API calls |
| `MAX_RETRIES` | `3` | Retry attempts on 429 rate limit |
| `INITIAL_BACKOFF_MS` | `1000` ms | Initial exponential backoff |
| `limit` (per API call) | `100` | Invoices fetched per Stripe API request (maximum allowed) |
| `subscriptions.limit` | `10` | Subscriptions checked per customer |

**Pagination Mode: RECURSIVE (Deep Harvest)**
- No invoice limit - scans ALL invoices in merchant's Stripe history
- Uses `starting_after` cursor for pagination
- Processes each batch of 100 invoices in-loop (memory-safe)
- Batches discarded after database UPSERT completes
- Continues while `has_more: true` from Stripe API

#### Defensive Rules (`pulseEngine.ts` + `storage.ts`)

| Rule | Value | Implementation |
|------|-------|----------------|
| **Grace Period** | `4 hours` | Ghost must exist >4h before first email (`storage.ts:172`) |
| **Max Strikes** | `3` emails | Ghost marked "exhausted" after 3 emails (`pulseEngine.ts:153`) |
| **Oracle Buffer** | `±2 hours` | Emails sent within 2h of Golden Hour (`pulseEngine.ts:32-33`) |
| **PII Retention** | `90 days` | `purgeAt` set to discoveredAt + 90 days (`ghostHunter.ts:149-150`) |

#### Scheduler Intervals (`scheduler.ts`)

| Job | Cron Expression | Frequency |
|-----|-----------------|-----------|
| Ghost Hunter | `0 */12 * * *` | Every 12 hours at minute 0 |
| Pulse Engine | `0 * * * *` | Every hour at minute 0 |

#### Atomic Job Locking (`storage.ts` + `scheduler.ts`)

The Sentinel implements industrial-grade database-level locking to prevent overlapping job executions:

| Mechanism | Implementation | Location |
|-----------|----------------|----------|
| **Lock Table** | `cron_locks` (jobName PK, holderId, createdAt) | `schema.ts:94-99` |
| **Lock TTL** | `60` minutes | `scheduler.ts:6` |
| **Acquire Strategy** | Atomic UPSERT with TTL-based lock stealing | `storage.ts:327-358` |
| **Release Strategy** | Identity-safe deletion (requires holderId match) | `storage.ts:360-372` |

**Lock Acquisition Flow:**
1. Generate unique `holderId` (UUID) for this process instance
2. Attempt atomic `INSERT...ON CONFLICT DO UPDATE` with TTL check
3. If existing lock is older than TTL (60 min), steal lock (considered stale/zombie)
4. If existing lock is healthy (within TTL), return `null` (lock denied)
5. On successful acquisition, return `{ holderId, wasStolen }` tuple

**Lock Release Flow:**
1. Delete lock only if BOTH `jobName` AND `holderId` match
2. This prevents zombie processes from corrupting locks they no longer own
3. If lock was stolen by another process, release fails gracefully (no action needed)

**Race Condition Prevention:**
- Atomic UPSERT eliminates "check-then-set" race condition
- Database-level constraint ensures only one process holds lock at any time
- TTL-based stealing recovers from crashed/stuck processes automatically

#### Stripe API Version

| Setting | Value | Location |
|---------|-------|----------|
| `apiVersion` | `"2025-12-15.clover"` | `ghostHunter.ts:48` |

---

### 3. Security & Encryption Perimeter

#### Identity Encryption Wrapper (crypto.ts)

All PII is encrypted at rest using AES-256-GCM before database storage. The storage layer transparently encrypts on write and decrypts on read.

#### Fields Processed Through `crypto.ts`

| Table | Field | Encryption Status |
|-------|-------|-------------------|
| `merchants` | `encryptedToken` | **CIPHERTEXT** (AES-256-GCM) |
| `merchants` | `iv` | Hex-encoded IV (12 bytes) |
| `merchants` | `tag` | Hex-encoded auth tag (16 bytes) |
| `ghost_targets` | `emailCiphertext` | **CIPHERTEXT** (AES-256-GCM) |
| `ghost_targets` | `emailIv` | Hex-encoded IV (12 bytes) |
| `ghost_targets` | `emailTag` | Hex-encoded auth tag (16 bytes) |
| `ghost_targets` | `customerNameCiphertext` | **CIPHERTEXT** (AES-256-GCM) |
| `ghost_targets` | `customerNameIv` | Hex-encoded IV (12 bytes) |
| `ghost_targets` | `customerNameTag` | Hex-encoded auth tag (16 bytes) |

#### PII Storage Analysis (`ghost_targets`)

| Field | Data Type | Storage Format | Encryption |
|-------|-----------|----------------|------------|
| `email` | `text` (triplet) | **CIPHERTEXT** | AES-256-GCM |
| `customerName` | `text` (triplet) | **CIPHERTEXT** | AES-256-GCM |
| `amount` | `integer` | **PLAINTEXT** | None (not PII) |
| `invoiceId` | `text` | **PLAINTEXT** | None (Stripe reference) |

**Security Model: Encrypted at Rest with Transient Decryption-on-Demand**
- All PII (email, customerName) encrypted before database insertion
- Each encryption operation generates new 12-byte random IV (forward secrecy)
- Titanium error handling: decryption failures return `ENCRYPTION_ERROR` placeholder instead of crashing
- Storage layer encapsulates encryption (callers pass plaintext, storage encrypts/decrypts)
- **Transient Decryption:** PII decrypted only when needed, never cached in memory or logs
- **PII-Safe Logging:** All console.log statements use anonymized identifiers (merchantId, ghostId) - never plaintext PII
- 90-day auto-purge (`purgeAt`) provides additional data minimization

#### Customer Name Extraction (`ghostHunter.ts`)

Customer name extracted from Stripe with fallback chain:
1. `invoice.customer_name` (primary source)
2. `invoice.customer.name` (if customer expanded)
3. `invoice.customer_email` (fallback)
4. `"Unknown Customer"` (default)

#### Encryption Specifications (`crypto.ts`)

| Parameter | Value |
|-----------|-------|
| Algorithm | `aes-256-gcm` |
| IV Length | `12` bytes (96 bits) - NIST recommended |
| Key Derivation | First 32 bytes of `ENCRYPTION_KEY` |
| Auth Tag | 16 bytes (128 bits) |
| Encoding | Hex for ciphertext, IV, and tag |

---

### 4. Service Interface Audit

#### `IStorage` Interface (`storage.ts:13-47`)

```typescript
interface IStorage {
  // === Merchants ===
  getMerchant(id: string): Promise<Merchant | undefined>
  getMerchantByStripeUserId(stripeUserId: string): Promise<Merchant | undefined>
  createMerchant(merchant: InsertMerchant): Promise<Merchant>
  getAllMerchants(): Promise<Merchant[]>
  updateMerchant(id: string, updates: Partial<InsertMerchant>): Promise<Merchant | undefined>
  incrementMerchantRecovery(id: string, amountCents: number): Promise<Merchant | undefined>
  getMerchantStats(merchantId: string): Promise<MerchantStats>
  
  // === Ghost Targets ===
  getGhostTarget(id: string): Promise<GhostTarget | undefined>
  getGhostTargetsByMerchant(merchantId: string): Promise<GhostTarget[]>
  createGhostTarget(target: InsertGhostTarget): Promise<GhostTarget>
  upsertGhostTarget(target: InsertGhostTarget): Promise<GhostTarget>
  countGhostsByMerchant(merchantId: string): Promise<number>
  getGhostByInvoiceId(invoiceId: string): Promise<GhostTarget | undefined>
  getUnprocessedGhosts(): Promise<GhostTarget[]>
  getEligibleGhostsForEmail(): Promise<GhostTarget[]>
  updateGhostEmailStatus(id: string): Promise<GhostTarget | undefined>
  markGhostRecovered(id: string): Promise<GhostTarget | undefined>
  markGhostExhausted(id: string): Promise<GhostTarget | undefined>
  countRecoveredGhostsByMerchant(merchantId: string): Promise<number>
  countActiveGhostsByMerchant(merchantId: string): Promise<number>
  
  // === Liquidity Oracle ===
  getLiquidityOracleEntry(id: string): Promise<LiquidityOracle | undefined>
  createLiquidityOracleEntry(entry: InsertLiquidityOracle): Promise<LiquidityOracle>
  countOracleEntriesByMerchant(merchantId: string): Promise<number>
  getGoldenHour(merchantId: string): Promise<GoldenHour | null>
  
  // === System Logs ===
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>
  getRecentSystemLogs(limit: number): Promise<SystemLog[]>
  
  // === Cron Locks ===
  acquireJobLock(jobName: string, ttlMinutes: number): Promise<LockResult | null>
  releaseJobLock(jobName: string, holderId: string): Promise<boolean>
}
```

#### Ghost Hunter Service (`ghostHunter.ts`)

| Export | Signature | I/O |
|--------|-----------|-----|
| `scanMerchant` | `(merchantId: string) => Promise<ScanResult>` | **In:** Merchant UUID<br>**Out:** `{ merchantId, ghostsFound[], oracleDataPoints, totalRevenueAtRisk, errors[] }` |
| `runAuditForMerchant` | `(merchantId: string) => Promise<AuditResult>` | **In:** Merchant UUID<br>**Out:** `{ total_ghosts_found, total_revenue_at_risk, oracle_data_points, errors[] }` |

#### Pulse Engine Service (`pulseEngine.ts`)

| Export | Signature | I/O |
|--------|-----------|-----|
| `processQueue` | `() => Promise<ProcessQueueResult>` | **In:** None (reads from DB)<br>**Out:** `{ emailsSent, emailsFailed, ghostsProcessed, nextGoldenHour, errors[] }` |

#### Pulse Mailer Service (`pulseMailer.ts`)

| Export | Signature | I/O |
|--------|-----------|-----|
| `sendRecoveryEmail` | `(to: string, amount: number, invoiceUrl: string, merchant: Merchant) => Promise<SendRecoveryEmailResult>` | **In:** Email, cents, URL, merchant config<br>**Out:** `{ success, messageId?, error? }` |

#### Webhook Handler Service (`webhookHandler.ts`)

| Export | Signature | I/O |
|--------|-----------|-----|
| `handleInvoicePaid` | `(invoice: Stripe.Invoice) => Promise<WebhookResult>` | **In:** Stripe Invoice object<br>**Out:** `{ success, message, ghostRecovered?, amountRecovered? }` |
| `handleWebhookEvent` | `(event: Stripe.Event) => Promise<WebhookResult>` | **In:** Stripe Event object<br>**Out:** Same as above |

#### Scheduler Service (`scheduler.ts`)

| Export | Signature | I/O |
|--------|-----------|-----|
| `startScheduler` | `() => void` | **In:** None<br>**Out:** Starts cron jobs (side effect) |
| `getSystemHealth` | `() => Promise<SystemHealth>` | **In:** None<br>**Out:** `{ recentLogs[], lastGhostHunterRun, lastPulseEngineRun }` |
| `runGhostHunterJob` | `() => Promise<void>` | **In:** None<br>**Out:** Logs to `system_logs` (side effect) |
| `runPulseEngineJob` | `() => Promise<void>` | **In:** None<br>**Out:** Logs to `system_logs` (side effect) |

---

### 5. Database Entity Relationship Diagram (ERD)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                 DATABASE SCHEMA                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────┐          ┌─────────────────────────────┐           │
│  │        merchants            │          │      ghost_targets          │           │
│  ├─────────────────────────────┤          ├─────────────────────────────┤           │
│  │ PK id (varchar/UUID)        │◀────────┐│ PK id (varchar/UUID)        │           │
│  │    stripeUserId (text)      │         ││ FK merchantId (varchar)     │───────────┤
│  │    encryptedToken (text)    │         │└─────────────────────────────┤           │
│  │    iv (text)                │         │     email (text)             │           │
│  │    tag (text)               │         │     amount (integer)         │           │
│  │    customEmailTemplate      │         │ UQ invoiceId (text)          │           │
│  │    recoveryStrategy (text)  │         │     discoveredAt (timestamp) │           │
│  │    businessName (text)      │         │     purgeAt (timestamp)      │           │
│  │    supportEmail (text)      │         │     lastEmailedAt (timestamp)│           │
│  │    totalRecoveredCents      │         │     emailCount (integer)     │           │
│  └─────────────────────────────┘         │     status (text)            │           │
│              │                           │     recoveredAt (timestamp)  │           │
│              │                           └─────────────────────────────┘            │
│              │                                                                       │
│              │                           ┌─────────────────────────────┐            │
│              │                           │    liquidity_oracle         │            │
│              │                           ├─────────────────────────────┤            │
│              └──────────────────────────▶│ PK id (varchar/UUID)        │            │
│                                          │ FK merchantId (varchar)     │            │
│                                          │    businessCategory (text)  │            │
│                                          │    dayOfWeek (integer)      │            │
│                                          │    hourOfDay (integer)      │            │
│                                          │    recordedAt (timestamp)   │            │
│                                          └─────────────────────────────┘            │
│                                                                                      │
│  ┌─────────────────────────────┐                                                    │
│  │       system_logs           │  (No FK - standalone monitoring)                   │
│  ├─────────────────────────────┤                                                    │
│  │ PK id (varchar/UUID)        │                                                    │
│  │    jobName (text)           │                                                    │
│  │    status (text)            │                                                    │
│  │    details (text)           │                                                    │
│  │    errorMessage (text)      │                                                    │
│  │    runAt (timestamp)        │                                                    │
│  └─────────────────────────────┘                                                    │
│                                                                                      │
│  ┌─────────────────────────────┐                                                    │
│  │       cron_locks            │  (No FK - mutex for job execution)                 │
│  ├─────────────────────────────┤                                                    │
│  │ PK jobName (text)           │                                                    │
│  │    holderId (text)          │                                                    │
│  │    createdAt (timestamp)    │                                                    │
│  └─────────────────────────────┘                                                    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Key Relationships

| Relationship | Cardinality | Foreign Key | Constraint |
|--------------|-------------|-------------|------------|
| `merchants` → `ghost_targets` | One-to-Many | `ghost_targets.merchantId` | References `merchants.id` |
| `merchants` → `liquidity_oracle` | One-to-Many | `liquidity_oracle.merchantId` | References `merchants.id` |

#### Multi-Tenancy Strategy

| Aspect | Implementation |
|--------|----------------|
| **Primary Key Type** | Internal UUID (`gen_random_uuid()`) |
| **Tenant Identifier** | `merchants.id` (UUID) |
| **Stripe Lookup** | `merchants.stripeUserId` (Stripe account ID) |
| **Data Isolation** | All queries filter by `merchantId` FK |

**Note:** The system uses internal auto-generated UUIDs for primary keys, NOT Stripe's `account_id`. The `stripeUserId` is stored separately for OAuth lookup but is not the primary connector for relationships.

#### Unique Constraints

| Table | Column | Purpose |
|-------|--------|---------|
| `merchants` | `stripeUserId` | Prevent duplicate OAuth connections |
| `ghost_targets` | `invoiceId` | Enable UPSERT, prevent duplicate tracking |

---

*Last Updated: December 28, 2025*
