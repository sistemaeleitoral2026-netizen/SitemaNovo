-- APAGA só a liderança LUIS FERNANDO do Coord. YURI LIMPOCAR.
-- NÃO apaga o coordenador Yuri. Fichas dele já foram removidas antes.

do $$
declare
  v_id uuid := '7ad3b867-de5d-49a9-bc89-2cddcfeaf403';
  v_lideres int := 0;
  v_nerites int := 0;
  v_hist int := 0;
  v_claims int := 0;
  v_aux int := 0;
  v_fichas int := 0;
  v_nome text;
  v_coord text;
begin
  select
    regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g'),
    regexp_replace(upper(btrim(coalesce(c.nome, ''))), '\s+', ' ', 'g')
  into v_nome, v_coord
  from public.lideres l
  left join public.coordenadores c on c.id = l.coordenador_id
  where l.id = v_id;

  if v_nome is null then
    raise exception 'Liderança % não encontrada (já apagada?).', v_id;
  end if;
  if v_nome !~ 'LU[IÍ]S' or v_nome !~ 'FERNANDO' or v_coord !~ 'YURI' then
    raise exception 'Abortado: id % não é LUIS FERNANDO / YURI (achei: % / %).', v_id, v_nome, v_coord;
  end if;

  alter table public.lideres disable trigger trg_formigas_owners_lideres;
  alter table public.cadastros disable trigger trg_formigas_owners_cadastros;

  begin
    update public.profiles
    set lider_id = null
    where lider_id = v_id;
    get diagnostics v_nerites = row_count;

    if to_regclass('public.auxiliar_lideres') is not null then
      delete from public.auxiliar_lideres where lider_id = v_id;
      get diagnostics v_aux = row_count;
    end if;

    if to_regclass('public.ativacao_claims') is not null then
      delete from public.ativacao_claims
      where tipo = 'lideranca' and pessoa_id = v_id;
      get diagnostics v_claims = row_count;
    end if;

    if to_regclass('public.formigas_historico') is not null then
      delete from public.formigas_historico
      where tipo = 'lideranca' and pessoa_id = v_id;
      get diagnostics v_hist = row_count;
    end if;

    -- Segurança: se sobrou alguma ficha com esse texto, remove só elas
    delete from public.cadastros
    where regexp_replace(upper(btrim(coalesce(lider, ''))), '\s+', ' ', 'g') ~ 'LU[IÍ]S FERNANDO'
      and regexp_replace(upper(btrim(coalesce(coordenador, ''))), '\s+', ' ', 'g') ~ 'YURI';
    get diagnostics v_fichas = row_count;

    delete from public.lideres where id = v_id;
    get diagnostics v_lideres = row_count;

    raise notice 'OK — liderança apagada: %. Fichas residual: %. Nerites desvinculadas: %. Aux: %. Hist: %. Claims: %.',
      v_lideres, v_fichas, v_nerites, v_aux, v_hist, v_claims;
  exception
    when others then
      alter table public.lideres enable trigger trg_formigas_owners_lideres;
      alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
      raise;
  end;

  alter table public.lideres enable trigger trg_formigas_owners_lideres;
  alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
end $$;

-- Conferência: liderança deve sumir; coordenador Yuri continua
select l.id, l.nome as lideranca, c.nome as coordenador
from public.lideres l
left join public.coordenadores c on c.id = l.coordenador_id
where l.id = '7ad3b867-de5d-49a9-bc89-2cddcfeaf403'
   or (
     regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') ~ 'LU[IÍ]S'
     and regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') ~ 'FERNANDO'
     and regexp_replace(upper(btrim(coalesce(c.nome, ''))), '\s+', ' ', 'g') ~ 'YURI'
   );

select id, nome, ativo
from public.coordenadores
where regexp_replace(upper(btrim(nome)), '\s+', ' ', 'g') ~ 'YURI'
  and regexp_replace(upper(btrim(nome)), '\s+', ' ', 'g') ~ 'LIMPOCAR';
