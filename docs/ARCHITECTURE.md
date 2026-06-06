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

- Flat-dotted names map to nested paths: `app.dashboard.tsx` → `/app/dashboard`.
- **`app.tsx`** is the authenticated layout (sidebar + `<Outlet/>`). All
  `/app/*` pages render inside it.
- **`__root.tsx`** is the document shell: `<html>`/`<head>`, SEO meta/OG tags,
  the `QueryClientProvider` + `AuthProvider`, and the global 404 / error UI.
- **`index.tsx`** is a pure redirect (`beforeLoad → redirect({ to: "/signup" })`).
  There is intentionally no marketing landing page in the app.

> Auth gating: `app.tsx` wraps the shared `/app` layout in `<RequireAuth>`
> (`src/components/auth/RouteGuards.tsx`), so every `/app/*` page is guarded at
> once. The guard shows a loader while auth resolves, redirects unauthenticated
> visitors to `/login` (remembering their target via a `redirect` search param),
> and reacts to mid-session expiry. Public-only pages use `<RequireGuest>`.
>
> Inside the guard, `app.tsx` also mounts `<BusinessDataProvider>` so the Sidebar
> and the routed page share a single business-data instance (one backend
> hydration per session, not one per consuming component).

---

## 3. Authentication (`src/hooks/useAuth.tsx`)

A single `AuthProvider` exposes `{ user, session, loading, isDemoMode, signUp,
signIn, signOut, signInWithGoogle }` via context.

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

The `valuation_data` / `risks` / `actions` tables store **computed report
snapshots**; the `shopify_*` tables store the **raw pulled data** that those
reports are computed from. Per-product revenue, repeat rates, concentration and
TTM are always **derived at compute time** from the raw rows, never denormalised.

RLS on every child table (`valuation_data`/`risks`/`actions`/`documents` and all
four `shopify_*` tables) is enforced via an
`exists (... where businesses.owner_id = auth.uid())` subquery. The UNIQUE
`(business_id, shopify_*_id)` keys make re-syncs idempotent upserts.

> The raw tables were added in `supabase/migrations/20260606000000_shopify_raw_data.sql`,
> which also extended `valuation_data` with the new columns above (all via
> `add column if not exists`). **Migrations must be applied to the live hosted
> project** — see the standing note in memory.

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
