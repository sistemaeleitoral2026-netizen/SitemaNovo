-- Cargo Visualizador: leitura global de lideranças e fichas, sem escrita.
-- Pode ser executado novamente sem perder dados.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'admin', 'diretoria', 'operador', 'mobilizador', 'administrativo',
    'coordenador', 'auxiliar', 'visualizador', 'externo'
  ));

create or replace function public.is_visualizador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'visualizador'
      and p.ativo = true
  );
$$;

revoke all on function public.is_visualizador() from public;
grant execute on function public.is_visualizador() to authenticated;

drop policy if exists profiles_select_visualizador on public.profiles;
create policy profiles_select_visualizador on public.profiles
  for select to authenticated
  using (public.is_visualizador());

drop policy if exists lideres_select_visualizador on public.lideres;
create policy lideres_select_visualizador on public.lideres
  for select to authenticated
  using (public.is_visualizador());

drop policy if exists coordenadores_select_visualizador on public.coordenadores;
create policy coordenadores_select_visualizador on public.coordenadores
  for select to authenticated
  using (public.is_visualizador());

-- cadastros_select já permite leitura aos usuários autenticados. Nenhuma
-- política de INSERT, UPDATE ou DELETE é criada para o Visualizador.

notify pgrst, 'reload schema';
