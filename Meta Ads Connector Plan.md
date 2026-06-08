# Meta Ads Connector — Build Plan

Goal: connect a merchant's Meta (Facebook/Instagram) Ads account, pull spend +
performance + conversion data, persist it raw, and feed **real** ROAS / CAC into
the Exit Score's *Marketing Efficiency & Stability* category (weight 15) — which
today runs on a hardcoded `adSpend = revenueTTM * 0.22` guess (`analytics.ts:287`).

This plan mirrors the existing Shopify connector exactly: connecting does ONE job
— authenticate, pull the full dataset, hand raw rows back to persist. No
normalization-into-score on connect; reports are computed on demand in
`analytics.ts`. Numbers stay deterministic; Gemini only polishes copy.

---

## 1. How we connect to Meta (the core decision)

Unlike Shopify, Meta has no "merchant pastes a self-serve Admin token" path that
works for arbitrary users. The Marketing API requires:

- A **Meta App** (App ID + **App Secret**) registered at developers.facebook.com,
  with the *Marketing API* product added.
- OAuth user consent for the `ads_read` permission.
- Token exchange: short-lived user token (~1–2h) → long-lived (~60d) → ideally a
  **System User token** (non-expiring) for durable business access.
- The **App Secret must stay server-side** — never in the browser.

This maps onto Shopify's existing two-path design. We build the same two paths:

### Path A — in-app Facebook OAuth (production) ✅ recommended
The OAuth flow is handled **entirely inside this app** — no external service, no
extra domain. The App ID/Secret live in this app's server env; the redirect URI is
a route on this app's own origin. Flow (see `docs/facebook-oauth-setup.md`):

1. `/meta-connect` "OAuth" tab → `getMetaOAuthUrlFn` builds the Facebook consent
   URL (App ID from env) and the browser redirects to Facebook.
2. User approves `ads_read`; Facebook redirects back to `/meta-oauth-callback`
   (this app). `exchangeMetaOAuthCodeFn` swaps the code for a long-lived token
   (App Secret server-side) and lists ad accounts.
3. User picks an account (auto if one); `syncMetaViaOAuth` runs the normal
   `syncMetaAdAccountFn` pull + `commitMetaSync` (`source='oauth'`) into Supabase.

The App Secret never reaches the client. Env: `FACEBOOK_APP_ID`,
`FACEBOOK_APP_SECRET`, `META_OAUTH_REDIRECT_URI` (e.g.
`https://dash.exitecom.com/meta-oauth-callback`).

### Path B — direct access token (MVP / power-user, mirrors the "custom app" path)
Advanced users paste a long-lived token + ad-account ID they generated themselves
(Graph API Explorer, their own dev app, or a Business Manager System User token).
`syncMetaAdAccountFn` calls the Graph API directly with that token.

**Build order:** Path B first — fully self-contained, testable immediately with
sandbox creds, and unblocks the score integration without waiting on Meta App
Review. Path A (in-app OAuth) is the production finish; it lives entirely in this
app (`getMetaOAuthUrlFn` + `exchangeMetaOAuthCodeFn` + `/meta-oauth-callback`),
needs `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`/`META_OAUTH_REDIRECT_URI`, and Meta
App Review for `ads_read` to serve other users. See `docs/facebook-oauth-setup.md`.

---

## 2. Data to pull (Meta Marketing API, Graph API ~v21.0)

Base: `https://graph.facebook.com/v21.0`. Ad account id format: `act_<id>`.
Pagination is cursor-based via the JSON `paging.next` URL (analogous to Shopify's
`Link` header, but a field — write a `fetchPagedJson` variant).

| Purpose | Endpoint | Key fields |
|---|---|---|
| Account metadata | `GET /act_{id}?fields=…` | `name, currency, account_status, timezone_name, amount_spent` |
| Account insights (monthly series) | `GET /act_{id}/insights?time_increment=monthly&time_range={since,until}&fields=…` | `spend, impressions, clicks, ctr, cpc, cpm, reach, actions, action_values, purchase_roas` |
| Per-campaign breakdown | `GET /act_{id}/insights?level=campaign&fields=…,campaign_name` | spend + conversions per campaign (concentration within Meta) |
| Campaign list (status/objective) | `GET /act_{id}/campaigns?fields=name,objective,status,created_time` | metadata |

Conversions/value come out of the `actions` / `action_values` arrays — filter for
`action_type` in (`purchase`, `offsite_conversion.fb_pixel_purchase`). `purchase_roas`
is Meta's self-reported ROAS (see review §B — label it as self-reported).

Mapped metrics (aligns to Score Plan "Ad Platform Ingestion" + "Marketing Efficiency"):
spend, impressions, clicks, CTR, CPC, CPM, conversions (purchases), conversion
value, ROAS, CPA/CAC (spend ÷ purchases), monthly time series, per-campaign split.

---

## 3. Normalized shape (mirror `ShopifySyncResult` in `src/lib/shopify.ts`)

```ts
interface RawMetaAccount {
  adAccountId: string; name: string; currency: string;
  timezone: string; accountStatus: string;
}
interface RawMetaMonthly {
  month: string; // YYYY-MM
  spend: number; impressions: number; clicks: number;
  conversions: number; conversionValue: number; roas: number;
}
interface RawMetaCampaign {
  metaCampaignId: string; name: string; objective: string | null;
  status: string | null; spend: number;
  conversions: number; conversionValue: number; roas: number;
}
interface MetaSyncResult {
  account: RawMetaAccount;
  monthly: RawMetaMonthly[];
  campaigns: RawMetaCampaign[];
  totals: { spend; impressions; clicks; conversions; conversionValue;
            roas; cpa; ctr; cpc };
  range: { since: string; until: string };
  capped: { campaigns: boolean };
  sandbox: boolean;
}
```

