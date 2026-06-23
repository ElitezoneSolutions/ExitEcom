# Changes log

A simplified list of changes made to ExitEcom. Newest first.

## 2026-06-24 — Google Ads: never query a Manager (MCC) account for metrics

Fixed a Google Ads OAuth bug where connecting with a Manager (MCC) account
auto-selected the manager itself and then failed with a cryptic
`INVALID_ARGUMENT` (`REQUESTED_METRICS_FOR_MANAGER`) during data pull — a manager
serves no ads, so it has no metrics. (`src/lib/google.ts`.)

- **OAuth expansion.** `exchangeGoogleOAuthCodeFn` now expands a manager — _or any
  seed it can't positively confirm as a standalone account_ (introspection
  returned no usable customer row) — into its non-manager client accounts, so the
  MCC is never offered or auto-picked directly.
- **Fail fast on a manager.** `pull()` fetches the account first and throws a
  clear, actionable error if `customer.manager` is true, instead of letting the
  metrics queries reject with an opaque 400.
- **Better error hint.** Added `REQUESTED_METRICS_FOR_MANAGER` /
  `METRICS_INCOMPATIBLE_WITH_MANAGER` to `hintForCode` so any future occurrence
  reads "pick one of the ad accounts under this manager."

## 2026-06-22 — Super Admin Dashboard

Added a role-gated admin control panel at `/admin`, the first role concept in the
app.

- **Roles & access.** New `profiles.role` column (`'user' | 'superadmin'`, default
  `user`) + `public.is_superadmin()` helper. New migration
  `20260622000000_admin_roles.sql` (must be pushed live), which also seeds
  `iam@exitecom.com` as the first superadmin once that account exists. `useAuth`
  now exposes `role`; new `RequireSuperAdmin` guard bounces non-admins to
  `/dashboard`; the sidebar shows an **Admin** group only for superadmins.
- **Server-only cross-user reads.** All admin data goes through `createServerFn`
  handlers in `src/lib/admin/*` that call `requireSuperadmin()` first, then use a
  **service-role** Supabase client (`src/lib/admin/server.ts`) to bypass RLS. The
  service-role key is server-only (`SUPABASE_SERVICE_ROLE_KEY`, never `VITE_`).
  Connector access/refresh tokens are never returned to the client.
- **Modules.** Overview (deterministic platform analytics: users, signups,
  connector adoption, exit-score distribution), Users (search/sort/CSV, role
  change, password-reset email, delete), Documents (all bank-statement & P&L PDFs,
  signed-URL inline preview, verify/reject/pending status via new
  `document_reviews` table), and an Audit Log (every admin mutation → new
  `admin_audit_log` table, filterable + CSV export).
- **New env vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (see
  `docs/env-vars.md`).

## 2026-06-19 — Data pages design consistency

Unified the UI across all eight data pages (`store-data`,
`bank-statements-data`, `pl-data`, `meta-data`, `google-data`, `tiktok-data`,
`snapchat-data`, `ga4-data`) onto one design language. `store/meta/google/ga4`
were already the reference; the others were brought in line.

- **`tiktok-data` / `snapchat-data`** rebuilt to match the reference layout:
  descriptive `PageHeader` (account details moved into the metadata grid),
  header `Sync now` (`btn-primary`) + `Disconnect` (`variant="button"`) with a
  `Last synced` line, a 4-up account-metadata grid (`Field`), 4 at-a-glance
  `Count` cards (incl. blended CAC, replacing the old inline banner), underline
  tabs, and the shared `DataTable`. They now auto-resync when data is stale (6h)
  like the others, instead of only on first load. Snapchat keeps its
  account-level-spend-only monthly note.
- **`bank-statements-data` / `pl-data`** empty states now use the reference gate
  card (circle icon, `font-display` headline, accent CTA) with a `PageHeader`;
  the header action row matches (`Disconnect` `variant="button"` + primary
  `Upload more` + `Last updated` line).

## 2026-06-19 — "Continue with Google" button polish

Visual + UX upgrade to the OAuth button on `/login` and `/signup`
(`src/routes/signup.tsx`).

- Added the official multi-colour Google "G" logo (inline SVG).
- Dedicated `googleLoading` state: the button shows a spinner +
  "Connecting to Google…" while the redirect kicks off, independent of the
  email form's submit state; both buttons disable during either action.
- Added a real hover state to `btn-ghost-light` (`src/styles.css`) and a
  `not-allowed` cursor when disabled.

## 2026-06-19 — Settings page made functional

The Settings page (`src/routes/_app.settings.tsx`) was entirely non-functional —
every field was a static placeholder with no state, no save handler and no
backing store. It now reads and persists real data.

