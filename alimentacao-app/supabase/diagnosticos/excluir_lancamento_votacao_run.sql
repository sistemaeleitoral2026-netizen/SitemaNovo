-- Rode no SQL Editor do Supabase para liberar exclusão de lançamento no Histórico.
-- Coord: apaga fichas criadas pelo auxiliar (adicionado_por_auxiliar) da própria coordenação.
-- Coord/diretoria/admin: podem remover anexos do bucket votacao-fotos.
-- Admin/diretoria já podem DELETE qualquer cadastro via cadastros_delete.

drop policy if exists cadastros_delete_coordenador_lancamento on public.cadastros;
create policy cadastros_delete_coordenador_lancamento on public.cadastros
  for delete to authenticated
  using (
    public.is_coordenador()
    and adicionado_por_auxiliar = true
    and exists (
      select 1
      from public.coordenadores co
      where co.id = public.my_coordenador_id()
        and lower(btrim(cadastros.coordenador)) = lower(btrim(co.nome))
    )
  );

drop policy if exists votacao_fotos_delete on storage.objects;
create policy votacao_fotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'votacao-fotos'
    and (
      public.is_admin()
      or public.is_diretoria()
      or public.is_coordenador()
      or (
        public.is_auxiliar()
        and (storage.foldername(name))[1] = auth.uid()::text
      )
    )
  );

notify pgrst, 'reload schema';
