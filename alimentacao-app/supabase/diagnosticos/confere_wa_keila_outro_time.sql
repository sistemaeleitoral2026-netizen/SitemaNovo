-- Confere se os 3 da planilha Keila (que ficaram em outro time) foram acionados no WhatsApp.
-- UM SELECT só. Rode no SQL Editor.

with alvos as (
  select *
  from (values
    ('a77f48fa-d6de-4447-8baa-99f78c351635'::uuid, '090093301155', 'Pedro Henrique Sousa Alcantara'),
    ('501a7e18-73b9-4d36-9c83-341bc670f3b5'::uuid, '069309761104', 'Ana Karolina Almeida Souza'),
    ('2316a5a3-5de8-4237-8124-ea868a24f931'::uuid, '064943791180', 'Leandro Cordeiro de Andrade')
  ) as v(cadastro_id, titulo, nome_ref)
),
hist as (
  select
    h.pessoa_id,
    count(*) as eventos_wa,
    min(h.created_at) as primeiro_wa,
    max(h.created_at) as ultimo_wa,
    string_agg(distinct coalesce(p.nome, h.actor_id::text), ' | ' order by coalesce(p.nome, h.actor_id::text)) as quem_marcou
  from public.formigas_historico h
  left join public.profiles p on p.id = h.actor_id
  where h.secao = 'whatsapp'
    and h.tipo = 'eleitor'
    and h.pessoa_id in (select cadastro_id from alvos)
  group by h.pessoa_id
)
select
  a.nome_ref,
  a.titulo,
  c.nome_completo,
  c.coordenador,
  c.lider,
  c.telefone,
  coalesce(c.contato_whatsapp_status, 'nao') as contato_whatsapp_status,
  c.contato_whatsapp as flag_whatsapp,
  c.ativacao_em,
  c.formigas_wa_em,
  pw.nome as formigas_wa_por,
  coalesce(h.eventos_wa, 0) as eventos_historico_wa,
  h.primeiro_wa,
  h.ultimo_wa,
  h.quem_marcou,
  case
    when coalesce(c.contato_whatsapp_status, 'nao') = 'sim' then 'ACIONADO_SIM'
    when coalesce(c.contato_whatsapp_status, 'nao') = 'sem' then 'MARCADO_SEM_WHATSAPP'
    when coalesce(h.eventos_wa, 0) > 0 then 'TEM_HISTORICO_WA_MAS_STATUS_NAO'
    when c.ativacao_em is not null then 'TEM_ATIVACAO_MAS_WA_NAO'
    else 'NAO_ACIONADO'
  end as situacao_wa
from alvos a
left join public.cadastros c on c.id = a.cadastro_id
left join public.profiles pw on pw.id = c.formigas_wa_by
left join hist h on h.pessoa_id = a.cadastro_id
order by a.nome_ref;
