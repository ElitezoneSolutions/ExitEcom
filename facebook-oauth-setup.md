# Facebook (Meta) Ads OAuth — Setup Guide

The Meta Ads connector's **OAuth** method is a real Facebook OAuth flow handled
**entirely inside this app** — no external service, no extra domain. The App
ID/Secret live in this app's server environment and are used only inside
`createServerFn` handlers (`src/lib/meta.ts`); the redirect URI is a route on this
app's own origin (`/meta-oauth-callback`). Tokens are stored in Supabase
(`meta_accounts`, RLS-protected) — not in sessions or a `tokens.json` file.

This guide has three parts:
1. **Facebook App setup** — what to configure in the Meta Developer portal
2. **App configuration** — the env vars this app reads
3. **How the flow works / verify / troubleshoot**

---

## Part 1: Facebook App Setup (Meta Developer Portal)

### Step 1 — Open (or create) your app
1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps**.
2. Open your **Marketing API** app, or **Create App** → choose **Business** type.
3. **App Settings → Basic** — note your **App ID** and **App Secret** (click *Show*).

### Step 2 — Confirm App Type is Business
In **App Settings → Basic**, the **App Type** must be **Business** (required for
`ads_read`). If it's Consumer/Gaming, create a new Business app and add the
**Marketing API** product.

### Step 3 — Add Facebook Login
1. Left sidebar → **Add Product** → **Facebook Login** → **Set Up** → **Web**.
2. Site URL: your app origin (e.g. `https://dash.exitecom.com`, or `http://localhost:<port>` for dev).

### Step 4 — Configure OAuth Redirect URIs
**Facebook Login → Settings → Valid OAuth Redirect URIs** — add the routes on
**this app's own origin** (must match `META_OAUTH_REDIRECT_URI` exactly):
```
https://dash.exitecom.com/meta-oauth-callback
http://localhost:<port-vite-prints>/meta-oauth-callback
```
Enable **Client OAuth Login** and **Web OAuth Login**, then **Save Changes**.

### Step 5 — Privacy Policy (required to go Live)
**App Settings → Basic** — fill in **Privacy Policy URL** (and ideally Terms of
Service + App Icon), then **Save Changes**.

### Step 6 — Switch to Live
**App Settings → Basic** — flip the **In Development → Live** toggle. (Greyed out?
Add the Privacy Policy URL first.)

### Step 7 — App Review for `ads_read` (only to read *other* users' accounts)
> Skip if you're only connecting **your own** ad account (your app's admins/testers
> can use `ads_read` without review while in Development).

**App Review → Permissions and Features** → request `ads_read` → provide the
business use case + a screencast → submit (2–5 business days).

---

## Part 2: Configure this app

Set these in `.env` (and in the hosting platform's env for production). They are
**server-side only — never `VITE_`-prefixed** (that would leak the secret into the
browser bundle). See `.env.example`.

```env
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
META_OAUTH_REDIRECT_URI=https://dash.exitecom.com/meta-oauth-callback   # prod
# Local dev: http://localhost:<port-vite-prints>/meta-oauth-callback
```

- Read only inside `getMetaOAuthUrlFn` and `exchangeMetaOAuthCodeFn` in
  `src/lib/meta.ts` (Nitro server functions). The App Secret never reaches the client.
- When these are unset, the **OAuth** tab on `/meta-connect` shows a "not configured"
  message and the **Access token** method (and sandbox via `test`/`demo` creds) still works.
- The connected token + ad-account metadata are stored in Supabase `meta_accounts`
  (`source = 'oauth'`), under the user's row-level security — no `tokens.json`, no sessions.

> Dev port: not pinned in `vite.config.ts` (it uses `@lovable.dev/vite-tanstack-config`;
> Vite's default is 5173, but this sandbox config may pick another). Use whatever port
> `npm run dev` prints, and make `META_OAUTH_REDIRECT_URI` + the Meta portal match it.

---

## Part 3: How the flow works

```
/meta-connect  "OAuth" tab → getMetaOAuthUrlFn(state)   [server: builds FB consent URL from App ID]
      ↓ browser → facebook.com consent (scope=ads_read)
Facebook redirects → /meta-oauth-callback?code=&state=  [this app, authenticated route]
      ↓ validate state (CSRF), then:
exchangeMetaOAuthCodeFn({code})   [server: code → short-lived → long-lived token; GET /me/adaccounts]
      ↓ { accessToken, accounts[] }
pick ad account (auto if one, picker if several)
      ↓
syncMetaViaOAuth(adAccountId, accessToken)  → syncMetaAdAccountFn pull + commitMetaSync(source:'oauth')
      ↓ stored in Supabase meta_accounts (RLS)
→ /meta-data
```

The only domain other than this app is `facebook.com` itself (where the user
approves) — unavoidable for any OAuth. Everything else runs on this app.

### Verify end-to-end
1. Set the three env vars; run `npm run dev` (note the port).
2. Open `/meta-connect` → **OAuth** tab → **Continue with Facebook** → approve `ads_read`.
3. You return to `/meta-oauth-callback`; pick an account if prompted; you land on
   `/meta-data` with real spend / ROAS / campaigns.
4. **Sync now** on `/meta-data` refreshes using the stored long-lived token;
   **Disconnect** clears it.
5. Without env vars set: the OAuth tab shows "not configured"; the Access-token tab
   and sandbox creds still work.
6. Negative: denying consent on Facebook returns to the callback with a friendly error.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ads_read` not available | App Type must be **Business**. |
| "URL blocked / redirect URI mismatch" | The Meta portal's Valid OAuth Redirect URI must **exactly** equal `META_OAUTH_REDIRECT_URI` (scheme, host, port, path). |
| OAuth tab says "not configured" | Set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `META_OAUTH_REDIRECT_URI` in the server env. |
| App stuck in Development | Add a Privacy Policy URL, then flip to **Live**. |
| Other users can't connect | App must be **Live** and `ads_read` approved via **App Review**. |
| Token expired (~60 days) | Click **Continue with Facebook** again to reconnect; resync uses the stored long-lived token until then. |
| "No ad accounts found" | The Facebook login has no Meta ad account — grant it access in Business Manager. |
