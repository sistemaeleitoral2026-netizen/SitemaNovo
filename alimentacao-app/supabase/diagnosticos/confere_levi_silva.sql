-- LEVI DA SILVA E SILVA — homônimo na conferência
-- ficha: f45a8d9d-1580-4e53-ba7f-ca74499298de
-- API devolveu outro LEVI (nasc 21/03/1982, mãe MARIA ELIANE, CPF 726.806.602-34)

-- 1) A ficha
select
  id,
  nome_completo,
  nome_mae,
  data_nascimento,
  cpf,
  titulo,
  zona,
  secao,
  coordenador,
  lider,
  diretoria_id
from public.cadastros
where id = 'f45a8d9d-1580-4e53-ba7f-ca74499298de';

-- 2) Outros LEVI DA SILVA E SILVA
select
  id,
  nome_completo,
  nome_mae,
  data_nascimento,
  cpf,
  titulo,
  zona,
  secao,
  coordenador,
  lider
from public.cadastros
where regexp_replace(upper(btrim(nome_completo)), '\s+', ' ', 'g')
      = 'LEVI DA SILVA E SILVA'
order by data_nascimento, id;

-- 3) O CPF que a API sugeriu (não aplicar nesta ficha se for outra pessoa)
select
  id,
  nome_completo,
  nome_mae,
  data_nascimento,
  cpf,
  titulo,
  coordenador,
  lider
from public.cadastros
where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = '72680660234';

-- 4) Título da ficha
select
  id,
  nome_completo,
  nome_mae,
  data_nascimento,
  titulo,
  cpf
from public.cadastros
where regexp_replace(coalesce(titulo, ''), '\D', '', 'g') = '082275731147';

-- 5) Relatório/Correção
select titulo_key, cadastro_id, nome, status, motivo, linha_txt
from public.relatorio_fichas_txt
where cadastro_id = 'f45a8d9d-1580-4e53-ba7f-ca74499298de'
   or titulo_key = 'id:f45a8d9d-1580-4e53-ba7f-ca74499298de'
   or regexp_replace(coalesce(titulo, ''), '\D', '', 'g') = '082275731147';
