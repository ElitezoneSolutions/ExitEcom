# Shopify — ExitEcom Connect

How a merchant's Shopify store gets into ExitEcom, and what to configure.

## Why there are three paths

Shopify data is the one **required** source: without orders, products and
customers there is no Exit Score and no valuation. Historically the only way in
was for the merchant to build their own Shopify custom app and paste an
`shpat_` Admin API token — fine for a developer, a wall for a founder.

**ExitEcom Connect** (`connect.exitecom.com`, its own repo:
[ElitezoneSolutions/ExitEcom-Analytic](https://github.com/ElitezoneSolutions/ExitEcom-Analytic))
is a real Shopify app the merchant installs in a minute. It holds the Shopify
access token and hands the dashboard an opaque **connection key** (`eea_…`), so
no Shopify credential ever reaches the browser or this database.

Connect Shopify therefore offers, in order:

| Path | What the merchant does | Where it's implemented |
|---|---|---|
| **Install the ExitEcom app** *(recommended)* | Clicks one button, enters their store address, approves on Shopify. Nothing to copy. | `startConnectHandoffFn` → Connect → `POST /api/analytic/ingest` |
| **I have a connection key** | Pastes the `eea_…` key from the Connect success page. | `syncShopifyViaConnectionKeyFn` |
| **Advanced: own custom app** | Pastes store domain + `shpat_` token. | `syncShopifyStoreFn` (unchanged) |

`shopify_stores.source` records which was used: `'connect'` (credential is
`connection_key`, `access_token` is null) or `'custom_app'` (the reverse).

## The automatic handoff, step by step

1. **Mint a link.** `startConnectHandoffFn` (`src/lib/shopify.ts`) signs a
   30-minute token — `base64url({businessId, userId, email, exp}).hmac` — with
   `EXITECOM_LINK_SECRET`, and returns
   `https://connect.exitecom.com/install?link=<token>`.
2. **Merchant installs.** Connect verifies the token, runs Shopify OAuth, and
   stores the access token against that `businessId`.
3. **Connect pushes the store back.** It pulls the full dataset and POSTs it to
   `POST /api/analytic/ingest` in signed parts: `meta` (opens the sync, upserts
   `shopify_stores`, clears prior rows), then `orders`/`products`/`customers` in
   slices of 500, then `done`. Chunked because a large store is several MB —
   one request would risk the serverless size/duration limits.
4. **Dashboard notices.** The Connect Shopify page polls `shopify_stores` every
   3s (up to 5 minutes). The install happens on another origin and detours
   through Shopify, so the database is the only reliable signal — there is no
   `postMessage` to wait on. If the row exists but `last_synced_at` is null (a
   partial push), the page pulls the rest itself through the connection key.

5. **Or the dashboard adopts it later.** ExitEcom Connect writes its `shops` row
   to the **same Supabase project** this app uses, so a finished install is
   visible here immediately. On opening Connect Shopify, `adoptConnectInstallFn`
   looks for a `shops` row for this business and pulls the store if it finds one.
   That makes the link self-healing: a failed push, or a merchant who closed the
   tab mid-install, no longer leaves the store stranded. `shops` holds Shopify
   tokens and is RLS-locked with `anon`/`authenticated` revoked, so this lookup is
   a server function using the service-role client — never a browser query.

Every later refresh — "Sync now", auto-on-stale, `resyncStore` — goes through
`syncShopifyViaConnectionKeyFn`, i.e. the **pull** path. That means a failed
push degrades to "the data arrives on the next sync", never to data loss.

## Token lifecycle

Shopify no longer accepts non-expiring Admin API tokens, so Connect requests an
**expiring** offline token: a ~1 hour access token plus a ~90 day refresh token
that rotates on each use. Connect refreshes on demand; the dashboard never sees a
Shopify token either way.

The consequence to know about: **an installation that goes 90 days without a sync
must be reinstalled.** `/api/store-data` returns **409** in that case, and
`syncShopifyViaConnectionKeyFn` surfaces "Your Shopify connection has expired.
Reinstall the ExitEcom app on your store" — stored data and reports are
unaffected.

## Security

- **Both directions are HMAC-signed** with the same shared secret. An unsigned or
  mis-signed `POST /api/analytic/ingest` is rejected with 401; a tampered or
  expired `?link=` shows an error page rather than silently degrading.
- **A valid signature proves the sender, not the payload.** The ingest handler
  also checks that the named `businessId` actually exists before writing.
- **The ingest endpoint uses the service-role client** (it writes across users),
  so it lives in `src/lib/analytic-ingest.ts` and is mounted in `src/server.ts`
  *before* TanStack — signature verification needs the exact bytes that were
  signed, the same reason the Stripe webhook is handled there.
- **Connection keys are single-purpose.** A key reads one store, read-only, and
  dies when the merchant uninstalls the app (`app/uninstalled` drops the row in
  the Connect service).

## Configuration

**This app** (see [`env-vars.md`](env-vars.md)):

```env
EXITECOM_LINK_SECRET=<openssl rand -hex 32>
# CONNECT_APP_URL=https://connect.exitecom.com   # optional
```

Plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which the ingest endpoint
needs.

**The Connect service** (its own `.env.example` documents all of these):
`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `APP_URL=connect.exitecom.com`,
`EXITECOM_APP_URL=https://dash.exitecom.com`, `EXITECOM_LINK_SECRET` (identical
to the above), `DATABASE_URL`, `SESSION_SECRET`.

**Shopify Partner dashboard:** App URL `https://connect.exitecom.com/install`,
allowed redirect `https://connect.exitecom.com/auth/callback`.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `403 [API] This app is not approved to access REST endpoints with protected customer data` | Orders and customers are protected customer data. Declare it in Partner Dashboard → API access requests → Protected customer data access. No review is needed for apps installed only on development stores. The engine uses no customer names or emails, so **Level 1** suffices. |
| `403 [API] Non-expiring access tokens are no longer accepted` | An install predating the expiring-token flow. Reinstall. |
| "The ExitEcom Connect app isn't configured on this deployment" | `EXITECOM_LINK_SECRET` is unset here. The other two paths still work. |
| Install finishes but the dashboard keeps waiting | The push was rejected. Almost always the two secrets don't match — check the Connect service's logs for a 401 from `/api/analytic/ingest`. The merchant can paste their connection key meanwhile. |
| "That connection key isn't recognised" | The merchant uninstalled the app (which deletes the key) or copied it incompletely. Reinstall. |
| "This connect link has expired" | Links live 30 minutes. Start again from Connect Shopify. |
