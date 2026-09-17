-- Hierarchy: admin > diretoria (Carol/Nicole) > nerites + lideres + coordenadores

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'diretoria', 'operador'));

alter table public.profiles
  add column if not exists diretoria_id uuid references public.profiles(id);

create table if not exists public.coordenadores (
  id uuid primary key default gen_random_uuid(),
  diretoria_id uuid not null references public.profiles(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.lideres (
  id uuid primary key default gen_random_uuid(),
  diretoria_id uuid not null references public.profiles(id) on delete cascade,
  coordenador_id uuid references public.coordenadores(id) on delete set null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists coordenador_id uuid references public.coordenadores(id) on delete set null;

alter table public.profiles
  add column if not exists lider_id uuid references public.lideres(id) on delete set null;

alter table public.cadastros
  add column if not exists diretoria_id uuid references public.profiles(id);

alter table public.cadastros
  add column if not exists lider text not null default '';

create index if not exists coordenadores_diretoria_idx on public.coordenadores(diretoria_id);
create index if not exists lideres_diretoria_idx on public.lideres(diretoria_id);
create index if not exists profiles_diretoria_idx on public.profiles(diretoria_id);
create index if not exists cadastros_diretoria_idx on public.cadastros(diretoria_id);

create or replace function public.is_diretoria()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'diretoria' and p.ativo = true
  );
$$;

create or replace function public.my_diretoria_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.role = 'diretoria' then p.id
    else p.diretoria_id
  end
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

-- RLS policies for new tables
alter table public.coordenadores enable row level security;
alter table public.lideres enable row level security;

drop policy if exists coordenadores_select on public.coordenadores;
create policy coordenadores_select on public.coordenadores for select using (
  public.is_admin()
  or diretoria_id = public.my_diretoria_id()
);

drop policy if exists coordenadores_write on public.coordenadores;
create policy coordenadores_write on public.coordenadores for all using (
  public.is_admin()
  or (public.is_diretoria() and diretoria_id = auth.uid())
) with check (
  public.is_admin()
  or (public.is_diretoria() and diretoria_id = auth.uid())
);

drop policy if exists lideres_select on public.lideres;
create policy lideres_select on public.lideres for select using (
  public.is_admin()
  or diretoria_id = public.my_diretoria_id()
);

drop policy if exists lideres_write on public.lideres;
create policy lideres_write on public.lideres for all using (
  public.is_admin()
  or (public.is_diretoria() and diretoria_id = auth.uid())
) with check (
  public.is_admin()
  or (public.is_diretoria() and diretoria_id = auth.uid())
);

-- Allow diretoria to read/write cadastros of their team
drop policy if exists cadastros_select_diretoria on public.cadastros;
create policy cadastros_select_diretoria on public.cadastros for select using (
  public.is_diretoria() and (
    diretoria_id = auth.uid()
    or operator_id in (select id from public.profiles where diretoria_id = auth.uid())
  )
);

drop policy if exists profiles_select_diretoria on public.profiles;
create policy profiles_select_diretoria on public.profiles for select using (
  public.is_diretoria() and (id = auth.uid() or diretoria_id = auth.uid() or role = 'diretoria')
);

drop policy if exists profiles_update_diretoria_team on public.profiles;
create policy profiles_update_diretoria_team on public.profiles for update using (
  public.is_diretoria() and (id = auth.uid() or diretoria_id = auth.uid())
);
