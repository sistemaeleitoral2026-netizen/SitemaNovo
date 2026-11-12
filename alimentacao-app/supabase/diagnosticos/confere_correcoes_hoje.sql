-- O que realmente subiu no Relatório/Correção hoje (horário de Brasília).
-- Backup = ficha foi gravada. relatorio_fichas_txt ok = entrou nos resultados.
-- relatorio_fichas_txt erro = foi para Falhas (devolução).

-- 1) Correções gravadas na ficha (Backup)
select
  alterado_em at time zone 'America/Sao_Paulo' as quando,
  nome_completo,
  alterado_por_nome as quem,
  cadastro_id,
  revertido,
  linha_txt
from public.cadastro_correcao_backup
where alterado_em >= (current_date at time zone 'America/Sao_Paulo')
order by alterado_em desc
limit 200;

-- 2) O que ficou no relatório (ok = resultados, erro = Falhas)
select
  updated_at at time zone 'America/Sao_Paulo' as quando,
  status,
  nome,
  motivo,
  cadastro_id,
  titulo_key,
  linha_txt
from public.relatorio_fichas_txt
where updated_at >= (current_date at time zone 'America/Sao_Paulo')
order by updated_at desc
limit 200;
