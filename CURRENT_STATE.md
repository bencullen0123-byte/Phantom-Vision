# PHANTOM Revenue Intelligence - Technical Manifest

## Document Purpose
Authoritative reference for the as-built state of the PHANTOM codebase. Zero aspirational content. All documentation reflects implemented logic only.

---

## 1. Forensic Data Schema (PostgreSQL)

### Table: `merchants`
Primary identity table for connected Stripe accounts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | Internal merchant identifier |
| `stripe_user_id` | text | NOT NULL, UNIQUE | Stripe Connect account ID |
| `encrypted_token` | text | NOT NULL | AES-256-GCM encrypted access token (hex) |
| `iv` | text | NOT NULL | 12-byte initialization vector (hex) |
| `tag` | text | NOT NULL | Authentication tag (hex) |
| `custom_email_template` | text | nullable | Optional custom recovery email HTML |
| `recovery_strategy` | text | NOT NULL, DEFAULT 'oracle' | Strategy: 'oracle', 'aggressive', 'passive' |
| `business_name` | text | nullable | Display name for emails |
| `support_email` | text | nullable | Reply-to address |
| `total_recovered_cents` | bigint | NOT NULL, DEFAULT 0 | Cumulative recovered revenue |
| `all_time_leaked_cents` | bigint | NOT NULL, DEFAULT 0 | Total identified leakage |
| `total_ghost_count` | integer | NOT NULL, DEFAULT 0 | Count of all ghost targets |
| `last_audit_at` | timestamp | nullable | Timestamp of most recent Deep Harvest |
| `tier_limit` | integer | NOT NULL, DEFAULT 50 | Max pending ghosts per subscription tier |

### Table: `ghost_targets`
Transient PII storage for recovery orchestration. All customer data encrypted at rest.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | Ghost identifier / Strike ID |
| `merchant_id` | varchar | NOT NULL, REFERENCES merchants(id) | Parent merchant |
| `email_ciphertext` | text | NOT NULL | AES-256-GCM encrypted email |
| `email_iv` | text | NOT NULL | Email encryption IV (hex) |
| `email_tag` | text | NOT NULL | Email authentication tag (hex) |
| `customer_name_ciphertext` | text | NOT NULL | AES-256-GCM encrypted name |
| `customer_name_iv` | text | NOT NULL | Name encryption IV (hex) |
| `customer_name_tag` | text | NOT NULL | Name authentication tag (hex) |
| `amount` | integer | NOT NULL | Invoice amount in cents |
| `invoice_id` | text | NOT NULL, UNIQUE | Stripe invoice ID |
| `discovered_at` | timestamp | NOT NULL, DEFAULT NOW() | When ghost was identified |
| `purge_at` | timestamp | NOT NULL | 90-day auto-deletion timestamp |
| `last_emailed_at` | timestamp | nullable | Most recent email dispatch |
| `email_count` | integer | NOT NULL, DEFAULT 0 | Total emails sent (max 3) |
| `status` | text | NOT NULL, DEFAULT 'pending' | Status enum: pending, recovered, exhausted |
| `recovered_at` | timestamp | nullable | Payment confirmation timestamp |
| `attribution_expires_at` | timestamp | nullable | 24h attribution window expiry |
| `recovery_type` | text | nullable | 'direct' or 'organic' (set on recovery) |
| `failure_reason` | text | nullable | Raw Stripe decline code |
| `decline_type` | text | nullable | Classified: 'expired_card', 'insufficient_funds', etc. |

**Foreign Key Relationship:**
- `ghost_targets.merchant_id` -> `merchants.id`

### Table: `system_logs`
Global job execution logging for health monitoring.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | Log entry ID |
| `job_name` | text | NOT NULL | Job identifier: 'ghost_hunter', 'pulse_engine' |
| `status` | text | NOT NULL | Execution status: 'success', 'failed', 'partial' |
| `details` | text | nullable | Human-readable execution summary |
| `error_message` | text | nullable | Error details if failed |
| `run_at` | timestamp | NOT NULL, DEFAULT NOW() | Execution timestamp |

### Table: `liquidity_oracle`
Anonymized payment timing metadata for Golden Hour prediction.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | varchar | PRIMARY KEY, DEFAULT gen_random_uuid() | Entry ID |
| `merchant_id` | varchar | NOT NULL, REFERENCES merchants(id) | Parent merchant |
| `business_category` | text | NOT NULL | Merchant category code |
| `day_of_week` | integer | NOT NULL | 0-6 (Sunday-Saturday) |
| `hour_of_day` | integer | NOT NULL | 0-23 |
| `recorded_at` | timestamp | NOT NULL, DEFAULT NOW() | When payment occurred |

