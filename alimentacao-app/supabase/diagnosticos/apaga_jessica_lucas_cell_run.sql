-- APAGA só as fichas da liderança JESSICA no coordenador LUCAS CELL.
-- Não apaga a liderança nem o coordenador.

do $$
declare
  v_fichas int := 0;
begin
  alter table public.cadastros disable trigger trg_formigas_owners_cadastros;

  begin
    delete from public.cadastros
    where regexp_replace(upper(btrim(lider)), '\s+', ' ', 'g') = 'JESSICA'
      and regexp_replace(upper(btrim(coordenador)), '\s+', ' ', 'g') = 'LUCAS CELL';
    get diagnostics v_fichas = row_count;

    raise notice 'OK — fichas apagadas: %.', v_fichas;
  exception
    when others then
      alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
      raise;
  end;

  alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
end $$;

-- Conferência: tem que voltar vazio
select nome_completo, lider, coordenador
from public.cadastros
where regexp_replace(upper(btrim(lider)), '\s+', ' ', 'g') = 'JESSICA'
  and regexp_replace(upper(btrim(coordenador)), '\s+', ' ', 'g') = 'LUCAS CELL';
