-- Raw Meta (Facebook/Instagram) Ads data store.
-- Connecting an ad account pulls and persists the full dataset (account metadata,
-- monthly insight series, per-campaign breakdown). Reports are computed on demand
-- from these tables by deterministic code in src/lib/analytics.ts — connecting an
-- account never auto-generates a report.
-- All tables are RLS-protected via business_id -> businesses.owner_id, mirroring
-- the shopify_* policy pattern in 20260606000000_shopify_raw_data.sql.

-- 1. Meta ad account metadata (one row per business) --------------------------
-- source tracks the connector path used, so a resync knows how to re-auth:
--   'direct'   -> a long-lived access token pasted by the user (stored here)
--   'analytic' -> an ExitEcom-hosted OAuth connection key (token held off-repo)
create table public.meta_accounts (
  business_id uuid primary key references public.businesses on delete cascade,
  ad_account_id text not null,
  access_token text,
  connection_key text,
  source text not null default 'direct',
  name text,
  currency text,
  timezone text,
  account_status text,
  last_synced_at timestamp with time zone,
  synced_at timestamp with time zone default now()
);

alter table public.meta_accounts enable row level security;

create policy "Users can view their own meta account"
  on public.meta_accounts for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert their own meta account"
  on public.meta_accounts for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update their own meta account"
  on public.meta_accounts for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete their own meta account"
  on public.meta_accounts for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 2. Monthly insight series ---------------------------------------------------
create table public.meta_monthly_insights (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  month text not null, -- YYYY-MM
  spend numeric default 0,
  impressions numeric default 0,
  clicks numeric default 0,
  conversions numeric default 0,
  conversion_value numeric default 0,
  roas numeric default 0,
  synced_at timestamp with time zone default now(),
  unique (business_id, month)
);

create index meta_monthly_insights_business_idx on public.meta_monthly_insights (business_id);

alter table public.meta_monthly_insights enable row level security;

create policy "Users can view meta insights for their own businesses"
  on public.meta_monthly_insights for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert meta insights for their own businesses"
  on public.meta_monthly_insights for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update meta insights for their own businesses"
  on public.meta_monthly_insights for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete meta insights for their own businesses"
  on public.meta_monthly_insights for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 3. Per-campaign breakdown ---------------------------------------------------
create table public.meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  meta_campaign_id text not null,
  name text,
  objective text,
  status text,
  spend numeric default 0,
  conversions numeric default 0,
  conversion_value numeric default 0,
  roas numeric default 0,
  synced_at timestamp with time zone default now(),
  unique (business_id, meta_campaign_id)
);

create index meta_campaigns_business_idx on public.meta_campaigns (business_id);

alter table public.meta_campaigns enable row level security;

create policy "Users can view meta campaigns for their own businesses"
  on public.meta_campaigns for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert meta campaigns for their own businesses"
  on public.meta_campaigns for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update meta campaigns for their own businesses"
  on public.meta_campaigns for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete meta campaigns for their own businesses"
  on public.meta_campaigns for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.meta_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));
