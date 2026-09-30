-- Aianka (chefe WhatsApp) e admin precisam ler lideranças/coordenadores
-- para a visão geral bater com o que as formigas lançaram.

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

drop policy if exists lideres_select on public.lideres;
create policy lideres_select on public.lideres
  for select to authenticated
  using (
    public.is_admin()
    or public.is_mobilizador()
    or public.is_formigas_whatsapp_chefe()
    or public.is_diretoria()
    or diretoria_id = public.my_diretoria_id()
  );

drop policy if exists coordenadores_select on public.coordenadores;
create policy coordenadores_select on public.coordenadores
  for select to authenticated
  using (
    public.is_admin()
    or public.is_mobilizador()
    or public.is_formigas_whatsapp_chefe()
    or public.is_diretoria()
    or diretoria_id = public.my_diretoria_id()
  );

notify pgrst, 'reload schema';