### Table: `cron_locks`
Atomic job locking for Sentinel scheduler.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `job_name` | text | PRIMARY KEY | Job identifier |
| `holder_id` | text | NOT NULL | UUID of lock holder |
| `created_at` | timestamp | NOT NULL, DEFAULT NOW() | Lock acquisition time |

### Recovery Type Calculation
The `recovery_type` field is determined by the webhook handler at payment confirmation:
1. On link click (`/api/l/:strikeId`): Sets `attribution_expires_at` to NOW() + 24 hours
2. On payment webhook (`invoice.paid`): Checks if `attribution_expires_at > NOW()`
   - If true: `recovery_type = 'direct'` (PHANTOM-attributed)
   - If false/null: `recovery_type = 'organic'` (independent payment)

---

## 2. Security & Identity Infrastructure

### Session Middleware: `requireMerchant`
Location: `server/middleware/auth.ts`

```typescript
function requireMerchant(req, res, next) {
  const merchantId = req.session?.merchantId;
  if (!merchantId) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }
  req.merchantId = merchantId;  // Binds to request object
  next();
}
```

All protected routes use `req.merchantId` from session. Client-provided merchant IDs are ignored.

### AES-256-GCM Encryption Flow
Location: `server/utils/crypto.ts`

**Key Derivation:**
- Source: `ENCRYPTION_KEY` environment variable (minimum 32 characters)
- Method: First 32 bytes extracted as UTF-8 buffer
- Algorithm: `aes-256-gcm`
- IV Length: 12 bytes (96-bit, NIST recommended)

**Encrypt Function:**
```typescript
function encrypt(plaintext: string): { encryptedData: string, iv: string, tag: string }
```
1. Generate random 12-byte IV via `crypto.randomBytes()`
2. Create cipher with `createCipheriv('aes-256-gcm', key, iv)`
3. Encrypt plaintext, finalize cipher
4. Extract authentication tag via `cipher.getAuthTag()`
5. Return hex-encoded: ciphertext, IV, tag

**Decrypt Function:**
```typescript
function decrypt(encryptedData: string, ivHex: string, tagHex: string): string
```
1. Parse hex-encoded IV and tag to buffers
2. Create decipher with `createDecipheriv('aes-256-gcm', key, iv)`
3. Set authentication tag via `decipher.setAuthTag()`
4. Decrypt and finalize
5. Return plaintext (authentication failure throws)

**Vault Self-Test:**
Mandatory encrypt/decrypt validation on server boot. Server exits with code 1 if mismatch.

### Stripe Connect OAuth State
Location: `server/routes.ts`

**Flow:**
1. `/api/auth/stripe` - Generate 32-byte random state, store in HTTP-only cookie (10min expiry)
2. Redirect to `https://connect.stripe.com/oauth/authorize` with state parameter
3. `/api/auth/callback` - Validate state cookie matches query param (CSRF protection)
4. Exchange authorization code for access token via `stripe.oauth.token()`
5. Encrypt access token with AES-256-GCM
6. Store encrypted token in `merchants` table
7. Set `req.session.merchantId` and save session
8. Redirect to `/` (dashboard)

**Storage:**
- `stripe_user_id`: Stored plaintext (not sensitive)
- `access_token`: Stored as `encrypted_token`, `iv`, `tag` (AES-256-GCM)

---

## 3. API & Intelligence Logic

### Temporal Aggregators
Location: `server/storage.ts`

**Monthly Trend (`getMonthlyTrend`):**
```sql
SELECT 
  TO_CHAR(DATE_TRUNC('month', discovered_at), 'YYYY-MM') AS month,
  SUM(CASE WHEN status IN ('pending', 'exhausted') THEN amount ELSE 0 END) AS leaked,
  SUM(CASE WHEN status = 'recovered' THEN amount ELSE 0 END) AS recovered
FROM ghost_targets
WHERE merchant_id = $1
GROUP BY DATE_TRUNC('month', discovered_at)
ORDER BY month ASC
```

**Daily Pulse (`getDailyPulse`):**
```sql
SELECT 
  TO_CHAR(DATE_TRUNC('day', discovered_at), 'YYYY-MM-DD') AS date,
  SUM(CASE WHEN status IN ('pending', 'exhausted') THEN amount ELSE 0 END) AS leaked,
  SUM(CASE WHEN status = 'recovered' THEN amount ELSE 0 END) AS recovered
FROM ghost_targets
WHERE merchant_id = $1
  AND discovered_at >= (NOW() - INTERVAL '30 days')
GROUP BY DATE_TRUNC('day', discovered_at)
ORDER BY date ASC
```

**Historical Revenue Stats (`getHistoricalRevenueStats`):**
Combines merchant aggregate fields with temporal data:
```typescript
{
  lifetime: {
    allTimeLeakedCents: number,
    totalGhostCount: number,
    totalRecoveredCents: number
  },
  monthlyTrend: MonthlyTrendPoint[],
  dailyPulse: DailyPulsePoint[]
}
```

