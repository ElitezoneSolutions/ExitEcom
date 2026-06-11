# Environment Variables

All variables prefixed `VITE_` are exposed to the browser bundle. Everything else is server-side only and must **never** be prefixed with `VITE_`.

---

## Supabase (required)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL — found in Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key — found in Project Settings → API |

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
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Developer token from your Google Ads Manager account → Tools → API Center. Must have **Basic access** to read live (non-test) accounts |
| `GOOGLE_OAUTH_REDIRECT_URI` | Full callback URL, e.g. `https://yourdomain.com/google-oauth-callback` |
| `GOOGLE_ADS_API_VERSION` | *(optional)* Override the API version, e.g. `v23`. Defaults to the current stable major if unset |
| `GOOGLE_LOGIN_CUSTOMER_ID` | *(optional)* Global fallback Manager (MCC) ID. Prefer leaving this unset — the per-connection `loginCustomerId` discovered during OAuth is used instead |

---

## TikTok Ads

Required for the in-app OAuth flow. Without these the OAuth tab shows a fallback message and users must use the Access token tab.

| Variable | Description |
|---|---|
| `TIKTOK_APP_ID` | App ID from TikTok for Business → My Apps → your app |
| `TIKTOK_APP_SECRET` | App Secret from the same page — server-side only |
| `TIKTOK_OAUTH_REDIRECT_URI` | Full callback URL, e.g. `https://yourdomain.com/tiktok-oauth-callback` — must match exactly what's registered in your TikTok app |

---

## Shopify Analytic Connector

Only needed if you use the ExitEcom-hosted Shopify connection key flow.

| Variable | Description |
|---|---|
| `SHOPIFY_ANALYTIC_APP_URL` | Base URL of the ExitEcom analytic connector service |

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

# Shopify Analytic Connector (optional)
# SHOPIFY_ANALYTIC_APP_URL=

# AI copy polish (optional)
# GEMINI_API_KEY=
```
