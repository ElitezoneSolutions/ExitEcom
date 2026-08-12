-- Admin approval for computed results.
--
-- Running a tool (Exit Readiness Score, Risk Scanner, Valuation Engine,
-- Optimization Plan) no longer publishes its result straight to the founder.
-- Each run creates a row here in 'pending', the team reviews it in
-- /admin/requests, and only on approval is the result written to
-- valuation_data / risks / actions and the founder emailed.
--
-- One row per tool run: the four tools are approved independently, so a founder
-- can have an approved valuation while their risk scan is still in review.
--
-- `payload` is the full computeFullReport() output as computed at submit time —
-- frozen deliberately, so the team approves exactly what they reviewed and a
-- later Shopify sync can't change the numbers underneath a pending request.
--
-- `overrides` is the admin's edit layer, applied ON TOP of payload at approval
-- (see applyOverrides in src/lib/reportRequests.ts). The original payload is
-- never mutated, so every published figure can be traced back to what the
-- deterministic engine actually produced and compared against what was
-- published. Every edit is also written to admin_audit_log.

create table if not exists public.report_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,

  -- Which tool the founder clicked. Mirrors ReportTypeId minus 'full' — the
  -- Full Report is a view over the four, not a separately approvable thing.
  tool text not null
    check (tool in ('exit-score', 'risk', 'valuation', 'optimization')),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  payload jsonb not null,
  overrides jsonb not null default '{}'::jsonb,

  -- Shown to the founder when a request is rejected; internal-only otherwise.
  admin_note text,
  reviewer_id uuid references auth.users on delete set null,

  created_at timestamp with time zone not null default now(),
  reviewed_at timestamp with time zone,
  -- Set once the "your result is ready" email is accepted by the mail
  -- function. Null on an approved row means approval succeeded but delivery
  -- did not — the founder can still see the result in the app.
  notified_at timestamp with time zone
);

-- The hot query is "latest request for this owner + tool".
create index if not exists report_requests_owner_tool_idx
  on public.report_requests (owner_id, tool, created_at desc);

-- The admin queue: pending first, newest first.
create index if not exists report_requests_status_idx
  on public.report_requests (status, created_at desc);

create index if not exists report_requests_business_idx
  on public.report_requests (business_id);

alter table public.report_requests enable row level security;

-- Founders read their own requests — they need to know whether a result is
-- pending, approved or rejected, and to read the rejection note.
create policy "Owners can view their own report requests"
  on public.report_requests for select
  using (auth.uid() = owner_id);

-- Founders submit their own runs, and may only ever create a PENDING row for a
-- business they own. Without the status check a crafted insert could publish an
-- approved result without review; without the business check they could attach
-- a request to someone else's business.
create policy "Owners can submit their own report requests"
  on public.report_requests for insert
  with check (
    auth.uid() = owner_id
    and status = 'pending'
    and exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

-- Deliberately NO update/delete policy for owners: a founder must not be able
-- to approve their own request, edit the frozen payload, or delete an awkward
-- one. Every review mutation goes through the service role in
-- src/lib/admin/reportRequests.ts, behind requireSuperadmin().

create policy "Superadmins can view all report requests"
  on public.report_requests for select
  using (public.is_superadmin());
