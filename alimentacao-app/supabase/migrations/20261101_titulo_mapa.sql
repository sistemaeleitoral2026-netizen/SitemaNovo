-- Título: grava lat/lng a partir do link do Google Maps.

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.cadastro_titulo_historico'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%tipo%';
  if cname is not null then
    execute format('alter table public.cadastro_titulo_historico drop constraint %I', cname);
  end if;
end $$;

alter table public.cadastro_titulo_historico
  drop constraint if exists cadastro_titulo_historico_tipo_check;
alter table public.cadastro_titulo_historico
  add constraint cadastro_titulo_historico_tipo_check
  check (tipo in ('consulta', 'edicao', 'mapa'));

create or replace function public.titulo_salvar_mapa(
  p_cadastro_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_nome text;
  v_row public.cadastro_titulo_consultas%rowtype;
begin
  if v_me is null then
    raise exception 'Não autenticado';
  end if;
  if not public.titulo_pode_ferramentas() then
    raise exception 'Sem permissão';
  end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Ponto do mapa inválido';
  end if;
  if not exists (select 1 from public.cadastros where id = p_cadastro_id) then
    raise exception 'Ficha não encontrada';
  end if;

  select * into v_row
  from public.cadastro_titulo_consultas
  where cadastro_id = p_cadastro_id;

  if found and v_row.consultado_por <> v_me and not (public.is_admin() or public.is_diretoria()) then
    raise exception 'Só quem consultou esta ficha pode alterar o mapa';
  end if;

  select coalesce(nome, '—') into v_nome from public.profiles where id = v_me;
  v_nome := coalesce(v_nome, '—');

  update public.cadastros
    set lat = p_lat,
        lng = p_lng,
        updated_at = now()
    where id = p_cadastro_id;

  insert into public.cadastro_titulo_historico (
    cadastro_id, tipo, status, ator_id, ator_nome, detalhes
  ) values (
    p_cadastro_id,
    'mapa',
    v_row.status,
    v_me,
    v_nome,
    jsonb_build_object('lat', p_lat, 'lng', p_lng)
  );
end;
$$;

revoke all on function public.titulo_salvar_mapa(uuid, double precision, double precision) from public;
grant execute on function public.titulo_salvar_mapa(uuid, double precision, double precision) to authenticated;
