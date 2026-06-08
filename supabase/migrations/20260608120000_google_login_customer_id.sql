-- Per-connection login-customer-id for Google Ads.
--
-- The Google Ads API requires the Manager (MCC) account id as the
-- `login-customer-id` header when an account is reached THROUGH a manager. This
-- value is specific to each connected user's own account hierarchy (discovered
-- during OAuth), so it must be stored per connection — not as a single global id.
-- Standalone accounts store their own id here (querying through themselves).

ALTER TABLE public.google_accounts
  ADD COLUMN IF NOT EXISTS login_customer_id text;
