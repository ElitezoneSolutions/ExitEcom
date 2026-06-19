---
name: design-tokens-components
description: CSS variables, utility classes, and shared UI primitives available in ExitEcom
metadata:
  type: reference
---

## Source file
`src/styles.css` — all custom properties and utilities defined here.

## Key CSS variables
- `--accent` (#1a56db) — primary brand blue, used for interactive elements, underlines, scores
- `--accent-muted` (#1e47c5) — hover state for accent
- `--text-primary` (#0d1f3c), `--text-secondary` (#374151), `--text-muted` (#6b7280), `--text-dim` (#9ca3af)
- `--border-warm` (#e2e8f0), `--border-mid` (#cbd5e1)
- `--risk-critical` (#dc2626), `--risk-medium` (#d97706), `--positive` (#16a34a)
- `--bg-primary` (#f7f8fa), `--bg-secondary` (#eff1f5)
- `--font-display`: Cormorant Garamond serif; `--font-body`: DM Sans

## Utility classes (defined in styles.css)
- `btn-primary` — filled blue CTA button (inline-flex, gap-2, padding 10/20)
- `btn-ghost-light` / `btn-ghost-dark` — bordered ghost button
- `card-light` / `card-dark` — white card with border + shadow-sm (both map to same white in current theme)
- `label-caps` — 0.6875rem (11px), uppercase, 0.08em letter-spacing, muted, 600 weight
- `surface-dark` / `surface-accent` — contextual backgrounds
- `font-display` — Cormorant Garamond

## Shared components
- `src/components/ex/PageHeader.tsx` — `PageHeader({ title, subtitle?, right? })` — use subtitle for all pages
- `src/components/ex/SectionLabel.tsx` — section dividers with optional `dark` / `gold` props
- `src/components/ex/Sidebar.tsx` — authed layout sidebar
- `src/routes/signup.tsx` exports `Field({ label, type, value, onChange, disabled?, invalid?, required?, placeholder? })` — canonical text/password input; used on settings and auth pages

## SelectField pattern (settings page)
Wraps `<select>` in a `<label>` using `label-caps` span + `mt-2` container. Accepts `disabled` prop. DO NOT add `style={{ fontSize: 10 }}` override — `label-caps` already defines 11px.

## Loading state pattern
Spinner: `<RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />` + `<p>Loading...</p>` centered in `min-h-[400px] flex flex-col items-center justify-center gap-4`. For inline loading: `<p role="status" className="text-sm text-[var(--text-muted)]">Loading…</p>`.
