-- PRÉ-REQUISITO do fluxo Coordenador + Auxiliar + Votação.
-- Rode isto no SQL Editor do Supabase ANTES de criar login de coordenador/auxiliar.
-- Cria roles, auxiliar_lideres, campos votou/voto_*, RLS e bucket votacao-fotos.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'admin', 'diretoria', 'operador', 'mobilizador', 'administrativo',
    'coordenador', 'auxiliar'
  ));

alter table public.coordenadores
  add column if not exists user_id uuid unique references public.profiles (id) on delete set null;

create index if not exists coordenadores_user_id_idx
  on public.coordenadores (user_id)
  where user_id is not null;

create table if not exists public.auxiliar_lideres (
  auxiliar_id uuid not null references public.profiles (id) on delete cascade,
  lider_id uuid not null references public.lideres (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (auxiliar_id, lider_id)
);

create index if not exists auxiliar_lideres_lider_idx
  on public.auxiliar_lideres (lider_id);

alter table public.cadastros
  add column if not exists votou boolean;

alter table public.cadastros
  add column if not exists voto_foto_path text;

alter table public.cadastros
  add column if not exists voto_em timestamptz;

alter table public.cadastros
  add column if not exists voto_por uuid references public.profiles (id) on delete set null;

create index if not exists cadastros_votou_idx
  on public.cadastros (votou)
  where votou is not null;

create index if not exists cadastros_voto_por_idx
  on public.cadastros (voto_por)
  where voto_por is not null;

create or replace function public.is_coordenador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and p.role = 'coordenador'
  );
$$;

create or replace function public.is_auxiliar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and p.role = 'auxiliar'
  );
$$;

create or replace function public.my_coordenador_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.role = 'coordenador' then coalesce(
      (select c.id from public.coordenadores c where c.user_id = p.id limit 1),
      p.coordenador_id
    )
    else p.coordenador_id
  end
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.auxiliar_pode_ficha(p_cadastro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cadastros c
    join public.auxiliar_lideres al on al.auxiliar_id = auth.uid()
    join public.lideres l on l.id = al.lider_id
    where c.id = p_cadastro_id
      and lower(btrim(c.lider)) = lower(btrim(l.nome))
      and (
        c.diretoria_id is null
        or c.diretoria_id = l.diretoria_id
        or c.diretoria_id = public.my_diretoria_id()
      )
  );
$$;

alter table public.auxiliar_lideres enable row level security;

drop policy if exists auxiliar_lideres_select on public.auxiliar_lideres;
create policy auxiliar_lideres_select
  on public.auxiliar_lideres for select to authenticated
  using (
    public.is_admin()
    or public.is_diretoria()
    or auxiliar_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auxiliar_lideres.auxiliar_id
        and (
          (public.is_coordenador() and p.coordenador_id = public.my_coordenador_id())
          or (public.is_diretoria() and p.diretoria_id = auth.uid())
        )
    )
  );

drop policy if exists auxiliar_lideres_write on public.auxiliar_lideres;
create policy auxiliar_lideres_write
  on public.auxiliar_lideres for all to authenticated
  using (
    public.is_admin()
    or public.is_diretoria()
    or (
      public.is_coordenador()
      and exists (
        select 1 from public.profiles p
        where p.id = auxiliar_lideres.auxiliar_id
          and p.role = 'auxiliar'
          and p.coordenador_id = public.my_coordenador_id()
      )
    )
  )
  with check (
    public.is_admin()
    or public.is_diretoria()
    or (
      public.is_coordenador()
      and exists (
        select 1 from public.profiles p
        where p.id = auxiliar_lideres.auxiliar_id
          and p.role = 'auxiliar'
          and p.coordenador_id = public.my_coordenador_id()
      )
    )
  );

drop policy if exists profiles_select_coordenador on public.profiles;
create policy profiles_select_coordenador on public.profiles
  for select to authenticated
  using (
    public.is_coordenador()
    and (
      id = auth.uid()
      or (
        role = 'auxiliar'
        and coordenador_id = public.my_coordenador_id()
      )
    )
  );

drop policy if exists profiles_select_auxiliar on public.profiles;
create policy profiles_select_auxiliar on public.profiles
  for select to authenticated
  using (public.is_auxiliar() and id = auth.uid());

drop policy if exists lideres_select_auxiliar on public.lideres;
create policy lideres_select_auxiliar on public.lideres
  for select to authenticated
  using (
    public.is_auxiliar()
    and exists (
      select 1 from public.auxiliar_lideres al
      where al.auxiliar_id = auth.uid()
        and al.lider_id = lideres.id
    )
  );

drop policy if exists cadastros_update_auxiliar on public.cadastros;
create policy cadastros_update_auxiliar on public.cadastros
  for update to authenticated
  using (public.is_auxiliar() and public.auxiliar_pode_ficha(id))
  with check (public.is_auxiliar() and public.auxiliar_pode_ficha(id));

drop policy if exists cadastros_update_coordenador on public.cadastros;
create policy cadastros_update_coordenador on public.cadastros
  for update to authenticated
  using (
    public.is_coordenador()
    and exists (
      select 1 from public.coordenadores co
      where co.id = public.my_coordenador_id()
        and lower(btrim(cadastros.coordenador)) = lower(btrim(co.nome))
    )
  )
  with check (
    public.is_coordenador()
    and exists (
      select 1 from public.coordenadores co
      where co.id = public.my_coordenador_id()
        and lower(btrim(cadastros.coordenador)) = lower(btrim(co.nome))
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'votacao-fotos',
  'votacao-fotos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists votacao_fotos_select on storage.objects;
create policy votacao_fotos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'votacao-fotos'
    and (
      public.is_admin()
      or public.is_diretoria()
      or public.is_coordenador()
      or public.is_auxiliar()
    )
  );

drop policy if exists votacao_fotos_insert on storage.objects;
create policy votacao_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'votacao-fotos'
    and (public.is_auxiliar() or public.is_coordenador() or public.is_admin() or public.is_diretoria())
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists votacao_fotos_update on storage.objects;
create policy votacao_fotos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'votacao-fotos'
    and (public.is_auxiliar() or public.is_coordenador() or public.is_admin() or public.is_diretoria())
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists votacao_fotos_delete on storage.objects;
create policy votacao_fotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'votacao-fotos'
    and (public.is_auxiliar() or public.is_coordenador() or public.is_admin() or public.is_diretoria())
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

notify pgrst, 'reload schema';
