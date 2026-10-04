-- Preenche votacao_notif com votos JÁ lançados por auxiliares (últimos 7 dias).
-- Rode DEPOIS de votacao_notif_run.sql.
-- Não duplica: ignora cadastro_id que já tem notificação.

insert into public.votacao_notif (
  cadastro_id,
  auxiliar_id,
  auxiliar_nome,
  eleitor_nome,
  lider,
  coordenador,
  votou,
  diretoria_id,
  created_at
)
select
  c.id,
  p.id,
  coalesce(nullif(btrim(p.nome), ''), 'Auxiliar'),
  coalesce(nullif(btrim(c.nome_completo), ''), 'Eleitor'),
  coalesce(btrim(c.lider), ''),
  coalesce(btrim(c.coordenador), ''),
  true,
  coalesce(c.diretoria_id, p.diretoria_id),
  coalesce(c.voto_em, c.created_at, now())
from public.cadastros c
join public.profiles p on p.id = c.voto_por
where c.votou is true
  and c.voto_em is not null
  and c.voto_em >= now() - interval '7 days'
  and p.role = 'auxiliar'
  and not exists (
    select 1 from public.votacao_notif n where n.cadastro_id = c.id
  )
order by c.voto_em desc
limit 500;

-- Conferência
select count(*) as total_notif from public.votacao_notif;
select eleitor_nome, auxiliar_nome, lider, created_at
from public.votacao_notif
order by created_at desc
limit 20;
