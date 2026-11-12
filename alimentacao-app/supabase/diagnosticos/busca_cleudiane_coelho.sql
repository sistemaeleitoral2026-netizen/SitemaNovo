-- Busca ficha Cleudiane Coelho (ativa + se foi excluída via auditoria).
-- Rode no SQL Editor do Supabase.

-- 1) Ainda existe em cadastros?
select
  id,
  nome_completo,
  titulo,
  zona,
  secao,
  nome_mae,
  coordenador,
  lider,
  telefone,
  operator_id,
  votou,
  voto_em,
  adicionado_por_auxiliar,
  criado_por,
  created_at,
  updated_at
from public.cadastros
where nome_completo ilike '%cleudiane%coelho%'
   or nome_completo ilike '%cleudiane%'
order by nome_completo;

-- 2) Auditoria de exclusão / alteração com esse nome
select
  a.id,
  a.created_at,
  a.acao,
  a.entidade,
  a.entidade_id,
  a.detalhes,
  p.nome as quem_fez,
  p.role as cargo
from public.auditoria a
left join public.profiles p on p.id = a.actor_id
where a.entidade = 'cadastros'
  and (
    a.acao ilike '%excluir%'
    or a.acao ilike '%reverter%'
    or a.acao ilike '%delete%'
  )
  and (
    a.detalhes::text ilike '%cleudiane%'
    or a.detalhes::text ilike '%coelho%'
  )
order by a.created_at desc
limit 50;

-- 3) Qualquer auditoria recente mencionando Cleudiane
select
  a.id,
  a.created_at,
  a.acao,
  a.entidade,
  a.entidade_id,
  a.detalhes,
  p.nome as quem_fez
from public.auditoria a
left join public.profiles p on p.id = a.actor_id
where a.detalhes::text ilike '%cleudiane%'
order by a.created_at desc
limit 50;
