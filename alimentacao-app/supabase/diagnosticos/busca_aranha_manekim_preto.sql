-- Conferência: MANEQUINHO (hoje na ARANHA) → coordenador PRETO (Nicole)

-- 1) Coordenador PRETO na Nicole
select
  c.id,
  c.nome,
  c.ativo,
  c.limite_liderancas,
  (
    select count(*) from public.lideres l
    where l.coordenador_id = c.id and l.ativo
  ) as liderancas_ativas,
  p.nome as diretora
from public.coordenadores c
left join public.profiles p on p.id = c.diretoria_id
where regexp_replace(upper(btrim(c.nome)), '\s+', ' ', 'g') ~ 'PRETO'
order by p.nome, c.ativo desc;

-- 2) Liderança MANEQUINHO
select
  l.id,
  l.nome as lideranca,
  l.ativo,
  co.nome as coordenador,
  d.nome as diretora
from public.lideres l
left join public.coordenadores co on co.id = l.coordenador_id
left join public.profiles d on d.id = l.diretoria_id
where regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') in ('MANEQUINHO', 'MANEKIM', 'MANE KIM')
order by co.nome, l.nome;

-- 3) Fichas da MANEQUINHO
select lider, coordenador, count(*) as fichas
from public.cadastros
where regexp_replace(upper(btrim(lider)), '\s+', ' ', 'g') in ('MANEQUINHO', 'MANEKIM', 'MANE KIM')
group by lider, coordenador
order by fichas desc;
