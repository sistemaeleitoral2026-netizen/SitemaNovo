-- Busca ampla: VALDEGRILSON / VAL / GRILSON
-- Rode isto e me manda as 3 tabelas.

select id, nome, ativo, diretoria_id, coordenador_id
from public.lideres
where nome ~* 'valde|grilson|\\(val\\)'
order by nome;

select lider, coordenador, count(*) as fichas
from public.cadastros
where lider ~* 'valde|grilson|\\(val\\)'
group by lider, coordenador
order by fichas desc;

select id, nome, lider_id
from public.profiles
where role = 'operador'
  and (
    lider_id in (
      select id from public.lideres where nome ~* 'valde|grilson|\\(val\\)'
    )
    or nome ~* 'valde|grilson'
  )
order by nome;
