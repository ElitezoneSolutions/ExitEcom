# Environment Variables

All variables prefixed `VITE_` are exposed to the browser bundle. Everything else is server-side only and must **never** be prefixed with `VITE_`.

---

## Supabase (required)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL — found in Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key — found in Project Settings → API |

---

## Supabase admin (Super Admin Dashboard)

Required **only** to run the Super Admin Dashboard (`/admin`). The service-role
key bypasses Row Level Security, so it is read **only inside server functions**
(`src/lib/admin/*`) and must **never** be `VITE_`-prefixed (that would inline it
into the browser bundle). Without these set the admin pages render an
"admin access is not configured" message; all other features are unaffected.

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Same project URL as `VITE_SUPABASE_URL`, exposed to the server without the `VITE_` prefix |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service-role** key — Project Settings → API → `service_role`. Secret; bypasses RLS |

---

## Meta (Facebook) Ads

Required for the in-app OAuth flow. Without these the OAuth tab shows a fallback message and users must use the Access token tab.

| Variable | Description |
|---|---|
| `FACEBOOK_APP_ID` | App ID from Meta for Developers → your app → Settings → Basic |
| `FACEBOOK_APP_SECRET` | App Secret from the same page (never expose client-side) |
| `META_OAUTH_REDIRECT_URI` | Full callback URL, e.g. `https://yourdomain.com/meta-oauth-callback` — must match exactly what's registered in your Meta app |

---

## Google Ads

All three are required to call the Google Ads API. The OAuth flow also needs the redirect URI.

| Variable | Description |
|---|---|
| `GOOGLE_ADS_CLIENT_ID` | OAuth 2.0 Client ID from Google Cloud Console |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth 2.0 Client Secret — server-side only |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | The **app's** developer token (from your Manager account → Tools → API Center). It identifies the app to Google; it does **not** restrict which accounts users can connect. Must have **Basic access** to read live (non-test) accounts. Each user's own account is authorised by their OAuth login, not by being in your MCC |
| `GOOGLE_OAUTH_REDIRECT_URI` | Full callback URL, e.g. `https://yourdomain.com/google-oauth-callback` |
| `GOOGLE_ADS_API_VERSION` | *(optional)* Override the API version, e.g. `v23`. Defaults to the current stable major if unset |

> **No global `login-customer-id`.** This is a multi-tenant app. The Manager (MCC)
> id needed to query an account through a manager is **always the connecting
> user's own**, discovered during OAuth and stored per connection
> (`google_accounts.login_customer_id`); directly-owned accounts need none. There is
> intentionally no `GOOGLE_LOGIN_CUSTOMER_ID` — a single global id would force every
> tenant's queries through one MCC and fail (`USER_PERMISSION_DENIED`) for any
> account that MCC doesn't manage.

---

## TikTok Ads

Required for the in-app OAuth flow. Without these the OAuth tab shows a fallback message and users must use the Access token tab.

| Variable | Description |
|---|---|
| `TIKTOK_APP_ID` | App ID from TikTok for Business → My Apps → your app |
| `TIKTOK_APP_SECRET` | App Secret from the same page — server-side only |
| `TIKTOK_OAUTH_REDIRECT_URI` | Full callback URL, e.g. `https://yourdomain.com/tiktok-oauth-callback` — must match exactly what's registered in your TikTok app |

---

## Snapchat Ads

Required for the in-app OAuth flow. Without these the OAuth tab shows a fallback message and users must use the Access token tab. Snapchat access tokens expire after 1 hour; a stored refresh token (used with the Client ID/Secret) renews them automatically.

| Variable | Description |
|---|---|
| `SNAPCHAT_CLIENT_ID` | OAuth Client ID from the Snapchat Business → Marketing API app |
| `SNAPCHAT_CLIENT_SECRET` | OAuth Client Secret from the same app — server-side only |
| `SNAPCHAT_REDIRECT_URI` | Full callback URL, e.g. `https://yourdomain.com/snapchat-oauth-callback` — must match the Snapchat app exactly |

---

## GA4 (Google Analytics 4)

GA4 **reuses the Google Ads OAuth client** (`GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` above) — it only needs its own redirect URI. Add the read-only Analytics scope to that OAuth client in Google Cloud Console.

| Variable | Description |
|---|---|
| `GA4_OAUTH_REDIRECT_URI` | Full callback URL, e.g. `https://yourdomain.com/ga4-oauth-callback` — must be registered on the shared Google OAuth client |

---

## AI (optional)

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key — used only to polish risk/action copy. The platform works fully without it; all numbers are deterministic |

---

## Quick-start `.env` template

```env
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Meta Ads OAuth
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
META_OAUTH_REDIRECT_URI=https://yourdomain.com/meta-oauth-callback

# Google Ads
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_OAUTH_REDIRECT_URI=https://yourdomain.com/google-oauth-callback
# GOOGLE_ADS_API_VERSION=v23   # optional override

# TikTok Ads OAuth
TIKTOK_APP_ID=
TIKTOK_APP_SECRET=
TIKTOK_OAUTH_REDIRECT_URI=https://yourdomain.com/tiktok-oauth-callback

# Snapchat Ads OAuth
SNAPCHAT_CLIENT_ID=
SNAPCHAT_CLIENT_SECRET=
SNAPCHAT_REDIRECT_URI=https://yourdomain.com/snapchat-oauth-callback

# GA4 (reuses the Google Ads OAuth client above)
GA4_OAUTH_REDIRECT_URI=https://yourdomain.com/ga4-oauth-callback

# AI copy polish (optional)
# GEMINI_API_KEY=
```
