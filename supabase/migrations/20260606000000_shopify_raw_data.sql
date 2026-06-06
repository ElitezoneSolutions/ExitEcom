-- Raw Shopify data store.
-- Connecting a store now pulls and persists the full dataset (orders, products,
-- customers, store metadata). Reports are computed on demand from these tables
-- by deterministic code — no AI, no auto-generated report on connect.
-- All tables are RLS-protected via business_id -> businesses.owner_id, mirroring
-- the risks/actions policy pattern in 20260525000000_init.sql.

-- 0. Extend valuation_data with fields the deterministic engine now persists
--    (previously these lived only in the front-end shape / Gemini output).
alter table public.valuation_data add column if not exists revenue_ttm numeric default 0;
alter table public.valuation_data add column if not exists ebitda numeric default 0;
alter table public.valuation_data add column if not exists score_tier text;
alter table public.valuation_data add column if not exists score_breakdown jsonb default '[]'::jsonb;
alter table public.valuation_data add column if not exists revenue_monthly jsonb default '[]'::jsonb;

-- 1. Shopify store metadata (one row per business) -----------------------------
create table public.shopify_stores (
  business_id uuid primary key references public.businesses on delete cascade,
  shop_domain text not null,
  access_token text,
  name text,
  currency text,
  country text,
  plan text,
  shop_created_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  synced_at timestamp with time zone default now()
);

alter table public.shopify_stores enable row level security;

create policy "Users can view their own shopify store"
  on public.shopify_stores for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_stores.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert their own shopify store"
  on public.shopify_stores for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_stores.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update their own shopify store"
  on public.shopify_stores for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_stores.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_stores.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete their own shopify store"
  on public.shopify_stores for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_stores.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 2. Orders -------------------------------------------------------------------
create table public.shopify_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  shopify_order_id text not null,
  order_number text,
  total_price numeric default 0,
  currency text,
  created_at timestamp with time zone,
  processed_at timestamp with time zone,
  financial_status text,
  customer_id text,
  line_items jsonb default '[]'::jsonb,
  synced_at timestamp with time zone default now(),
  unique (business_id, shopify_order_id)
);

create index shopify_orders_business_idx on public.shopify_orders (business_id);

alter table public.shopify_orders enable row level security;

create policy "Users can view orders for their own businesses"
  on public.shopify_orders for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_orders.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert orders for their own businesses"
  on public.shopify_orders for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_orders.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update orders for their own businesses"
  on public.shopify_orders for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_orders.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_orders.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete orders for their own businesses"
  on public.shopify_orders for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_orders.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 3. Products -----------------------------------------------------------------
create table public.shopify_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  shopify_product_id text not null,
  title text,
  product_type text,
  vendor text,
  status text,
  created_at timestamp with time zone,
  variants jsonb default '[]'::jsonb,
  synced_at timestamp with time zone default now(),
  unique (business_id, shopify_product_id)
);

create index shopify_products_business_idx on public.shopify_products (business_id);

alter table public.shopify_products enable row level security;

create policy "Users can view products for their own businesses"
  on public.shopify_products for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_products.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert products for their own businesses"
  on public.shopify_products for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_products.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update products for their own businesses"
  on public.shopify_products for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_products.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_products.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete products for their own businesses"
  on public.shopify_products for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_products.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- 4. Customers ----------------------------------------------------------------
create table public.shopify_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  shopify_customer_id text not null,
  email text,
  first_name text,
  last_name text,
  orders_count integer default 0,
  total_spent numeric default 0,
  created_at timestamp with time zone,
  last_order_at timestamp with time zone,
  synced_at timestamp with time zone default now(),
  unique (business_id, shopify_customer_id)
);

create index shopify_customers_business_idx on public.shopify_customers (business_id);

alter table public.shopify_customers enable row level security;

create policy "Users can view customers for their own businesses"
  on public.shopify_customers for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_customers.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert customers for their own businesses"
  on public.shopify_customers for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_customers.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update customers for their own businesses"
  on public.shopify_customers for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_customers.business_id
    and public.businesses.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_customers.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete customers for their own businesses"
  on public.shopify_customers for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.shopify_customers.business_id
    and public.businesses.owner_id = auth.uid()
  ));
