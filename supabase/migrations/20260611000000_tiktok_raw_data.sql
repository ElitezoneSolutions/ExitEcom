-- Raw TikTok Ads data store. Mirrors meta_raw_data and google_raw_data:
-- connecting stores account metadata, a monthly insight series, and a
-- per-campaign breakdown. Reports are computed on demand from these tables.
-- All tables RLS-protected via business_id -> businesses.owner_id.

-- 1. TikTok Ads account metadata (one row per business) ---------------------
-- source: 'oauth' (in-app OAuth) or 'direct' (pasted access token).
-- Access tokens are long-lived (~365 days) — no refresh token needed.
create table public.tiktok_accounts (
  business_id uuid primary key references public.businesses on delete cascade,
  advertiser_id text not null,
  access_token text,
  source text not null default 'oauth',
  name text,
  currency text,
  timezone text,
  account_status text,
  last_synced_at timestamp with time zone,
  synced_at timestamp with time zone default now()
);

alter table public.tiktok_accounts enable row level security;

create policy "Users can view their own tiktok account"
  on public.tiktok_accounts for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert their own tiktok account"
  on public.tiktok_accounts for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update their own tiktok account"
  on public.tiktok_accounts for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete their own tiktok account"
  on public.tiktok_accounts for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 2. Monthly insight series --------------------------------------------------
create table public.tiktok_monthly_insights (
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

create index tiktok_monthly_insights_business_idx
  on public.tiktok_monthly_insights (business_id);

alter table public.tiktok_monthly_insights enable row level security;

create policy "Users can view tiktok insights for their own businesses"
  on public.tiktok_monthly_insights for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert tiktok insights for their own businesses"
  on public.tiktok_monthly_insights for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update tiktok insights for their own businesses"
  on public.tiktok_monthly_insights for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete tiktok insights for their own businesses"
  on public.tiktok_monthly_insights for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 3. Per-campaign breakdown --------------------------------------------------
create table public.tiktok_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  tiktok_campaign_id text not null,
  name text,
  objective_type text,
  status text,
  spend numeric default 0,
  conversions numeric default 0,
  conversion_value numeric default 0,
  roas numeric default 0,
  synced_at timestamp with time zone default now(),
  unique (business_id, tiktok_campaign_id)
);

create index tiktok_campaigns_business_idx
  on public.tiktok_campaigns (business_id);

alter table public.tiktok_campaigns enable row level security;

create policy "Users can view tiktok campaigns for their own businesses"
  on public.tiktok_campaigns for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert tiktok campaigns for their own businesses"
  on public.tiktok_campaigns for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update tiktok campaigns for their own businesses"
  on public.tiktok_campaigns for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete tiktok campaigns for their own businesses"
  on public.tiktok_campaigns for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.tiktok_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));
