-- Bank statement file uploads and parsed monthly aggregates.
-- Files are processed server-side and discarded; only monthly aggregates are
-- stored. Both tables RLS-protected via business_id -> businesses.owner_id.

-- 1. Upload metadata (one row per file uploaded) ----------------------------
create table public.bank_statement_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  file_name text not null,
  file_size integer,
  row_count integer,
  synced_at timestamp with time zone default now()
);

create index bank_statement_files_business_idx
  on public.bank_statement_files (business_id);

alter table public.bank_statement_files enable row level security;

create policy "Users can view their own bank statement files"
  on public.bank_statement_files for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.bank_statement_files.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert their own bank statement files"
  on public.bank_statement_files for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.bank_statement_files.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update their own bank statement files"
  on public.bank_statement_files for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.bank_statement_files.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.bank_statement_files.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete their own bank statement files"
  on public.bank_statement_files for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.bank_statement_files.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 2. Parsed monthly cash-flow aggregates ------------------------------------
create table public.bank_statement_monthly (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  month text not null,              -- YYYY-MM
  total_credits numeric default 0,
  total_debits  numeric default 0,
  net_flow      numeric default 0,
  transaction_count integer default 0,
  synced_at timestamp with time zone default now(),
  unique (business_id, month)
);

create index bank_statement_monthly_business_idx
  on public.bank_statement_monthly (business_id);

alter table public.bank_statement_monthly enable row level security;

create policy "Users can view their own bank statement monthly data"
  on public.bank_statement_monthly for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.bank_statement_monthly.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert their own bank statement monthly data"
  on public.bank_statement_monthly for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.bank_statement_monthly.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update their own bank statement monthly data"
  on public.bank_statement_monthly for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.bank_statement_monthly.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.bank_statement_monthly.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete their own bank statement monthly data"
  on public.bank_statement_monthly for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.bank_statement_monthly.business_id
    and public.businesses.owner_id = auth.uid()
  ));
