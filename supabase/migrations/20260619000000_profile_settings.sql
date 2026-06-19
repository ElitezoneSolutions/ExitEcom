-- Extend profiles with the user-editable settings surfaced on the Settings page.
-- full_name already exists; we add display preferences (timezone, currency) and
-- per-user notification toggles. notification_prefs is a jsonb map of
-- { exit_score, new_risk, valuation_change, weekly_summary } booleans.
alter table public.profiles
  add column if not exists timezone text,
  add column if not exists currency text,
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
