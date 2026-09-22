-- Diretoria pode editar (e excluir) qualquer ficha de cadastro,
-- sem ficar limitada à própria hierarquia / equipe.

drop policy if exists cadastros_update_diretoria on public.cadastros;
create policy cadastros_update_diretoria on public.cadastros
  for update to authenticated
  using (public.is_diretoria() or public.is_admin())
  with check (public.is_diretoria() or public.is_admin());

drop policy if exists cadastros_delete on public.cadastros;
create policy cadastros_delete on public.cadastros
  for delete to authenticated
  using (
    operator_id = auth.uid()
    or public.is_admin()
    or public.is_diretoria()
  );

notify pgrst, 'reload schema';
