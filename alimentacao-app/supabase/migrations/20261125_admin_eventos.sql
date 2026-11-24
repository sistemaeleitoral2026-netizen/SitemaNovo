-- Painel administrativo centralizado
-- Consolida auditorias dos sistemas sem alterar os históricos de origem.

create table if not exists public.admin_eventos (
  id uuid primary key default gen_random_uuid(),
  sistema text not null check (sistema in (
    'nerites', 'mr-terceiriza', 'assessoria-mb',
    'painel-do-mandato', 'financeiro-pessoal', 'admin'
  )),
  categoria text not null default 'atividade',
  acao text not null,
  entidade text,
  entidade_id text,
  titulo text not null,
  resumo text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_nome text,
  ocorrido_em timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  origem_url text,
  source_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists admin_eventos_ocorrido_idx on public.admin_eventos (ocorrido_em desc);
create index if not exists admin_eventos_sistema_idx on public.admin_eventos (sistema, ocorrido_em desc);
create index if not exists admin_eventos_actor_idx on public.admin_eventos (actor_id, ocorrido_em desc);
create index if not exists admin_eventos_categoria_idx on public.admin_eventos (categoria, ocorrido_em desc);

alter table public.admin_eventos enable row level security;

drop policy if exists admin_eventos_select on public.admin_eventos;
create policy admin_eventos_select on public.admin_eventos
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.ativo = true and p.role = 'admin'
    )
  );

-- Não há policies de update/delete: o histórico é somente leitura para o app.

create or replace function public.admin_evento_categoria(p_acao text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_acao, '')) ~ '(exclu|apag|remov)' then 'exclusao'
    when lower(coalesce(p_acao, '')) ~ '(conclu|baixa|paga|feito|status)' then 'conclusao'
    when lower(coalesce(p_acao, '')) ~ '(cri|novo|inclu|cadastr|import|lancar)' then 'criacao'
    when lower(coalesce(p_acao, '')) ~ '(edit|alter|atualiz|corrig|saldo)' then 'edicao'
    when lower(coalesce(p_acao, '')) ~ '(acesso|permiss|usuario|login)' then 'acesso'
    else 'atividade'
  end
$$;

create or replace function public.admin_evento_url(p_sistema text, p_entidade text, p_entidade_id text)
returns text language sql immutable as $$
  select case
    when p_sistema = 'nerites' and p_entidade = 'cadastros' and p_entidade_id is not null
      then '/cadastros/' || p_entidade_id || '/editar'
    when p_sistema = 'nerites' then '/'
    when p_sistema = 'mr-terceiriza' then '/mr-terceiriza'
    when p_sistema = 'assessoria-mb' then '/assessoria-mb'
    when p_sistema = 'painel-do-mandato' then '/painel-do-mandato'
    when p_sistema = 'financeiro-pessoal' then '/financeiro-pessoal'
    when p_sistema = 'admin' then '/admin/usuarios'
    else null
  end
$$;

create or replace function public.admin_copiar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sistema text := tg_argv[0];
  v_acao text;
  v_entidade text;
  v_entidade_id text;
  v_actor_id uuid;
  v_actor_nome text;
  v_ocorrido timestamptz;
  v_resumo text;
  v_metadata jsonb := '{}'::jsonb;
