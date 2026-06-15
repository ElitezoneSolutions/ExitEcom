# TikTok Ads — Setup Guide

## Must-Have Checklist

Everything below must be in place before the connector will work end-to-end.

- [ ] **TikTok for Business account** — the account that owns the TikTok app (not just a regular TikTok account)
- [ ] **App created** in the TikTok for Business developer portal with type **Web**
- [ ] **Two scopes enabled** on the app: `Ad Account Read` (Reporting) + `Ad Reporting Read`
- [ ] **Redirect URI** added to the app's Basic Settings — must match `TIKTOK_OAUTH_REDIRECT_URI` exactly
- [ ] **Three env vars set** on the server: `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_OAUTH_REDIRECT_URI`
- [ ] **App in Development/Sandbox mode** is fine for connecting your own account — you do not need App Review for that
- [ ] **App submitted for review** only if you want *other people's* TikTok Ads accounts to connect via your platform

---

## Part 1: TikTok App Setup

### Step 1 — Create an app

1. Go to [business-api.tiktok.com](https://business-api.tiktok.com) and sign in
   with your TikTok for Business account.
2. Top nav → **My Apps** → **Create App**.
3. Choose **Web** app type and fill in the name, description and category.
4. After creation you'll see your **App ID** and **App Secret** on the app detail
   page. Copy both — you'll need them in Part 2.

### Step 2 — Enable scopes (critical)

In **App Detail → Scopes**, enable **both** of these:

| Scope | Why it's needed |
| --- | --- |
| `Ad Account Read` (under Reporting) | Read advertiser account metadata and campaign list |
| `Ad Reporting Read` | Pull spend, impressions, clicks, conversions, and conversion value reports |

Without `Ad Reporting Read` the connector will connect successfully but fail when pulling data (code 40300 — permission denied).

### Step 3 — Add the redirect URI

In **App Detail → Basic Settings**, add your redirect URI under **Redirect URI**:

```
https://dash.exitecom.com/tiktok-oauth-callback
http://localhost:8080/tiktok-oauth-callback      # local dev (check your actual port)
```

Rules:
- Must match `TIKTOK_OAUTH_REDIRECT_URI` **exactly** — scheme, host, port, path
- No trailing slash
- If your local dev server runs on a different port (e.g. 8081), add that URI too

### Step 4 — App review (production multi-user only)

> **Skip this during development.** Your own TikTok Ads accounts always work while
> the app is in Development/Sandbox mode.

For production, where your platform's customers connect their own TikTok Ads accounts,
submit the app for API review in **App Detail → Review**. Approval is required before
other users' data can be accessed.

---

## Part 2: Configure this app

Set these in `.env` (and in the hosting platform's environment for production).
They are **server-side only — never use the `VITE_` prefix** or the secret leaks to the browser.

```env
TIKTOK_APP_ID=your_app_id
TIKTOK_APP_SECRET=your_app_secret
TIKTOK_OAUTH_REDIRECT_URI=https://dash.exitecom.com/tiktok-oauth-callback
# Local dev: http://localhost:8080/tiktok-oauth-callback  (match the port Vite actually uses)
```

These are read only inside `getTikTokOAuthUrlFn` and `exchangeTikTokOAuthCodeFn` in
`src/lib/tiktok.ts`. The App Secret never reaches the browser.

When unset, the **OAuth** tab on `/tiktok-connect` shows "not configured" and falls
back gracefully — the **Access token** tab and sandbox mode (use `test`/`demo`/`sandbox`
in any field) still work.

### Access token (direct) path — no env vars needed

Users can also connect by generating a token manually:

1. TikTok Marketing API portal → **App Detail → Authentication → Access Token** —
   generate a token authorised against the target advertiser account.
2. TikTok Ads Manager → **Account Settings** — copy the 13-digit **Advertiser ID**.
3. Paste both into the **Access token** tab on `/tiktok-connect`.

Direct tokens last ~365 days. Stored in Supabase `tiktok_accounts` with `source = 'direct'`.

---

## Part 3: How the flow works

```
/tiktok-connect  "OAuth" tab → getTikTokOAuthUrlFn(state)     [server: builds TikTok consent URL]
      ↓ browser → business-api.tiktok.com consent
TikTok redirects → /tiktok-oauth-callback?auth_code=&state=   [this app, authenticated route]
      ↓ validate state (CSRF), then:
exchangeTikTokOAuthCodeFn({authCode})  [server: auth_code → access_token + advertiser_ids[]]
      ↓ GET /advertiser/info/ → { accessToken, accounts[] }
pick advertiser account (auto if one, picker UI if several)
      ↓
syncTikTokViaOAuth(advertiserId, accessToken)  → syncTikTokAdsFn → pull() + commitTikTokSync(source:'oauth')
      ↓ stored in Supabase tiktok_accounts (RLS)
→ /tiktok-data
```

**Key TikTok API differences from Meta/Google:**

| Detail | TikTok | Meta | Google |
| --- | --- | --- | --- |
| Auth header | `Access-Token: <token>` | query param | `Authorization: Bearer` |
| OAuth callback param | `auth_code` | `code` | `code` |
| Token endpoint body | JSON | form-encoded | form-encoded |
| Refresh token | None (token is long-lived ~365d) | None (long-lived) | Yes (refresh_token) |
| Response status check | `body.code === 0` (HTTP always 200) | `res.ok` | `res.ok` |
| Monthly data | Daily reports (`stat_time_day`) bucketed in code | `time_increment=monthly` | GAQL `segments.month` |
| Reporting HTTP method | GET with JSON-encoded query params | POST body | POST body |

### Data pulled per sync

1. **Account metadata** (`GET /advertiser/info/`) — name, currency, timezone, status
2. **Daily report** (`GET /report/integrated/get/`, `data_level: AUCTION_ADVERTISER`) — spend, impressions, clicks, conversion, total_value — bucketed by YYYY-MM
3. **Campaign report** (`GET /report/integrated/get/`, `data_level: AUCTION_CAMPAIGN`) — spend, conversion, total_value per campaign
4. **Campaign list** (`GET /campaign/get/`) — name, objective, status — merged with report by campaign ID

All stored in `tiktok_accounts`, `tiktok_monthly_insights`, `tiktok_campaigns`.
TikTok spend feeds into the Exit Score via the shared `adFeeds` pipeline in
`src/lib/analytics.ts` alongside Meta, Google, and Snapchat.

**Correct metric names (TikTok v1.3 API):**
- `conversion` — number of conversions (singular, not `conversions`)
- `total_value` — total conversion value / revenue (not `value`, not `conversion_value`); silently omitted for accounts that don't track purchase value
- `stat_time_day` — daily time dimension (not `date` or `date_time`)

**Silent fallback chain (daily report):**
The connector tries the richest data shape first and falls back automatically if TikTok rejects it:
1. `AUCTION_ADVERTISER` + `total_value` + 365-day window (production)
2. → `total_value` invalid → retry without it (ROAS/conversionValue = 0)
3. → `AUCTION_ADVERTISER` unsupported → retry with `AUCTION_CAMPAIGN` (sandbox)
4. → time span > 30 days → retry with 30-day window (sandbox)

QPS rate limits (code 40100 + "qps" in message) trigger automatic backoff and retry at each step.

### Verify end-to-end

1. Set all three env vars; run `npm run dev`.
2. Open `/tiktok-connect` → **OAuth** tab → **Continue with TikTok** → approve access.
3. You return to `/tiktok-oauth-callback`; pick an account if prompted; you land on
   `/tiktok-data` with real spend / ROAS / campaigns.
4. **Refresh** on `/tiktok-data` re-pulls using the stored access token.
5. **Disconnect** clears all stored TikTok data for that business.
6. Without env vars: OAuth tab shows "not configured"; Access token tab and sandbox
   creds (`test`/`demo`/`sandbox` in any field) still work.

---

## Troubleshooting

| Problem | Cause | Fix |
| --- | --- | --- |
| OAuth tab says "not configured" | Env vars missing | Set `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_OAUTH_REDIRECT_URI` and restart the server. |
| "Redirect URI mismatch" on TikTok | URI not registered | Add the exact URI (scheme + host + port + path, no trailing slash) to the app's Basic Settings in the portal. |
| code 40001 — missing/wrong parameter | Wrong advertiser ID format | Check that the Advertiser ID is numeric (no spaces, dashes, or letters). |
| code 40002 — invalid metric/dimension | API metric name changed | Check `src/lib/tiktok.ts` — metrics must be `total_value` (not `value`) and `conversion` (not `conversions`). |
| code 40100 + "QPS" in message — rate limit | Too many parallel requests | Code automatically retries with backoff. If it persists, the account's QPS quota is very low — wait a moment and retry. |
| code 40100 — advertiser not accessible | Token scope missing | Check `Ad Account Read` scope is enabled on the app in the portal. |
| code 40105 — token revoked | Token expired or revoked | Generate a new token in the TikTok Marketing API portal and reconnect. |
| code 40300 — permission denied | Reporting scope missing | Enable `Ad Reporting Read` scope in the app's Scopes settings in the portal. |
| code 40009 — unsupported data_level | Sandbox limitation | Code automatically falls back to `AUCTION_CAMPAIGN` data level. No action needed. |
| "max time span is 30 days" | Sandbox daily report limit | Code automatically retries with a 30-day window. No action needed — you'll get 1 month of data instead of 12. |
| HTML page / 405 from reporting endpoint | Wrong HTTP method | The reporting endpoint is GET, not POST. Current code is correct — if this appears again check `fetchReportPages` in `src/lib/tiktok.ts`. |
| "No advertiser accounts were authorised" | User didn't approve | Ask the user to re-authorise and approve at least one advertiser account on the TikTok consent screen. |
| Accounts show but picking one errors | Any of the above | The error message in the red box on `/tiktok-connect` tells you the exact code — match it to the table above. |
| OAuth connects but data gone after refresh | `business.id` race in popup | Fixed in code — `commitTikTokSync` now fetches business ID directly from Supabase if not in state yet. |
| No data in tables (reports empty) | No spend in window | The advertiser has no spend in the trailing 365 days (or 30 days in sandbox). Use the sandbox checkbox + TikTok sandbox creds to test without real spend. |
| App stuck in Sandbox for other users | No App Review | Submit for review in **App Detail → Review** for production multi-user access. |
