-- Cargo administrativo + módulo Demandas (tabela, storage, RLS)

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'diretoria', 'operador', 'mobilizador', 'administrativo'));

create or replace function public.is_administrativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'administrativo' and p.ativo = true
  );
$$;

create table if not exists public.demandas (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  cadastro_id uuid references public.cadastros(id) on delete set null,
  origem text not null check (origem in ('cadastro', 'avulso')),
  nome text not null,
  documento text,
  telefone text,
  telefone_extra text,
  descricao text not null,
  foto_path text,
  status text not null default 'aberta' check (status in ('aberta', 'feita')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolved_note text
);

create index if not exists demandas_status_created_idx on public.demandas (status, created_at desc);
create index if not exists demandas_created_by_idx on public.demandas (created_by);
create index if not exists demandas_cadastro_id_idx on public.demandas (cadastro_id);

alter table public.demandas enable row level security;

drop policy if exists demandas_select on public.demandas;
create policy demandas_select on public.demandas
  for select to authenticated
  using (
    public.is_admin()
    or public.is_diretoria()
    or public.is_administrativo()
  );

drop policy if exists demandas_insert on public.demandas;
create policy demandas_insert on public.demandas
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_admin()
      or public.is_diretoria()
      or public.is_administrativo()
    )
  );

drop policy if exists demandas_update_admin on public.demandas;
create policy demandas_update_admin on public.demandas
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Storage: fotos das demandas
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'demandas-fotos',
  'demandas-fotos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists demandas_fotos_select on storage.objects;
create policy demandas_fotos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'demandas-fotos'
    and (
      public.is_admin()
      or public.is_diretoria()
      or public.is_administrativo()
    )
  );

drop policy if exists demandas_fotos_insert on storage.objects;
create policy demandas_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'demandas-fotos'
    and (
      public.is_admin()
      or public.is_diretoria()
      or public.is_administrativo()
    )
  );

-- Administrativo lê nomes na listagem de demandas
drop policy if exists profiles_select_administrativo on public.profiles;
create policy profiles_select_administrativo on public.profiles
  for select to authenticated
  using (public.is_administrativo());

notify pgrst, 'reload schema';
