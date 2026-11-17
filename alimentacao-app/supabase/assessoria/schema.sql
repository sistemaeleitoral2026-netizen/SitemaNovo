-- ASSESSORIA MB — rode no SQL Editor do projeto NERITES
-- (mesmo banco de https://uzewhebfshmhuymgungr.supabase.co).
-- Pode rodar de novo sem perder dados.
--
-- Prefixo mb_* para não misturar com financeiro_* (Nerites) nem fin_* (Gabinete).

do $$
begin
  if to_regclass('public.cadastros') is null then
    raise exception 'Este SQL é do projeto NERITES (precisa existir public.cadastros). Pare aqui.';
  end if;
end $$;

-- Quem pode usar o painel corporativo (login Nerites).
create or replace function public.can_access_assessoria_mb()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.is_diretoria();
$$;

revoke all on function public.can_access_assessoria_mb() from public;
grant execute on function public.can_access_assessoria_mb() to authenticated;

-- ============ CADASTROS AUXILIARES ============

create table if not exists public.mb_empresas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.mb_bancos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.mb_centros_custo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,          -- M1..M5
  nome text,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.mb_templates_tarefa (
  id uuid primary key default gen_random_uuid(),
  titulo text not null unique,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.mb_equipe (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ LANÇAMENTOS FINANCEIROS ============
-- Espelha o objeto `db.finance` do painel (localStorage assessoria-mb-demo-v3).

create table if not exists public.mb_lancamentos (
  id uuid primary key default gen_random_uuid(),
  parceiro text not null default '',
  centro text,                            -- código/nome do centro de custo
  data date not null,
  data_recebida date,
  empresa_depositante text,
  conta_bancaria text,                    -- controle interno (não vai à prestação)
  demanda text,
  empresa text,                           -- subdivision: ESP, MTAREIA, MTEX...
  previsto numeric(14, 2) not null default 0 check (previsto >= 0),
  recebido numeric(14, 2) not null default 0 check (recebido >= 0),
  saida numeric(14, 2) not null default 0 check (saida >= 0),
  tipo_lancamento text not null default 'receita'
    check (tipo_lancamento in ('receita', 'entrada_por_fora', 'saida')),
  recebimentos jsonb not null default '[]'::jsonb,
  origem text not null default 'Cadastro manual',
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null
);

create index if not exists mb_lancamentos_data_idx
  on public.mb_lancamentos (data desc);

create index if not exists mb_lancamentos_empresa_idx
  on public.mb_lancamentos (empresa);

create index if not exists mb_lancamentos_centro_idx
  on public.mb_lancamentos (centro);

-- Competência (YYYY-MM): filtrar por intervalo em `data`
-- (ex.: data >= '2026-07-01' and data < '2026-08-01'). Não usar to_char em índice.

-- ============ TAREFAS / DEMANDAS ============
-- Espelha `db.tasks`.

create table if not exists public.mb_tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  nome text,                              -- favorecido / identificação
  responsavel text,
  prazo date,
  data_execucao date,
  status text not null default 'Pendente'
    check (status in ('Pendente', 'Em andamento', 'Concluída')),
  descricao text,
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  origem_pagamento text,                  -- banco / origem
  nome_extrato text,
  situacao_registro text,
  observacao text,
  demanda text,
  empresa text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null
);

create index if not exists mb_tarefas_prazo_idx
  on public.mb_tarefas (prazo);

create index if not exists mb_tarefas_status_idx
  on public.mb_tarefas (status);

-- ============ PRESTAÇÃO DE CONTAS (planilha histórica) ============
-- Espelha `monthlyHistory` + edições de `db.historyEdits`.

create table if not exists public.mb_prestacao_contas (
  id uuid primary key default gen_random_uuid(),
  codigo_origem text unique,              -- ex.: plan1-2 (id da planilha embutida)
  mes text not null,                      -- '2026-03'
  aba text,
  linha int,
  nome text,
  descricao text,
  data date,
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  banco text,
  extrato text,
  situacao text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create index if not exists mb_prestacao_mes_idx
  on public.mb_prestacao_contas (mes);

create index if not exists mb_prestacao_data_idx
  on public.mb_prestacao_contas (data);

-- ============ AUDITORIA DO PAINEL ============

create table if not exists public.mb_auditoria (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_nome text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists mb_auditoria_at_idx
  on public.mb_auditoria (at desc);

-- ============ ANEXOS / COMPROVANTES ============
-- Metadados; arquivo fica no Storage bucket mb-comprovantes.

create table if not exists public.mb_anexos (
  id uuid primary key default gen_random_uuid(),
  entidade text not null
    check (entidade in ('lancamento', 'tarefa', 'prestacao')),
  entidade_id uuid not null,
  nome text not null,
  mime text,
  tamanho bigint,
  storage_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create index if not exists mb_anexos_entidade_idx
  on public.mb_anexos (entidade, entidade_id);

-- ============ SEEDS (cadastros do painel atual) ============

insert into public.mb_empresas (codigo, nome, ordem)
values
  ('ESP', 'ESP', 1),
  ('MTAREIA', 'MTAREIA', 2),
  ('MTEX', 'MTEX', 3),
  ('MARI', 'MARI', 4),
  ('IMP', 'IMP', 5),
  ('SONIGNF', 'SONIGNF', 6),
  ('CAST', 'CAST', 7),
  ('PREF GNF', 'PREF GNF', 8),
  ('PREF ZD', 'PREF ZD', 9)
on conflict (codigo) do nothing;

insert into public.mb_bancos (nome, ordem)
values
  ('INTER', 1),
  ('RB', 2),
  ('ITAU', 3),
  ('GRUPO LEANDRO', 4),
  ('PB ITAU', 5),
  ('MATHEUS BB', 6),
  ('BB MATHEUS PJ', 7),
  ('RE FASHION SANTANDER', 8),
  ('BNB', 9),
  ('Espécie', 10)
on conflict (nome) do nothing;

insert into public.mb_centros_custo (codigo, nome, ordem)
values
  ('M1', 'M1', 1),
  ('M2', 'M2', 2),
  ('M3', 'M3', 3),
  ('M4', 'M4', 4),
  ('M5', 'M5', 5)
on conflict (codigo) do nothing;

insert into public.mb_templates_tarefa (titulo, ordem)
values
  ('Abastecimento', 1),
  ('Estúdio', 2),
  ('Lanche escritório', 3),
  ('Starlink', 4),
  ('Óleo avião', 5),
  ('Pagamento de condomínio', 6),
  ('Pagamento de conta', 7)
on conflict (titulo) do nothing;

-- ============ RLS ============

alter table public.mb_empresas enable row level security;
alter table public.mb_bancos enable row level security;
alter table public.mb_centros_custo enable row level security;
alter table public.mb_templates_tarefa enable row level security;
alter table public.mb_equipe enable row level security;
alter table public.mb_lancamentos enable row level security;
alter table public.mb_tarefas enable row level security;
alter table public.mb_prestacao_contas enable row level security;
alter table public.mb_auditoria enable row level security;
alter table public.mb_anexos enable row level security;

-- Cadastros auxiliares: leitura/escrita só admin/diretoria
do $$
declare
  t text;
begin
  foreach t in array array[
    'mb_empresas', 'mb_bancos', 'mb_centros_custo',
    'mb_templates_tarefa', 'mb_equipe'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.can_access_assessoria_mb())',
      t, t
    );
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated using (public.can_access_assessoria_mb()) with check (public.can_access_assessoria_mb())',
      t, t
    );
  end loop;
end $$;

drop policy if exists mb_lancamentos_select on public.mb_lancamentos;
create policy mb_lancamentos_select on public.mb_lancamentos
  for select to authenticated
  using (public.can_access_assessoria_mb());

drop policy if exists mb_lancamentos_write on public.mb_lancamentos;
create policy mb_lancamentos_write on public.mb_lancamentos
  for all to authenticated
  using (public.can_access_assessoria_mb())
  with check (public.can_access_assessoria_mb());

drop policy if exists mb_tarefas_select on public.mb_tarefas;
create policy mb_tarefas_select on public.mb_tarefas
  for select to authenticated
  using (public.can_access_assessoria_mb());

drop policy if exists mb_tarefas_write on public.mb_tarefas;
create policy mb_tarefas_write on public.mb_tarefas
  for all to authenticated
  using (public.can_access_assessoria_mb())
  with check (public.can_access_assessoria_mb());

drop policy if exists mb_prestacao_select on public.mb_prestacao_contas;
create policy mb_prestacao_select on public.mb_prestacao_contas
  for select to authenticated
  using (public.can_access_assessoria_mb());

drop policy if exists mb_prestacao_write on public.mb_prestacao_contas;
create policy mb_prestacao_write on public.mb_prestacao_contas
  for all to authenticated
  using (public.can_access_assessoria_mb())
  with check (public.can_access_assessoria_mb());

drop policy if exists mb_auditoria_select on public.mb_auditoria;
create policy mb_auditoria_select on public.mb_auditoria
  for select to authenticated
  using (public.can_access_assessoria_mb());

drop policy if exists mb_auditoria_insert on public.mb_auditoria;
create policy mb_auditoria_insert on public.mb_auditoria
  for insert to authenticated
  with check (public.can_access_assessoria_mb());

drop policy if exists mb_anexos_select on public.mb_anexos;
create policy mb_anexos_select on public.mb_anexos
  for select to authenticated
  using (public.can_access_assessoria_mb());

drop policy if exists mb_anexos_write on public.mb_anexos;
create policy mb_anexos_write on public.mb_anexos
  for all to authenticated
  using (public.can_access_assessoria_mb())
  with check (public.can_access_assessoria_mb());

-- ============ STORAGE ============

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mb-comprovantes',
  'mb-comprovantes',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mb_comprovantes_select on storage.objects;
create policy mb_comprovantes_select on storage.objects
  for select to authenticated
  using (bucket_id = 'mb-comprovantes' and public.can_access_assessoria_mb());

drop policy if exists mb_comprovantes_insert on storage.objects;
create policy mb_comprovantes_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mb-comprovantes' and public.can_access_assessoria_mb());

drop policy if exists mb_comprovantes_update on storage.objects;
create policy mb_comprovantes_update on storage.objects
  for update to authenticated
  using (bucket_id = 'mb-comprovantes' and public.can_access_assessoria_mb())
  with check (bucket_id = 'mb-comprovantes' and public.can_access_assessoria_mb());

drop policy if exists mb_comprovantes_delete on storage.objects;
create policy mb_comprovantes_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'mb-comprovantes' and public.can_access_assessoria_mb());

notify pgrst, 'reload schema';
