-- 1) Como o nome aparece nas fichas
select
  coordenador,
  count(*) as fichas,
  count(distinct diretoria_id) as diretorias
from public.cadastros
where upper(coordenador) like '%LUCAS%'
group by coordenador
order by fichas desc;

-- 2) Diretora pelas fichas (mesmo sem cadastro em coordenadores)
select
  ca.coordenador,
  d.nome as diretora,
  d.email,
  count(*) as fichas
from public.cadastros ca
left join public.profiles d on d.id = ca.diretoria_id
where upper(ca.coordenador) like '%LUCAS%'
group by ca.coordenador, d.nome, d.email
order by fichas desc;

-- 3) Cadastro oficial de coordenadores com LUCAS no nome
select
  c.id,
  c.nome,
  d.nome as diretora,
  d.email
from public.coordenadores c
left join public.profiles d on d.id = c.diretoria_id
where upper(c.nome) like '%LUCAS%'
order by c.nome;
