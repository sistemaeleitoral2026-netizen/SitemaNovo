-- Rode no SQL Editor do Supabase (Financeiro: valor devido + lançamentos).

create table if not exists public.financeiro_coordenador (
  id uuid primary key default gen_random_uuid(),
  diretoria_id uuid not null references public.profiles (id) on delete cascade,
  coordenador_id uuid not null references public.coordenadores (id) on delete cascade,
  valor_devido numeric(12, 2) not null default 0 check (valor_devido >= 0),
  travado boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  unique (diretoria_id, coordenador_id)
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'financeiro_coordenador'
      and column_name = 'valor'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'financeiro_coordenador'
      and column_name = 'valor_devido'
  ) then
    alter table public.financeiro_coordenador
      add column valor_devido numeric(12, 2) not null default 0 check (valor_devido >= 0);
    update public.financeiro_coordenador set valor_devido = coalesce(valor, 0);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'financeiro_coordenador'
      and column_name = 'valor_devido'
  ) then
    alter table public.financeiro_coordenador
      add column valor_devido numeric(12, 2) not null default 0 check (valor_devido >= 0);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'financeiro_coordenador'
      and column_name = 'travado'
  ) then
    alter table public.financeiro_coordenador
      add column travado boolean not null default false;
  end if;
end $$;

create table if not exists public.financeiro_lancamentos (
  id uuid primary key default gen_random_uuid(),
  diretoria_id uuid not null references public.profiles (id) on delete cascade,
  coordenador_id uuid not null references public.coordenadores (id) on delete cascade,
  valor numeric(12, 2) not null check (valor > 0),
  forma text not null check (forma in ('dinheiro', 'pix', 'transferencia')),
  comprovante_path text,
  observacao text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

-- Atualiza constraint de forma se a tabela já existia sem 'transferencia'
do $$
declare
  cname text;
begin
  for cname in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'financeiro_lancamentos'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%forma%'
  loop
    execute format('alter table public.financeiro_lancamentos drop constraint %I', cname);
  end loop;
  alter table public.financeiro_lancamentos
    add constraint financeiro_lancamentos_forma_check
    check (forma in ('dinheiro', 'pix', 'transferencia'));
exception when others then
  null;
end $$;

create index if not exists financeiro_coordenador_diretoria_idx
  on public.financeiro_coordenador (diretoria_id);

create index if not exists financeiro_lancamentos_diretoria_idx
  on public.financeiro_lancamentos (diretoria_id, created_at desc);

create index if not exists financeiro_lancamentos_coord_idx
  on public.financeiro_lancamentos (coordenador_id);

alter table public.financeiro_coordenador enable row level security;
alter table public.financeiro_lancamentos enable row level security;

drop policy if exists financeiro_coordenador_select on public.financeiro_coordenador;
create policy financeiro_coordenador_select
  on public.financeiro_coordenador for select to authenticated
  using (public.is_admin() or diretoria_id = auth.uid());

drop policy if exists financeiro_coordenador_write on public.financeiro_coordenador;
create policy financeiro_coordenador_write
  on public.financeiro_coordenador for all to authenticated
  using (public.is_admin() or diretoria_id = auth.uid())
  with check (public.is_admin() or diretoria_id = auth.uid());

drop policy if exists financeiro_lancamentos_select on public.financeiro_lancamentos;
create policy financeiro_lancamentos_select
  on public.financeiro_lancamentos for select to authenticated
  using (public.is_admin() or diretoria_id = auth.uid());

drop policy if exists financeiro_lancamentos_insert on public.financeiro_lancamentos;
create policy financeiro_lancamentos_insert
  on public.financeiro_lancamentos for insert to authenticated
  with check (public.is_admin() or diretoria_id = auth.uid());

drop policy if exists financeiro_lancamentos_delete on public.financeiro_lancamentos;
create policy financeiro_lancamentos_delete
  on public.financeiro_lancamentos for delete to authenticated
  using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financeiro-comprovantes',
  'financeiro-comprovantes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists financeiro_comprovantes_select on storage.objects;
create policy financeiro_comprovantes_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'financeiro-comprovantes'
    and (public.is_admin() or public.is_diretoria())
  );

drop policy if exists financeiro_comprovantes_insert on storage.objects;
create policy financeiro_comprovantes_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'financeiro-comprovantes'
    and (public.is_admin() or public.is_diretoria())
  );

drop policy if exists financeiro_comprovantes_delete on storage.objects;
create policy financeiro_comprovantes_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'financeiro-comprovantes'
    and (public.is_admin() or public.is_diretoria())
  );

notify pgrst, 'reload schema';
