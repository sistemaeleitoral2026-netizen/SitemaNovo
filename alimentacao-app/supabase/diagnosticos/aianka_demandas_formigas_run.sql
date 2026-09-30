-- Aianka + cargos combinados: Demandas (administrativo) + Formigas (mobilizador).
-- Garante helpers com extra_roles e corrige o perfil da Aianka.
-- Rode no SQL Editor do Supabase.

-- 1) Helpers: role principal OU extra_roles
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

-- 2) Aianka: administrativo (Demandas) + Formiga (Lançar Formigas)
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

-- 3) Chefe WhatsApp também pode atualizar Formigas (mesmo se extra_roles falhar)
create or replace function public.is_formigas_whatsapp_chefe()
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
      and lower(trim(coalesce(p.email, ''))) = 'aiankacecilia01@gmail.com'
  );
$$;

drop policy if exists cadastros_update_mobilizador on public.cadastros;
create policy cadastros_update_mobilizador on public.cadastros
  for update to authenticated
  using (
    public.is_mobilizador()
    or public.is_formigas_whatsapp_chefe()
    or public.is_admin()
    or public.is_diretoria()
  )
  with check (
    public.is_mobilizador()
    or public.is_formigas_whatsapp_chefe()
    or public.is_admin()
    or public.is_diretoria()
  );

drop policy if exists lideres_update_mobilizador on public.lideres;
create policy lideres_update_mobilizador on public.lideres
  for update to authenticated
  using (
    public.is_mobilizador()
    or public.is_formigas_whatsapp_chefe()
    or public.is_admin()
    or public.is_diretoria()
  )
  with check (
    public.is_mobilizador()
    or public.is_formigas_whatsapp_chefe()
    or public.is_admin()
    or public.is_diretoria()
  );

drop policy if exists coordenadores_update_mobilizador on public.coordenadores;
create policy coordenadores_update_mobilizador on public.coordenadores
  for update to authenticated
  using (
    public.is_mobilizador()
    or public.is_formigas_whatsapp_chefe()
    or public.is_admin()
    or public.is_diretoria()
  )
  with check (
    public.is_mobilizador()
    or public.is_formigas_whatsapp_chefe()
    or public.is_admin()
    or public.is_diretoria()
  );

-- 4) Conferência
select id, nome, email, role, extra_roles, ativo
from public.profiles
where lower(trim(email)) = 'aiankacecilia01@gmail.com'
   or lower(nome) like '%aianka%';

notify pgrst, 'reload schema';
