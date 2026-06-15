# Google Analytics 4 (GA4) OAuth — Setup Guide

The GA4 connector's **OAuth** method is a real Google OAuth flow handled
**entirely inside this app** — no external service, no extra domain. It is
**web analytics**, not an ad platform: it pulls a monthly traffic/conversion/
revenue series plus a per-channel breakdown (no spend/ROAS). The data feeds a
separate **traffic signal** in the Exit Score (session growth + channel
diversification), never the ad-spend math.

GA4 **reuses the Google Ads OAuth client** (`GOOGLE_ADS_CLIENT_ID` /
`GOOGLE_ADS_CLIENT_SECRET` — the same Google Cloud project) but with the
read-only Analytics scope and its **own redirect URI**. **No developer token is
needed.** Server secrets are read only inside `createServerFn` handlers
(`src/lib/ga4.ts`); the redirect URI is a route on this app's own origin
(`/ga4-oauth-callback`). Tokens are stored in Supabase (`ga4_accounts`,
RLS-protected) — we keep the durable **refresh token** and mint access tokens
per pull.

Three parts:
1. **Google Cloud setup** — enable APIs + add the redirect URI
2. **App configuration**
3. **How it works / verify / troubleshoot**

---

## Part 1: Google Cloud setup

Use the **same Google Cloud project** as your Google Ads OAuth client.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and pick
   the project that holds your `GOOGLE_ADS_CLIENT_ID` OAuth client.
2. **APIs & Services → Library** → enable **both**:
   - **Google Analytics Data API** (runs the reports)
   - **Google Analytics Admin API** (lists the GA4 properties for the picker)
3. **APIs & Services → OAuth consent screen** → add the scope
   `https://www.googleapis.com/auth/analytics.readonly`, and add yourself as a
   test user (or publish the app for production).
4. **APIs & Services → Credentials** → open your existing **OAuth client ID**
   (the Google Ads one). Under **Authorized redirect URIs** add (must match
   `GA4_OAUTH_REDIRECT_URI` exactly — scheme, host, port, path):
   ```
   https://dash.exitecom.com/ga4-oauth-callback
   http://localhost:8080/ga4-oauth-callback
   ```

> The signed-in Google account must have at least **Viewer** access to the GA4
> property you want to analyse.

---

## Part 2: App configuration

Set these in the server environment (never `VITE_`-prefixed):

```
GOOGLE_ADS_CLIENT_ID=...        # reused from the Google Ads connector
GOOGLE_ADS_CLIENT_SECRET=...    # reused from the Google Ads connector
GA4_OAUTH_REDIRECT_URI=https://dash.exitecom.com/ga4-oauth-callback
```

Apply the database migration `supabase/migrations/20260615000000_ga4_raw_data.sql`
to the hosted Supabase project (creates `ga4_accounts`, `ga4_monthly_insights`,
`ga4_channels`). Until it's applied, connecting returns a "tables are missing"
error.

If OAuth env is blank, the OAuth tab shows "not configured"; the **Manual** path
(paste a property id + a `analytics.readonly` refresh token) still works, as does
**sandbox** mode (use a property id or refresh token containing `test`/`demo`/
`sandbox`).

---

## Part 3: How it works / verify / troubleshoot

**Flow:** Connect GA4 → approve the read-only Analytics scope → pick a property
(if more than one) → we pull the last 365 days via the Data API (`runReport` over
the `yearMonth` and `sessionDefaultChannelGroup` dimensions) and store it.

**Metrics pulled:** `sessions`, `totalUsers`, `newUsers`, `keyEvents` (GA4's
current name for conversions), `purchaseRevenue`, `ecommercePurchases`. The
site-wide conversion rate is computed as conversions ÷ sessions.

**Exit Score impact:** a connected GA4 property
- raises **Data Confidence** by 10,
- corroborates the **Growth Trajectory** dimension with session growth,
- scores **Platform & Channel Risk** from real traffic-source diversification
  (instead of the neutral default), and
- adds a **Traffic Concentration** risk when one channel dominates sessions.

The report only recomputes when there's Shopify order data, so GA4 alone won't
generate a score — connect Shopify and click **Run**, then confirm Data
Confidence rises and the Traffic Concentration risk appears.

**Troubleshooting:**
- *403 on connect/property list* — the **Analytics Admin API** isn't enabled, or
  the account can't see any property. Enable it and confirm Viewer access.
- *403 on sync* — the **Analytics Data API** isn't enabled on the project.
- *"didn't return a refresh token"* — remove ExitEcom from your Google account's
  third-party access and reconnect to re-consent (we request `prompt=consent`).
- *Wrong id* — use the **numeric property id** (Admin → Property Settings), not
  the `G-XXXX` measurement id.
