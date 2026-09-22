-- Diagnóstico: Thasilla / Thassia (e grafias parecidas) em lideranças e fichas
-- Rode no SQL Editor do Supabase.

select
  l.id,
  l.nome,
  l.ativo,
  l.telefone,
  l.diretoria_id,
  d.nome as diretoria_nome,
  l.coordenador_id,
  c.nome as coordenador_nome,
  c.ativo as coordenador_ativo,
  c.diretoria_id as coordenador_diretoria_id
from public.lideres l
left join public.profiles d on d.id = l.diretoria_id
left join public.coordenadores c on c.id = l.coordenador_id
where l.nome ~* 'thas|thass|tasill|tassi'
order by l.nome;

-- Fichas cujo texto de liderança bate nesses nomes
select
  c.lider,
  c.coordenador,
  c.diretoria_id,
  count(*) as fichas
from public.cadastros c
where c.lider ~* 'thas|thass|tasill|tassi'
group by c.lider, c.coordenador, c.diretoria_id
order by fichas desc;

-- Lideranças sem coordenador (costumam aparecer para a nerite e “sumir” no filtro do admin)
select id, nome, ativo, diretoria_id, coordenador_id
from public.lideres
where coordenador_id is null
  and nome ~* 'thas|thass|tasill|tassi'
order by nome;
