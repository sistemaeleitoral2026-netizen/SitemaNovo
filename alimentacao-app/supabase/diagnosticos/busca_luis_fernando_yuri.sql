-- Luís Fernando (liderança) do Coord. Yuri — rode no SQL Editor e me mande o resultado.

-- 1) Coordenadores Yuri
select id, nome, ativo, diretoria_id
from public.coordenadores
where regexp_replace(upper(btrim(nome)), '\s+', ' ', 'g') ~ 'YURI'
order by nome;

-- 2) Lideranças Luís Fernando (qualquer coordenador)
select
  l.id,
  l.nome as lideranca,
  l.ativo,
  c.nome as coordenador,
  l.coordenador_id,
  l.diretoria_id,
  l.telefone
from public.lideres l
left join public.coordenadores c on c.id = l.coordenador_id
where regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') ~ 'LU[IÍ]S'
  and regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') ~ 'FERNANDO'
order by c.nome nulls last, l.nome;

-- 3) Luís Fernando ligado ao Coord. Yuri (por coordenador_id)
select
  l.id as lider_id,
  l.nome as lideranca,
  c.nome as coordenador,
  l.ativo,
  l.telefone,
  (
    select count(*) from public.cadastros x
    where x.lider_id = l.id
       or (
         regexp_replace(upper(btrim(coalesce(x.lider, ''))), '\s+', ' ', 'g')
           = regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g')
         and regexp_replace(upper(btrim(coalesce(x.coordenador, ''))), '\s+', ' ', 'g')
           ~ 'YURI'
       )
  ) as fichas
from public.lideres l
join public.coordenadores c on c.id = l.coordenador_id
where regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') ~ 'LU[IÍ]S'
  and regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') ~ 'FERNANDO'
  and regexp_replace(upper(btrim(c.nome)), '\s+', ' ', 'g') ~ 'YURI'
order by l.nome;

-- 4) Contagem de fichas por lider / coordenador (texto na ficha)
select
  lider,
  coordenador,
  count(*) as fichas
from public.cadastros
where regexp_replace(upper(btrim(coalesce(lider, ''))), '\s+', ' ', 'g') ~ 'LU[IÍ]S'
  and regexp_replace(upper(btrim(coalesce(lider, ''))), '\s+', ' ', 'g') ~ 'FERNANDO'
  and regexp_replace(upper(btrim(coalesce(coordenador, ''))), '\s+', ' ', 'g') ~ 'YURI'
group by lider, coordenador
order by fichas desc;

-- 5) Lista das fichas
select
  id,
  nome_completo,
  titulo,
  zona,
  secao,
  telefone,
  bairro,
  lider,
  coordenador,
  created_at
from public.cadastros
where regexp_replace(upper(btrim(coalesce(lider, ''))), '\s+', ' ', 'g') ~ 'LU[IÍ]S'
  and regexp_replace(upper(btrim(coalesce(lider, ''))), '\s+', ' ', 'g') ~ 'FERNANDO'
  and regexp_replace(upper(btrim(coalesce(coordenador, ''))), '\s+', ' ', 'g') ~ 'YURI'
order by nome_completo;
