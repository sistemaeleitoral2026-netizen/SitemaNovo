-- MR Terceiriza: descrição opcional no cadastro de centros de custo.

alter table public.mr_centros_custo
  add column if not exists descricao text;

drop policy if exists mr_centros_custo_update on public.mr_centros_custo;
create policy mr_centros_custo_update on public.mr_centros_custo
  for update to authenticated
  using (public.can_access_mr_terceriza())
  with check (public.can_access_mr_terceriza());

notify pgrst, 'reload schema';
