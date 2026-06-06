# Changes log

A simplified list of changes made to ExitEcom. Newest first.

## 2026-06 — Deterministic engine, raw data store & on-demand reports

### Sync and reporting are now decoupled
- **Connecting a store no longer auto-generates a report.** It only
  authenticates, pulls, stores raw data, and confirms (counts only — no score or
  valuation on the success screen).
- New server fn `syncShopifyStoreFn` (`src/lib/shopify.ts`) pulls **all history**
  (orders capped ~5k, products ~2k, customers ~5k) via cursor pagination. Real
  credential failures now throw real errors; the sandbox path is reserved for
  explicit `*test/demo/sandbox*` creds.

### Numbers are deterministic — AI is cosmetic only
- New deterministic engine `src/lib/analytics.ts` computes metrics, the 9-dimension
  exit score, valuation, risks and actions from the **full** raw dataset (real line
  items). Same data → same numbers, fully auditable.
- **Removed Gemini from every numeric path.** Gemini (`src/lib/ai.ts`,
  `enrichRiskCopyFn`) now only polishes the _prose_ of risk/action copy and is
  optional. Removed `VITE_GEMINI_API_KEY` (browser-leak risk); the key is
  server-only via `process.env.GEMINI_API_KEY`.
- Reports run **on demand** via `useReport` (`run()` / "Re-compute") on the four
  result pages, which now render **real computed values** (no more `mock.ts`).

### Raw data store + Store Data page
- New migration `20260606000000_shopify_raw_data.sql`: `shopify_stores`,
  `shopify_orders`, `shopify_products`, `shopify_customers` (all RLS-protected,
  idempotent upserts) + new `valuation_data` columns. Applied live.
- New page `/app/store-data` displays everything pulled (orders / products /
  customers / store metadata) with **Sync now** + auto-stale (>6h) refresh.
- Sidebar **Data Sources** is now an always-expanded parent: **Connections** +
  **Store Data**.
- Raw data is cached in `localStorage` (`exitecom_shopify_raw_v1`) for instant
  paint and zero-network warm loads. The Admin API token is **never** cached — it
  is lazily re-fetched from `shopify_stores` at sync time.
- Fixed a spurious "Failed to load live backend data" toast on login: raw-data
  loading is isolated in its own try/catch that degrades silently.

## 2026-06 — Auth, real data & cleanup

### Email OTP sign-up
- Sign-up now verifies the account with a **6-digit code emailed to the user** (instead of a magic link), then enters onboarding with a real session.
- Added a "Verify your email" code screen with **Resend** and **Use a different email**.
- Mounted global toast notifications (success / error / warning) — the app now gives feedback on every auth/onboarding action.
- Supabase config (dashboard/API): custom SMTP enabled, email OTP length set to 6, "Confirm signup" template sends `{{ .Token }}`.

### Real data only (no dummy/placeholder)
- New migration so sign-up seeds **only a user profile** — no more fake "NovaSkin Co." business/valuation/connections.
- Onboarding now **saves the user's answers to Supabase** (business profile) instead of faking it.
- Onboarding "Connect Data" step is **info-only** (Shopify + "Coming soon"); removed the fake "Connected" toggles.
- **Profile** page reads/saves the user's real Supabase data.
- Removed the mock-data fallback from the data layer; empty state is shown until real data exists.
- **Dashboard + all result pages are gated** behind "Connect Shopify" until a store is connected.
- Migration applied live to the hosted Supabase project.
- Doc: `docs/DATA-DISPLAY.md` (data contract + how/where results are shown).

### Data Sources page
- **Shopify** is the only active integration; everything else shows a **"COMING SOON"** badge.

### Cleanup & docs
- Removed the marketing landing page — `/` now redirects to `/signup`.
- Fixed all TypeScript errors and lint issues; removed dead assets and an unused component.
- Added `README.md`, `docs/ARCHITECTURE.md`, and `.env.example`.

## Known follow-ups
- [ ] Add an **auth guard** so `/app/*` and `/onboarding` redirect to `/login` when not signed in.
- [ ] Wire each gated result page to **real Shopify-derived data** when Shopify Connect is built (see `docs/DATA-DISPLAY.md` TODO list).
- [ ] Consider a transactional email provider (e.g. Resend) so emails send from `otp@exitecom.com` rather than the Gmail account.
