# Snapchat Ads — Setup Guide

The Snapchat Ads connector's **OAuth** method is a real Snapchat Marketing API OAuth
flow handled **entirely inside this app** — no external service, no extra domain.
The Client ID/Secret live in this app's server environment and are used only inside
`createServerFn` handlers (`src/lib/snapchat.ts`); the redirect URI is a route on
this app's own origin (`/snapchat-oauth-callback`). Tokens and account metadata are
stored in Supabase (`snapchat_accounts`, RLS-protected).

**Important:** Snapchat access tokens **expire after 3600 seconds (1 hour)**. A
`refresh_token` is stored alongside the access token and used automatically to obtain
a new one before each re-sync — no user action needed after the initial connection.

This guide has three parts:

1. **Snapchat App setup** — what to configure in the Snapchat Business portal
2. **App configuration** — the env vars this app reads
3. **How the flow works / verify / troubleshoot**

---

## Part 1: Snapchat App Setup

### Step 1 — Create a Snapchat Business account and app

1. Go to [business.snapchat.com](https://business.snapchat.com) and sign in or
   create a Snapchat Business account.
2. In the top-left menu, open **Business Settings** for your organisation.
3. Scroll to the **Marketing API** section and click **Get Started** (or **New App**
   if you've created one before).
4. Give the app a name (e.g. "ExitEcom"), set the category to **Analytics /
   Reporting**, and click **Create**.
5. After creation your **Client ID** and **Client Secret** appear on the app detail
   page. Copy both — the Client Secret is only shown once at creation time (you can
   reset it later).

### Step 2 — Set the OAuth redirect URI

On the app detail page, under **Redirect URIs**, click **+ Add Redirect URI** and add:

```
https://dash.exitecom.com/snapchat-oauth-callback
http://localhost:8080/snapchat-oauth-callback      # local dev
```

The value must match `SNAPCHAT_REDIRECT_URI` in the server environment **exactly** —
scheme, host, port, path, no trailing slash.

### Step 3 — Configure the required scopes

Snapchat only requires one scope for read-only ad data access:

| Scope | Why |
| --- | --- |
| `snapchat-marketing-api` | Read spend, ROAS, impressions, campaign performance |

No write scopes are requested. ExitEcom only reads your data.

> If your app portal shows a list of optional scopes, enable only
> `snapchat-marketing-api`. Do **not** enable `snapchat-offline-conversions-api`
> unless you also need offline conversion data.

### Step 4 — Obtain your Ad Account ID

1. In Snapchat Ads Manager ([ads.snapchat.com](https://ads.snapchat.com)), open the
   account you want to analyse.
2. Go to **Business Details** (top-right gear icon → **Business Details**).
3. Copy the **Ad Account ID** — it's a UUID (e.g. `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).

You'll need this for the **Access token** (direct) connection method, or to identify
which account to select during OAuth if your login has access to several ad accounts.

---

## Part 2: Configure this app

Set these in `.env` (and in the hosting platform's env for production). They are
**server-side only — never `VITE_`-prefixed**. See `env-vars.md`.

```env
SNAPCHAT_CLIENT_ID=your_client_id
SNAPCHAT_CLIENT_SECRET=your_client_secret
SNAPCHAT_REDIRECT_URI=https://dash.exitecom.com/snapchat-oauth-callback
# Local dev: http://localhost:8080/snapchat-oauth-callback
```

- Read only inside `getSnapchatOAuthUrlFn` and `exchangeSnapchatOAuthCodeFn` in
  `src/lib/snapchat.ts`. The Client Secret never reaches the browser.
- When unset, the **OAuth** tab on `/snapchat-connect` shows a "not configured"
  notice and the **Access token** method (and sandbox via `test`/`demo` creds)
  still works.
- After OAuth, both `access_token` and `refresh_token` are stored in Supabase
  `snapchat_accounts` (`source = 'oauth'`), under the user's RLS policy.
- On each re-sync the server fn sends the stored `refresh_token` to Snapchat's
  token endpoint if the access token has expired (HTTP 401 triggers auto-refresh).
  The new token pair is persisted immediately so future re-syncs continue to work
  without re-authorisation.

### Access token (direct) path

Users can also connect without OAuth by generating a token manually:

1. Follow the OAuth flow in Snapchat's own API console or use Postman to obtain an
   `access_token` + `refresh_token` for your ad account.
2. Paste the **Ad Account ID** (UUID from step 4 above) and the **Access Token**
   into the **Access token** tab on `/snapchat-connect`.

Direct tokens stored with `source = 'direct'` in `snapchat_accounts`. Refresh tokens
work the same way — if one is available it will be used to refresh automatically.

---

## Part 3: How the flow works

```
/snapchat-connect  "OAuth" tab → getSnapchatOAuthUrlFn(state)  [server: builds consent URL]
      ↓ browser → accounts.snapchat.com/login/oauth2/authorize
Snapchat redirects → /snapchat-oauth-callback?code=&state=     [this app, authenticated route]
      ↓ validate state (CSRF), then:
exchangeSnapchatOAuthCodeFn({code})  [server: code → access_token + refresh_token]
      ↓ GET /v1/me/organizations?with_ad_accounts=true
      ↓ flatten ad accounts from all orgs → { accessToken, refreshToken, adAccounts[] }
pick ad account (auto if one, picker if several)
      ↓
syncSnapchatViaOAuth(adAccountId, accessToken, refreshToken)
  → syncSnapchatAdsFn pull + commitSnapchatSync(source:'oauth')
  → on HTTP 401: refreshAccessToken → retry pull → return updatedTokens
  → commitSnapchatSync persists updatedTokens to snapchat_accounts
      ↓ stored in Supabase snapchat_accounts (RLS)
→ /snapchat-data
```

**Key differences from TikTok / Meta / Google:**

| Detail | Snapchat | TikTok | Meta | Google |
| --- | --- | --- | --- | --- |
| Auth header | `Authorization: Bearer` | `Access-Token: <token>` | query param | `Authorization: Bearer` |
| OAuth callback param | `code` | `auth_code` | `code` | `code` |
| Token body format | form-encoded | JSON | form-encoded | form-encoded |
| Refresh token | Yes (1 h expiry) | None (long-lived) | None (long-lived) | Yes (long-lived) |
| Spend field | `spend` (÷ 1,000,000) | `spend` (raw) | `spend` (raw) | `metrics.cost_micros` (÷ 1M) |
| Clicks | `swipes` | `clicks` | `clicks` | `metrics.clicks` |
| Monthly data | Daily timeseries → bucketed | Daily reports → bucketed | `time_increment=monthly` | GAQL `segments.month` |
| Per-campaign stats | One GET per campaign | Batch report | Batch report | GAQL per campaign |

### Data pulled per sync

1. **Account metadata** — `GET /v1/adaccounts/{id}` → name, currency, timezone, status
2. **Daily stats** — `GET /v1/adaccounts/{id}/stats?granularity=DAY` → spend, impressions,
   swipes, conversions, `conversion_purchases_value` for 365-day lookback, then bucketed
   to YYYY-MM months in code
3. **Campaign list** — `GET /v1/adaccounts/{id}/campaigns` → campaign IDs, names,
   status, objective (capped at 100)
4. **Per-campaign TOTAL stats** — `GET /v1/campaigns/{id}/stats?granularity=TOTAL` —
   one request per campaign, all run in parallel

All stored in `snapchat_accounts`, `snapchat_monthly_insights`, `snapchat_campaigns`.
Snapchat spend and conversions feed into the Exit Score via the shared `adFeeds`
pipeline in `src/lib/analytics.ts` alongside Meta, Google, and TikTok.

### Verify end-to-end

1. Set the three env vars; run `npm run dev`.
2. Open `/snapchat-connect` → **OAuth** tab → **Continue with Snapchat** → approve access.
3. You return to `/snapchat-oauth-callback`; pick an ad account if prompted; you land
   on `/snapchat-data` with real spend / ROAS / campaigns.
4. **Refresh** on `/snapchat-data` re-pulls using the stored token (auto-refreshes
   if expired).
5. **Disconnect** clears all stored Snapchat data for that business.
6. Without env vars: the OAuth tab shows "not configured"; the Access token tab and
   sandbox creds (`test`/`demo`/`sandbox` in any field) still work.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| OAuth tab says "not configured" | Set `SNAPCHAT_CLIENT_ID`, `SNAPCHAT_CLIENT_SECRET`, `SNAPCHAT_REDIRECT_URI` in the server env and restart. |
| "Redirect URI mismatch" on Snapchat consent screen | The portal's **Redirect URI** must match `SNAPCHAT_REDIRECT_URI` exactly — check scheme, host, port, path, no trailing slash. |
| "Snapchat token exchange failed" | Client ID / Secret mismatch. Double-check both values in `.env` against the Snapchat app portal. |
| HTTP 401 on data pull | Access token expired and refresh failed. Likely because `SNAPCHAT_CLIENT_ID` / `SNAPCHAT_CLIENT_SECRET` are not set — the server cannot refresh without them. Set both env vars. |
| "Snapchat session has expired and the automatic token refresh failed" | The stored `refresh_token` itself expired (Snapchat revokes them after ~1 year of inactivity). The user must reconnect via `/snapchat-connect`. |
| "No ad accounts were found" | The Snapchat login has no associated ad accounts, or the consent was denied. Ensure the login has the correct business account linked. |
| Empty monthly data | The ad account has no spend in the trailing 365-day window. Sandbox mode (`test`/`demo` creds) returns deterministic demo data without a real account. |
| Campaigns table empty | Either no campaigns exist in the account, or all 100-campaign slots were filled with campaigns that have no stats in the lookback window. |
| `spend` looks 1,000,000× too large | The raw `spend` field from Snapchat's API is in micro-currency units. `src/lib/snapchat.ts` divides by 1,000,000 — if you're seeing inflated numbers, check that you're reading from the stored DB column (already converted), not the raw API response. |
