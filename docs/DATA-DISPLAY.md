# Data display contract

How ExitEcom decides what to show, where the numbers come from, and the rule we
never break. Read this before adding any page that displays business data.

## The one rule: no dummy or placeholder data

Users only ever see **their own real data** or an **empty state / gate**. We do
not render demo numbers, sample businesses, or fabricated valuations. If we
don't have the data yet, we say so and point the user at how to get it.

Historically there were two sources of fake data; both are now removed from the
live paths:

- **DB seeding trigger** — `handle_new_user()` used to seed a full "NovaSkin
  Co." business. The migration `supabase/migrations/20260603000000_no_dummy_seed.sql`
  reduces it to inserting only the user's `profiles` row.
- **`src/lib/mock.ts`** — was the client-side fallback in `useBusinessData`. The
  hook no longer imports it; it uses an `EMPTY_BUSINESS` empty state instead.
  (`mock.ts` still exists only for the three not-yet-wired legacy pages and a
  couple of formatters — see TODO below.)

## Sources of truth

| Data | Where it's collected | DB table | Surfaced on |
| --- | --- | --- | --- |
| Business profile (name, industry, channel, country, age, monthly revenue, founder context, exit timeframe) | **Onboarding** (`src/routes/onboarding.tsx`) | `businesses` | Profile (`/app/profile`) |
| Raw store data: orders, products, customers, store metadata | **Shopify Connect** (`syncShopifyStoreFn`) | `shopify_stores`, `shopify_orders`, `shopify_products`, `shopify_customers` | Store Data (`/app/store-data`) |
| Results: Exit Score, valuation range, multiples, KPIs, risks, actions, documents | **Computed on demand** from the raw data (`src/lib/analytics.ts`) | `valuation_data`, `risks`, `actions`, `documents` | Dashboard + result pages |

`useBusinessData` (`src/hooks/useBusinessData.ts`) is the single read/write layer.
It maps `businesses` → profile fields, the `shopify_*` tables → raw data, and
`valuation_data` → result metrics, with **no mock fallbacks** (absent values stay
`""`/`0`). It exposes `isShopifyConnected`, the raw arrays (`store`, `orders`,
`products`, `customers`), and `syncStore` / `resyncStore` / `saveComputedReport`.
Reports are computed (not collected) — every result number comes from
`computeFullReport` in `analytics.ts`, never an LLM.

## The Shopify-first gate

Results are derived from Shopify, so every result page is locked until a store
is connected. The gate is `src/components/ex/ConnectShopifyGate.tsx`, rendered
when `!isShopifyConnected`:

```tsx
const { isShopifyConnected } = useBusinessData();
if (!isShopifyConnected) return <ConnectShopifyGate title="…" feature="…" />;
```

**Gated pages:** `app.dashboard`, `app.exit-score`, `app.valuation`,
`app.risk-scanner`, `app.optimization`, `app.investment-memo`,
`app.financial-normalizer`, `app.data-room`, `app.buyer-matching`.

**Always reachable:** `app.profile`, `app.data-sources`, `app.store-data`,
`app.shopify-connect`, `app.settings`, `app.billing` — you need these to enter
data, connect, and inspect the pulled raw data.

Once a store is connected, `isShopifyConnected` is true and the gate lifts. The
report pages then show a **"Run <feature>"** CTA until the user computes a report;
after that they render the persisted snapshot with a **"Re-compute"** button.

## Flow

```
Sign up ──▶ Onboarding (4 steps) ──writes businesses row──▶ Data Sources
                                                                │
                                                   Connect Shopify
                                          (syncShopifyStoreFn → syncStore)
                                                                │
                                  writes shopify_stores/_orders/_products/_customers
                                                                ▼
                          Store Data page + result pages unlock (gate lifts)
                                                                │
                                          user clicks "Run" on a report page
                                                                │
                                computeFullReport() → saveComputedReport()
                                            writes valuation_data/risks/actions
                                                                ▼
                                        Dashboard + result pages show real numbers
```

- Onboarding Step 2 is **info-only**: Shopify is "connect after setup", all other
  integrations are "Coming soon". No fake "Connected" toggles.
- Onboarding Step 4 **inserts** the `businesses` row + a zeroed `valuation_data`
  row (no fabricated valuation), then routes to `/app/data-sources`.

## Status — result pages wired to real data

The core pages now compute from real Shopify-derived data (via `useReport` →
`computeFullReport`) and persist snapshots:

- [x] `app.dashboard` — command-center (counts + launchers) pre-run; real hero numbers post-run
- [x] `app.exit-score` — 9-dimension breakdown, computed
- [x] `app.valuation` — valuation range, multiples, drivers, computed
- [x] `app.risk-scanner` — computed risks, persisted to `risks`
- [x] `app.optimization` — computed actions, persisted to `actions`
- [x] `app.store-data` — raw orders / products / customers / metadata (new)

Still on mock scaffolding (not yet wired — they remain gated, so no user sees mock
data today):

- [ ] `app.financial-normalizer` — normalized financials (imports `mockBusiness`/`addBacks`)
- [ ] `app.investment-memo` — generate from real metrics (imports `mockBusiness`)
- [ ] `app.data-room` — `documents` from DB (imports `dataRoomCategories`)
- [ ] `app.buyer-matching` — real match criteria (private-beta placeholder)
- [ ] Once these consume real data, delete `src/lib/mock.ts`. Note: the `fmtGBP`/
      `fmtGBPk` formatters now live in `src/lib/utils.ts`, but `RiskCard`/`ActionCard`
      and the legacy pages still import them from `mock.ts` — repoint those first.

## Note on the migration

`20260603000000_no_dummy_seed.sql` must be applied to the hosted Supabase project
(`npx supabase db push`, or paste into the SQL editor). Accounts created **before**
it was applied still have the old "NovaSkin Co." seed rows — test with a fresh
account.
