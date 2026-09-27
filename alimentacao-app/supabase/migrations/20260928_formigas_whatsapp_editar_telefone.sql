-- Aianka (chefe das formigas) e admin editam telefone oficial da ficha
-- a partir do menu WhatsApp.

create or replace function public.is_formigas_whatsapp_chefe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(trim(coalesce(p.email, ''))) = 'aiankacecilia01@gmail.com'
    );
$$;

create or replace function public.formigas_whatsapp_editar_telefone(
  p_tipo text,
  p_id uuid,
  p_telefone text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if not public.is_formigas_whatsapp_chefe() then
    raise exception 'Sem permissão para editar telefone.';
  end if;

  if p_tipo = 'eleitor' then
    update public.cadastros set telefone = v_phone where id = p_id;
  elsif p_tipo = 'lideranca' then
    update public.lideres set telefone = nullif(v_phone, '') where id = p_id;
  elsif p_tipo = 'coordenador' then
    update public.coordenadores set telefone = nullif(v_phone, '') where id = p_id;
  else
    raise exception 'Tipo inválido.';
  end if;

  if not found then
    raise exception 'Ficha não encontrada.';
  end if;

  return v_phone;
end;
$$;

revoke all on function public.is_formigas_whatsapp_chefe() from public;
revoke all on function public.formigas_whatsapp_editar_telefone(text, uuid, text) from public;
grant execute on function public.is_formigas_whatsapp_chefe() to authenticated;
grant execute on function public.formigas_whatsapp_editar_telefone(text, uuid, text) to authenticated;

drop policy if exists cadastros_update_wa_chefe on public.cadastros;
create policy cadastros_update_wa_chefe on public.cadastros
  for update to authenticated
  using (public.is_formigas_whatsapp_chefe())
  with check (public.is_formigas_whatsapp_chefe());

drop policy if exists lideres_update_wa_chefe on public.lideres;
create policy lideres_update_wa_chefe on public.lideres
  for update to authenticated
  using (public.is_formigas_whatsapp_chefe())
  with check (public.is_formigas_whatsapp_chefe());

drop policy if exists coordenadores_update_wa_chefe on public.coordenadores;
create policy coordenadores_update_wa_chefe on public.coordenadores
  for update to authenticated
  using (public.is_formigas_whatsapp_chefe())
  with check (public.is_formigas_whatsapp_chefe());

notify pgrst, 'reload schema';
