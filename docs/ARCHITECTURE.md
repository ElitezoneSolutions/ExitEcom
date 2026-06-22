# ExitEcom — Architecture

This document explains how the app is wired together: rendering, routing, auth,
the data layer, the Shopify sync pipeline, the deterministic analytics engine,
and SSR error handling. For setup and a high-level overview, start with the root
[`README.md`](../README.md).

> **Design rule (2026-06):** sync and reporting are decoupled. Connecting a store
> only authenticates, pulls, and **stores raw data** — it never produces a report.
> Reports run **on demand** and every number is computed deterministically in
> `src/lib/analytics.ts`. Gemini (`src/lib/ai.ts`) is optional and only polishes
> the _prose_ of risk/action copy — it never produces a number.

---

## 1. Rendering & request lifecycle

ExitEcom is server-rendered via **TanStack Start** on top of **Nitro**.

- **`src/start.ts`** — creates the Start instance and installs a server
  `requestMiddleware` that catches unhandled errors and returns a branded 500
  page (`renderErrorPage()`), while re-throwing framework redirects/`statusCode`
  errors so they behave normally.
- **`src/server.ts`** — the deployed `fetch` entry (referenced by
  `wrangler.jsonc` and the Nitro build). It wraps the TanStack server entry and
  calls `normalizeCatastrophicSsrResponse()`. This exists because **h3** (Nitro's
  HTTP layer) swallows in-handler throws into an opaque
  `{"unhandled":true,"message":"HTTPError"}` 500 JSON body that a normal
  `try/catch` never sees. The wrapper detects that exact body shape and swaps in
  the branded error page.
- **`src/lib/error-capture.ts`** — registers global `error` /
  `unhandledrejection` listeners that stash the _real_ error (with stack) for up
  to 5 seconds, so `server.ts` can log the genuine cause even after h3 has
  flattened it.
- **`src/router.tsx`** — `getRouter()` builds the router with a fresh
  `QueryClient` in context and the generated `routeTree`.

```
Request ─▶ src/server.ts ─▶ TanStack server entry ─▶ start.ts middleware ─▶ route
                │                                                              │
                └──◀── normalizeCatastrophicSsrResponse / branded 500 ◀────────┘
```

---

## 2. Routing

File-based routing (`src/routes/`), compiled into `src/routeTree.gen.ts` by the
TanStack Router plugin. **Never edit `routeTree.gen.ts` by hand** — it
regenerates on dev/build.

- Flat-dotted names map to nested paths: `_app.dashboard.tsx` → `/dashboard`.
- **`_app.tsx`** is the authenticated layout (sidebar + `<Outlet/>`). The `_app`
  prefix makes it a **pathless** layout route — it contributes no URL segment, so
  its children sit at the root (`/dashboard`, `/profile`, …) while still rendering
  inside it.
- **`__root.tsx`** is the document shell: `<html>`/`<head>`, SEO meta/OG tags,
  the `QueryClientProvider` + `AuthProvider`, and the global 404 / error UI.
- **`index.tsx`** is a pure redirect (`beforeLoad → redirect({ to: "/signup" })`).
  There is intentionally no marketing landing page in the app.

> Auth gating: `_app.tsx` wraps the shared authenticated layout in `<RequireAuth>`
> (`src/components/auth/RouteGuards.tsx`), so every page inside it is guarded at
> once. The guard shows a loader while auth resolves, redirects unauthenticated
> visitors to `/login` (remembering their target via a `redirect` search param),
> and reacts to mid-session expiry. Public-only pages use `<RequireGuest>`.
>
> Inside the guard, `_app.tsx` also mounts `<BusinessDataProvider>` so the Sidebar
> and the routed page share a single business-data instance (one backend
> hydration per session, not one per consuming component).

---

## 3. Authentication (`src/hooks/useAuth.tsx`)

A single `AuthProvider` exposes `{ user, session, loading, isDemoMode, role,
signUp, signIn, signOut, signInWithGoogle }` via context. `role`
(`'user' | 'superadmin' | null`) gates the Super Admin Dashboard (see §6a).

It has **two implementations behind one interface**, switched by
`isSupabaseConfigured`:

- **Live:** delegates to `supabase.auth.*` and subscribes to
  `onAuthStateChange`.
