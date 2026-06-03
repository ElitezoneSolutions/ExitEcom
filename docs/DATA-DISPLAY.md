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
  (`mock.ts` still exists for the not-yet-wired result pages — see TODO below.)

## Sources of truth

| Data | Where it's collected | DB table | Surfaced on |
| --- | --- | --- | --- |
| Business profile (name, industry, channel, country, age, monthly revenue, founder context, exit timeframe) | **Onboarding** (`src/routes/onboarding.tsx`) | `businesses` | Profile (`/app/profile`) |
| Results: Exit Score, valuation range, multiples, KPIs, risks, actions, documents | **Shopify Connect** (later — not built yet) | `valuation_data`, `risks`, `actions`, `documents` | Dashboard + result pages |

`useBusinessData` (`src/hooks/useBusinessData.ts`) is the single read/write layer.
It maps `businesses` → profile fields and `valuation_data` → result metrics, with
**no mock fallbacks** (absent values stay `""`/`0`). It also exposes
`isShopifyConnected`.

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

**Always reachable:** `app.profile`, `app.data-sources`, `app.shopify-connect`,
`app.settings`, `app.billing` — you need these to enter data and connect.

Because Shopify Connect is not wired yet, `connectedSources` is always empty, so
the gate is what users currently see on result pages. That is intended.

## Flow

```
Sign up ──▶ Onboarding (4 steps) ──writes businesses row──▶ Data Sources
                                                                │
                                                   Connect Shopify (TODO)
                                                                │
                                            writes valuation_data/risks/actions
                                                                ▼
                                              Dashboard + result pages unlock
```

- Onboarding Step 2 is **info-only**: Shopify is "connect after setup", all other
  integrations are "Coming soon". No fake "Connected" toggles.
- Onboarding Step 4 **inserts** the `businesses` row + a zeroed `valuation_data`
  row (no fabricated valuation), then routes to `/app/data-sources`.

## TODO — wire result pages to real Shopify data

The gated result pages still import `mockBusiness`/`topRisks`/etc. from
`src/lib/mock.ts` for layout scaffolding. They never render without Shopify, so
no user sees mock data today — but when Shopify Connect is built, each must be
switched to real data from `useBusinessData`:

- [ ] `app.dashboard` — score, valuation, KPIs, risks/actions previews
- [ ] `app.exit-score` — score breakdown / nine dimensions
- [ ] `app.valuation` — valuation range, multiples, drivers
- [ ] `app.risk-scanner` — `risks` from DB
- [ ] `app.optimization` — `actions` from DB
- [ ] `app.financial-normalizer` — normalized financials
- [ ] `app.investment-memo` — generated from real metrics
- [ ] `app.data-room` — `documents` from DB
- [ ] `app.buyer-matching` — real match criteria
- [ ] Once all consume real data, delete `src/lib/mock.ts` (keep the `fmtGBP`/
      `fmtGBPk` formatters, which now live in `src/lib/utils.ts`).

## Note on the migration

`20260603000000_no_dummy_seed.sql` must be applied to the hosted Supabase project
(`npx supabase db push`, or paste into the SQL editor). Accounts created **before**
it was applied still have the old "NovaSkin Co." seed rows — test with a fresh
account.
