-- Raw Snapchat Ads data store. Mirrors tiktok_raw_data and the other ad-platform
-- migrations: account metadata, monthly insight series, per-campaign breakdown.
-- Reports are computed on demand from these tables.
-- All tables RLS-protected via business_id -> businesses.owner_id.
--
-- Key difference from TikTok: Snapchat access tokens expire after 3600 s.
-- refresh_token is stored so that re-syncs can obtain a fresh access_token.

-- 1. Snapchat Ads account metadata (one row per business) ---------------------
-- source: 'oauth' (in-app OAuth) or 'direct' (pasted token + ad account id).
create table public.snapchat_accounts (
  business_id uuid primary key references public.businesses on delete cascade,
  ad_account_id text not null,
  access_token text,
  refresh_token text,
  source text not null default 'oauth',
  name text,
  currency text,
  timezone text,
  account_status text,
  last_synced_at timestamp with time zone,
  synced_at timestamp with time zone default now()
);

alter table public.snapchat_accounts enable row level security;

create policy "Users can view their own snapchat account"
  on public.snapchat_accounts for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert their own snapchat account"
  on public.snapchat_accounts for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update their own snapchat account"
  on public.snapchat_accounts for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete their own snapchat account"
  on public.snapchat_accounts for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_accounts.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 2. Monthly insight series --------------------------------------------------
create table public.snapchat_monthly_insights (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  month text not null, -- YYYY-MM
  spend numeric default 0,
  impressions numeric default 0,
  clicks numeric default 0,   -- Snapchat calls these "swipes"
  conversions numeric default 0,
  conversion_value numeric default 0,
  roas numeric default 0,
  synced_at timestamp with time zone default now(),
  unique (business_id, month)
);

create index snapchat_monthly_insights_business_idx
  on public.snapchat_monthly_insights (business_id);

alter table public.snapchat_monthly_insights enable row level security;

create policy "Users can view snapchat insights for their own businesses"
  on public.snapchat_monthly_insights for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert snapchat insights for their own businesses"
  on public.snapchat_monthly_insights for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update snapchat insights for their own businesses"
  on public.snapchat_monthly_insights for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete snapchat insights for their own businesses"
  on public.snapchat_monthly_insights for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_monthly_insights.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 3. Per-campaign breakdown --------------------------------------------------
create table public.snapchat_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  snapchat_campaign_id text not null,
  name text,
  objective text,
  status text,
  spend numeric default 0,
  conversions numeric default 0,
  conversion_value numeric default 0,
  roas numeric default 0,
  synced_at timestamp with time zone default now(),
  unique (business_id, snapchat_campaign_id)
);

create index snapchat_campaigns_business_idx
  on public.snapchat_campaigns (business_id);

alter table public.snapchat_campaigns enable row level security;

create policy "Users can view snapchat campaigns for their own businesses"
  on public.snapchat_campaigns for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert snapchat campaigns for their own businesses"
  on public.snapchat_campaigns for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update snapchat campaigns for their own businesses"
  on public.snapchat_campaigns for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete snapchat campaigns for their own businesses"
  on public.snapchat_campaigns for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.snapchat_campaigns.business_id
    and public.businesses.owner_id = auth.uid()
  ));