- **Demo:** fabricates a `User`/`Session` (`getMockUser`/`getMockSession`) and
  persists a minimal `{ email, fullName }` record in `localStorage` under
  `exitecom_demo_user`. Google sign-in is mocked too.

The shared auth UI is `SplitAuth` (exported from `routes/signup.tsx`); `login.tsx`
reuses it with `mode="login"`.

---

## 4. Data layer (`src/hooks/useBusinessData.ts`)

This hook is the single source of truth for the founder's business data and the
raw Shopify dataset. It returns `{ business, risks, actions, documents, loading,
error, isShopifyConnected, store, orders, products, customers, lastSyncedAt,
canResync, refetch, updateBusiness, syncStore, resyncStore, saveComputedReport }`.

**Initialisation (synchronous):** state is seeded from `localStorage` if present,
otherwise from an `EMPTY_BUSINESS` empty state. There is **no mock fallback** — if
there's no real data, the UI shows empty/gated states. The raw Shopify arrays
(`store`, `orders`, `products`, `customers`, `lastSyncedAt`) are seeded from a
dedicated cache key (`exitecom_shopify_raw_v1`).

**Hydration (`fetchData`):** when Supabase is configured _and_ a user exists, it
loads the most recent business for `owner_id`, then its `valuation_data`, `risks`,
`actions`, and `documents`, maps snake_case → camelCase, and caches to
`localStorage`. It then calls `loadShopifyData(businessId)` in an **isolated**
try/catch that degrades silently (console.warn, no toast) — so a not-yet-connected
store or a missing table never surfaces a scary "failed to load" toast on login.

**Raw Shopify data (`loadShopifyData`):**

- **Warm cache** → serves `store` + `lastSyncedAt` + arrays from `localStorage`
  and returns with **zero network**.
- **Cold** → reads `shopify_stores` (metadata + credentials) and the three heavy
  tables, then writes the cache. No store row → clears state + cache.

**Writes:**

- `updateBusiness(partial)` — optimistic local update + `localStorage`, then (if
  live) persists to `businesses` and `valuation_data`.
- `syncStore(shopDomain, accessToken, opts?)` — calls `syncShopifyStoreFn`, sets
  state optimistically, **upserts** raw rows into `shopify_stores/_orders/
  _products/_customers` (idempotent on the UNIQUE Shopify-ID keys), and refreshes
  the cache. Persistence is wrapped so DB errors surface as clear messages
  (`describeDbError` detects a missing migration).
- `resyncStore(incremental?)` — re-syncs an already-connected store. Lazily fetches
  the stored `access_token` from `shopify_stores` only when needed (the token is
  never kept in `localStorage`).
- `saveComputedReport(report)` — writes a computed snapshot to `valuation_data`
  (upsert) and **replaces** the `risks`/`actions` rows. Used by `useReport`.

