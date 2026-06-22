-- Super Admin Dashboard foundation.
--
-- Introduces the first role concept in the app (profiles.role), an audit log for
-- every admin mutation, and a document-review status table. All cross-user admin
-- reads happen via the service-role key inside server functions (see
-- src/lib/admin/server.ts) — these tables do NOT add superadmin exceptions to the
-- per-user RLS on the underlying business data. The select policies below let a
-- signed-in superadmin read the admin tables directly if ever needed; all writes
-- go through the service role.

-- 1. Role on profiles -------------------------------------------------------
-- Two tiers only: 'user' (default, everyone) and 'superadmin' (the team). The
-- product has no broker/connector user tier — connectors are data integrations.
alter table public.profiles
  add column if not exists role text not null default 'user'
    check (role in ('user', 'superadmin'));

-- Reusable predicate: is the current auth.uid() a superadmin?
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'superadmin'
  );
$$;

-- 2. Admin audit log --------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users on delete set null,
  action text not null,                 -- e.g. 'user.role_changed', 'document.status_set'
  target_type text,                     -- e.g. 'user', 'document'
  target_id text,                       -- free-form id of the affected entity
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id);

alter table public.admin_audit_log enable row level security;

-- Superadmins may read the log directly; writes are service-role only.
create policy "Superadmins can view the audit log"
  on public.admin_audit_log for select
  using (public.is_superadmin());

-- 3. Document review status -------------------------------------------------
-- Tracks the team's verification decision on each uploaded financial document.
-- Kept separate from the file-metadata tables (bank_statement_files / pl_files)
-- so review state never mixes with the user-owned upload rows.
create table if not exists public.document_reviews (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null,
  file_type text not null check (file_type in ('bank_statement', 'pl')),
  status text not null default 'pending'
    check (status in ('verified', 'rejected', 'pending')),
  note text,
  reviewer_id uuid references auth.users on delete set null,
  updated_at timestamp with time zone default now(),
  unique (file_id, file_type)
);

create index if not exists document_reviews_file_idx
  on public.document_reviews (file_id);

alter table public.document_reviews enable row level security;

create policy "Superadmins can view document reviews"
  on public.document_reviews for select
  using (public.is_superadmin());

-- 4. Seed the first superadmin ---------------------------------------------
-- Bootstraps iam@exitecom.com. This only takes effect once that account has
-- signed up (a profiles row exists for it). If it signs up AFTER this migration
-- runs, re-run just this statement against the live project:
--   update public.profiles set role = 'superadmin'
--   from auth.users u
--   where u.id = public.profiles.id and lower(u.email) = 'iam@exitecom.com';
update public.profiles
  set role = 'superadmin'
  from auth.users u
  where u.id = public.profiles.id
    and lower(u.email) = 'iam@exitecom.com';
