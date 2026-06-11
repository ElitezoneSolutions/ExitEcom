# TikTok Ads — Setup Guide

The TikTok Ads connector's **OAuth** method is a real TikTok Marketing API OAuth
flow handled **entirely inside this app** — no external service, no extra domain.
The App ID/Secret live in this app's server environment and are used only inside
`createServerFn` handlers (`src/lib/tiktok.ts`); the redirect URI is a route on
this app's own origin (`/tiktok-oauth-callback`). Tokens are stored in Supabase
(`tiktok_accounts`, RLS-protected).

TikTok access tokens are **long-lived (~365 days)** with no refresh-token exchange
needed — they behave like Meta's long-lived tokens, not Google's refresh-token model.

This guide has three parts:

1. **TikTok App setup** — what to configure in the TikTok for Business portal
2. **App configuration** — the env vars this app reads
3. **How the flow works / verify / troubleshoot**

---

## Part 1: TikTok App Setup

### Step 1 — Create an app

1. Go to [business-api.tiktok.com](https://business-api.tiktok.com) and sign in
   with your TikTok for Business account.
2. Top nav → **My Apps** → **Create App**.
3. Choose **Web** app type and fill in the name, description and category.
4. After creation you'll see your **App ID** and **App Secret** on the app detail
   page. Note both.

### Step 2 — Add scopes

In **App Detail → Scopes**, enable:

| Scope | Why |
| --- | --- |
| `Ad Account Read` (under Reporting) | Read campaign and performance data |
| `Ad Reporting Read` | Pull spend/ROAS/impression reports |

Read-only scopes are sufficient — ExitEcom never writes to TikTok Ads.

### Step 3 — Configure OAuth redirect URI

In **App Detail → Basic Settings**, add the redirect URI under **Redirect URI**:

```
https://dash.exitecom.com/tiktok-oauth-callback
http://localhost:8080/tiktok-oauth-callback      # local dev
```

The value must match `TIKTOK_OAUTH_REDIRECT_URI` **exactly** — scheme, host, port,
path, no trailing slash.

### Step 4 — Submit for review (for multi-user production use)

> Skip during development. Your own accounts are always accessible while the app
> is in Sandbox / Development mode.

For production, where your platform users connect **their own** TikTok Ads accounts,
submit the app for API review in **App Detail → Review**. Approval grants access to
live advertiser data for all authorised users.

---

## Part 2: Configure this app

Set these in `.env` (and in the hosting platform's env for production). They are
**server-side only — never `VITE_`-prefixed**. See `env-vars.md`.

```env
TIKTOK_APP_ID=your_app_id
TIKTOK_APP_SECRET=your_app_secret
TIKTOK_OAUTH_REDIRECT_URI=https://dash.exitecom.com/tiktok-oauth-callback
# Local dev: http://localhost:8080/tiktok-oauth-callback
```

- Read only inside `getTikTokOAuthUrlFn` and `exchangeTikTokOAuthCodeFn` in
  `src/lib/tiktok.ts`. The App Secret never reaches the client.
- When unset, the **OAuth** tab on `/tiktok-connect` shows a "not configured"
  message and the **Access token** method (and sandbox via `test`/`demo` creds)
  still works.
- The connected token and account metadata are stored in Supabase `tiktok_accounts`
  (`source = 'oauth'`), under the user's RLS policy.

### Access token (direct) path

Users can also connect without OAuth by generating a token manually:

1. In the TikTok Marketing API portal → **App Detail → Authentication →
   Access Token** — generate a token authorised against the target advertiser.
2. In TikTok Ads Manager → **Account Settings** — copy the 13-digit
   **Advertiser ID**.
3. Paste both into the **Access token** tab on `/tiktok-connect`.

Direct tokens also last ~365 days. Stored with `source = 'direct'` in
`tiktok_accounts`.

---

## Part 3: How the flow works

```
/tiktok-connect  "OAuth" tab → getTikTokOAuthUrlFn(state)    [server: builds TikTok consent URL]
      ↓ browser → business-api.tiktok.com consent
TikTok redirects → /tiktok-oauth-callback?auth_code=&state=  [this app, authenticated route]
      ↓ validate state (CSRF), then:
exchangeTikTokOAuthCodeFn({authCode})  [server: auth_code → access_token + advertiser_ids[]]
      ↓ GET /advertiser/info/ → { accessToken, accounts[] }
pick advertiser account (auto if one, picker if several)
      ↓
syncTikTokViaOAuth(advertiserId, accessToken)  → syncTikTokAdsFn pull + commitTikTokSync(source:'oauth')
      ↓ stored in Supabase tiktok_accounts (RLS)
→ /tiktok-data
```

**Key differences from Meta/Google:**

| Detail | TikTok | Meta | Google |
| --- | --- | --- | --- |
| Auth header | `Access-Token: <token>` | query param | `Authorization: Bearer` |
| OAuth callback param | `auth_code` | `code` | `code` |
| Token endpoint body | JSON | form-encoded | form-encoded |
| Refresh token | None (token is long-lived) | None (long-lived) | Yes (refresh_token) |
| Response check | `body.code === 0` (HTTP always 200) | `res.ok` | `res.ok` |
| Monthly data | Daily reports → bucketed in code | `time_increment=monthly` | GAQL `segments.month` |

### Data pulled per sync

1. **Account metadata** — advertiser name, currency, timezone, status
2. **Daily report** — spend, impressions, clicks, conversions, value — bucketed
   into months (`stat_time_day` dimension → YYYY-MM grouping)
3. **Campaign report** — spend, conversions, value per campaign
4. **Campaign list** — name, objective, status (merged with report by campaign ID)

All stored in `tiktok_accounts`, `tiktok_monthly_insights`, `tiktok_campaigns`.
TikTok spend feeds into the Exit Score via the shared `adFeeds` pipeline in
`src/lib/analytics.ts` alongside Meta and Google.

### Verify end-to-end

1. Set the three env vars; run `npm run dev`.
2. Open `/tiktok-connect` → **OAuth** tab → **Continue with TikTok** → approve access.
3. You return to `/tiktok-oauth-callback`; pick an account if prompted; you land on
   `/tiktok-data` with real spend / ROAS / campaigns.
4. **Refresh** on `/tiktok-data` re-pulls using the stored access token.
5. **Disconnect** clears all stored TikTok data for that business.
6. Without env vars: the OAuth tab shows "not configured"; the Access token tab
   and sandbox creds (`test`/`demo`/`sandbox` in any field) still work.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| OAuth tab says "not configured" | Set `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_OAUTH_REDIRECT_URI` in the server env and restart. |
| "Redirect URI mismatch" on TikTok consent screen | The portal's **Redirect URI** must match `TIKTOK_OAUTH_REDIRECT_URI` exactly — check scheme, host, port, path, no trailing slash. |
| `code 40001` / `40002` — invalid token | The access token has expired or is invalid. The user must reconnect via `/tiktok-connect`. |
| `code 40100` — advertiser not accessible | The token doesn't have access to the chosen advertiser. Check the app's scopes include `Ad Account Read`. |
| `code 40300` — permission denied | The app doesn't have the `Ad Reporting Read` scope approved. Check scopes in the portal. |
| "No advertiser accounts were authorised" | The user didn't approve any accounts during the consent flow. Try again. |
| No data in tables (reports return empty) | The advertiser account has no spend in the trailing 365-day window. Sandbox mode (`test`/`demo` creds) works without a real account. |
| App stuck in Sandbox | Submit for review in **App Detail → Review** for production multi-user access. |
