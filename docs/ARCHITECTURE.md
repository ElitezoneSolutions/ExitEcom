# ExitEcom — Architecture

This document explains how the app is wired together: rendering, routing, auth,
the data layer, the Shopify/Gemini pipeline, and SSR error handling. For setup
and a high-level overview, start with the root [`README.md`](../README.md).

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

> Note: route components currently render regardless of auth state (no global
> auth guard / `beforeLoad` redirect on `/app/*`). Auth gating is a known gap —
> add it in `app.tsx`'s `beforeLoad` if you need to enforce it.

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

This hook is the single source of truth for the founder's business data. It
returns `{ business, risks, actions, documents, loading, error, refetch,
updateBusiness, syncShopifyData }`.

**Initialisation (synchronous):** state is seeded from `localStorage` if present,
otherwise from `src/lib/mock.ts` (the "NovaSkin Co." demo dataset). This means
the UI always has data to render, even before any network call.

**Hydration (`fetchData`):** when Supabase is configured _and_ a user exists, it
loads the most recent business for `owner_id`, then its `valuation_data`,
`risks`, `actions`, and `documents`, and maps the snake_case DB columns onto the
camelCase `BusinessData` shape. Results are cached back to `localStorage`. On
error it toasts and falls back to the offline/local data.

**Writes:**

- `updateBusiness(partial)` — optimistic local update + `localStorage`, then (if
  live) persists to `businesses` and `valuation_data`.
- `syncShopifyData(report)` — applies a `NormalizedShopifyReport` to state and
  `localStorage`, then (if live) upserts `valuation_data` and **replaces** the
  `risks`/`actions` rows for the business.

Key TypeScript contracts (exported): `BusinessData`, `RiskItem`, `ActionItem`,
`DocumentItem`, `NormalizedShopifyReport`.

---

## 5. The Shopify → metrics pipeline (`src/lib/shopify.ts`)

`connectShopifyFn` is a TanStack **server function** (`POST`), so credentials and
the Gemini key stay on the server. Built with the current builder API:

```ts
createServerFn({ method: "POST" })
  .inputValidator((input: ConnectShopifyInput) => input)
  .handler(async ({ data }) => { /* ... */ });
```

Steps inside the handler:

1. **Sanitise** the shop domain (strip protocol, append `.myshopify.com`).
2. **Fetch** shop / orders / products from the Shopify Admin API
   (`2024-01`). **Sandbox mode** kicks in automatically when the domain or token
   contains `test`/`demo`/`sandbox`, _or_ if the real API call throws — it
   substitutes a high-fidelity simulated store (12 repeat customers, 5 SKUs).
3. **Condense** the raw data into compact summaries (`ShopSummary`,
   `OrderSummary[]`, `ProductSummary[]`).
4. **Normalise** to M&A metrics:
   - With a Gemini key → `gemini-2.5-flash` is prompted (as an "M&A advisor") to
     return strict JSON. The response is de-fenced and `JSON.parse`d.
   - Without a key → `getFallbackNormalization()` computes AOV, TTM revenue
     (extrapolated), repeat rate, product concentration, margins, exit score,
     valuation multiples, risks and actions deterministically.
5. **Return** `{ businessUpdate, risks[], actions[] }`, which the client passes to
   `useBusinessData.syncShopifyData()`.

The client caller (`routes/app.shopify-connect.tsx`) invokes it as
`connectShopifyFn({ data: { shopDomain, accessToken, industry } })`.

---

## 6. Data model (Supabase)

Defined in `supabase/migrations/`. Every table has **Row-Level Security** so a
user only ever sees rows tied to their own `auth.uid()`.

| Table            | Key                         | Notes                                                            |
| ---------------- | --------------------------- | ---------------------------------------------------------------- |
| `profiles`       | `id` → `auth.users.id`      | `full_name`. Self-scoped select/insert/update.                   |
| `businesses`     | `id` (uuid)                 | Owned by `owner_id`. Intake fields (industry, channel, age, …).  |
| `valuation_data` | `business_id` (1:1)         | Exit score, valuation range, multiples, KPIs, connected sources. |
| `risks`          | `id`, FK `business_id`      | severity + buyer-perspective narrative + recommendation.         |
| `actions`        | `id`, FK `business_id`      | priority, £ uplift, time, steps.                                 |
| `documents`      | `id`, FK `business_id`      | data-room document checklist state.                              |

RLS on the child tables (`valuation_data`/`risks`/`actions`/`documents`) is
enforced via an `exists (... where businesses.owner_id = auth.uid())` subquery.

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
  should degrade gracefully to mock data + `localStorage` when Supabase is absent.
- **Server-only secrets** (Shopify token, Gemini key) belong inside server
  functions / `process.env`, never in `VITE_`-prefixed client code (except the
  Supabase anon key, which is public by design).
- The deployed entry is `src/server.ts`; keep its catastrophic-error handling in
  sync with how the app surfaces failures.
