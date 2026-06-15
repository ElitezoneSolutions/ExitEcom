-- Raw Google Analytics 4 (GA4) data store. Mirrors the ad-platform tables
-- (e.g. 20260608100000_google_raw_data.sql) but GA4 is a WEB-ANALYTICS source,
-- not an ad platform: there is no spend/ROAS. We persist property metadata, a
-- monthly traffic/conversion/revenue series and a per-channel breakdown.
-- Reports are computed on demand from these tables by deterministic code in
-- src/lib/analytics.ts. All tables RLS-protected via business_id -> owner_id.

-- 1. GA4 property metadata (one row per business) ----------------------------
-- source: 'oauth' (in-app Google OAuth) or 'manual' (pasted refresh token).
-- We store the long-lived refresh_token and mint access tokens per pull.
create table public.ga4_accounts (
  business_id uuid primary key references public.businesses on delete cascade,
  property_id text not null,
  refresh_token text,
  source text not null default 'oauth',
  name text,
  currency text,
  timezone text,
  property_type text,
  last_synced_at timestamp with time zone,
  synced_at timestamp with time zone default now()
);

alter table public.ga4_accounts enable row level security;

create policy "Users can view their own ga4 account"
  on public.ga4_accounts for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert their own ga4 account"
  on public.ga4_accounts for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update their own ga4 account"
  on public.ga4_accounts for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete their own ga4 account"
  on public.ga4_accounts for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 2. Monthly traffic/conversion/revenue series ------------------------------
create table public.ga4_monthly_insights (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  month text not null, -- YYYY-MM
  sessions numeric default 0,
  total_users numeric default 0,
  new_users numeric default 0,
  conversions numeric default 0, -- GA4 "key events"
  conversion_rate numeric default 0, -- conversions / sessions (0–1)
  purchase_revenue numeric default 0,
  transactions numeric default 0,
  synced_at timestamp with time zone default now(),
  unique (business_id, month)
);

create index ga4_monthly_insights_business_idx on public.ga4_monthly_insights (business_id);

alter table public.ga4_monthly_insights enable row level security;

create policy "Users can view ga4 insights for their own businesses"
  on public.ga4_monthly_insights for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert ga4 insights for their own businesses"
  on public.ga4_monthly_insights for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update ga4 insights for their own businesses"
  on public.ga4_monthly_insights for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete ga4 insights for their own businesses"
  on public.ga4_monthly_insights for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 3. Per-channel breakdown (sessionDefaultChannelGroup) ----------------------
create table public.ga4_channels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  channel text not null,
  sessions numeric default 0,
  conversions numeric default 0,
  purchase_revenue numeric default 0,
  session_share numeric default 0, -- share of total sessions (0–1)
  synced_at timestamp with time zone default now(),
  unique (business_id, channel)
);

create index ga4_channels_business_idx on public.ga4_channels (business_id);

alter table public.ga4_channels enable row level security;

create policy "Users can view ga4 channels for their own businesses"
  on public.ga4_channels for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_channels.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert ga4 channels for their own businesses"
  on public.ga4_channels for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_channels.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update ga4 channels for their own businesses"
  on public.ga4_channels for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_channels.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_channels.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete ga4 channels for their own businesses"
  on public.ga4_channels for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.ga4_channels.business_id
    and public.businesses.owner_id = auth.uid()
  ));
