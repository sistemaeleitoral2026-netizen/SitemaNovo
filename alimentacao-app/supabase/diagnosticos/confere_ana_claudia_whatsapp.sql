-- ANA CLAUDIA RODRIGUES (formiga)
-- Por que a visão mostra ~130 e "no sistema dela" ~260?
-- Rode e me mande o resultado de cada bloco.

-- 0) Perfil
select id, nome, email, role, extra_roles, ativo
from public.profiles
where nome ~* 'ana.?cl[aá]udia'
order by nome;

-- Use o id da Ana no lugar de :ANA se precisar; abaixo resolve sozinho.
-- 1) O que a VISÃO conta hoje (formigas_wa_by + ativacao_em + sim/sem)
with ana as (
  select id, nome from public.profiles
  where nome ~* 'ana.?cl[aá]udia' and nome ~* 'rodrigues'
  limit 1
)
select
  'visao_atual' as origem,
  count(*) filter (where status = 'sim') as acionou,
  count(*) filter (where status = 'sem') as sem_whatsapp,
  count(*) as total
from (
  select c.contato_whatsapp_status as status
  from public.cadastros c, ana
  where c.formigas_wa_by = ana.id
    and c.ativacao_em is not null
    and c.contato_whatsapp_status in ('sim', 'sem')
  union all
  select l.contato_whatsapp_status
  from public.lideres l, ana
  where l.formigas_wa_by = ana.id and l.ativo and l.ativacao_em is not null
    and l.contato_whatsapp_status in ('sim', 'sem')
  union all
  select o.contato_whatsapp_status
  from public.coordenadores o, ana
  where o.formigas_wa_by = ana.id and o.ativo and o.ativacao_em is not null
    and o.contato_whatsapp_status in ('sim', 'sem')
) x;

-- 2) Pessoas DISTINTAS no histórico WhatsApp dela (o que ela realmente marcou WA)
with ana as (
  select id from public.profiles
  where nome ~* 'ana.?cl[aá]udia' and nome ~* 'rodrigues' limit 1
)
select
  'historico_whatsapp_distinto' as origem,
  count(distinct (tipo || ':' || pessoa_id::text)) as pessoas
from public.formigas_historico, ana
where actor_id = ana.id
  and secao = 'whatsapp';

-- 3) Pessoas DISTINTAS em QUALQUER seção (histórico completo dela)
with ana as (
  select id from public.profiles
  where nome ~* 'ana.?cl[aá]udia' and nome ~* 'rodrigues' limit 1
)
select
  'historico_todas_secoes_distinto' as origem,
  count(distinct (tipo || ':' || pessoa_id::text)) as pessoas,
  count(*) as eventos
from public.formigas_historico, ana
where actor_id = ana.id;

-- 4) Histórico WA dela mas dono atual NÃO é ela (ou null) — crédito perdido
with ana as (
  select id from public.profiles
  where nome ~* 'ana.?cl[aá]udia' and nome ~* 'rodrigues' limit 1
),
wa_dela as (
  select distinct h.tipo, h.pessoa_id
  from public.formigas_historico h, ana
  where h.actor_id = ana.id and h.secao = 'whatsapp'
)
select
  'wa_historico_sem_credito_atual' as origem,
  count(*) as pessoas
from wa_dela w
left join lateral (
  select
    case w.tipo
      when 'eleitor' then (select formigas_wa_by from public.cadastros c where c.id = w.pessoa_id)
      when 'lideranca' then (select formigas_wa_by from public.lideres l where l.id = w.pessoa_id)
      else (select formigas_wa_by from public.coordenadores o where o.id = w.pessoa_id)
    end as owner
) o on true
where o.owner is distinct from (select id from ana);

-- 5) Por seção no histórico dela
with ana as (
  select id from public.profiles
  where nome ~* 'ana.?cl[aá]udia' and nome ~* 'rodrigues' limit 1
)
select secao,
       count(*) as eventos,
       count(distinct (tipo || ':' || pessoa_id::text)) as pessoas
from public.formigas_historico, ana
where actor_id = ana.id
group by secao
order by pessoas desc;
