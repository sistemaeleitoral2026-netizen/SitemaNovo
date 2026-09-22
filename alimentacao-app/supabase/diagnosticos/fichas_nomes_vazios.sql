-- Diagnóstico somente leitura: fichas com nome da pessoa, coordenação
-- ou liderança nulos, vazios ou compostos apenas por espaços.
-- Execute no SQL Editor do Supabase. Nenhum dado é alterado.

select
  c.id as ficha_id,
  c.created_at as cadastrada_em,
  p.nome as nerite,
  c.operator_id as nerite_id,
  c.nome_completo,
  c.coordenador,
  c.lider,
  (nullif(btrim(c.nome_completo), '') is null) as nome_pessoa_vazio,
  (nullif(btrim(c.coordenador), '') is null) as coordenacao_vazia,
  (nullif(btrim(c.lider), '') is null) as lideranca_vazia
from public.cadastros c
left join public.profiles p on p.id = c.operator_id
where nullif(btrim(c.nome_completo), '') is null
   or nullif(btrim(c.coordenador), '') is null
   or nullif(btrim(c.lider), '') is null
order by c.created_at desc, c.id;

-- Resumo por campo.
select
  count(*) filter (where nullif(btrim(nome_completo), '') is null) as fichas_sem_nome_pessoa,
  count(*) filter (where nullif(btrim(coordenador), '') is null) as fichas_sem_coordenacao,
  count(*) filter (where nullif(btrim(lider), '') is null) as fichas_sem_lideranca,
  count(*) filter (
    where nullif(btrim(nome_completo), '') is null
       or nullif(btrim(coordenador), '') is null
       or nullif(btrim(lider), '') is null
  ) as fichas_com_algum_campo_vazio
from public.cadastros;
