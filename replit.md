# PHANTOM Revenue Intelligence

## Overview

PHANTOM is a revenue intelligence platform designed to identify "Ghost Users"—customers with active SaaS access despite failed payments—and automate their recovery. It functions as a fully autonomous, headless backend, managing merchant identities, encryption, ghost detection, recovery email orchestration, and payment tracking to recover lost revenue and prevent future churn. The platform aims to provide a comprehensive solution for revenue protection and growth for SaaS businesses.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Frameworks:** React with TypeScript, Vite, Wouter for routing.
- **State Management:** TanStack React Query.
- **UI/Styling:** shadcn/ui (Radix UI) and Tailwind CSS with a Fluent Design System approach.
- **Design Philosophy:** Enterprise security-first, minimal UI, Inter font.

### Backend Architecture
- **Runtime:** Node.js with Express and TypeScript (ESM).
- **API:** RESTful with JSON responses.
- **Development:** `tsx` for execution, Vite middleware for HMR.
- **Production:** `esbuild` for server, Vite for client.

### Security & Data
- **Encryption:** AES-256-GCM with 12-byte IVs; `ENCRYPTION_KEY` environment variable. Self-tests on boot.
- **Database:** PostgreSQL via Drizzle ORM.
- **Key Tables:**
    - `merchants`: Stores encrypted Stripe tokens, recovery stats, and multi-currency data.
    - `ghost_targets`: Manages transient PII for recovery, status, and unique identifiers.
    - `liquidity_oracle`: Anonymized metadata for recovery timing.
    - `system_logs`: Monitors scheduled jobs and system health.
- **Multi-Currency:** Automatic detection and storage of `default_currency`, `impending_leakage_cents`, and `total_protected_cents`.

### Universal Revenue Intelligence (ML Metadata)
- **Non-PII Fields:** `cardBrand`, `cardFunding`, `countryCode`, `requires3ds`, `stripeErrorCode`, `originalInvoiceDate` for ML analysis, all normalized to lowercase.
- **Extraction Flow:** Ghost Hunter and real-time Stripe webhooks (e.g., `invoice.payment_failed`) extract and normalize metadata.
- **Recovery Strategy:** `determineRecoveryStrategy()` categorizes ghosts into `technical_bridge`, `smart_retry`, `card_refresh`, or `high_value_manual` based on decline reasons and invoice value.
- **Attribution & Redirect Audit:** Tracks `clickCount` and `lastClickedAt` for recovery links. Redirects strategically based on recovery type (Stripe hosted invoice, Customer Portal). Uses `phantom_attribution` cookie for attribution.
- **Golden Hour Email Engine:** Sends strategy-specific emails immediately after ghost creation with tailored templates via Resend.

### Authentication & Authorization
- **OAuth Provider:** Stripe Connect.
- **Flow:** Redirects to Stripe for authorization, exchanges code for token, encrypts and stores.

### Autonomous Operations
- **The Sentinel:** Schedules `Ghost Hunter` (every 12 hours) and `Pulse Engine` (hourly) for autonomous operation.
- **Recovery Logic:** Includes grace periods, cooldowns, and a maximum of 3 emails per ghost before marking as "exhausted."
- **Webhook Infrastructure (The Handshake):** `invoice.paid` and `customer.subscription.updated` events from Stripe webhooks mark ghosts as "recovered" or "protected" and attribute recoveries.

### UI/UX Features

#### Three-Tier Dashboard Layout
- **Tier 1 - Global Command Header:** Consolidated header in MainLayout with Volume Guarded (left), Sentinel Status + Active Leakage + Refresh (center), Revenue Saved + Last Audit (right)
- **Tier 2 - Diagnostic Trident:** 3-column War Room layout with Shadow Leakage card, Diagnostic DNA bar chart, and Leakage Forensics donut with PHANTOM Insight
- **Tier 3 - Operational Floor:** Audit Proof conversion funnel + Vigilance Grid for ghost target management

#### Core Pages
- **MainLayout:** Collapsible sidebar with 3 pages: Dashboard (The Audit), Recoveries (The Action), Settings (The Control Plane)
- **DashboardPage:** Displays overall health, revenue guarded, shadow leakage, and impending risk via Diagnostic Trident and Audit Proof funnel
- **RecoveriesPage:** Manages ghost targets with last action, recovery strategy, status, and attribution badges
- **SettingsPage:** Contains Sentinel Arming Station (Auto-Pilot toggle) and Blueprint Editor

#### Settings Features
- **Sentinel Arming Station:** Toggle switch for enabling/disabling autonomous recovery email sending (Auto-Pilot mode). Requires support email to be configured.
- **Blueprint Editor:** Real-time editor for customizing recovery email copy with:
  - Editable fields: Subject, Greeting, Message Body, Button Text
  - Live mobile preview with instant synchronization
  - Placeholder highlighting for `{{customer_name}}` and `{{business_name}}`
  - Visual feedback (purple ring) when editing corresponding preview sections
  - "Reset to Default" button to restore proven Technical Bridge copy

#### Components & Badges
- **Centralized Badges:** `forensic-badges.tsx` with StrategyBadge, StatusBadge, CardBrandBadge, CountryBadge, AttributionBadge
- **Modular Components:** `MoneyHero` (revenue metrics, leakage health), `ForensicCharts` (monthly/daily trends), `LeakageDonut` (category distribution), `DiagnosticTrident` (3-column analysis panel)
- **Social Sharing:** Allows sharing of individual recovery wins and overall integrity reports

#### CSS Animations
- `heartbeat-pulse`: 1.5s animation for engaged badges
- `sentinel-armed`: 2s emerald glow for Auto-Pilot toggle when armed
- `animate-pulse`: For Sentinel Active status indicator

## External Dependencies

### Third-Party Services
- **Stripe Connect:** For merchant authorization and accessing payment data.
- **PostgreSQL:** Primary database.
- **Resend:** For sending recovery and protection emails.

### Key NPM Packages
- **Database:** `drizzle-orm`, `pg`, `drizzle-zod`.
- **API:** `express`, `stripe` SDK.
- **Frontend:** `react`, `@tanstack/react-query`, `wouter`.
- **UI:** `@radix-ui/*`, `tailwindcss`, `class-variance-authority`.
- **Build:** `vite`, `esbuild`, `tsx`.

### Environment Variables
- `DATABASE_URL`
- `ENCRYPTION_KEY`
- `STRIPE_CLIENT_ID`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`