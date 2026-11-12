-- LUCAS CELL: coordenador, lideranças e fichas

select
  c.id,
  c.nome,
  c.ativo,
  c.diretoria_id,
  (
    select count(*)
    from public.lideres l
    where l.coordenador_id = c.id
  ) as liderancas
from public.coordenadores c
where regexp_replace(upper(btrim(c.nome)), '\s+', ' ', 'g') ~ 'LUCAS'
  and regexp_replace(upper(btrim(c.nome)), '\s+', ' ', 'g') ~ 'CELL'
order by c.nome;

select
  coordenador,
  count(*) as fichas
from public.cadastros
where regexp_replace(upper(btrim(coordenador)), '\s+', ' ', 'g') ~ 'LUCAS'
  and regexp_replace(upper(btrim(coordenador)), '\s+', ' ', 'g') ~ 'CELL'
group by coordenador
order by fichas desc;

select
  lider,
  coordenador,
  count(*) as fichas
from public.cadastros
where regexp_replace(upper(btrim(coordenador)), '\s+', ' ', 'g') ~ 'LUCAS'
  and regexp_replace(upper(btrim(coordenador)), '\s+', ' ', 'g') ~ 'CELL'
group by lider, coordenador
order by fichas desc, lider;
