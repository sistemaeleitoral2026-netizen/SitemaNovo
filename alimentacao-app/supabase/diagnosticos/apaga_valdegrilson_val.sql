-- =============================================================================
-- Apaga a liderança VALDEGRILSON (VAL) e SOMENTE as fichas em que ele é
-- a liderança (campo cadastros.lider). Não mexe em fichas de outras lideranças.
--
-- 1) Rode o PREVIEW e confira a quantidade.
-- 2) Depois rode o bloco APAGAR (está descomentado no arquivo de run).
-- =============================================================================

-- ---------- PREVIEW ----------
select
  l.id,
  l.nome,
  l.ativo,
  l.diretoria_id,
  d.nome as diretoria,
  c.nome as coordenador
from public.lideres l
left join public.profiles d on d.id = l.diretoria_id
left join public.coordenadores c on c.id = l.coordenador_id
where upper(btrim(l.nome)) like '%VALDEGRILSON%'
   or upper(btrim(l.nome)) = 'VALDEGRILSON (VAL)'
   or upper(btrim(l.nome)) like '%VALDEGRILSON%(VAL)%'
order by l.nome;

select
  lider,
  coordenador,
  diretoria_id,
  count(*) as fichas
from public.cadastros
where upper(btrim(lider)) like '%VALDEGRILSON%'
   or upper(btrim(lider)) = 'VALDEGRILSON (VAL)'
group by lider, coordenador, diretoria_id
order by fichas desc;

select count(*) as nerites_vinculadas
from public.profiles
where lider_id in (
  select id from public.lideres
  where upper(btrim(nome)) like '%VALDEGRILSON%'
);
