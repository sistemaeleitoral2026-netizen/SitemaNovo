-- Edição/exclusão de demandas pelo autor (abertas) ou admin

drop policy if exists demandas_update_autor on public.demandas;
create policy demandas_update_autor on public.demandas
  for update to authenticated
  using (
    public.is_admin()
    or (
      created_by = auth.uid()
      and status = 'aberta'
      and (public.is_administrativo() or public.is_diretoria())
    )
  )
  with check (
    public.is_admin()
    or (
      created_by = auth.uid()
      and status = 'aberta'
      and (public.is_administrativo() or public.is_diretoria())
    )
  );

drop policy if exists demandas_delete on public.demandas;
create policy demandas_delete on public.demandas
  for delete to authenticated
  using (
    public.is_admin()
    or (
      created_by = auth.uid()
      and status = 'aberta'
      and (public.is_administrativo() or public.is_diretoria())
    )
  );

drop policy if exists demandas_fotos_delete on storage.objects;
create policy demandas_fotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'demandas-fotos'
    and (
      public.is_admin()
      or public.is_diretoria()
      or public.is_administrativo()
    )
  );

notify pgrst, 'reload schema';
