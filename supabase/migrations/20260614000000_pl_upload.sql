-- P&L file uploads for financial document verification.
-- Mirrors bank_statement_files: PDF metadata only, actual files go to Storage.

create table public.pl_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses on delete cascade not null,
  file_name text not null,
  file_size integer,
  file_path text,
  synced_at timestamp with time zone default now()
);

create index pl_files_business_idx on public.pl_files (business_id);

alter table public.pl_files enable row level security;

create policy "Users can view their own pl files"
  on public.pl_files for select
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.pl_files.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can insert their own pl files"
  on public.pl_files for insert
  with check (exists (
    select 1 from public.businesses
    where public.businesses.id = public.pl_files.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can update their own pl files"
  on public.pl_files for update
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.pl_files.business_id
    and public.businesses.owner_id = auth.uid()
  ));

create policy "Users can delete their own pl files"
  on public.pl_files for delete
  using (exists (
    select 1 from public.businesses
    where public.businesses.id = public.pl_files.business_id
    and public.businesses.owner_id = auth.uid()
  ));

-- Private storage bucket for P&L PDFs (owner-scoped paths: {uid}/{uuid}.pdf)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pl-uploads',
  'pl-uploads',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do nothing;

create policy "pl_uploads_owner_select"
  on storage.objects for select
  using (
    bucket_id = 'pl-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "pl_uploads_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'pl-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "pl_uploads_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'pl-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