begin
  if v_sistema = 'nerites' then
    v_acao := new.acao;
    v_entidade := new.entidade;
    v_entidade_id := new.entidade_id::text;
    v_actor_id := new.actor_id;
    v_ocorrido := new.created_at;
    v_metadata := coalesce(new.detalhes, '{}'::jsonb);
    select nome into v_actor_nome from public.profiles where id = new.actor_id;
    v_resumo := nullif(concat_ws(' · ', new.entidade, new.detalhes->>'nome', new.detalhes->>'descricao'), '');
  elsif v_sistema = 'mr-terceiriza' then
    v_acao := new.action;
    v_entidade := 'atividade';
    v_entidade_id := new.id::text;
    v_actor_id := new.actor_id;
    v_actor_nome := new.actor_nome;
    v_ocorrido := new.at;
    v_resumo := new.detail;
    v_metadata := jsonb_strip_nulls(jsonb_build_object('empresa', new.empresa));
  elsif v_sistema = 'assessoria-mb' then
    v_acao := new.action;
    v_entidade := 'atividade';
    v_entidade_id := new.id::text;
    v_actor_id := new.actor_id;
    v_actor_nome := new.actor_nome;
    v_ocorrido := new.at;
    v_resumo := new.detail;
  else
    v_acao := new.acao;
    v_entidade := new.entidade;
    v_entidade_id := new.entidade_id::text;
    v_actor_id := new.actor_id;
    v_actor_nome := new.actor_nome;
    v_ocorrido := new.at;
    v_metadata := coalesce(new.detalhes, '{}'::jsonb);
    v_resumo := nullif(concat_ws(' · ', new.detalhes->>'nome', new.detalhes->>'titulo', new.detalhes->>'descricao'), '');
  end if;

  insert into public.admin_eventos (
    sistema, categoria, acao, entidade, entidade_id, titulo, resumo,
    actor_id, actor_nome, ocorrido_em, metadata, origem_url, source_key
  ) values (
    v_sistema,
    public.admin_evento_categoria(v_acao),
    v_acao,
    v_entidade,
    v_entidade_id,
    coalesce(nullif(replace(replace(v_acao, '.', ' '), '_', ' '), ''), 'Atividade registrada'),
    v_resumo,
    v_actor_id,
    coalesce(v_actor_nome, 'Usuário'),
    coalesce(v_ocorrido, now()),
    v_metadata,
    public.admin_evento_url(v_sistema, v_entidade, v_entidade_id),
    v_sistema || ':' || new.id::text
  ) on conflict (source_key) do nothing;
  return new;
end
$$;

do $$
begin
  if to_regclass('public.auditoria') is not null then
    drop trigger if exists admin_evento_from_nerites on public.auditoria;
    create trigger admin_evento_from_nerites after insert on public.auditoria
      for each row execute function public.admin_copiar_auditoria('nerites');
  end if;
  if to_regclass('public.mr_auditoria') is not null then
    drop trigger if exists admin_evento_from_mr on public.mr_auditoria;
    create trigger admin_evento_from_mr after insert on public.mr_auditoria
      for each row execute function public.admin_copiar_auditoria('mr-terceiriza');
  end if;
  if to_regclass('public.mb_auditoria') is not null then
    drop trigger if exists admin_evento_from_mb on public.mb_auditoria;
    create trigger admin_evento_from_mb after insert on public.mb_auditoria
      for each row execute function public.admin_copiar_auditoria('assessoria-mb');
  end if;
  if to_regclass('public.fp_auditoria') is not null then
    drop trigger if exists admin_evento_from_fp on public.fp_auditoria;
    create trigger admin_evento_from_fp after insert on public.fp_auditoria
      for each row execute function public.admin_copiar_auditoria('financeiro-pessoal');
  end if;
end
$$;

-- Mudanças de acesso feitas diretamente pelo administrador no navegador.
create or replace function public.admin_auditar_acessos_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor_nome text;
begin
  if auth.uid() is null or old.acessos_externos is not distinct from new.acessos_externos then return new; end if;
  select nome into v_actor_nome from public.profiles where id = auth.uid();
  insert into public.admin_eventos (
    sistema, categoria, acao, entidade, entidade_id, titulo, resumo,
    actor_id, actor_nome, ocorrido_em, metadata, origem_url, source_key
  ) values (
    'admin', 'acesso', 'usuario.acessos', 'profiles', new.id::text,
    'Acessos do usuário alterados', new.nome,
    auth.uid(), coalesce(v_actor_nome, 'Administrador'), now(),
    jsonb_build_object('usuario', new.nome), '/admin/usuarios',
    'admin:profile:' || new.id::text || ':' || extract(epoch from clock_timestamp())::text
  );
  return new;
end
$$;

drop trigger if exists admin_evento_profile_acessos on public.profiles;
create trigger admin_evento_profile_acessos
  after update of acessos_externos on public.profiles
  for each row execute function public.admin_auditar_acessos_profile();

