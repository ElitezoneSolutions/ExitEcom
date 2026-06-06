# ExitEcom Dashboard Context

This file is the working map for the dashboard/application area. The landing page is intentionally out of scope for upcoming backend work unless explicitly requested.

## Product Summary

ExitEcom is a pre-exit intelligence dashboard for e-commerce founders preparing to sell their business. The app turns connected store, marketing, analytics, and financial data into a buyer-grade view of readiness, risk, valuation, and value-improvement actions.

The current application is a polished prototype. Most values come from `src/lib/mock.ts`; UI actions are mostly local state, links, or disabled buttons. The next phase is to preserve the current interface while replacing prototype data and placeholder actions with real backend-backed behavior.

## Current Stack

- TanStack Start, TanStack Router, React 19, Vite.
- Tailwind v4 style utilities and app-wide tokens live in `src/styles.css`.
- Shared dashboard components live in `src/components/ex`.
- Dashboard routes live under `src/routes/app*.tsx`.
- Mock product data, formatters, risks, actions, add-backs, and data-room categories live in `src/lib/mock.ts`.
- Cloudflare/Vite deployment config exists through `vite.config.ts` and `wrangler.jsonc`.

## UI Direction

- Keep the current dashboard look and layout.
- Primary color is `#1a56db`.
- The dashboard is light theme.
- Prefer small, targeted UI changes only when needed for function, clarity, or consistency.
- Do not change `src/routes/index.tsx` or landing-page sections during dashboard/backend work unless the user explicitly asks.

## Dashboard Modules

### App Shell

- Route: `/app`
- Files: `src/routes/app.tsx`, `src/components/ex/Sidebar.tsx`
- Provides the persistent dashboard shell and sidebar navigation.
- Backend needs: authenticated user/session state, active business selection, logout.

### Dashboard Overview

- Route: `/dashboard`
- File: `src/routes/app.dashboard.tsx`
- Shows greeting, exit score, valuation range, value gap, top buyer concerns, highest impact actions, business snapshot, and data health.
- Backend needs: dashboard summary endpoint composed from business profile, financial metrics, score, valuation, risks, actions, integrations.

### Business Profile

- Route: `/profile`
- File: `src/routes/app.profile.tsx`
- Editable business identity and snapshot.
- Backend needs: CRUD for business profile fields, save state, validation, last-updated timestamp.

### Data Sources

- Route: `/data-sources`
- File: `src/routes/app.data-sources.tsx`
- Lists integration status for store, marketing, financial, and analytics sources.
- Backend needs: integration records, OAuth/connect flows, sync status, last sync time, error state, disconnect/manage actions.

### Exit Readiness Score

- Route: `/exit-score`
- File: `src/routes/app.exit-score.tsx`
- Shows overall score, tier, nine score dimensions, valuation range, and value gap.
- Backend needs: scoring engine output, score dimension table, score history, explanation/rationale fields.

### Risk Scanner

- Route: `/risk-scanner`
- File: `src/routes/app.risk-scanner.tsx`
- Shows risk score, value lost, critical risks, additional risks, buyer psychology, recommendations.
- Backend needs: risk records, severity, impact estimate, buyer-facing rationale, recommendation generation, dismissed/resolved state.

### Valuation Engine

- Route: `/valuation`
- File: `src/routes/app.valuation.tsx`
- Shows valuation range, fair market value, multiple, value opportunity, drivers, scenarios, methodology.
- Backend needs: valuation model output, financial inputs, multipliers, methodology metadata, scenario calculations.

### Optimization Plan

- Route: `/optimization`
- File: `src/routes/app.optimization.tsx`
- Shows unlock potential, prioritized actions, roadmap, progress summary, local checklist state.
- Backend needs: action plan records, status/progress, owner, due dates, estimated uplift, generated recommendations, PDF/report generation.

### Financial Normalizer

- Route: `/financial-normalizer`
- File: `src/routes/app.financial-normalizer.tsx`
- Shows earnings overview, add-backs, expense breakdown, revenue trend.
- Backend needs: normalized P&L, uploaded file parsing, manual add-backs, SDE/EBITDA calculations, monthly revenue series.

### Investment Memo

- Route: `/investment-memo`
- File: `src/routes/app.investment-memo.tsx`
- Generates buyer-ready memo content from live business data, with tone/settings controls.
- Backend needs: memo settings, generated memo sections, regeneration job, export/download, copy/share.

### Data Room

- Route: `/data-room`
- File: `src/routes/app.data-room.tsx`
- Tracks required diligence documents, upload completeness, AI generation prompt.
- Backend needs: document categories, file uploads/storage, generated documents, permissions, buyer sharing.

### Reports

- Route: `/reports`
- File: `src/routes/app.reports.tsx`
- Lists generated reports and available report types.
- Backend needs: report generation jobs, report files, status, download URLs.

### Settings

- Route: `/settings`
- File: `src/routes/app.settings.tsx`
- Prototype tabs for profile, notifications, integrations, security.
- Backend needs: account settings, notification preferences, security controls, session management.

### Billing

- Route: `/billing`
- File: `src/routes/app.billing.tsx`
- Shows current plan, payment method, invoices.
- Backend needs: subscription/customer state, payment method, invoices, plan changes, Stripe or equivalent integration.

## Core Data Concepts

Likely backend entities:

- User: owner account, auth identity, preferences.
- Business: profile, industry, country, URLs, channels, owner relationship.
- Integration: provider, status, credentials reference, scopes, last sync, sync errors.
- FinancialMetric: revenue, COGS, ad spend, opex, EBITDA, SDE, margins, monthly series.
- Score: overall score, tier, dimension scores, confidence, generated timestamp.
- Risk: title, severity, description, impact, buyer psychology fields, recommendation.
- Valuation: low/mid/high/optimized values, multiples, drivers, methodology.
- ActionPlanItem: title, priority, uplift, time estimate, steps, completion state.
- DocumentRequirement: category, item, uploaded/generated state, file reference.
- Report: type, status, generated at, file URL.
- Subscription: plan, billing date, payment method, invoice history.

## Suggested Backend Build Order

1. Create typed dashboard data contracts and replace direct `mock.ts` imports route by route with a thin data access layer.
2. Add persistence for business profile and settings.
3. Implement data-source/integration status records before real OAuth.
4. Implement financial data model and manual/uploaded normalized financials.
5. Build score, risk, valuation, and optimization calculations from stored financial/profile/integration data.
6. Add document upload/storage for the data room.
7. Add report and memo generation/export jobs.
8. Add auth and billing once core dashboard flows have stable data ownership boundaries.

## Implementation Notes

- Preserve current visual components when connecting backend data.
- Prefer introducing typed domain models before wiring real APIs.
- Avoid spreading backend calls directly throughout components; use route loaders, hooks, or a small service layer.
- Keep mock data available as seed/demo fallback until real onboarding and integrations populate the dashboard.
- When changing UI copy or layout, keep it dense, operational, and dashboard-focused.
