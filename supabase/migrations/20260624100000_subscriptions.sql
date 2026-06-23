-- Stripe Billing — subscription state.
--
-- One row per user holding the current subscription status. The Stripe webhook
-- (src/server.ts → /api/stripe-webhook) is the SINGLE WRITER, using the
-- service-role key (which bypasses RLS). The browser anon client can only SELECT
-- its own row — there is deliberately NO client insert/update policy, so a user
-- can never grant themselves an active plan from the front end.
--
-- Access-granting statuses (active / trialing / past_due / comp) are interpreted
-- in app code (useSubscription) rather than in SQL, so the gate logic lives in
-- one place. `comp` = complimentary access with no Stripe subscription (used to
-- grandfather users who signed up before billing existed).

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none'
    check (status in (
      'none', 'trialing', 'active', 'past_due',
      'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'comp'
    )),
  price_id text,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean not null default false,
  updated_at timestamp with time zone not null default now()
);

create index if not exists subscriptions_customer_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

-- A signed-in user may read ONLY their own subscription row. No insert/update/
-- delete policy exists: the service-role webhook is the only writer.
create policy "Users can view their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Grandfather everyone who already has an account: give them complimentary
-- access so the paywall (added in this release) never locks out existing users.
-- New users who sign up AFTER this migration get no row → gated → must subscribe.
insert into public.subscriptions (user_id, status)
  select id, 'comp' from auth.users
  on conflict (user_id) do nothing;
