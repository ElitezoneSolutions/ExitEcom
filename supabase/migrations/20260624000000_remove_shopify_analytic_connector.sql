-- Remove the ExitEcom Analytic Shopify connector.
--
-- The connection-key path (the separate ExitEcom Analytic OAuth service) has been
-- removed from the app — Shopify now connects only via a merchant's own custom-app
-- Admin API token. The `connection_key` column (added in
-- 20260607000000_shopify_connection_source.sql) is no longer written or read, so
-- drop it. Any store previously connected via the analytic key must reconnect with
-- a custom-app token.
--
-- The `source` column is kept (it now only ever holds 'custom_app') to avoid
-- churning every existing row and the upsert path that still sets it.
alter table public.shopify_stores
  drop column if exists connection_key;
