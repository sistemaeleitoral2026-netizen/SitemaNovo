-- Conferência: EDNA TAIANA (SEU LIMA)
-- Rode isto antes de apagar.

select
  l.id,
  l.nome,
  l.telefone,
  c.nome as coordenador,
  l.diretoria_id
from public.lideres l
left join public.coordenadores c on c.id = l.coordenador_id
where regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') = 'EDNA TAIANA'
order by c.nome, l.nome;

select lider, coordenador, count(*) as fichas
from public.cadastros
where regexp_replace(upper(btrim(lider)), '\s+', ' ', 'g') = 'EDNA TAIANA'
group by lider, coordenador
order by fichas desc;

select id, nome, lider_id
from public.profiles
where lider_id in (
  select id from public.lideres
  where regexp_replace(upper(btrim(nome)), '\s+', ' ', 'g') = 'EDNA TAIANA'
);
