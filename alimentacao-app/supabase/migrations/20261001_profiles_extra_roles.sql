-- Papéis extras: Nerite também Formiga / Administrativo, etc.

alter table public.profiles
  add column if not exists extra_roles text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_extra_roles_check;
alter table public.profiles
  add constraint profiles_extra_roles_check
  check (
    extra_roles <@ array['operador', 'mobilizador', 'administrativo']::text[]
  );

comment on column public.profiles.extra_roles is
  'Cargos adicionais além do role principal (libera menus e atribuições).';

-- Helpers passam a considerar role principal OU extra_roles
create or replace function public.is_mobilizador()
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
      and (
        p.role = 'mobilizador'
        or 'mobilizador' = any(coalesce(p.extra_roles, '{}'::text[]))
      )
  );
$$;

create or replace function public.is_administrativo()
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
      and (
        p.role = 'administrativo'
        or 'administrativo' = any(coalesce(p.extra_roles, '{}'::text[]))
      )
  );
$$;

create or replace function public.is_operador()
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
      and (
        p.role = 'operador'
        or 'operador' = any(coalesce(p.extra_roles, '{}'::text[]))
      )
  );
$$;

notify pgrst, 'reload schema';
