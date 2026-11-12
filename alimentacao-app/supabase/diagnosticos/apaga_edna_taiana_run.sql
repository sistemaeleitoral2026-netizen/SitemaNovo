-- APAGA só EDNA TAIANA do coordenador SEU LIMA + as fichas dela como liderança.
-- Não mexe em outra EDNA de outro coordenador.

do $$
declare
  v_fichas int := 0;
  v_lideres int := 0;
  v_nerites int := 0;
  v_ids uuid[];
begin
  select coalesce(array_agg(l.id), '{}')
  into v_ids
  from public.lideres l
  join public.coordenadores c on c.id = l.coordenador_id
  where regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') = 'EDNA TAIANA'
    and regexp_replace(upper(btrim(c.nome)), '\s+', ' ', 'g') = 'SEU LIMA';

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'Não achei EDNA TAIANA do coordenador SEU LIMA.';
  end if;

  alter table public.cadastros disable trigger trg_formigas_owners_cadastros;
  alter table public.lideres disable trigger trg_formigas_owners_lideres;

  begin
    update public.profiles
    set lider_id = null
    where lider_id = any(v_ids);
    get diagnostics v_nerites = row_count;

    delete from public.ativacao_claims
    where tipo = 'lideranca'
      and pessoa_id = any(v_ids);

    if to_regclass('public.formigas_historico') is not null then
      delete from public.formigas_historico
      where tipo = 'lideranca'
        and pessoa_id = any(v_ids);
    end if;

    delete from public.cadastros
    where regexp_replace(upper(btrim(lider)), '\s+', ' ', 'g') = 'EDNA TAIANA'
      and regexp_replace(upper(btrim(coordenador)), '\s+', ' ', 'g') = 'SEU LIMA';
    get diagnostics v_fichas = row_count;

    delete from public.lideres
    where id = any(v_ids);
    get diagnostics v_lideres = row_count;

    raise notice 'OK — lideranças: %. Fichas: %. Nerites desvinculadas: %.',
      v_lideres, v_fichas, v_nerites;
  exception
    when others then
      alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
      alter table public.lideres enable trigger trg_formigas_owners_lideres;
      raise;
  end;

  alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
  alter table public.lideres enable trigger trg_formigas_owners_lideres;
end $$;

-- Conferência: EDNA TAIANA + SEU LIMA deve sumir
select l.id, l.nome, c.nome as coordenador
from public.lideres l
left join public.coordenadores c on c.id = l.coordenador_id
where regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') = 'EDNA TAIANA';

select lider, coordenador, count(*) as fichas
from public.cadastros
where regexp_replace(upper(btrim(lider)), '\s+', ' ', 'g') = 'EDNA TAIANA'
group by lider, coordenador;
