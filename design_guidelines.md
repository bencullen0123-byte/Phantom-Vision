# PHANTOM Revenue Intelligence - Design Guidelines

## Design Approach: Enterprise Security-First

**Selected Framework:** Fluent Design System (Microsoft) - optimized for data-heavy B2B applications with strong security posture

**Design Philosophy:** 
PHANTOM is a professional revenue intelligence tool. The design must communicate trust, precision, and technical sophistication. Minimal UI in Stage 1, but foundation must scale to future dashboard-heavy stages.

## Core Design Elements

### Typography
- **Primary Font:** Inter (via Google Fonts)
  - Headings: 600-700 weight
  - Body: 400 weight
  - Code/Data: 500 weight (tabular-nums)
- **Hierarchy:**
  - H1: text-4xl (36px)
  - H2: text-2xl (24px)
  - Body: text-base (16px)
  - Data Labels: text-sm (14px)

### Layout System
**Spacing Scale:** Tailwind units of 4, 6, 8, 12, 16
- Component padding: p-6 or p-8
- Section gaps: gap-8 to gap-12
- Container max-width: max-w-6xl

### Component Library

**Stage 1 (Minimal UI):**
- **OAuth Landing Page:**
  - Centered layout (flex items-center justify-center min-h-screen)
  - Card container: bg-white shadow-lg rounded-lg p-8 max-w-md
  - Logo/Title: Text-based "PHANTOM" in uppercase, tracking-tight
  - "Connect Stripe" button: Primary CTA with Stripe branding colors
  - Status messages: JSON response displayed in monospace font

**Future Stages (Dashboard):**
- **Navigation:** Left sidebar, collapsed by default, 64px icons-only mode
- **Data Tables:** Striped rows, fixed headers, sortable columns
- **Cards:** Minimal elevation (shadow-sm), border-l-4 for status indicators
- **Buttons:** 
  - Primary: Solid fill
  - Secondary: Border outline
  - Height: h-10 or h-12
  - All buttons: rounded-md

### Color Philosophy
Security-first palette (to be implemented later):
- Emphasize data hierarchy through contrast
- Status colors: Success (green), Warning (amber), Critical (red)
- Neutral grays for backgrounds and borders

### Interaction Patterns
- **Loading States:** Skeleton screens for data tables
- **Error Handling:** Inline validation, toast notifications for system errors
- **OAuth Flow:** Clear step indicators, minimal distraction
- **Animations:** Subtle (200ms transitions), only for state changes

## Images
**No hero images required.** PHANTOM is a headless B2B tool. Stage 1 needs only:
- Company logo (SVG, monochrome)
- Stripe Connect button (use official Stripe assets)

Future stages may include:
- Icon library: Heroicons for data visualization icons
- Status indicators: SVG badges for Ghost User states

## Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation for all OAuth flows
- High contrast for financial data displays
- Screen reader labels for all data tables