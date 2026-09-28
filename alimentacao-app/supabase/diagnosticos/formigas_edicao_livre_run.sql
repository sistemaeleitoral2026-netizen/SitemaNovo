-- Rode no SQL Editor do Supabase.
-- Qualquer formiga pode editar qualquer parte.
-- Ao alterar, o nome/data passam a ser de quem editou agora.

create or replace function public.enforce_formigas_section_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old_links int;
  v_new_links int;
  v_old_casa text;
  v_new_casa text;
begin
  if v_uid is null then
    return new;
  end if;

  new.contato_whatsapp := (coalesce(new.contato_whatsapp_status, 'nao') = 'sim');

  v_old_links := case
    when old.postagem_links is null then 0
    when jsonb_typeof(old.postagem_links) <> 'array' then 0
    else jsonb_array_length(old.postagem_links)
  end;
  v_new_links := case
    when new.postagem_links is null then 0
    when jsonb_typeof(new.postagem_links) <> 'array' then 0
    else jsonb_array_length(new.postagem_links)
  end;
  v_old_casa := coalesce(old.adesivos_casa_status, case when coalesce(old.adesivos_casa, 0) > 0 then 'sim' else 'nao' end);
  v_new_casa := coalesce(new.adesivos_casa_status, case when coalesce(new.adesivos_casa, 0) > 0 then 'sim' else 'nao' end);

  -- WhatsApp
  if coalesce(old.contato_whatsapp_status, 'nao') is distinct from coalesce(new.contato_whatsapp_status, 'nao') then
    if new.contato_whatsapp_status is distinct from 'nao' then
      new.formigas_wa_by := v_uid;
      new.formigas_wa_em := now();
    else
      new.formigas_wa_by := old.formigas_wa_by;
      new.formigas_wa_em := old.formigas_wa_em;
    end if;
  else
    new.formigas_wa_by := old.formigas_wa_by;
    new.formigas_wa_em := old.formigas_wa_em;
  end if;

  -- Veículos (carro e moto)
  if coalesce(old.carros_adesivados, 0) is distinct from coalesce(new.carros_adesivados, 0)
     or coalesce(old.motos_adesivadas, 0) is distinct from coalesce(new.motos_adesivadas, 0) then
    if coalesce(new.carros_adesivados, 0) > 0 or coalesce(new.motos_adesivadas, 0) > 0 then
      new.formigas_carros_by := v_uid;
      new.formigas_carros_em := now();
    else
      new.formigas_carros_by := old.formigas_carros_by;
      new.formigas_carros_em := old.formigas_carros_em;
    end if;
  else
    new.formigas_carros_by := old.formigas_carros_by;
    new.formigas_carros_em := old.formigas_carros_em;
  end if;

  -- Adesivo residencial
  if v_old_casa is distinct from v_new_casa
     or coalesce(old.adesivos_casa, 0) is distinct from coalesce(new.adesivos_casa, 0) then
    if v_new_casa in ('sim', 'talvez') or coalesce(new.adesivos_casa, 0) > 0 then
      new.formigas_casa_by := v_uid;
      new.formigas_casa_em := now();
    else
      new.formigas_casa_by := old.formigas_casa_by;
      new.formigas_casa_em := old.formigas_casa_em;
    end if;
  else
    new.formigas_casa_by := old.formigas_casa_by;
    new.formigas_casa_em := old.formigas_casa_em;
  end if;

  -- Links
  if v_old_links is distinct from v_new_links
     or coalesce(old.postagem_links, '[]'::jsonb) is distinct from coalesce(new.postagem_links, '[]'::jsonb) then
    if v_new_links > 0 then
      new.formigas_links_by := v_uid;
      new.formigas_links_em := now();
    else
      new.formigas_links_by := old.formigas_links_by;
      new.formigas_links_em := old.formigas_links_em;
    end if;
  else
    new.formigas_links_by := old.formigas_links_by;
    new.formigas_links_em := old.formigas_links_em;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