Include a `buildSandbox()` that returns deterministic fake Meta data when creds
contain `test`/`demo`/`sandbox` or no backend is configured — exactly like
`shopify.ts` — so local/demo flows work end-to-end.

---

## 4. Database migration

New file `supabase/migrations/<ts>_meta_raw_data.sql`, copying the RLS policy
block from `20260606000000_shopify_raw_data.sql` (every table RLS-protected via
`business_id → businesses.owner_id = auth.uid()`):

- `meta_accounts` (business_id PK, like `shopify_stores`): `ad_account_id`,
  `access_token` (nullable), `connection_key` (nullable), `source`
  (`'direct'|'analytic'`), `name`, `currency`, `timezone`, `account_status`,
  `last_synced_at`, `synced_at`.
- `meta_monthly_insights`: `business_id`, `month`, spend/impressions/clicks/
  conversions/conversion_value/roas, `unique (business_id, month)`.
- `meta_campaigns`: `business_id`, `meta_campaign_id`, name/objective/status/
  spend/conversions/conversion_value/roas, `unique (business_id, meta_campaign_id)`.

⚠️ **Apply to the hosted Supabase project, not just the repo** (per project memory).

**Token storage:** Shopify currently stores `access_token` in plaintext. For Meta,
prefer Path A (token never enters this repo). If Path B stores a token, flag for a
follow-up: pgcrypto-encrypt it, since the UI promises "bank-grade encryption".

---

## 5. Code wiring

1. **`src/lib/meta.ts`** (new) — `syncMetaAdAccountFn` (direct), `getMetaOAuthUrlFn` +
   `exchangeMetaOAuthCodeFn` (in-app OAuth), `buildSandbox`, field mappers,
   `fetchPagedJson` (paging.next), error messages mirroring `shopify.ts`.
2. **`src/hooks/useBusinessData.tsx`** — add `metaAccount` / `metaMonthly` /
   `metaCampaigns` state + a localStorage cache (mirror `CACHE_SHOPIFY`); expose
   `syncMeta`, `syncMetaViaOAuth`, `resyncMeta`; add `commitMetaSync` that upserts the
   3 tables and adds `"meta"` to `connected_sources`; add `isMetaConnected`. Tokens
   never cached locally — fetched from Supabase on resync (same rule as Shopify).
3. **`src/routes/_app.meta-connect.tsx`** (new) — two-method selector (OAuth /
   Access token), OAuth "Continue with Facebook" button, connecting→fetching→saving→
   success/error states, success stats showing Spend, ROAS, Campaigns.
   Plus **`src/routes/_app.meta-oauth-callback.tsx`** — the OAuth return route.
4. **`src/routes/_app.data-sources.tsx`** — promote "Meta Ads" out of "Coming Soon"
   into a new **"Marketing"** section; status derived from `connectedSources`;
   Connect → `/meta-connect`; show impact line when connected.
5. **`src/lib/analytics.ts`** (the payoff) — when Meta is connected:
   - replace the `revenueTTM * 0.22` ad-spend estimate and `roas: 0` with real
     totals (`meta.ts:287`/`324`/`325`);
   - score *Marketing Efficiency & Stability* from real ROAS + CAC + monthly
     spend/ROAS trend & volatility;
   - raise `dataConfidence`;
   - **do NOT** improve *Platform & Channel Risk* just because Meta connected — Meta
     is a traffic source, not a diversified *sales* channel (see review §D).
6. **`.env.example`** — add `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`,
   `META_OAUTH_REDIRECT_URI` (server-side only; never `VITE_`-prefixed).
7. **Gemini (`src/lib/ai.ts`)** — no change; numbers stay deterministic.

---

## 6. External prerequisites (Meta App setup, outside this repo)

- Create a **Business-type Meta App** at developers.facebook.com; add the
  **Marketing API** product.
- Permissions: `ads_read` (+ `read_insights`; `business_management` if we let users
  pick among multiple ad accounts).
- **App Review for Advanced Access to `ads_read`** — required to read *other*
  businesses' ad data in production. Standard Access only covers users with a role
  on the app, which is fine for dev/testing.
- Add **Facebook Login (Web)** and set the Valid OAuth Redirect URI to this app's own
  origin: `https://dash.exitecom.com/meta-oauth-callback` (+ the localhost dev URL).
- App must be in **Live** mode (needs a Privacy Policy URL) to serve non-admin users.

---

## 7. Build sequence

1. Migration + push to hosted Supabase.
2. `src/lib/meta.ts` with Path B + sandbox (testable in isolation immediately).
3. `useBusinessData` wiring (`commitMetaSync`, state, cache).
4. `_app.meta-connect.tsx` + data-sources entry.
5. `analytics.ts` — wire real Meta figures into Marketing Efficiency + confidence.
6. Path A (in-app OAuth: `getMetaOAuthUrlFn` + `exchangeMetaOAuthCodeFn` +
   `/meta-oauth-callback`) once the FB app credentials + App Review are in place.
```