### Intelligence Log Synthesis
Location: `server/storage.ts` - `getIntelligenceLogs()`

Synthesizes strategic reasoning strings from ghost target data:

| Decline Type | Strategy String |
|--------------|-----------------|
| `expired_card` | "Strategy: Immediate Outreach triggered. Bypassing Oracle timing for Expired Card." |
| `insufficient_funds` | "Strategy: Intelligent Hold. Retrying in 24h based on high-probability liquidity window." |
| `card_declined` | "Strategy: Standard Recovery initiated. Card declined - generic failure code." |
| `processing_error` | "Strategy: Delayed Retry. Processing error detected - temporary issue likely." |
| `fraudulent` | "Strategy: Case Flagged. Potential fraud indicator - manual review recommended." |
| default | "Strategy: Recovery Pulse dispatched. Email sequence initiated." |

**Event Types Generated:**
- `discovery`: Ghost identification from Deep Harvest
- `action`: Email dispatch with decline strategy
- `success`: Confirmed recovery with attribution type
- `info`: Exhausted status (max 3 emails reached)

---

## 4. UI Architectural Patterns

### Color Token System
| Token | Value | Usage |
|-------|-------|-------|
| Obsidian Background | `#0A0A0A` | Global body, nav, skeleton |
| Slate-400 | `#94a3b8` | Leaked revenue, secondary text |
| Slate-500 | `#64748b` | Tertiary text, info logs |
| Slate-800 | `#1e293b` | Skeleton pulse, tooltip bg |
| Emerald-500 | `#10b981` | Recovered revenue, success states |
| Sky-400 | `#38bdf8` | Action/decision logs |

### Typography
- **Financial Values:** JetBrains Mono for all monetary amounts, invoice IDs, technical data
- **Body Text:** System sans-serif (Inter via Tailwind)
- **Hero Amounts:** `text-5xl md:text-6xl lg:text-7xl` for leaked, `text-3xl md:text-4xl` for recovered

### Dashboard Hero Layout (`DashboardPage.tsx`)
Fixed height container: `h-[200px]`
- Leaked revenue: Large slate-400 typography, top position
- Recovered revenue: Medium emerald-500 typography, below leaked
- Metrics row: Ghost count, Tier limit, Strategy - bottom border separator

### Chart Components

**MonthlyTrendChart:**
- Type: Recharts BarChart
- Height: 280px fixed
- Bars: Stacked leaked (slate) + recovered (emerald)
- Grid: 5% opacity white, horizontal only
- X-axis: Month labels (e.g., "Dec '24")
- Y-axis: Currency formatted

**DailyPulseChart:**
- Type: Recharts AreaChart
- Height: 220px fixed
- Areas: Stacked with linear gradients
- Gradient: 30% opacity at top, 0% at bottom
- Range: Last 30 days

### Forensic Ledger (`RecoveriesPage.tsx`)

**Table Structure:**
- shadcn/ui Table components
- Columns: Customer, Email, Amount, Invoice, Discovered, Status, Attribution
- Sort: Default by discoveredAt DESC (most recent first)
- Search: Filters across email, customerName, invoiceId

**Status Badges:**
| Status | Color Scheme |
|--------|--------------|
| Pending | indigo-500/20 bg, indigo-400 text |
| Emailed (n) | amber-500/20 bg, amber-400 text |
| Recovered | emerald-500/20 bg, emerald-400 text |
| Exhausted | slate-500/20 bg, slate-400 text |

**Attribution Badges:**
| Type | Color Scheme |
|------|--------------|
| Direct | emerald-600/20 bg, emerald-300 text |
| Organic | slate-600/20 bg, slate-400 text |

### Intelligence Log Feed (`SystemPage.tsx`)
- Terminal-style UI with JetBrains Mono throughout
- Log types: discovery, action, success, info
- Color coding: slate-500 (info/discovery), sky-400 (action), emerald-500 (success)
- Max height 500px with overflow scroll
- Entry format: timestamp + optional amount + message

### Skeleton Strategy (`ObsidianSkeleton.tsx`)
- Fixed min-height: `min-h-screen`
- Nav skeleton: h-16 matching actual nav
- Hero skeleton: h-[200px] matching MoneyHero
- Chart skeletons: h-[280px] and h-[220px] matching actual charts
- Animation: `animate-slow-pulse` (2s duration via Tailwind config)
- Background: `bg-slate-800/50` for elements, `bg-[#0A0A0A]` for body

---

## 5. Express Routes Map

