-- Track how each store was connected so we can refresh it the right way.
--   * 'custom_app' (default) — the merchant pasted a Shopify Admin API token,
--     which we store in access_token and reuse for incremental resyncs.
--   * 'analytic'             — the merchant connected via the ExitEcom Analytic
--     app. The Shopify token lives in the connector service; here we only keep
--     the opaque connection_key used to pull data via /api/store-data?key=...
--
-- access_token is already nullable; for analytic stores it stays null and the
-- connection_key carries the credential instead.
alter table public.shopify_stores
  add column if not exists source text not null default 'custom_app';

alter table public.shopify_stores
  add column if not exists connection_key text;
