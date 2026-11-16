-- Se o upload de comprovante falhar com "Bucket not found" ou RLS de storage,
-- rode isto no SQL Editor do Nerites.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mb-comprovantes',
  'mb-comprovantes',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mb_comprovantes_select on storage.objects;
create policy mb_comprovantes_select on storage.objects
  for select to authenticated
  using (bucket_id = 'mb-comprovantes' and public.can_access_assessoria_mb());

drop policy if exists mb_comprovantes_insert on storage.objects;
create policy mb_comprovantes_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mb-comprovantes' and public.can_access_assessoria_mb());

drop policy if exists mb_comprovantes_update on storage.objects;
create policy mb_comprovantes_update on storage.objects
  for update to authenticated
  using (bucket_id = 'mb-comprovantes' and public.can_access_assessoria_mb())
  with check (bucket_id = 'mb-comprovantes' and public.can_access_assessoria_mb());

drop policy if exists mb_comprovantes_delete on storage.objects;
create policy mb_comprovantes_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'mb-comprovantes' and public.can_access_assessoria_mb());
