# ExitEcom

**Pre-exit intelligence for e-commerce founders.** ExitEcom is the operating
system founders use _before_ selling their business: it produces an **Exit
Readiness Score**, a buyer-grade **valuation range**, a prioritised
**optimization plan**, and a **risk scan** — all computed **deterministically**
from real store data (via Shopify) and normalised into M&A-ready financials.

Connecting a store **only authenticates, pulls, and stores raw data** — it never
auto-generates a report. The four reports run **on demand** and every number they
produce is computed in auditable code (`src/lib/analytics.ts`), not by an LLM.

This repository is a server-rendered React app built on **TanStack Start**.

---

## Tech stack

| Concern            | Choice                                                          |
| ------------------ | -------------------------------------------------------------- |
| Framework / SSR    | [TanStack Start](https://tanstack.com/start) (+ TanStack Router) |
| UI                 | React 19, Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com) (Radix) |
| Data fetching      | TanStack Query                                                 |
| Auth & database    | [Supabase](https://supabase.com) (Postgres + Auth + RLS)       |
| AI / intelligence  | Google Gemini (`@google/generative-ai`) — **optional, cosmetic copy only** (never numbers) |
| Charts / motion    | Recharts, Framer Motion                                         |
| Build / deploy     | Vite 7, Nitro → Vercel (Cloudflare-compatible)                 |
| Language / tooling | TypeScript, ESLint, Prettier                                   |

> Vite config lives behind `@lovable.dev/vite-tanstack-config`, which preloads
> the TanStack Start, React, Tailwind, tsconfig-paths and env plugins. **Do not
> re-add those plugins** in `vite.config.ts` or the build breaks with duplicates.

---

## Quick start

```bash
# 1. Install (the lockfiles are bun.lock + package-lock.json; npm works fine)
npm install

# 2. Configure environment (see below). Without it, the app runs in Demo Mode.
cp .env.example .env   # then fill in your values

# 3. Run the dev server
npm run dev            # http://localhost:8080

# 4. Production build (Vercel/Nitro output)
npm run build
npm run preview
```

The app **boots straight into `/signup`** — there is no marketing landing page.
`/` redirects to `/signup`.

### Scripts

| Command          | What it does                                  |
| ---------------- | --------------------------------------------- |
| `npm run dev`    | Vite dev server with HMR                      |
| `npm run build`  | Production build (`NITRO_PRESET=vercel`)      |
| `npm run preview`| Preview the production build locally          |
| `npm run lint`   | ESLint over the repo                          |
| `npm run format` | Prettier write over the repo                  |

---

## Environment variables

Create a `.env` file in the project root:

| Variable                 | Required | Purpose                                                                 |
| ------------------------ | -------- | ----------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | No\*     | Supabase project URL. Exposed to the client.                            |
| `VITE_SUPABASE_ANON_KEY` | No\*     | Supabase anon key. Exposed to the client.                               |
| `GEMINI_API_KEY`         | No       | **Server-side only.** Optional cosmetic AI: polishes the _prose_ of risk/action copy. Never touches numbers. |

\* **Demo Mode:** if Supabase vars are missing or left as placeholders, the app
runs against `localStorage` only (auth is mocked; see
[Operating modes](#operating-modes)).

> **Never set `VITE_GEMINI_API_KEY`.** The `VITE_` prefix inlines the value into
> the browser bundle and would leak the key publicly. The key is read **only**
> via `process.env.GEMINI_API_KEY` inside a server function (`src/lib/ai.ts`).
> Without the key, risk/action copy falls back to deterministic templates and the
> app works fully. **All valuation/score/risk numbers are deterministic and never
> depend on Gemini.**

---

## Operating modes

ExitEcom is designed to run end-to-end with **zero backend configured**, then
progressively light up as you add credentials.

1. **Demo / Fallback mode** (`isSupabaseConfigured === false`)
   - Auth is mocked: sign up / sign in / Google all create a fake user persisted
     in `localStorage` (`exitecom_demo_user`).
   - There is **no seeded sample business** — the user starts from an empty state
     and onboards/connects to populate real data. State is cached to
     `localStorage`.

2. **Live mode** (Supabase configured)
   - Real Supabase Auth (email OTP sign-up + Google OAuth).
   - Business / valuation / risk / action / document rows and the raw Shopify
     tables are read from and written to Postgres, scoped per-user by Row-Level
     Security.
   - Raw Shopify data is also cached to `localStorage` for instant paint and to
     avoid re-fetching on every page load (see
     [How the data flows](#how-the-data-flows)).

The switch is centralised in `src/lib/supabase.ts` (`isSupabaseConfigured`).

> `src/lib/mock.ts` is **no longer the data source.** It survives only as
> scaffolding for three not-yet-wired legacy pages (investment memo, financial
> normalizer, data room) and a couple of currency formatters. The live data layer
> never imports it. See [`docs/DATA-DISPLAY.md`](docs/DATA-DISPLAY.md).

---

## Project structure

```
src/
├── routes/                 # File-based routes (TanStack Router)
│   ├── __root.tsx          # Root shell: <html>, head/meta, providers, error/404 UI
│   ├── index.tsx           # "/" → redirects to /signup
│   ├── signup.tsx          # /signup  (exports the shared <SplitAuth> form)
│   ├── login.tsx           # /login   (reuses <SplitAuth mode="login">)
│   ├── onboarding.tsx      # /onboarding — 4-step business intake wizard
│   ├── app.tsx             # /app layout shell (sidebar + <Outlet/>)
│   └── app.*.tsx           # Authenticated app pages (see Routes below)
├── components/
│   ├── ex/                 # ExitEcom-specific presentational components
│   └── ui/                 # shadcn/ui primitives (Radix-based)
├── hooks/
│   ├── useAuth.tsx         # Auth context: real Supabase OR mocked demo auth
│   ├── useBusinessData.ts  # Loads/saves business + valuation + risks + actions
│   │                       #   + raw Shopify data; localStorage cache; sync/resync
│   ├── useReport.ts        # On-demand report: compute via analytics.ts + persist
│   └── use-mobile.tsx
├── lib/
│   ├── supabase.ts         # Supabase client + isSupabaseConfigured flag
│   ├── shopify.ts          # `syncShopifyStoreFn` server fn: pulls raw Shopify data
│   ├── analytics.ts        # Deterministic engine: metrics, score, valuation, risks
│   ├── ai.ts               # OPTIONAL Gemini copy-polish (prose only, never numbers)
│   ├── mock.ts             # Legacy scaffolding for 3 unwired pages + formatters
│   ├── error-capture.ts    # Out-of-band SSR error capture
│   ├── error-page.ts       # Branded 500 HTML page
│   └── utils.ts            # cn() + currency formatters + misc helpers
├── server.ts               # SSR fetch entry; normalises catastrophic SSR errors
├── start.ts                # TanStack Start instance + error middleware
├── router.tsx              # Router factory (QueryClient context)
├── routeTree.gen.ts        # AUTO-GENERATED route tree — do not edit by hand
└── styles.css              # Tailwind v4 + design tokens (CSS variables)

supabase/
├── config.toml
└── migrations/             # Schema + Row-Level Security policies
```

### Routes

| Path                      | Page                                                    |
| ------------------------- | ------------------------------------------------------- |
| `/` → `/signup`           | Redirect (no landing page)                              |
| `/signup`, `/login`       | Split-screen auth (`SplitAuth`)                         |
| `/onboarding`             | 4-step intake wizard; seeds a business in Supabase      |
| `/app/dashboard`          | Overview / home                                         |
| `/app/profile`            | Business Profile                                        |
| `/app/data-sources`       | Connections — Shopify / Meta / Google / uploads         |
| `/app/store-data`         | Store Data — all pulled orders / products / customers   |
| `/app/shopify-connect`    | Shopify credential + sync flow (authenticate + pull)    |
| `/app/exit-score`         | Exit Readiness Score (9 dimensions)                     |
| `/app/risk-scanner`       | Risk intelligence                                       |
| `/app/valuation`          | Valuation Engine                                        |
| `/app/optimization`       | Optimization Plan (£ uplift per action)                 |
| `/app/financial-normalizer` | Buyer-ready financial reconstruction                  |
| `/app/investment-memo`    | Auto-generated investment memo                          |
| `/app/data-room`          | Due-diligence document repository                       |
| `/app/buyer-matching`     | Matched acquirers (private beta placeholder)            |
| `/app/reports`            | Saved reports & downloads                               |
| `/app/settings`, `/app/billing` | Account management                                |

---

## How the data flows

The pipeline is split into two **independent** phases: **sync** (pull + store raw
data) and **report** (compute on demand). Connecting a store never produces a
report — it only confirms what was pulled.

**Phase 1 — Sync (pull + store, no report):**

```
/app/shopify-connect  ──(shopDomain, accessToken)──▶  syncShopifyStoreFn (server fn)
                                                            │
                                          ┌─────────────────┤
                                          ▼                 ▼
                               Shopify Admin API   Sandbox simulator
                               (shop/orders/        (ONLY for explicit
                                products/customers;  *test/demo/sandbox* creds;
                                cursor-paginated,    real failures now THROW)
                                capped ~5k orders)
                                          │
                                          ▼
                    Raw { shop, orders[], products[], customers[], counts }
                                          │
                                          ▼
                       useBusinessData.syncStore(...)
              → React state + localStorage cache + Supabase
                (shopify_stores / _orders / _products / _customers)
                                          │
                                          ▼
              Success screen: COUNTS ONLY (no score / valuation)
                  + "View Store Data" / "Run your first report"
```

**Phase 2 — Report (on demand, deterministic):**

```
/app/{exit-score,risk-scanner,valuation,optimization}  ──"Run"──▶  useReport.run()
                                          │
                                          ▼
                    computeFullReport(rawData)   ← src/lib/analytics.ts
              (pure, synchronous, auditable: AOV, TTM revenue, repeat
               rate, product concentration, margins, EBITDA/SDE, exit
               score across 9 dimensions, valuation multiples, risks, actions)
                                          │
                       (optional) enrichRiskCopyFn  ← src/lib/ai.ts
                       Gemini polishes risk/action PROSE only — never numbers
                                          │
                                          ▼
              useBusinessData.saveComputedReport(report)
              → React state + localStorage + Supabase
                (valuation_data / risks / actions)
```

`syncShopifyStoreFn` (`src/lib/shopify.ts`) and `enrichRiskCopyFn`
(`src/lib/ai.ts`) are TanStack **server functions**, so the Admin API token and
the Gemini key never reach the browser. The token is **never** stored in
`localStorage`; it lives only in the RLS-protected `shopify_stores` row and is
lazily re-fetched when a sync runs.

**Freshness:** raw data is served from the `localStorage` cache for instant paint
(zero network on a warm cache). It refreshes via **auto-stale** (the Store Data
page re-syncs if data is older than ~6h) and a manual **"Sync now"** button.
Syncs upsert by Shopify ID, so re-syncing is idempotent.

For deeper architecture notes (auth, SSR error handling, the data model), see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Deployment

`npm run build` runs Nitro with the Vercel preset and emits `.vercel/output`
(see `wrangler.jsonc` for the Cloudflare-compatible worker entry at
`src/server.ts`). Set the environment variables above in your hosting provider.
The Supabase schema lives in `supabase/migrations/` — apply it with the Supabase
CLI (`supabase db push`) against your project.
