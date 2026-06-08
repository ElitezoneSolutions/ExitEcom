-- Raw Google Ads data store. Mirrors the Meta tables
-- (20260608000000_meta_raw_data.sql): connecting an account pulls and persists
-- account metadata, a monthly insight series and a per-campaign breakdown.
-- Reports are computed on demand from these tables by deterministic code in
-- src/lib/analytics.ts. All tables RLS-protected via business_id -> owner_id.

-- 1. Google Ads account metadata (one row per business) ----------------------
-- source: 'oauth' (in-app Google OAuth) or 'manual' (pasted refresh token).
-- We store the long-lived refresh_token and mint access tokens per pull.
create table public.google_accounts (
  business_id uuid primary key references public.businesses on delete cascade,
  customer_id text not null,
  refresh_token text,
  source text not null default 'oauth',
  name text,
  currency text,
  timezone text,
  account_status text,
  last_synced_at timestamp with time zone,
  synced_at timestamp with time zone default now()
);

alter table public.google_accounts enable row level security;

create policy "Users can view their own google account"
  on public.google_accounts for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert their own google account"
  on public.google_accounts for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update their own google account"
  on public.google_accounts for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete their own google account"
  on public.google_accounts for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 2. Monthly insight series --------------------------------------------------
create table public.google_monthly_insights (
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

create index google_monthly_insights_business_idx on public.google_monthly_insights (business_id);

alter table public.google_monthly_insights enable row level security;

create policy "Users can view google insights for their own businesses"
  on public.google_monthly_insights for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert google insights for their own businesses"
  on public.google_monthly_insights for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update google insights for their own businesses"
  on public.google_monthly_insights for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete google insights for their own businesses"
  on public.google_monthly_insights for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 3. Per-campaign breakdown --------------------------------------------------
create table public.google_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  google_campaign_id text not null,
  name text,
  channel_type text,
  status text,
  spend numeric default 0,
  conversions numeric default 0,
  conversion_value numeric default 0,
  roas numeric default 0,
  synced_at timestamp with time zone default now(),
  unique (business_id, google_campaign_id)
);

create index google_campaigns_business_idx on public.google_campaigns (business_id);

alter table public.google_campaigns enable row level security;

create policy "Users can view google campaigns for their own businesses"
  on public.google_campaigns for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert google campaigns for their own businesses"
  on public.google_campaigns for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update google campaigns for their own businesses"
  on public.google_campaigns for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete google campaigns for their own businesses"
  on public.google_campaigns for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.google_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));