- **Profile tab** loads the current full name/email from the auth user and the
  timezone/currency from `profiles`. Save writes `full_name` to both the auth
  `user_metadata` (what the app reads for the owner's name) and the `profiles`
  row, persists timezone/currency, and triggers Supabase's email-change
  confirmation when the email is edited.
- **Notifications tab** binds the four toggles to `profiles.notification_prefs`
  (jsonb) and persists them.
- **Integrations tab** now links to the Data Sources page.
- **Security tab** — Change Password opens an inline form that calls
  `supabase.auth.updateUser({ password })`. **Two-factor authentication was
  removed.**
- Demo Mode (no Supabase) degrades gracefully with a non-persisting toast.
- Migration `20260619000000_profile_settings.sql` adds `timezone`, `currency`
  and `notification_prefs` to `profiles` (applied to the hosted project).

## 2026-06-19 — Google sign-in: onboarding routing + display name

Fixes two issues seen after a first "Continue with Google" sign-up: onboarding
was skipped (straight to the dashboard) and the owner's name was blank.

- **New users now reach onboarding wherever the OAuth round-trip lands.** The
  onboarding-vs-app decision moved into a shared `resolvePostAuthDestination()`
  (`src/components/auth/RouteGuards.tsx`), used by both `/auth-callback` and
  `RequireGuest`. So even if Supabase falls back to its Site URL (landing on a
  guest page instead of the callback), a profile-less user is still sent to
  `/onboarding` rather than bounced to `/dashboard`.
- **Display name now resolves for Google users.** `ownerName`
  (`useBusinessData`) falls back to `user_metadata.name` (Google's claim) when
  `full_name` is absent, so the dashboard greeting and sidebar show the name.

## 2026-06-19 — "Continue with Google" sign-in completed

The Google sign-in button on `/login` and `/signup` now drives a full OAuth
round-trip with proper landing logic.

- `signInWithGoogle(redirectTo?)` (`src/hooks/useAuth.tsx`) now passes an
  explicit `redirectTo` so Google returns to our own callback rather than the
  project's default Site URL.
- New public route `src/routes/auth-callback.tsx` resolves the Supabase session
  from the redirect, then routes: **new** Google users (no business profile) →
  `/onboarding`, **returning** users → their saved `redirect` target or
  `/dashboard`; denied/failed consent → `/login` with a toast.
- The user's intended destination (`?redirect=`) is carried through Google and
  honoured on return.
- **Supabase config required** (not code): enable the Google provider in
  Auth → Providers, and add `<app-origin>/auth-callback` (prod + localhost) to
  Auth → URL Configuration → Redirect URLs, or the `redirectTo` is rejected.

## 2026-06 — Ad-platform & analytics connectors

Real marketing data now feeds the Exit Score, beyond Shopify. Each connector
authenticates, pulls raw data, stores it (RLS-protected), and surfaces it on its
own data page; the figures flow into `src/lib/analytics.ts` via a shared
`adFeeds` pipeline (Meta / Google / TikTok / Snapchat) plus a separate GA4
traffic signal.

- **Meta Ads** (`src/lib/meta.ts`, migration `..._meta_raw_data.sql`) — spend,
  ROAS, per-campaign breakdown.
- **Google Ads** (`src/lib/google.ts`, `..._google_raw_data.sql` +
  `..._google_login_customer_id.sql`) — GAQL monthly + per-campaign; `cost_micros ÷ 1M`.
- **TikTok Ads** (`src/lib/tiktok.ts`, `..._tiktok_raw_data.sql`) — `Access-Token`
  header, code-`0` envelope, daily reports bucketed to months; in-app OAuth.
- **Snapchat Ads** (`src/lib/snapchat.ts`, `..._snapchat_raw_data.sql`) — OAuth
  with 1-hour tokens + auto-refresh. **Account-level stats expose only `spend`**,
  so the monthly series comes from account-level DAY spend (≤28-day, timezone-
  aligned windows) and conversions/value come from per-campaign TOTAL stats; the
  monthly table shows "—" for per-month conversions. The real period conversion
  value reaches the score via the feed's `conversionValueTotal`. See
  [snapchat-ads-setup.md](snapchat-ads-setup.md).
- **GA4** (`src/lib/ga4.ts`, `..._ga4_raw_data.sql`) — web-analytics traffic
  signal (session growth + channel concentration), **not** an ad feed (no
  spend/ROAS). Pulls full property history; the data page has a year filter.
- **Bank statements** (`..._bank_statements.sql` + `..._bank_statements_storage.sql`)
  and **P&L upload** (`..._pl_upload.sql`) — verified-financials inputs.

### Scoring & confidence updates (`src/lib/analytics.ts`)
- **Marketing Efficiency & Stability** (dim 3) now uses real per-platform
  ROAS + spend-stability when any ad feed is connected (`adSpendVerified`),
  falling back to the repeat-rate proxy otherwise.
- **Growth Trajectory** (dim 8) folds in GA4 session growth only when ≥6 months
  of history exist; **Platform & Channel Risk** (dim 9) scores GA4 traffic-channel
  concentration when a real channel mix is present.
- **Data Confidence** gains +10 each for a verified ad feed, a connected GA4
  property, bank statements on file, and a P&L on file (still capped at 95).

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
- New page `/store-data` displays everything pulled (orders / products /
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
- [ ] Add an **auth guard** so `/*` and `/onboarding` redirect to `/login` when not signed in.
- [ ] Wire each gated result page to **real Shopify-derived data** when Shopify Connect is built (see `docs/DATA-DISPLAY.md` TODO list).
- [ ] Consider a transactional email provider (e.g. Resend) so emails send from `otp@exitecom.com` rather than the Gmail account.