-- Resumo agregado em uma única chamada. Toda métrica deriva de eventos reais.
create or replace function public.admin_dashboard_resumo(p_dias int default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.ativo = true and p.role = 'admin'
  ) then raise exception 'Acesso negado'; end if;

  select jsonb_build_object(
    'movimentacoesHoje', count(*) filter (where ocorrido_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),
    'usuariosAtivos', count(distinct actor_id) filter (where ocorrido_em >= now() - make_interval(days => greatest(1, least(p_dias, 90)))),
    'sistemasAtivos', count(distinct sistema) filter (where ocorrido_em >= now() - interval '24 hours'),
    'totalPeriodo', count(*) filter (where ocorrido_em >= now() - make_interval(days => greatest(1, least(p_dias, 90))))
  ) into v_result from public.admin_eventos;
  return v_result;
end
$$;

revoke all on function public.admin_dashboard_resumo(int) from public;
grant execute on function public.admin_dashboard_resumo(int) to authenticated;

-- Histórico disponível antes da implantação. Não cria eventos do Mandato.
do $$
begin
  if to_regclass('public.auditoria') is not null then
    insert into public.admin_eventos (sistema,categoria,acao,entidade,entidade_id,titulo,resumo,actor_id,actor_nome,ocorrido_em,metadata,origem_url,source_key)
    select 'nerites',public.admin_evento_categoria(a.acao),a.acao,a.entidade,a.entidade_id::text,
      replace(replace(a.acao,'.',' '),'_',' '),nullif(concat_ws(' · ',a.entidade,a.detalhes->>'nome',a.detalhes->>'descricao'),''),
      a.actor_id,coalesce(p.nome,'Usuário'),a.created_at,coalesce(a.detalhes,'{}'::jsonb),
      public.admin_evento_url('nerites',a.entidade,a.entidade_id::text),'nerites:'||a.id::text
    from public.auditoria a left join public.profiles p on p.id=a.actor_id on conflict(source_key) do nothing;
  end if;
  if to_regclass('public.mr_auditoria') is not null then
    insert into public.admin_eventos (sistema,categoria,acao,entidade,entidade_id,titulo,resumo,actor_id,actor_nome,ocorrido_em,metadata,origem_url,source_key)
    select 'mr-terceiriza',public.admin_evento_categoria(a.action),a.action,'atividade',a.id::text,
      replace(replace(a.action,'.',' '),'_',' '),a.detail,a.actor_id,coalesce(a.actor_nome,'Usuário'),a.at,
      jsonb_strip_nulls(jsonb_build_object('empresa',a.empresa)),'/mr-terceiriza','mr-terceiriza:'||a.id::text
    from public.mr_auditoria a on conflict(source_key) do nothing;
  end if;
  if to_regclass('public.mb_auditoria') is not null then
    insert into public.admin_eventos (sistema,categoria,acao,entidade,entidade_id,titulo,resumo,actor_id,actor_nome,ocorrido_em,metadata,origem_url,source_key)
    select 'assessoria-mb',public.admin_evento_categoria(a.action),a.action,'atividade',a.id::text,
      replace(replace(a.action,'.',' '),'_',' '),a.detail,a.actor_id,coalesce(a.actor_nome,'Usuário'),a.at,
      '{}'::jsonb,'/assessoria-mb','assessoria-mb:'||a.id::text
    from public.mb_auditoria a on conflict(source_key) do nothing;
  end if;
  if to_regclass('public.fp_auditoria') is not null then
    insert into public.admin_eventos (sistema,categoria,acao,entidade,entidade_id,titulo,resumo,actor_id,actor_nome,ocorrido_em,metadata,origem_url,source_key)
    select 'financeiro-pessoal',public.admin_evento_categoria(a.acao),a.acao,a.entidade,a.entidade_id::text,
      replace(replace(a.acao,'.',' '),'_',' '),nullif(concat_ws(' · ',a.detalhes->>'nome',a.detalhes->>'titulo',a.detalhes->>'descricao'),''),
      a.actor_id,coalesce(a.actor_nome,'Usuário'),a.at,coalesce(a.detalhes,'{}'::jsonb),
      '/financeiro-pessoal','financeiro-pessoal:'||a.id::text
    from public.fp_auditoria a on conflict(source_key) do nothing;
  end if;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.admin_eventos;
exception when duplicate_object then null;
end
$$;
