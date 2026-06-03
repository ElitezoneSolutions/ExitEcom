-- Stop seeding dummy "NovaSkin Co." data on signup.
--
-- The original handle_new_user() (20260525000000_init.sql) seeded a full demo
-- business + valuation + risks + actions + documents, including a fake
-- connected_sources array. That dummy data leaked into the UI (Profile showed
-- "NovaSkin Co.", Data Sources showed sources as "connected" that weren't).
--
-- New behaviour: on signup we create ONLY the user's profile row. The business
-- and its valuation are created later by the onboarding flow from the user's
-- real answers, and results (valuation/risks/actions) come from Shopify.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');

  return new;
end;
$$ language plpgsql security definer;

-- Trigger definition is unchanged; recreated here for idempotency.
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
