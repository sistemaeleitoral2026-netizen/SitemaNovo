-- Cole no SQL Editor do Supabase e rode uma vez.
-- Cria a tabela da Garagem (carros por liderança).

create table if not exists public.garagem_carros (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  diretoria_id uuid references public.profiles(id) on delete set null,
  coordenador_id uuid not null references public.coordenadores(id) on delete restrict,
  coordenador_nome text not null,
  lider_id uuid references public.lideres(id) on delete set null,
  lider_nome text not null default '',
  pessoa_nome text not null default '',
  placa text not null default '',
  cor text not null default '',
  modelo text not null default '',
  telefone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists garagem_carros_coord_idx
  on public.garagem_carros (coordenador_id, created_at desc);

create index if not exists garagem_carros_lider_idx
  on public.garagem_carros (lider_id, created_at desc);

create index if not exists garagem_carros_diretoria_idx
  on public.garagem_carros (diretoria_id, created_at desc);

create index if not exists garagem_carros_placa_idx
  on public.garagem_carros (placa);

comment on table public.garagem_carros is
  'Carros por liderança (Garagem). Coordenação obrigatória; demais campos livres.';

alter table public.garagem_carros enable row level security;

drop policy if exists garagem_carros_select on public.garagem_carros;
create policy garagem_carros_select on public.garagem_carros
  for select to authenticated
  using (public.is_admin() or public.is_diretoria());

drop policy if exists garagem_carros_insert on public.garagem_carros;
create policy garagem_carros_insert on public.garagem_carros
  for insert to authenticated
  with check (public.is_admin() or public.is_diretoria());

drop policy if exists garagem_carros_update on public.garagem_carros;
create policy garagem_carros_update on public.garagem_carros
  for update to authenticated
  using (public.is_admin() or public.is_diretoria())
  with check (public.is_admin() or public.is_diretoria());

drop policy if exists garagem_carros_delete on public.garagem_carros;
create policy garagem_carros_delete on public.garagem_carros
  for delete to authenticated
  using (public.is_admin() or public.is_diretoria());

alter table public.garagem_carros
  add column if not exists telefone text not null default '';

notify pgrst, 'reload schema';
