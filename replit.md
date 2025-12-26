# PHANTOM Revenue Intelligence

## Overview

PHANTOM is a revenue intelligence platform designed to identify "Ghost Users"—customers who retain active SaaS access despite failed payments—and execute recovery operations. The application is currently in Stage 1 ("The Titanium Gate"), focused on building a secure, headless backend capable of handling merchant identities and encryption through Stripe Connect OAuth integration.

The project follows a staged development approach:
- **Stage 1:** Foundation & Security (current) - OAuth, encryption vault, secure data storage
- **Stage 2:** Ghost Hunter - Historical audit & forensic data extraction
- **Stage 3:** Recovery Orchestrator - Messaging via Resend/Twilio
- **Stage 4:** Oracle & Enforcement - Aggregated data moat & access shield API

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
  - `merchants` - Encrypted Stripe access tokens with IV and auth tag
  - `ghost_targets` - Transient PII (email, amount) with 90-day purge timestamp
  - `liquidity_oracle` - Anonymized metadata (business category, timing data)

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