# ExitEcom — project guide for Claude

Pre-exit intelligence for e-commerce founders: an **Exit Readiness Score**,
**valuation range**, **risk scan** and **optimization plan**, computed
deterministically from real store + marketing data. Server-rendered React on
**TanStack Start** (Nitro → Vercel), **Supabase** (Postgres + Auth + RLS).

## Non-negotiable rules
- **All numbers are deterministic.** Every score/valuation/risk/£ figure is
  computed in plain, auditable code in `src/lib/analytics.ts`. **Never route a
  number through an LLM.** Gemini (`src/lib/ai.ts`) is optional and only polishes
  the _prose_ of risk/action copy — never figures.
- **Server-only secrets.** API tokens and OAuth secrets live in server functions
  / `process.env`, **never** `VITE_`-prefixed (that inlines them into the browser
  bundle). The only public client var is the Supabase anon key.
- **Migrations must be applied to the LIVE hosted Supabase project**, not just
  committed (`supabase db push`). Editing a migration file alone changes nothing
  in production.
- **No dummy/placeholder data** in live paths — real data or an empty/gated
  state. The sandbox path is reserved for explicit `test`/`demo`/`sandbox` creds.
- **`src/routeTree.gen.ts` is generated** — never hand-edit; add a route file and
  let the plugin regenerate it. Don't re-declare the plugins bundled by
  `@lovable.dev/vite-tanstack-config` in `vite.config.ts`.

## Layout
- Routes: `src/routes/_app.*.tsx` (`_app` is the authed, pathless layout).
- Deterministic engine: `src/lib/analytics.ts` (`computeMetrics` →
  `computeExitScore` → `computeValuation` → risks/actions; `computeFullReport`).
- Data layer: `src/hooks/useBusinessData.tsx`; on-demand reports: `useReport.ts`.
- Connectors (each a `createServerFn` that authenticates, pulls raw data, and
  hands rows back to the hook to persist to RLS tables): `src/lib/shopify.ts`
  (required), and the optional ad/analytics feeds `meta.ts`, `google.ts`,
  `tiktok.ts`, `snapchat.ts`, `ga4.ts`. Ad feeds drive Marketing Efficiency off
  real ROAS + spend stability; GA4 is a separate traffic signal (no spend/ROAS).

## Conventions
- Dev server runs on `http://localhost:8080` (`npm run dev`). Build:
  `npm run build` (`NITRO_PRESET=vercel`). `npm run lint` / `npm run format`.
- Conventional Commits; the repo commits directly to `main`.

## Docs (keep current when behaviour changes)
- `docs/architecture.md` — wiring, data model, connector pattern.
- `docs/report-calculations.md` — exactly how every figure is computed.
- `docs/data-display.md` — what's shown where + the no-dummy-data rule.
- `docs/env-vars.md` — every env var (Supabase, each connector, Gemini).
- `docs/*-ads-setup.md`, `docs/ga4-setup.md` — per-connector setup + troubleshooting.
- `docs/changelog.md` — newest-first change log.
