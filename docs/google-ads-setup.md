# Google Ads OAuth — Setup Guide

The Google Ads connector's **OAuth** method is a real Google OAuth flow handled
**entirely inside this app** — no external service, no extra domain. The OAuth
client id/secret and the **developer token** live in this app's server
environment and are used only inside `createServerFn` handlers (`src/lib/google.ts`);
the redirect URI is a route on this app's own origin (`/google-oauth-callback`).
Tokens are stored in Supabase (`google_accounts`, RLS-protected) — we keep the
durable **refresh token** and mint access tokens per pull.

Three parts:
1. **Google Cloud setup** — OAuth client + API
2. **Developer token** — required to call the Google Ads API at all
3. **App configuration / how it works / verify / troubleshoot**

---

## Part 1: Google Cloud setup (OAuth client)

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create or
   pick a project.
2. **APIs & Services → Library** → enable the **Google Ads API**.
3. **APIs & Services → OAuth consent screen** → configure (External), add the
   scope `https://www.googleapis.com/auth/adwords`, and add yourself as a test
   user (or publish the app for production).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   **Web application**. Under **Authorized redirect URIs** add (must match
   `GOOGLE_OAUTH_REDIRECT_URI` exactly — scheme, host, port, path):
   ```
   https://dash.exitecom.com/google-oauth-callback
   http://localhost:8080/google-oauth-callback
   ```
5. Note the **Client ID** and **Client secret**.

---

## Part 2: Developer token (required)

The Google Ads API rejects every request without a developer token.

1. Sign in to a **Google Ads Manager (MCC) account** (create one if needed).
2. **Tools → API Center** → copy the **developer token**.
3. **Apply for Basic access.** A fresh token has *Test* access only — it can read
   only **test** accounts. To read live accounts you must apply for **Basic
   access** and be approved by Google. Until then, use the connector's sandbox
   (any customer id / refresh token containing `demo`) to preview.

---

## Part 3: Configure this app

Set these in `.env` (and in the hosting platform's env for production). They are
**server-side only — never `VITE_`-prefixed**. See `.env.example`.

```env
GOOGLE_ADS_CLIENT_ID=your_oauth_client_id
GOOGLE_ADS_CLIENT_SECRET=your_oauth_client_secret
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
GOOGLE_OAUTH_REDIRECT_URI=https://dash.exitecom.com/google-oauth-callback   # prod
# Local dev: http://localhost:8080/google-oauth-callback
```

- Read only inside `src/lib/google.ts` server functions; nothing reaches the client.
- When unset, the **OAuth** tab on `/google-connect` shows "not configured" and the
  **Manual** method (paste a customer id + refresh token) and sandbox still work.
- The refresh token + customer metadata are stored in Supabase `google_accounts`
  (`source = 'oauth' | 'manual'`, RLS) — not in sessions or files.

> **Production:** set these in your host's environment, not just local `.env` — the
> server reads them at boot. Restart/redeploy after changing them.

> Dev port: `npm run dev` serves on **8080** in this project; use whatever it prints
> and keep `GOOGLE_OAUTH_REDIRECT_URI` + the Google Cloud redirect URI in sync.

### How the flow works

```
/google-connect "OAuth" tab → getGoogleOAuthUrlFn(state)   [server: builds consent URL from client id]
      ↓ browser → accounts.google.com consent (scope=adwords, access_type=offline)
Google redirects → /google-oauth-callback?code=&state=     [this app, authenticated route]
      ↓ validate state (CSRF), then:
exchangeGoogleOAuthCodeFn({code})  [server: code → refresh token; listAccessibleCustomers]
      ↓ { refreshToken, customers[] }
pick customer (auto if one, picker if several)
      ↓
syncGoogleViaOAuth(customerId, refreshToken)  → syncGoogleAdsFn pull (GAQL) + commit (source 'oauth')
      ↓ stored in Supabase google_accounts (RLS)
→ /google-data
```

### Verify end-to-end
1. Set the env vars; run `npm run dev` (note the port).
2. `/google-connect` → **OAuth** → **Continue with Google** → approve → pick a
   customer → land on `/google-data` with real spend / ROAS / campaigns.
3. **Sync now** refreshes using the stored refresh token; **Disconnect** clears it.
4. No env / no approval: OAuth tab shows "not configured"; **Manual** + sandbox
   (creds containing `demo`) still work, and connect alongside Meta — each platform
   is scored *separately* in Marketing Efficiency.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "redirect_uri_mismatch" | The Google Cloud Authorized redirect URI must **exactly** equal `GOOGLE_OAUTH_REDIRECT_URI` (scheme, host, port, path — no trailing slash). |
| OAuth tab says "not configured" | Set `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_OAUTH_REDIRECT_URI`. |
| `DEVELOPER_TOKEN_NOT_APPROVED` / works only on test accounts | Apply for **Basic access** for your developer token in the Manager account's API Center. |
| 404 / "API version may be retired" | Google Ads API majors sunset ~monthly. The code defaults to a current major; if it lags, set `GOOGLE_ADS_API_VERSION` (e.g. `v23`) — see the [sunset dates](https://developers.google.com/google-ads/api/docs/sunset-dates). |
| 400 / "Metrics cannot be requested for a manager account" | You selected a Manager (MCC) account, which has no campaigns. Pick a client account, and set `GOOGLE_LOGIN_CUSTOMER_ID` to your MCC id so it's sent as `login-customer-id`. |
| "Google didn't return a refresh token" | Remove the app from your Google account's third-party access and reconnect, so Google re-prompts for offline consent. |
| No accounts found | The Google login has no Google Ads account access — grant it in the account/MCC. |
| Account under a manager | MVP targets directly-accessible accounts; manager-only customers may need a `login-customer-id` (not yet wired). |
