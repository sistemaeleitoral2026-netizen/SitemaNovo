-- Status do adesivo residencial: nao | sim | talvez
-- Backfill: adesivos_casa > 0 → sim; demais → nao.
-- "talvez" exige endereço (como sim), mas não conta como adesivo confirmado.
-- Desativa triggers de ownership no backfill (SQL Editor não tem auth.uid()).

do $$
declare
  t text;
begin
  -- Evita "Não autenticado" do enforce_formigas_section_owners no UPDATE em massa
  alter table public.cadastros disable trigger trg_formigas_owners_cadastros;
  alter table public.lideres disable trigger trg_formigas_owners_lideres;
  alter table public.coordenadores disable trigger trg_formigas_owners_coordenadores;

  foreach t in array array['cadastros', 'lideres', 'coordenadores']
  loop
    execute format(
      'alter table public.%I add column if not exists adesivos_casa_status text',
      t
    );
    execute format(
      'update public.%I set adesivos_casa_status = case
         when coalesce(adesivos_casa, 0) > 0 then ''sim''
         else ''nao''
       end
       where adesivos_casa_status is null',
      t
    );
    execute format(
      'alter table public.%I alter column adesivos_casa_status set default ''nao''',
      t
    );
    execute format(
      'update public.%I set adesivos_casa_status = ''nao'' where adesivos_casa_status is null',
      t
    );
    execute format(
      'alter table public.%I alter column adesivos_casa_status set not null',
      t
    );
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_adesivos_casa_status_check'
    );
    execute format(
      'alter table public.%I add constraint %I
       check (adesivos_casa_status in (''nao'', ''sim'', ''talvez''))',
      t, t || '_adesivos_casa_status_check'
    );
    execute format(
      'comment on column public.%I.adesivos_casa_status is
       ''Adesivo residencial: nao | sim (confirmado) | talvez (endereço coletado, pendente confirmar)''',
      t
    );
  end loop;

  alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
  alter table public.lideres enable trigger trg_formigas_owners_lideres;
  alter table public.coordenadores enable trigger trg_formigas_owners_coordenadores;
end $$;

-- Ownership: trava também quando muda o status (talvez/sim)
create or replace function public.enforce_formigas_section_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_admin() or public.is_diretoria();
  v_old_links int := coalesce(jsonb_array_length(coalesce(old.postagem_links, '[]'::jsonb)), 0);
  v_new_links int := coalesce(jsonb_array_length(coalesce(new.postagem_links, '[]'::jsonb)), 0);
  v_old_casa_status text := coalesce(old.adesivos_casa_status, case when coalesce(old.adesivos_casa, 0) > 0 then 'sim' else 'nao' end);
  v_new_casa_status text := coalesce(new.adesivos_casa_status, case when coalesce(new.adesivos_casa, 0) > 0 then 'sim' else 'nao' end);
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  new.contato_whatsapp := (coalesce(new.contato_whatsapp_status, 'nao') = 'sim');

  -- WhatsApp
  if coalesce(old.contato_whatsapp_status, 'nao') is distinct from coalesce(new.contato_whatsapp_status, 'nao') then
    if old.formigas_wa_by is not null and old.formigas_wa_by is distinct from v_uid and not v_admin then
      raise exception 'Só a formiga que registrou o WhatsApp pode alterar.';
    end if;
    if new.contato_whatsapp_status is distinct from 'nao' and new.formigas_wa_by is null then
      new.formigas_wa_by := v_uid;
    elsif new.contato_whatsapp_status is distinct from 'nao' then
      new.formigas_wa_by := coalesce(old.formigas_wa_by, v_uid);
    else
      new.formigas_wa_by := old.formigas_wa_by;
    end if;
  else
    new.formigas_wa_by := old.formigas_wa_by;
  end if;

  -- Carros / motos
  if coalesce(old.carros_adesivados, 0) is distinct from coalesce(new.carros_adesivados, 0)
     or coalesce(old.motos_adesivadas, 0) is distinct from coalesce(new.motos_adesivadas, 0) then
    if old.formigas_carros_by is not null and old.formigas_carros_by is distinct from v_uid and not v_admin then
      raise exception 'Só a formiga que registrou o adesivo de veículo pode alterar.';
    end if;
    if coalesce(new.carros_adesivados, 0) > 0 or coalesce(new.motos_adesivadas, 0) > 0 then
      new.formigas_carros_by := coalesce(old.formigas_carros_by, v_uid);
    else
      new.formigas_carros_by := old.formigas_carros_by;
    end if;
  else
    new.formigas_carros_by := old.formigas_carros_by;
  end if;

  -- Casa (quantidade OU status)
  if coalesce(old.adesivos_casa, 0) is distinct from coalesce(new.adesivos_casa, 0)
     or v_old_casa_status is distinct from v_new_casa_status then
    if old.formigas_casa_by is not null and old.formigas_casa_by is distinct from v_uid and not v_admin then
      raise exception 'Só a formiga que registrou o adesivo residencial pode alterar.';
    end if;
    if coalesce(new.adesivos_casa, 0) > 0 or v_new_casa_status in ('sim', 'talvez') then
      new.formigas_casa_by := coalesce(old.formigas_casa_by, v_uid);
    else
      new.formigas_casa_by := old.formigas_casa_by;
    end if;
  else
    new.formigas_casa_by := old.formigas_casa_by;
  end if;

  -- Links / redes
  if v_old_links is distinct from v_new_links
     or coalesce(old.postagem_links, '[]'::jsonb) is distinct from coalesce(new.postagem_links, '[]'::jsonb) then
    if old.formigas_links_by is not null and old.formigas_links_by is distinct from v_uid and not v_admin then
      raise exception 'Só a formiga que registrou as postagens pode alterar os links.';
    end if;
    if v_new_links > 0 then
      new.formigas_links_by := coalesce(old.formigas_links_by, v_uid);
    else
      new.formigas_links_by := old.formigas_links_by;
    end if;
  else
    new.formigas_links_by := old.formigas_links_by;
  end if;

  return new;
end;
$$;

-- Pendente: "talvez" também tira da fila de próximo
create or replace function public.ativacao_is_pendente(
  p_carros int,
  p_casa int,
  p_postagens int,
  p_links jsonb,
  p_contato boolean,
  p_ativacao_em timestamptz,
  p_status text default 'nao',
  p_motos int default 0,
  p_casa_status text default 'nao'
)
returns boolean
language sql
immutable
as $$
  select
    p_ativacao_em is null
    and coalesce(p_carros, 0) = 0
    and coalesce(p_motos, 0) = 0
    and coalesce(p_casa, 0) = 0
    and coalesce(p_postagens, 0) = 0
    and coalesce(p_contato, false) = false
    and coalesce(p_status, 'nao') = 'nao'
    and coalesce(p_casa_status, 'nao') = 'nao'
    and (
      p_links is null
      or p_links = '[]'::jsonb
      or jsonb_typeof(p_links) <> 'array'
      or jsonb_array_length(p_links) = 0
    );
$$;

-- claim_next: passa adesivos_casa_status (com default a função antiga ainda funciona)
create or replace function public.claim_next_ativacao(p_diretoria_id uuid default null)
returns table (out_tipo text, out_pessoa_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tipo text;
  v_id uuid;
  v_until timestamptz := now() + interval '5 minutes';
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  if not (public.is_mobilizador() or public.is_admin() or public.is_diretoria()) then
    raise exception 'Sem permissão para Formigas';
  end if;

  delete from public.ativacao_claims where claimed_until < now();
  delete from public.ativacao_claims where claimed_by = v_uid;

  select c.tipo, c.pessoa_id
  into v_tipo, v_id
  from (
    select 'eleitor'::text as tipo, c.id as pessoa_id
    from public.cadastros c
    where public.ativacao_is_pendente(
      c.carros_adesivados::int,
      c.adesivos_casa::int,
      c.postagens::int,
      c.postagem_links,
      c.contato_whatsapp,
      c.ativacao_em,
      c.contato_whatsapp_status,
      coalesce(c.motos_adesivadas, 0)::int,
      coalesce(c.adesivos_casa_status, 'nao')
    )
      and (p_diretoria_id is null or c.diretoria_id = p_diretoria_id)
      and not exists (
        select 1 from public.ativacao_claims ac
        where ac.tipo = 'eleitor' and ac.pessoa_id = c.id and ac.claimed_until >= now()
      )

    union all

    select 'lideranca'::text, l.id
    from public.lideres l
    where l.ativo = true
      and public.ativacao_is_pendente(
        l.carros_adesivados::int,
        l.adesivos_casa::int,
        l.postagens::int,
        l.postagem_links,
        l.contato_whatsapp,
        l.ativacao_em,
        l.contato_whatsapp_status,
        coalesce(l.motos_adesivadas, 0)::int,
        coalesce(l.adesivos_casa_status, 'nao')
      )
      and (p_diretoria_id is null or l.diretoria_id = p_diretoria_id)
      and not exists (
        select 1 from public.ativacao_claims ac
        where ac.tipo = 'lideranca' and ac.pessoa_id = l.id and ac.claimed_until >= now()
      )

    union all

    select 'coordenador'::text, o.id
    from public.coordenadores o
    where o.ativo = true
      and public.ativacao_is_pendente(
        o.carros_adesivados::int,
        o.adesivos_casa::int,
        o.postagens::int,
        o.postagem_links,
        o.contato_whatsapp,
        o.ativacao_em,
        o.contato_whatsapp_status,
        coalesce(o.motos_adesivadas, 0)::int,
        coalesce(o.adesivos_casa_status, 'nao')
      )
      and (p_diretoria_id is null or o.diretoria_id = p_diretoria_id)
      and not exists (
        select 1 from public.ativacao_claims ac
        where ac.tipo = 'coordenador' and ac.pessoa_id = o.id and ac.claimed_until >= now()
      )
  ) c
  order by random()
  limit 1;

  if v_id is null then
    return;
  end if;

  insert into public.ativacao_claims (tipo, pessoa_id, claimed_by, claimed_until)
  values (v_tipo, v_id, v_uid, v_until)
  on conflict (tipo, pessoa_id) do update
    set claimed_by = excluded.claimed_by,
        claimed_until = excluded.claimed_until
  where public.ativacao_claims.claimed_until < now()
     or public.ativacao_claims.claimed_by = v_uid;

  if not exists (
    select 1 from public.ativacao_claims
    where tipo = v_tipo and pessoa_id = v_id and claimed_by = v_uid and claimed_until >= now()
  ) then
    return;
  end if;

  out_tipo := v_tipo;
  out_pessoa_id := v_id;
  return next;
end;
$$;

notify pgrst, 'reload schema';
