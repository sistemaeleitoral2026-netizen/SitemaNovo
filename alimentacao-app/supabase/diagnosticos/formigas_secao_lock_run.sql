-- Formigas: trava por seção (WhatsApp, veículos, adesivo, links)
-- e grava o momento do primeiro lançamento de cada parte.

do $$
declare
  t text;
begin
  foreach t in array array['cadastros', 'lideres', 'coordenadores']
  loop
    execute format('alter table public.%I add column if not exists formigas_wa_em timestamptz', t);
    execute format('alter table public.%I add column if not exists formigas_carros_em timestamptz', t);
    execute format('alter table public.%I add column if not exists formigas_casa_em timestamptz', t);
    execute format('alter table public.%I add column if not exists formigas_links_em timestamptz', t);
  end loop;
end $$;

create or replace function public.enforce_formigas_section_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_admin() or public.is_diretoria();
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
    if old.formigas_wa_by is not null and old.formigas_wa_by is distinct from v_uid and not v_admin then
      raise exception 'Só a formiga que registrou o WhatsApp pode alterar esse status.';
    end if;
    if new.contato_whatsapp_status is distinct from 'nao' then
      new.formigas_wa_by := coalesce(old.formigas_wa_by, v_uid);
      new.formigas_wa_em := coalesce(old.formigas_wa_em, now());
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
    if old.formigas_carros_by is not null and old.formigas_carros_by is distinct from v_uid and not v_admin then
      raise exception 'Só a formiga que registrou os veículos pode alterar.';
    end if;
    if coalesce(new.carros_adesivados, 0) > 0 or coalesce(new.motos_adesivadas, 0) > 0 then
      new.formigas_carros_by := coalesce(old.formigas_carros_by, v_uid);
      new.formigas_carros_em := coalesce(old.formigas_carros_em, now());
    else
      new.formigas_carros_by := old.formigas_carros_by;
      new.formigas_carros_em := old.formigas_carros_em;
    end if;
  else
    new.formigas_carros_by := old.formigas_carros_by;
    new.formigas_carros_em := old.formigas_carros_em;
  end if;

  -- Adesivo residencial (sim / talvez / quantidade)
  if v_old_casa is distinct from v_new_casa
     or coalesce(old.adesivos_casa, 0) is distinct from coalesce(new.adesivos_casa, 0) then
    if old.formigas_casa_by is not null and old.formigas_casa_by is distinct from v_uid and not v_admin then
      raise exception 'Só a formiga que registrou o adesivo residencial pode alterar.';
    end if;
    if v_new_casa in ('sim', 'talvez') or coalesce(new.adesivos_casa, 0) > 0 then
      new.formigas_casa_by := coalesce(old.formigas_casa_by, v_uid);
      new.formigas_casa_em := coalesce(old.formigas_casa_em, now());
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
    if old.formigas_links_by is not null and old.formigas_links_by is distinct from v_uid and not v_admin then
      raise exception 'Só a formiga que registrou as postagens pode alterar os links.';
    end if;
    if v_new_links > 0 then
      new.formigas_links_by := coalesce(old.formigas_links_by, v_uid);
      new.formigas_links_em := coalesce(old.formigas_links_em, now());
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

drop trigger if exists trg_formigas_owners_cadastros on public.cadastros;
create trigger trg_formigas_owners_cadastros
  before update on public.cadastros
  for each row execute function public.enforce_formigas_section_owners();

drop trigger if exists trg_formigas_owners_lideres on public.lideres;
create trigger trg_formigas_owners_lideres
  before update on public.lideres
  for each row execute function public.enforce_formigas_section_owners();

drop trigger if exists trg_formigas_owners_coordenadores on public.coordenadores;
create trigger trg_formigas_owners_coordenadores
  before update on public.coordenadores
  for each row execute function public.enforce_formigas_section_owners();

notify pgrst, 'reload schema';
