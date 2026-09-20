-- Backfill ownership Formigas a partir do histórico (só onde *_by é null).
-- Também libera leitura do histórico por ficha para mobilizadores (auditoria operacional).
-- Não inventa autor sem linha no formigas_historico.

-- 1) RLS: formigas (mobilizador) podem ver o histórico de qualquer ficha
drop policy if exists formigas_historico_select on public.formigas_historico;
create policy formigas_historico_select on public.formigas_historico
  for select to authenticated
  using (
    public.is_admin()
    or public.is_diretoria()
    or public.is_mobilizador()
    or actor_id = auth.uid()
  );

create index if not exists formigas_historico_pessoa_idx
  on public.formigas_historico (tipo, pessoa_id, created_at desc);

-- 2) Backfill: primeiro actor por seção (mais antigo) → owner, se ainda null e seção tem valor
do $$
declare
  t text;
begin
  foreach t in array array['cadastros', 'lideres', 'coordenadores']
  loop
    -- WhatsApp
    execute format($sql$
      update public.%I p
      set formigas_wa_by = h.actor_id
      from (
        select distinct on (pessoa_id)
          pessoa_id, actor_id
        from public.formigas_historico
        where tipo = %L
          and secao = 'whatsapp'
        order by pessoa_id, created_at asc
      ) h
      where p.id = h.pessoa_id
        and p.formigas_wa_by is null
        and p.ativacao_em is not null
        and coalesce(p.contato_whatsapp_status, 'nao') <> 'nao'
    $sql$, t, case t
      when 'cadastros' then 'eleitor'
      when 'lideres' then 'lideranca'
      else 'coordenador'
    end);

    -- Carros
    execute format($sql$
      update public.%I p
      set formigas_carros_by = h.actor_id
      from (
        select distinct on (pessoa_id)
          pessoa_id, actor_id
        from public.formigas_historico
        where tipo = %L
          and secao = 'carros'
        order by pessoa_id, created_at asc
      ) h
      where p.id = h.pessoa_id
        and p.formigas_carros_by is null
        and p.ativacao_em is not null
        and coalesce(p.carros_adesivados, 0) > 0
    $sql$, t, case t
      when 'cadastros' then 'eleitor'
      when 'lideres' then 'lideranca'
      else 'coordenador'
    end);

    -- Casa
    execute format($sql$
      update public.%I p
      set formigas_casa_by = h.actor_id
      from (
        select distinct on (pessoa_id)
          pessoa_id, actor_id
        from public.formigas_historico
        where tipo = %L
          and secao = 'casa'
        order by pessoa_id, created_at asc
      ) h
      where p.id = h.pessoa_id
        and p.formigas_casa_by is null
        and p.ativacao_em is not null
        and coalesce(p.adesivos_casa, 0) > 0
    $sql$, t, case t
      when 'cadastros' then 'eleitor'
      when 'lideres' then 'lideranca'
      else 'coordenador'
    end);

    -- Links
    execute format($sql$
      update public.%I p
      set formigas_links_by = h.actor_id
      from (
        select distinct on (pessoa_id)
          pessoa_id, actor_id
        from public.formigas_historico
        where tipo = %L
          and secao = 'links'
        order by pessoa_id, created_at asc
      ) h
      where p.id = h.pessoa_id
        and p.formigas_links_by is null
        and p.ativacao_em is not null
        and (
          (jsonb_typeof(p.postagem_links) = 'array' and jsonb_array_length(p.postagem_links) > 0)
          or coalesce(p.postagens, 0) > 0
        )
    $sql$, t, case t
      when 'cadastros' then 'eleitor'
      when 'lideres' then 'lideranca'
      else 'coordenador'
    end);
  end loop;
end $$;

-- 3) Relatório de lacunas — rode no SQL Editor (autor desconhecido / pré-auditoria):
/*
with base as (
  select 'eleitor'::text as tipo, id, nome_completo as nome, ativacao_em,
         contato_whatsapp_status, carros_adesivados, adesivos_casa, postagem_links, postagens,
         formigas_wa_by, formigas_carros_by, formigas_casa_by, formigas_links_by
  from public.cadastros
  where ativacao_em is not null
  union all
  select 'lideranca', id, nome, ativacao_em,
         contato_whatsapp_status, carros_adesivados, adesivos_casa, postagem_links, postagens,
         formigas_wa_by, formigas_carros_by, formigas_casa_by, formigas_links_by
  from public.lideres
  where ativacao_em is not null
  union all
  select 'coordenador', id, nome, ativacao_em,
         contato_whatsapp_status, carros_adesivados, adesivos_casa, postagem_links, postagens,
         formigas_wa_by, formigas_carros_by, formigas_casa_by, formigas_links_by
  from public.coordenadores
  where ativacao_em is not null
),
gaps as (
  select b.tipo, b.id as pessoa_id, b.nome, s.secao
  from base b
  cross join lateral (
    values
      ('whatsapp', coalesce(b.contato_whatsapp_status, 'nao') <> 'nao' and b.formigas_wa_by is null),
      ('carros', coalesce(b.carros_adesivados, 0) > 0 and b.formigas_carros_by is null),
      ('casa', coalesce(b.adesivos_casa, 0) > 0 and b.formigas_casa_by is null),
      ('links', (
        (jsonb_typeof(b.postagem_links) = 'array' and jsonb_array_length(b.postagem_links) > 0)
        or coalesce(b.postagens, 0) > 0
      ) and b.formigas_links_by is null)
  ) as s(secao, gap)
  where s.gap
)
select g.tipo, g.pessoa_id, g.nome, g.secao,
  'autor desconhecido / pré-auditoria'::text as motivo
from gaps g
where not exists (
  select 1 from public.formigas_historico h
  where h.tipo = g.tipo and h.pessoa_id = g.pessoa_id and h.secao = g.secao
)
order by g.tipo, g.nome, g.secao;
*/

notify pgrst, 'reload schema';
