# PHANTOM Design System v1.0

## Design Approach: Surgical/Titanium Aesthetic

**Philosophy:** PHANTOM communicates precision, trust, and technical sophistication through a dark, clinical interface optimized for revenue intelligence data.

---

## Primary Palette

| Color | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| **Obsidian** | `#0A0A0B` | `bg-obsidian` | Primary background color |
| **Slate-900** | `#0f172a` | `bg-slate-900` | Card backgrounds |
| **Slate-800** | `#1e293b` | `border-slate-800` | Borders and dividers |

## Functional Accents

| Color | Tailwind Class | Usage |
|-------|----------------|-------|
| **Emerald-500** | `text-emerald-500` | ONLY for numerical revenue that has been "Recovered" (Attributed) |
| **Indigo-600** | `bg-indigo-600` | Primary actions and system navigation |
| **Slate-400** | `text-slate-400` | "Leaked" or "Shadow" revenue totals (implies inaccessible) |

---

## Typography Rules

### Numerical Data
- **Font Family:** `font-mono` (JetBrains Mono)
- **Use for:** Currency values, percentages, timestamps, IDs

### Interface Prose
- **Font Family:** `font-sans` (Inter)
- **Use for:** Labels, menus, descriptions, headers, body text

### Font Weights

| Font | Weight | Usage |
|------|--------|-------|
| Inter | 400 | Body text |
| Inter | 500 | Labels, emphasis |
| Inter | 600 | Headings, section titles |
| JetBrains Mono | 400 | Data values |
| JetBrains Mono | 500 | Highlighted metrics |

---

## Component Patterns

### Cards
```tsx
<div className="bg-slate-900 border border-white/10 rounded-md p-4">
  {/* Card content */}
</div>
```

### Revenue Display (Recovered)
```tsx
<span className="font-mono text-emerald-500">£4,200.50</span>
```

### Revenue Display (Leaked/Shadow)
```tsx
<span className="font-mono text-slate-400">£12,500.00</span>
```

### Primary Action Button
```tsx
<Button className="bg-indigo-600 hover:bg-indigo-700">
  Start Audit
</Button>
```

### Subtle Borders
```tsx
<div className="border border-white/10">
  {/* Content with subtle border */}
</div>
```

---

## Global Styles

- Body background: `bg-obsidian` (#0A0A0B)
- Default text: `text-slate-200`
- Default font: `font-sans` (Inter)

---

## Typography Hierarchy

| Element | Size | Weight | Font |
|---------|------|--------|------|
| H1 | `text-4xl` | 600 | Inter |
| H2 | `text-2xl` | 600 | Inter |
| H3 | `text-xl` | 500 | Inter |
| Body | `text-base` | 400 | Inter |
| Data Labels | `text-sm` | 400 | Inter |
| Metrics | `text-lg` | 500 | JetBrains Mono |
| Currency | varies | 400-500 | JetBrains Mono |

---

## Layout Guidelines

- **Container max-width:** `max-w-6xl`
- **Component padding:** `p-6` or `p-8`
- **Section gaps:** `gap-8` to `gap-12`
- **Card padding:** `p-4` to `p-6`

---

## Status Colors

| Status | Color | Usage |
|--------|-------|-------|
| Success/Recovered | Emerald-500 | Recovered revenue, successful operations |
| Warning | Amber-500 | Pending actions, attention needed |
| Critical/Error | Red-500 | Failed operations, errors |
| Neutral/Shadow | Slate-400 | Leaked revenue, inactive states |

---

**Note:** All future components MUST reference this design system. The "Surgical/Titanium" aesthetic requires strict adherence to these specifications.
