-- Tira MARIA DAS CHAGAS FERNANDES do Relatório/Correção.
-- Falhas (devolução) e já testados (resultados). A ficha em cadastros não é apagada.

-- 1) Conferir onde ela está
select
  titulo_key,
  cadastro_id,
  nome,
  titulo,
  status,
  motivo,
  linha_txt
from public.relatorio_fichas_txt
where cadastro_id = 'abb26e1b-a930-416b-a9fe-b94e65965d4f'
   or titulo_key in (
     'id:abb26e1b-a930-416b-a9fe-b94e65965d4f',
     '030493221163'
   )
   or regexp_replace(coalesce(titulo, ''), '\D', '', 'g') = '030493221163'
   or (
     nome ilike '%maria das chagas fernandes%'
     and regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = '01110205309'
   );

-- 2) Apagar do relatório (rode depois de conferir)
delete from public.relatorio_fichas_txt
where cadastro_id = 'abb26e1b-a930-416b-a9fe-b94e65965d4f'
   or titulo_key in (
     'id:abb26e1b-a930-416b-a9fe-b94e65965d4f',
     '030493221163'
   )
   or regexp_replace(coalesce(titulo, ''), '\D', '', 'g') = '030493221163'
   or (
     nome ilike '%maria das chagas fernandes%'
     and regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = '01110205309'
   )
returning titulo_key, cadastro_id, nome, titulo, status, motivo;
