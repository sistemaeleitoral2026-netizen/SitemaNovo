-- AlimentaAção schema
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'operador')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cadastros (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id),
  nome_completo text not null,
  cpf text,
  telefone text not null,
  titulo text not null,
  zona text not null,
  secao text not null,
  nome_mae text not null,
  cep text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cadastros_cpf_unique unique (cpf),
  constraint cadastros_cpf_digits check (cpf is null or cpf ~ '^[0-9]{11}$'),
  constraint cadastros_cep_digits check (cep is null or cep ~ '^[0-9]{8}$'),
  constraint cadastros_titulo_unique unique (titulo)
);

create index if not exists cadastros_operator_id_idx on public.cadastros(operator_id);
create index if not exists cadastros_zona_idx on public.cadastros(zona);
create index if not exists cadastros_secao_idx on public.cadastros(secao);
create index if not exists cadastros_created_at_idx on public.cadastros(created_at);
create index if not exists cadastros_nome_idx on public.cadastros(nome_completo);

create table if not exists public.importacoes (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id),
  nome_arquivo text not null,
  total int not null default 0,
  validos int not null default 0,
  duplicados int not null default 0,
  erros int not null default 0,
  confirmada boolean not null default false,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  acao text not null,
  entidade text,
  entidade_id uuid,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.ativo = true
  );
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid() limit 1;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'operador')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_cadastro_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cadastros_updated_at on public.cadastros;
create trigger trg_cadastros_updated_at
  before update on public.cadastros
  for each row execute function public.set_cadastro_updated_at();

create or replace function public.enforce_cadastro_operator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service role / jobs sem JWT: não sobrescrever operator_id
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    if tg_op = 'INSERT' and new.operator_id is null then
      new.operator_id := auth.uid();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.operator_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    if old.operator_id <> auth.uid() then
      raise exception 'Sem permissão para alterar cadastro de outra nerite';
    end if;
    new.operator_id := old.operator_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_cadastro_operator on public.cadastros;
create trigger trg_enforce_cadastro_operator
  before insert or update on public.cadastros
  for each row execute function public.enforce_cadastro_operator();

alter table public.profiles enable row level security;
alter table public.cadastros enable row level security;
alter table public.importacoes enable row level security;
alter table public.auditoria enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin() or id = auth.uid());

drop policy if exists cadastros_select on public.cadastros;
create policy cadastros_select on public.cadastros
  for select to authenticated
  using (operator_id = auth.uid() or public.is_admin());

drop policy if exists cadastros_insert on public.cadastros;
create policy cadastros_insert on public.cadastros
  for insert to authenticated
  with check (operator_id = auth.uid() or public.is_admin());

drop policy if exists cadastros_update on public.cadastros;
create policy cadastros_update on public.cadastros
  for update to authenticated
  using (operator_id = auth.uid() or public.is_admin())
  with check (operator_id = auth.uid() or public.is_admin());

drop policy if exists cadastros_delete on public.cadastros;
create policy cadastros_delete on public.cadastros
  for delete to authenticated
  using (operator_id = auth.uid() or public.is_admin());

drop policy if exists importacoes_select on public.importacoes;
create policy importacoes_select on public.importacoes
  for select to authenticated
  using (operator_id = auth.uid() or public.is_admin());

drop policy if exists importacoes_insert on public.importacoes;
create policy importacoes_insert on public.importacoes
  for insert to authenticated
  with check (operator_id = auth.uid() or public.is_admin());

drop policy if exists importacoes_update on public.importacoes;
create policy importacoes_update on public.importacoes
  for update to authenticated
  using (operator_id = auth.uid() or public.is_admin())
  with check (operator_id = auth.uid() or public.is_admin());

drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria
  for select to authenticated
  using (actor_id = auth.uid() or public.is_admin());

drop policy if exists auditoria_insert on public.auditoria;
create policy auditoria_insert on public.auditoria
  for insert to authenticated
  with check (actor_id = auth.uid() or public.is_admin());

insert into public.profiles (id, nome, email, role, ativo)
values (
  'c2684a49-1285-4075-a3e1-5eb49fdb45bb',
  'Administrador',
  'admin@gmail.com',
  'admin',
  true
)
on conflict (id) do update
set nome = excluded.nome,
    email = excluded.email,
    role = 'admin',
    ativo = true;