### Public Routes (No Auth)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/health` | Inline | System health check with vault status |
| GET | `/api/auth/status` | Inline | Session authentication check |
| GET | `/api/auth/stripe` | Inline | OAuth initiation redirect |
| GET | `/api/auth/callback` | Inline | OAuth callback, token exchange |
| GET | `/api/auth/success` | Inline | Post-OAuth success response |
| GET | `/api/auth/error` | Inline | OAuth error display |
| POST | `/api/webhooks/stripe` | `handleWebhookEvent` | Stripe payment webhooks |
| GET | `/api/system/health` | `getSystemHealth` | Scheduler status and logs |

### Protected Routes (requireMerchant)

| Method | Path | Handler | Frontend View |
|--------|------|---------|---------------|
| POST | `/api/audit/run` | `runAuditForMerchant` | DashboardPage (DeepHarvestGate) |
| GET | `/api/merchant/stats` | `getHistoricalRevenueStats` | DashboardPage (MoneyHero + Charts) |
| GET | `/api/merchant/ghosts` | `getGhostTargetsByMerchant` | RecoveriesPage (GhostLedger) |
| GET | `/api/merchant/logs` | `getIntelligenceLogs` | SystemPage (IntelligenceLogFeed) |

### Attribution Routes

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/l/:strikeId` | Inline | Attribution link proxy, sets 24h window, redirects to Stripe invoice |

### Manual Trigger Routes (No Auth - Admin/Testing)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/pulse/run` | `processQueue` | Manual pulse engine trigger |
| POST | `/api/sentinel/ghost-hunter` | `runGhostHunterJob` | Manual Deep Harvest trigger |
| POST | `/api/sentinel/pulse-engine` | `runPulseEngineJob` | Manual email queue trigger |

### Frontend Routes (wouter)

| Path | Component | Auth Required |
|------|-----------|---------------|
| `/` | DashboardPage | Yes (shows ConnectStripeGate if not) |
| `/recoveries` | RecoveriesPage | Yes |
| `/growth` | GrowthPage | Yes |
| `/system` | SystemPage | Yes |
| `/settings` | SettingsPage | Yes |
| `*` | NotFound | No |

---

## 6. Sentinel Scheduler

**Jobs:**
- Ghost Hunter: Every 12 hours at minute 0
- Pulse Engine: Every hour at minute 0

**Defensive Rules:**
- 4-hour grace period before emailing new ghosts
- Maximum 3 emails per ghost (then status = 'exhausted')

**Lock Mechanism:**
- Atomic PostgreSQL UPSERT with TTL-based lock stealing
- 30-minute TTL for stale lock recovery
- Identity-safe release (holderId verification)

---

## 7. Diagnostic Shell (Performance Validation)

Location: `server/services/ghostHunter.ts`

### Pre-Flight Vault Check
Before any Stripe API calls, the diagnostic shell validates encryption integrity:
```typescript
vaultDiagnostic()
// Encrypts/decrypts "PHANTOM_INTEGRITY_TEST"
// Throws CRITICAL_VAULT_ERROR if mismatch
// Returns { encryptMs, decryptMs } timing data
```

### Throttling Strategy
Changed from per-call delays to batch-based throttling for better performance:
| Constant | Value | Purpose |
|----------|-------|---------|
| `THROTTLE_BATCH_SIZE` | 50 | Process N records before delay |
| `THROTTLE_DELAY_MS` | 200ms | Pause duration after batch |
| `RATE_LIMIT_RETRY_MS` | 2000ms | Sleep on StripeRateLimitError |

### Rate Limit Detection
Enhanced detection for Stripe rate limiting:
```typescript
isStripeRateLimitError(error)
// Checks: statusCode === 429
// Checks: type === 'StripeRateLimitError'
// Checks: code === 'rate_limit'
```

### Telemetry State
Real-time performance monitoring during scan:
```typescript
interface TelemetryState {
  startTime: number;      // Scan start timestamp
  recordsProcessed: number; // Invoice counter
  peakRssMb: number;      // Peak memory usage
  lastEncryptMs: number;  // Latest encrypt timing
  totalUpsertMs: number;  // Cumulative DB latency
  upsertCount: number;    // UPSERT operation count
}
```

### Heartbeat Logging
Every 50 records, telemetry logs:
```
[PHANTOM-CORE] Index: 50 | RAM: 142.3MB | Encrypt: 1ms | Avg UPSERT: 12.5ms | Elapsed: 5420ms
```

### Final Summary (system_logs)
On completion, writes to `system_logs` table:
```
Scanned 3 merchants, 1500 records, found 12 ghosts in 45000ms | Peak RSS: 156.2MB | Avg UPSERT: 11.3ms
```

---

## 8. Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Master encryption key (32+ chars) |
| `SESSION_SECRET` | Express session signing key |
| `STRIPE_CLIENT_ID` | Stripe Connect app ID |
| `STRIPE_SECRET_KEY` | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |

**Email Service:** Uses Replit's Resend connector integration - no manual API key required.
