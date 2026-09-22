-- MERGE definitivo: THASILLA + THASSIA (MIRANDA) → uma THASSIA
-- Desativa o trigger de Formigas (SQL Editor não tem auth.uid()).

do $$
declare
  v_dir uuid := '4383407d-1321-4880-bb49-fab84c620cbc'::uuid;
  v_coord uuid;
  v_keep uuid;
  v_fichas int;
  v_nerites int;
  r record;
begin
  -- Evita ERROR "Não autenticado" do enforce_formigas_section_owners
  alter table public.cadastros disable trigger trg_formigas_owners_cadastros;
  alter table public.lideres disable trigger trg_formigas_owners_lideres;

  begin
    select id into v_coord
    from public.coordenadores
    where diretoria_id = v_dir
      and upper(btrim(nome)) = 'MIRANDA'
    order by ativo desc, created_at asc
    limit 1;

    if v_coord is null then
      raise exception 'Coordenador MIRANDA não encontrado nessa diretoria.';
    end if;

    select id into v_keep
    from public.lideres
    where upper(btrim(nome)) in ('THASSIA', 'THASILLA')
    order by
      case when diretoria_id = v_dir then 0 else 1 end,
      case when upper(btrim(nome)) = 'THASSIA' then 0 else 1 end,
      created_at asc nulls last,
      id
    limit 1;

    if v_keep is null then
      insert into public.lideres (nome, diretoria_id, coordenador_id, ativo)
      values ('THASSIA', v_dir, v_coord, true)
      returning id into v_keep;
      raise notice 'Criada liderança THASSIA id %', v_keep;
    else
      update public.lideres
      set
        nome = 'THASSIA',
        ativo = true,
        diretoria_id = v_dir,
        coordenador_id = coalesce(coordenador_id, v_coord)
      where id = v_keep;
    end if;

    update public.cadastros
    set
      lider = 'THASSIA',
      coordenador = 'MIRANDA',
      diretoria_id = coalesce(diretoria_id, v_dir)
    where upper(btrim(lider)) in ('THASILLA', 'THASSIA')
      and (
        diretoria_id = v_dir
        or diretoria_id is null
        or upper(btrim(coordenador)) = 'MIRANDA'
      );

    get diagnostics v_fichas = row_count;

    update public.profiles
    set lider_id = v_keep,
        coordenador_id = coalesce(v_coord, coordenador_id),
        diretoria_id = coalesce(diretoria_id, v_dir)
    where lider_id in (
      select id from public.lideres
      where id <> v_keep
        and upper(btrim(nome)) in ('THASSIA', 'THASILLA')
    );
    get diagnostics v_nerites = row_count;

    for r in
      select id, nome from public.lideres
      where id <> v_keep
        and upper(btrim(nome)) in ('THASSIA', 'THASILLA')
    loop
      update public.profiles set lider_id = v_keep where lider_id = r.id;
      delete from public.lideres where id = r.id;
      raise notice 'Removida duplicata: % (%)', r.nome, r.id;
    end loop;

    raise notice 'OK — THASSIA id %. Fichas atualizadas: %. Nerites: %.', v_keep, v_fichas, v_nerites;
  exception
    when others then
      alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
      alter table public.lideres enable trigger trg_formigas_owners_lideres;
      raise;
  end;

  alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
  alter table public.lideres enable trigger trg_formigas_owners_lideres;
end $$;

-- Conferência
select id, nome, ativo, diretoria_id, coordenador_id
from public.lideres
where upper(btrim(nome)) in ('THASSIA', 'THASILLA');

select lider, coordenador, diretoria_id, count(*) as fichas
from public.cadastros
where upper(btrim(lider)) in ('THASSIA', 'THASILLA')
group by lider, coordenador, diretoria_id;
