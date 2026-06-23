-- Let founders see the verification status of their OWN uploaded documents.
--
-- Until now document_reviews was superadmin-read-only (see
-- 20260622000000_admin_roles.sql). Founders need to see whether each bank
-- statement / P&L they uploaded is "Pending Verification" or "Approved", so we
-- add an owner-scoped select policy. Writes stay service-role only.
--
-- The table keys reviews by (file_id, file_type) with no business_id, so
-- ownership is resolved by joining file_id back to the upload row and its
-- business. Those subqueries run as the requesting user and are themselves
-- subject to the per-user RLS on bank_statement_files / pl_files / businesses,
-- so a founder can only ever match rows for files they already own.
create policy "Owners can view their own document reviews"
  on public.document_reviews for select
  using (
    (
      file_type = 'bank_statement'
      and exists (
        select 1
        from public.bank_statement_files f
        join public.businesses b on b.id = f.business_id
        where f.id = document_reviews.file_id
          and b.owner_id = auth.uid()
      )
    )
    or (
      file_type = 'pl'
      and exists (
        select 1
        from public.pl_files f
        join public.businesses b on b.id = f.business_id
        where f.id = document_reviews.file_id
          and b.owner_id = auth.uid()
      )
    )
  );
