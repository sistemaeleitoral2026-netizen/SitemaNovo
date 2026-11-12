select
  nome_completo,
  telefone,
  titulo,
  zona,
  lider,
  coordenador
from public.cadastros
where regexp_replace(upper(btrim(lider)), '\s+', ' ', 'g') = 'JESSICA'
  and regexp_replace(upper(btrim(coordenador)), '\s+', ' ', 'g') = 'LUCAS CELL'
order by nome_completo;
