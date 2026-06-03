# ExitEcom

**Pre-exit intelligence for e-commerce founders.** ExitEcom is the operating
system founders use _before_ selling their business: it produces an **Exit
Readiness Score**, a buyer-grade **valuation range**, a prioritised
**optimization plan**, and a **risk scan** — all derived from real store data
(via Shopify) and normalised into M&A-ready financials.

This repository is a server-rendered React app built on **TanStack Start**.

---

## Tech stack

| Concern            | Choice                                                          |
| ------------------ | -------------------------------------------------------------- |
| Framework / SSR    | [TanStack Start](https://tanstack.com/start) (+ TanStack Router) |
| UI                 | React 19, Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com) (Radix) |
| Data fetching      | TanStack Query                                                 |
| Auth & database    | [Supabase](https://supabase.com) (Postgres + Auth + RLS)       |
| AI / intelligence  | Google Gemini (`@google/generative-ai`) — app-wide AI provider |
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
cp .env.example .env   # then fill in values  (no .env.example yet — create from the table below)

# 3. Run the dev server
npm run dev            # http://localhost:3000

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
| `GEMINI_API_KEY`         | No       | Server-side Google Gemini key — the app-wide AI provider (intelligence features + the Shopify normalizer). |
| `VITE_GEMINI_API_KEY`    | No       | Alternate Gemini key name (checked as a fallback).                      |

\* **Demo Mode:** if Supabase vars are missing or left as placeholders, the app
runs fully against mock data + `localStorage` (see [Operating modes](#operating-modes)).
If the Gemini key is missing, Shopify Connect falls back to a deterministic
rule-based normalizer instead of the LLM.

---

## Operating modes

ExitEcom is designed to run end-to-end with **zero backend configured**, then
progressively light up as you add credentials.

1. **Demo / Fallback mode** (`isSupabaseConfigured === false`)
   - Auth is mocked: sign up / sign in / Google all create a fake user persisted
     in `localStorage` (`exitecom_demo_user`).
   - All business data comes from `src/lib/mock.ts`, cached to `localStorage`
     (`exitecom_business`, `exitecom_risks`, `exitecom_actions`).
   - Shopify Connect still works — it simulates store data and (optionally) calls
     Gemini, then writes results to local state.

2. **Live mode** (Supabase configured)
   - Real Supabase Auth (email/password + Google OAuth).
   - Business / valuation / risk / action / document rows are read from and
     written to Postgres, scoped per-user by Row-Level Security.
   - Local state is still cached to `localStorage` as an offline fallback.

The switch is centralised in `src/lib/supabase.ts` (`isSupabaseConfigured`).

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
│   ├── useBusinessData.ts  # Loads/saves business+valuation+risks+actions+docs
│   └── use-mobile.tsx
├── lib/
│   ├── supabase.ts         # Supabase client + isSupabaseConfigured flag
│   ├── shopify.ts          # `connectShopifyFn` server fn: Shopify → Gemini → metrics
│   ├── mock.ts             # All demo/seed data (NovaSkin Co.)
│   ├── error-capture.ts    # Out-of-band SSR error capture
│   ├── error-page.ts       # Branded 500 HTML page
│   └── utils.ts            # cn() + misc helpers
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
| `/app/data-sources`       | Connect Shopify / Meta / Google / uploads               |
| `/app/shopify-connect`    | Shopify credential + sync flow                          |
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

The Shopify → metrics pipeline is the core of the product:

```
/app/shopify-connect  ──(shopDomain, accessToken)──▶  connectShopifyFn  (server fn)
                                                            │
                          ┌─────────────────────────────────┤
                          ▼                                   ▼
              Shopify Admin API                    Sandbox simulator
           (orders/products/shop)        (auto-used for *test/demo/sandbox*
                          │                creds, or when the API call fails)
                          ▼
              Condensed summary payload
                          │
              ┌───────────┴────────────┐
              ▼                          ▼
   Gemini (gemini-2.5-flash)   Rule-based fallback
   normalizes to M&A metrics   (no API key present)
              └───────────┬────────────┘
                          ▼
        { businessUpdate, risks[], actions[] }
                          │
                          ▼
        useBusinessData.syncShopifyData()
        → React state + localStorage (+ Supabase if configured)
```

`connectShopifyFn` (`src/lib/shopify.ts`) is a TanStack **server function**
(`createServerFn(...).inputValidator(...).handler(...)`), so the access token and
Gemini key never reach the browser.

For deeper architecture notes (auth, SSR error handling, the data model), see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Deployment

`npm run build` runs Nitro with the Vercel preset and emits `.vercel/output`
(see `wrangler.jsonc` for the Cloudflare-compatible worker entry at
`src/server.ts`). Set the environment variables above in your hosting provider.
The Supabase schema lives in `supabase/migrations/` — apply it with the Supabase
CLI (`supabase db push`) against your project.
