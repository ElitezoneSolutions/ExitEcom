-- Re-introduce the ExitEcom Connect Shopify connector.
--
-- 20260624000000_remove_shopify_analytic_connector.sql dropped `connection_key`
-- when the separate OAuth service was unwired. That service is back as ExitEcom
-- Connect (connect.exitecom.com): merchants install a real Shopify app instead of
-- building their own custom app and pasting an Admin API token.
--
-- `shopify_stores.source` now takes:
--   * 'custom_app' (default) — merchant pasted their own Admin API token, stored
--     in access_token and reused for incremental resyncs.
--   * 'connect'              — merchant installed ExitEcom Connect. The Shopify
--     token stays in that service; here we keep only the opaque connection_key,
--     used to pull via GET /api/store-data?key=… . access_token stays null.
alter table public.shopify_stores
  add column if not exists connection_key text;

-- One store per business already (business_id is the PK), but the key must not
-- be reusable across businesses.
create unique index if not exists shopify_stores_connection_key_idx
  on public.shopify_stores (connection_key)
  where connection_key is not null;

-- Idempotency ledger for the chunked push from ExitEcom Connect. The service
-- POSTs a store's data as several signed parts tied together by sync_id; this
-- table lets the receiver recognise a replayed or retried part.
-- Service-role only: RLS is enabled with no policies, so no client can read it.
create table if not exists public.shopify_connect_syncs (
  sync_id     uuid primary key,
  business_id uuid not null references public.businesses on delete cascade,
  shop_domain text not null,
  started_at  timestamp with time zone default now(),
  completed_at timestamp with time zone
);

alter table public.shopify_connect_syncs enable row level security;

create index if not exists shopify_connect_syncs_business_idx
  on public.shopify_connect_syncs (business_id);
