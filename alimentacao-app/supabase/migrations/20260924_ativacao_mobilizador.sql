-- Cargo mobilizador + campos de Ativação de Campanha

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'diretoria', 'operador', 'mobilizador'));

alter table public.cadastros
  add column if not exists postagem_links jsonb not null default '[]'::jsonb;

alter table public.cadastros
  add column if not exists ativacao_notas text;

alter table public.cadastros
  add column if not exists ativacao_em timestamptz;

alter table public.lideres
  add column if not exists postagem_links jsonb not null default '[]'::jsonb;

alter table public.lideres
  add column if not exists ativacao_notas text;

alter table public.lideres
  add column if not exists ativacao_em timestamptz;

alter table public.coordenadores
  add column if not exists postagem_links jsonb not null default '[]'::jsonb;

alter table public.coordenadores
  add column if not exists ativacao_notas text;

alter table public.coordenadores
  add column if not exists ativacao_em timestamptz;

-- Mobilizador pode atualizar campos de ativação em cadastros (não cria/exclui)
create or replace function public.is_mobilizador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'mobilizador' and p.ativo = true
  );
$$;

drop policy if exists cadastros_update_mobilizador on public.cadastros;
create policy cadastros_update_mobilizador on public.cadastros
  for update to authenticated
  using (public.is_mobilizador() or public.is_admin() or public.is_diretoria())
  with check (public.is_mobilizador() or public.is_admin() or public.is_diretoria());

-- Lideres / coordenadores: mobilizador pode atualizar flags de ativação
drop policy if exists lideres_update_mobilizador on public.lideres;
create policy lideres_update_mobilizador on public.lideres
  for update to authenticated
  using (public.is_mobilizador() or public.is_admin() or public.is_diretoria())
  with check (public.is_mobilizador() or public.is_admin() or public.is_diretoria());

drop policy if exists coordenadores_update_mobilizador on public.coordenadores;
create policy coordenadores_update_mobilizador on public.coordenadores
  for update to authenticated
  using (public.is_mobilizador() or public.is_admin() or public.is_diretoria())
  with check (public.is_mobilizador() or public.is_admin() or public.is_diretoria());

-- Select de lideres/coordenadores para mobilizador
drop policy if exists lideres_select_mobilizador on public.lideres;
create policy lideres_select_mobilizador on public.lideres
  for select to authenticated
  using (true);

drop policy if exists coordenadores_select_mobilizador on public.coordenadores;
create policy coordenadores_select_mobilizador on public.coordenadores
  for select to authenticated
  using (true);

notify pgrst, 'reload schema';
