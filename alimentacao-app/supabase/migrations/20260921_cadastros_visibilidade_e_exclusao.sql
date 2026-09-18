-- Todos os usuários autenticados podem visualizar todos os cadastros.
-- Exclusão: nerite exclui somente os próprios; diretoria, somente sua equipe; admin, todos.

-- Expõe somente os dados mínimos dos operadores necessários à tabela,
-- sem liberar e-mail ou demais campos privados dos perfis.
create or replace function public.list_cadastro_operadores()
returns table (id uuid, nome text, diretoria_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome, p.diretoria_id
  from public.profiles p
  where auth.uid() is not null
    and p.role = 'operador'
  order by p.nome;
$$;

revoke all on function public.list_cadastro_operadores() from public;
grant execute on function public.list_cadastro_operadores() to authenticated;

drop policy if exists cadastros_select on public.cadastros;
create policy cadastros_select on public.cadastros
  for select to authenticated
  using (true);

drop policy if exists cadastros_select_diretoria on public.cadastros;

drop policy if exists cadastros_delete on public.cadastros;
create policy cadastros_delete on public.cadastros
  for delete to authenticated
  using (
    operator_id = auth.uid()
    or public.is_admin()
    or (
      public.is_diretoria()
      and (
        diretoria_id = auth.uid()
        or operator_id in (
          select id from public.profiles where diretoria_id = auth.uid()
        )
      )
    )
  );

notify pgrst, 'reload schema';