`describeDbError` converts Postgrest errors (which are not `Error` instances) into
clear `Error`s and detects a missing migration (code `PGRST205` / "could not find
the table") so the connect UI can tell the user to apply the migration.

Key TypeScript contracts (exported): `BusinessData`, `RiskItem`, `ActionItem`,
`DocumentItem`.

### 4a. On-demand reports (`src/hooks/useReport.ts`)

`useReport` wraps `useBusinessData`, assembles an `AnalyticsInput` from the raw
data, and exposes `{ ...bd, input, hasData, hasRun, report, computing, run }`.

- `hasRun` is true once a snapshot exists (`business.exitScore > 0` or any risks).
- `report` is recomputed via `computeFullReport(input)` whenever there's data and
  a report has been run (or was just run this session).
- `run()` computes the full report deterministically and persists it via
  `saveComputedReport`. The four report pages call this behind a "Run" / "Re-compute"
  button — nothing is computed until the user asks.

---

## 5. The Shopify sync pipeline (`src/lib/shopify.ts`)

`syncShopifyStoreFn` is a TanStack **server function** (`POST`), so the Admin API
token stays on the server. It **only pulls raw data** — no normalization, no
Gemini, no report. Built with the current builder API:

```ts
createServerFn({ method: "POST" })
  .inputValidator((input: ShopifySyncInput) => input)
  .handler(async ({ data }) => { /* ... */ });
```

Steps inside the handler:

1. **Sanitise** the shop domain (strip protocol, append `.myshopify.com`).
2. **Validate** the credentials via `GET /admin/api/2024-01/shop.json`. On a real
   domain a failure now **throws a real error** (401/403 messaging) — the old
   silent sandbox-masking-on-failure is gone. The sandbox generator is used
   **only** for explicit `test`/`demo`/`sandbox` creds, so local demos still work.
3. **Paginate** orders, products and customers via the cursor in the
   `Link: rel="next"` header (`limit=250`), capped at `ORDER_CAP=5000`,
   `PRODUCT_CAP=2000`, `CUSTOMER_CAP=5000`. Incremental refresh passes
   `created_at_min = sinceISO`. `attachLastOrderDates` derives each customer's
   last-order date from the orders.
4. **Return** raw `{ shop, orders[], products[], customers[], counts, capped,
   sandbox }` to the client. Persistence happens in the hook (`syncStore`), which
   holds the authed Supabase session — a server-side anon client would be blocked
   by RLS.

The deterministic math that used to live here (`getFallbackNormalization`) has
moved to the analytics engine (§5a). Exported types: `RawShopifyStore`,
`RawShopifyOrder`, `RawShopifyProduct`, `RawShopifyCustomer`, `RawLineItem`,
`ShopifySyncInput`, `ShopifySyncResult`.

The client caller (`routes/app.shopify-connect.tsx`) calls the hook's
`syncStore(shopDomain, accessToken)`, which invokes the server fn and persists the
result. The success screen shows **counts only** — never a score or valuation.

---

## 5a. Deterministic analytics engine (`src/lib/analytics.ts`)

Pure, synchronous functions over the **full** raw dataset (real line items, all
customers) — no AI, no randomness, fully auditable. Re-running the same data
always yields the same numbers.

- `computeMetrics(input)` → revenue TTM (trailing 365d, annualised fallback),
  12-month revenue buckets, AOV, repeat rate, per-product revenue +
  `topProductShare` (from real line items), industry margins, COGS, gross profit,
  EBITDA, SDE (= EBITDA × 1.25), opex, business age, growth rate.
  - It also consumes **optional ad feeds** (Meta/Google/TikTok/Snapchat) and an
    **optional GA4 traffic signal**. The four ad feeds are each an
    `AnalyticsAdsFeed` (`{ monthly, campaigns, conversionValueTotal? }`) collected
    into an `adFeeds` array; they drive **Marketing Efficiency** (dim 3), **Growth**
    (dim 8) and **Platform/Channel Risk** (dim 9), and raise **Data Confidence**.
    GA4 (`AnalyticsGA4`: monthly traffic/conversion series + per-channel breakdown)
    is **not** an ad feed — it carries no spend/ROAS, so it feeds a separate session
    growth + traffic-channel-concentration signal and its own Data Confidence bump.
- `computeExitScore(metrics)` → score across **9 dimensions** summing to 100, a
  `scoreTier`, and a `dataConfidence`.
- `computeValuation(metrics, exitScore)` → low / mid / high / optimised values,
  multiples, value gap, positive/negative drivers.
- `computeRisks(metrics, valuation)` → `RiskItem[]` (deterministic, templated copy).
- `computeOptimization(metrics, valuation)` → `ActionItem[]`.
- `computeFullReport(input)` → `{ metrics, score, valuation, risks, actions,
  businessUpdate }` — the single entry point used by `useReport`.

### Optional AI copy-polish (`src/lib/ai.ts`)

`enrichRiskCopyFn` is the **only** place AI is used. It is a server function that
takes deterministically-computed risk copy and asks `gemini-2.5-flash` to rewrite
**only** the `description`/`recommendation` _prose_ (explicitly instructed not to
change any number). The key is read via `process.env.GEMINI_API_KEY` (server-only;
**never** `VITE_`-prefixed). If the key is absent or anything fails, it returns the
original text unchanged (`passthrough`). Numbers never pass through here.

---

## 5b. The ad-platform & analytics connectors

The Shopify pipeline (§5) is the template for every other data source. Each
connector is its own `src/lib/<platform>.ts` exposing one or more
`createServerFn`s that **only authenticate, pull raw data, and return it** — never
compute a score. A connector authenticates via OAuth (a real in-app flow whose
App ID/secret live in this app's server env, redirecting to a route on this app's
own origin) **and/or** a direct-token path (the user pastes a token they generated
themselves). The server fn returns the raw `{ account, monthly[], campaigns[] }`
to the connect-page hook, which holds the authed Supabase session and persists the
rows into RLS-protected per-business tables (a server-side anon client would be
blocked by RLS, exactly as in §5). The stored figures then feed the Exit Score on
demand via `useReport` and surface on the per-platform data pages.

Per-platform key quirks (full details in each `docs/*-setup.md`):

- **Meta** (`src/lib/meta.ts`, [`docs/meta-ads-setup.md`](./meta-ads-setup.md)) —
  Graph API uses **query-param auth** (`access_token=…`); conversions are read
  from `actions`/`action_values` purchase-style entries.
- **Google Ads** (`src/lib/google.ts`,
  [`docs/google-ads-setup.md`](./google-ads-setup.md)) — spend comes back as
  `cost_micros`, so divide by **1,000,000**; needs three server secrets and an
  approved developer token, plus a per-connection `login_customer_id` for MCC
  hierarchies.
- **TikTok** (`src/lib/tiktok.ts`,
  [`docs/tiktok-ads-setup.md`](./tiktok-ads-setup.md)) — auth is an
  **`Access-Token:` header** (not Bearer) and the response is a **`{ code: 0, data }`
  envelope** (check `code`, not HTTP status); there is **no refresh token** (the
  access token is long-lived), so nothing to refresh.
- **Snapchat** (`src/lib/snapchat.ts`,
  [`docs/snapchat-ads-setup.md`](./snapchat-ads-setup.md)) — standard
  **`Bearer` auth** but access tokens expire in **1 hour**, so a `refresh_token` is
  stored and used on 401 (refreshed creds are returned for the caller to persist);
  the ad account exposes **only spend**, so conversions come from **per-campaign
  TOTAL stats** (one request per campaign).
- **GA4** (`src/lib/ga4.ts`, [`docs/ga4-setup.md`](./ga4-setup.md)) — a
  **web-analytics** source, not an ad platform (no spend/ROAS). It reuses the
  Google Ads OAuth client (same GCP project) with the read-only Analytics scope and
  a GA4-specific redirect URI, and pulls a monthly traffic/conversion series plus a
  per-channel breakdown that feeds the **traffic** signal (see §5a).

> The P&L and bank-statement uploads follow the same store-raw-only rule, but their
> source is an uploaded PDF rather than an API. The PDFs live in **private,
> owner-scoped Supabase Storage buckets** (`bank-statements`, `pl-uploads`); the
> parsed monthly figures land in the tables below.

---

## 6. Data model (Supabase)

Defined in `supabase/migrations/`. Every table has **Row-Level Security** so a
user only ever sees rows tied to their own `auth.uid()`.

| Table               | Key                                | Notes                                                            |
| ------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `profiles`          | `id` → `auth.users.id`             | `full_name`. Self-scoped select/insert/update.                   |
| `businesses`        | `id` (uuid)                        | Owned by `owner_id`. Intake fields (industry, channel, age, …).  |
| `valuation_data`    | `business_id` (1:1)                | Computed snapshot: exit score, valuation range, multiples, KPIs, connected sources, `score_breakdown`/`revenue_monthly` jsonb, `revenue_ttm`, `ebitda`, `score_tier`. |
| `risks`             | `id`, FK `business_id`             | severity + buyer-perspective narrative + recommendation.         |
| `actions`           | `id`, FK `business_id`             | priority, £ uplift, time, steps.                                 |
| `documents`         | `id`, FK `business_id`             | data-room document checklist state.                              |
| `shopify_stores`    | `business_id` (PK/FK)              | One row per business: `shop_domain`, `access_token`, `name`, `currency`, `country`, `plan`, `shop_created_at`, `last_synced_at`. |
| `shopify_orders`    | `business_id` + UNIQUE Shopify ID  | Raw orders: total, currency, dates, financial status, customer id, `line_items` jsonb. |
| `shopify_products`  | `business_id` + UNIQUE Shopify ID  | Raw products: title, type, vendor, status, `variants` jsonb.     |
| `shopify_customers` | `business_id` + UNIQUE Shopify ID  | Raw customers: email, name, `orders_count`, `total_spent`, last-order date. |
| `meta_accounts`     | `business_id` (PK/FK)              | One Meta ad account per business: id, name, currency, timezone, status, token. |
| `meta_monthly_insights` | `business_id` + UNIQUE `month`  | Monthly Meta spend/impressions/clicks/conversions series.        |
| `meta_campaigns`    | `business_id` + UNIQUE `meta_campaign_id` | Per-campaign Meta breakdown.                            |
| `google_accounts`   | `business_id` (PK/FK)              | One Google Ads account: `customer_id`, name, currency, refresh token, `login_customer_id`. |
| `google_monthly_insights` | `business_id` + UNIQUE `month` | Monthly Google Ads spend (from `cost_micros`)/clicks/conversions series. |
| `google_campaigns`  | `business_id` + UNIQUE `google_campaign_id` | Per-campaign Google Ads breakdown.                   |
| `tiktok_accounts`   | `business_id` (PK/FK)              | One TikTok account: `advertiser_id`, name, currency, timezone, status, token. |
| `tiktok_monthly_insights` | `business_id` + UNIQUE `month` | Monthly TikTok spend/impressions/clicks/conversions series.      |
| `tiktok_campaigns`  | `business_id` + UNIQUE `tiktok_campaign_id` | Per-campaign TikTok breakdown.                       |
| `snapchat_accounts` | `business_id` (PK/FK)              | One Snapchat account: ad-account id, name, currency, timezone, status, access + refresh tokens. |
| `snapchat_monthly_insights` | `business_id` + UNIQUE `month` | Monthly Snapchat spend (account-level) + conversions series.    |
| `snapchat_campaigns`| `business_id` + UNIQUE `snapchat_campaign_id` | Per-campaign Snapchat breakdown (source of conversions). |
| `ga4_accounts`      | `business_id` (PK/FK)              | One GA4 property: `property_id`, name, currency, timezone, refresh token. |
| `ga4_monthly_insights` | `business_id` + UNIQUE `month`  | Monthly GA4 traffic/sessions/conversions/revenue series.         |
| `ga4_channels`      | `business_id` + UNIQUE `channel`  | Per-channel GA4 traffic breakdown.                               |
| `bank_statement_files` | `id`, FK `business_id`          | Uploaded bank-statement PDF metadata + `file_path` into the `bank-statements` Storage bucket. |
| `bank_statement_monthly` | `business_id` + UNIQUE `month` | Parsed monthly inflow/outflow figures from bank statements.      |
| `pl_files`          | `id`, FK `business_id`             | Uploaded P&L PDF metadata + path into the `pl-uploads` Storage bucket. |

The `valuation_data` / `risks` / `actions` tables store **computed report
snapshots**; the `shopify_*`, `<platform>_*`, `ga4_*` and upload tables store the
**raw pulled/parsed data** that those reports are computed from. Per-product
revenue, repeat rates, concentration and TTM are always **derived at compute time**
from the raw rows, never denormalised.

RLS on every child table (`valuation_data`/`risks`/`actions`/`documents`, all four
`shopify_*` tables, and the per-platform `meta_*`/`google_*`/`tiktok_*`/
`snapchat_*`/`ga4_*` and `bank_statement_*`/`pl_files` tables) is enforced via an
`exists (... where businesses.owner_id = auth.uid())` subquery so each row stays
scoped to the owning business. The UNIQUE keys (`shopify_*_id`, `month`,
`<platform>_campaign_id`, `channel`) make re-syncs idempotent upserts. The
`bank-statements` and `pl-uploads` Storage buckets are private with owner-scoped
path policies on `storage.objects`.

> The raw tables were added across `supabase/migrations/` — the
> `shopify_raw_data` migration plus one per platform
> (`*_meta_raw_data`, `*_google_raw_data`, `*_tiktok_raw_data`,
> `*_snapchat_raw_data`, `*_ga4_raw_data`) and the upload migrations
> (`*_bank_statements`, `*_bank_statements_storage`, `*_pl_upload`). The original
> `shopify_raw_data` migration also extended `valuation_data` with the new columns
> above (all via `add column if not exists`). **Migrations must be applied to the
> live hosted project** — see the standing note in memory.

---

## 6a. Super Admin Dashboard (`/admin`, `src/lib/admin/*`)

The admin panel is the one place that deliberately reads **across** users, so it
sits outside the per-owner RLS model rather than poking holes in it.

- **Role.** `profiles.role` (`'user' | 'superadmin'`, default `user`) is the only
  role concept in the app. `useAuth` resolves the caller's own role via the anon
  client (RLS already lets a user read their own profile). `RequireSuperAdmin`
  (in `RouteGuards.tsx`) gates the `_app.admin.*` routes; the sidebar's **Admin**
  group renders only for superadmins.
- **Service-role path.** Every admin read/write is a `createServerFn` in
  `src/lib/admin/{users,documents,analytics}.ts`. Each handler calls
  `requireSuperadmin(accessToken)` (verifies the JWT → checks `profiles.role`)
  **first**, then uses the service-role client from `src/lib/admin/server.ts` to
  bypass RLS. The service-role key is read from `process.env` only
  (`SUPABASE_SERVICE_ROLE_KEY`) — never `VITE_`-prefixed, never imported into
  client code. Connector tokens are never selected/returned; only status fields.
- **Document preview.** Bank-statement/P&L PDFs live in the private
  `bank-statements`/`pl-uploads` buckets, so the admin viewer mints a 1-hour
  signed URL via the service client (`getDocumentUrlFn`).
- **Determinism & audit.** Platform analytics are plain SQL aggregations (no LLM).
  Every mutation writes to `admin_audit_log` via `logAdminAction`. Review
  decisions persist in `document_reviews`. Both tables + the `role` column ship in
  `20260622000000_admin_roles.sql`, which also seeds the first superadmin —
  **must be pushed to the live project.**

---

## 7. Styling & components

- **Tailwind CSS v4** with design tokens declared as CSS variables in
  `src/styles.css` (e.g. `--bg-primary`, `--accent`, `--text-secondary`,
  `--border-warm`). Prefer these tokens over hard-coded colours.
- **`components/ui/`** — shadcn/ui primitives (Radix). These intentionally
  co-export variant helpers (`buttonVariants`, etc.) alongside components, which
  is why ESLint emits `react-refresh/only-export-components` _warnings_ for them.
  That's the upstream shadcn convention and is safe to leave.
- **`components/ex/`** — product-specific presentational pieces (`Logo`,
  `PageHeader`, `ScoreRing`, `ProgressBar`, `Sidebar`, `RiskCard`,
  `ActionCard`, `StatusBadge`, `SectionLabel`).

---

## 8. Conventions & gotchas

- **`routeTree.gen.ts` is generated** — don't hand-edit; add a route file and let
  the plugin regenerate it.
- **`vite.config.ts`** must not re-declare the plugins bundled by
  `@lovable.dev/vite-tanstack-config` (TanStack Start, React, Tailwind,
  tsconfig-paths, env injection) — duplicates break the build.
- **Demo Mode is a first-class path**, not an error state. New data features
  should degrade gracefully to an empty state + `localStorage` when Supabase is
  absent — **not** to mock data (the live data layer no longer imports `mock.ts`).
- **All numbers are deterministic.** Valuation, score and risk figures are
  computed in `src/lib/analytics.ts` and must stay auditable. **Never** route a
  number through an LLM. Gemini (`src/lib/ai.ts`) is **optional and cosmetic only**
  — it rewrites risk/action _prose_ and nothing else. The app is fully functional
  with no Gemini key (copy falls back to deterministic templates).
- **Server-only secrets** (Shopify token, Gemini key) belong inside server
  functions / `process.env`, never in `VITE_`-prefixed client code (except the
  Supabase anon key, which is public by design). In particular **never set
  `VITE_GEMINI_API_KEY`** — it would inline the key into the browser bundle. The
  Shopify Admin token is also kept out of `localStorage`; it lives only in the
  RLS-protected `shopify_stores` row.
- The deployed entry is `src/server.ts`; keep its catastrophic-error handling in
  sync with how the app surfaces failures.
