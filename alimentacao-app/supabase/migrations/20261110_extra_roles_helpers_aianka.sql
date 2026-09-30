-- Helpers com extra_roles + Aianka (Demandas + Formigas).

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

update public.profiles
set
  role = 'administrativo',
  ativo = true,
  extra_roles = array(
    select distinct x
    from unnest(
      coalesce(extra_roles, '{}'::text[]) || array['mobilizador']::text[]
    ) as x
    where x is not null
      and x <> ''
      and x <> 'administrativo'
  )
where lower(trim(email)) = 'aiankacecilia01@gmail.com';
