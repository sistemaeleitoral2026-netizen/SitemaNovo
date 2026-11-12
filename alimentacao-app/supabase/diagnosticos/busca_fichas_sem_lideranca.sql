-- Fichas (cadastros) sem liderança preenchida.
-- Rode no SQL Editor do Supabase.

-- Resumo por coordenação
select
  coalesce(nullif(btrim(coordenador), ''), '(sem coordenador)') as coordenador,
  count(*) as fichas_sem_lideranca
from public.cadastros
where btrim(coalesce(lider, '')) = ''
group by 1
order by fichas_sem_lideranca desc, coordenador;

-- Total geral
select count(*) as total_fichas_sem_lideranca
from public.cadastros
where btrim(coalesce(lider, '')) = '';

-- Lista (limite 200)
select
  id,
  nome_completo,
  titulo,
  zona,
  secao,
  coordenador,
  lider,
  diretoria_id,
  operator_id,
  created_at
from public.cadastros
where btrim(coalesce(lider, '')) = ''
order by coordenador nulls last, nome_completo
limit 200;
