-- APAGA só VALDEGRILSON (VAL) + as 20 fichas dele (liderança).
-- NÃO mexe em VALDELIR / GUTO.

do $$
declare
  v_fichas int := 0;
  v_lideres int := 0;
  v_nerites int := 0;
begin
  alter table public.cadastros disable trigger trg_formigas_owners_cadastros;
  alter table public.lideres disable trigger trg_formigas_owners_lideres;

  begin
    update public.profiles
    set lider_id = null
    where lider_id in (
      select id from public.lideres
      where upper(btrim(nome)) = 'VALDEGRILSON (VAL)'
    );
    get diagnostics v_nerites = row_count;

    delete from public.ativacao_claims
    where tipo = 'lideranca'
      and pessoa_id in (
        select id from public.lideres
        where upper(btrim(nome)) = 'VALDEGRILSON (VAL)'
      );

    if to_regclass('public.formigas_historico') is not null then
      delete from public.formigas_historico
      where tipo = 'lideranca'
        and pessoa_id in (
          select id from public.lideres
          where upper(btrim(nome)) = 'VALDEGRILSON (VAL)'
        );
    end if;

    -- Só fichas em que a liderança é VALDEGRILSON (VAL)
    delete from public.cadastros
    where upper(btrim(lider)) = 'VALDEGRILSON (VAL)';
    get diagnostics v_fichas = row_count;

    delete from public.lideres
    where upper(btrim(nome)) = 'VALDEGRILSON (VAL)';
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

-- Conferência: VALDEGRILSON some; VALDELIR continua com 18
select id, nome from public.lideres
where upper(btrim(nome)) in ('VALDEGRILSON (VAL)', 'VALDELIR');

select lider, coordenador, count(*) as fichas
from public.cadastros
where upper(btrim(lider)) in ('VALDEGRILSON (VAL)', 'VALDELIR')
group by lider, coordenador;
