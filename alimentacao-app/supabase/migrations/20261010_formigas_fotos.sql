-- Fotos Formigas: veículo adesivado e casa adesivada

do $$
declare
  t text;
begin
  foreach t in array array['cadastros', 'lideres', 'coordenadores']
  loop
    execute format(
      'alter table public.%I add column if not exists foto_veiculo_paths text[] not null default ''{}''::text[]',
      t
    );
    execute format(
      'alter table public.%I add column if not exists foto_casa_paths text[] not null default ''{}''::text[]',
      t
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'formigas-fotos',
  'formigas-fotos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists formigas_fotos_select on storage.objects;
create policy formigas_fotos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'formigas-fotos'
    and (public.is_mobilizador() or public.is_admin() or public.is_diretoria())
  );

drop policy if exists formigas_fotos_insert on storage.objects;
create policy formigas_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'formigas-fotos'
    and (public.is_mobilizador() or public.is_admin() or public.is_diretoria())
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists formigas_fotos_delete on storage.objects;
create policy formigas_fotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'formigas-fotos'
    and (
      public.is_admin()
      or public.is_diretoria()
      or (public.is_mobilizador() and (storage.foldername(name))[1] = auth.uid()::text)
    )
  );

notify pgrst, 'reload schema';
