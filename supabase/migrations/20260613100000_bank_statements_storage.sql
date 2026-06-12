-- Create private storage bucket for bank statement PDFs.
-- Files are stored at {owner_uid}/{file_uuid}.pdf so RLS can scope by folder.
-- Add file_path column to bank_statement_files to record the storage path.

-- 1. Storage bucket -----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bank-statements',
  'bank-statements',
  false,
  10485760,           -- 10 MB per file
  array['application/pdf']
);

-- 2. RLS on storage.objects ---------------------------------------------------
-- Owner can upload, read, and delete their own files (path starts with their uid).
create policy "Bank statements: owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'bank-statements'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Bank statements: owner select"
  on storage.objects for select
  using (
    bucket_id = 'bank-statements'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Bank statements: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'bank-statements'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. Add file_path column to bank_statement_files ----------------------------
alter table public.bank_statement_files
  add column if not exists file_path text;
