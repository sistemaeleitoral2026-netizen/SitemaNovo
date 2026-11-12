-- Hierarquia e as 16 fichas: LUCAS CELL → JESSICA

-- 1) Coordenador e a diretora dele
select
  c.id as coordenador_id,
  c.nome as coordenador,
  d.nome as diretora,
  c.diretoria_id
from public.coordenadores c
left join public.profiles d on d.id = c.diretoria_id
where regexp_replace(upper(btrim(c.nome)), '\s+', ' ', 'g') ~ 'LUCAS'
  and regexp_replace(upper(btrim(c.nome)), '\s+', ' ', 'g') ~ 'CELL';

-- 2) Lideranças oficiais desse coordenador
select
  l.id,
  l.nome as lideranca,
  l.telefone,
  c.nome as coordenador,
  d.nome as diretora
from public.lideres l
join public.coordenadores c on c.id = l.coordenador_id
left join public.profiles d on d.id = l.diretoria_id
where regexp_replace(upper(btrim(c.nome)), '\s+', ' ', 'g') ~ 'LUCAS'
  and regexp_replace(upper(btrim(c.nome)), '\s+', ' ', 'g') ~ 'CELL'
order by l.nome;

-- 3) As fichas gravadas com coordenador LUCAS CELL + liderança JESSICA
select
  ca.id,
  ca.nome_completo,
  ca.telefone,
  ca.titulo,
  ca.zona,
  ca.lider,
  ca.coordenador,
  d.nome as diretora
from public.cadastros ca
left join public.profiles d on d.id = ca.diretoria_id
where regexp_replace(upper(btrim(ca.coordenador)), '\s+', ' ', 'g') ~ 'LUCAS'
  and regexp_replace(upper(btrim(ca.coordenador)), '\s+', ' ', 'g') ~ 'CELL'
  and regexp_replace(upper(btrim(ca.lider)), '\s+', ' ', 'g') ~ 'JESSICA'
order by ca.nome_completo;
