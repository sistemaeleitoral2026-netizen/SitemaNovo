-- CONTROLE FINANCEIRO PESSOAL (/financeiro-pessoal) — rode no SQL Editor do
-- projeto NERITES (mesmo banco de https://uzewhebfshmhuymgungr.supabase.co).
-- Pode rodar de novo sem perder dados (idempotente).
--
-- Prefixo fp_* para não misturar com mb_* (Assessoria MB), mr_* (Empresas),
-- fin_* (Gabinete) nem financeiro_* (Nerites).
--
-- Precisa ter rodado antes: 20261116b_acessos_externos.sql (coluna
-- profiles.acessos_externos).
--
-- Quem acessa (igual à rota /financeiro-pessoal em App.tsx):
--   • admin do Nerites, ou
--   • quem tem acesso extra cadastrado em /admin (acessos_externos ? 'financeiro-pessoal').
-- Nível "admin" (admin do Nerites ou acesso extra "admin"): cria/edita/exclui
-- tarefas, dispensa mês, desfaz baixa, exclui qualquer registro.
-- Nível "editor": vê tudo, dá baixa em tarefas, lança, informa saldo; só
-- exclui o que ele mesmo criou.
--
-- Tabelas:
--   fp_contas               contas bancárias (saldo inicial)
--   fp_conferencias_conta   saldo real informado (data/hora/valor/responsável)
--   fp_lancamentos          receitas e despesas
--   fp_tarefas              modelos de pagamento (único, mensal, a cada N meses, anual)
--   fp_tarefas_baixas       baixa (paga) ou dispensa de cada tarefa em cada mês
--   fp_investimentos        aplicações
--   fp_investimentos_saldos saldo verificado de cada aplicação (data/hora/responsável)
--   fp_anexos               metadados dos comprovantes (arquivo no bucket fp-comprovantes)
--   fp_config               configurações (meta da reserva etc.)
--   fp_auditoria            registro de quem fez o quê (só inclusão)

do $$
begin
  if to_regclass('public.cadastros') is null then
    raise exception 'Este SQL é do projeto NERITES (precisa existir public.cadastros). Pare aqui.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'acessos_externos'
  ) then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116b_acessos_externos.sql antes deste. Pare aqui.';
  end if;
end $$;

comment on column public.profiles.acessos_externos is
  'Acesso extra a sistemas fora do Nerites (cadastrado em /admin). Chave = id do sistema (assessoria-mb, painel-do-mandato, mr-terceiriza, financeiro-pessoal), valor = "admin" ou "editor". Não usado pelo Nerites em si.';

-- ============ FUNÇÕES DE ACESSO ============

create or replace function public.can_access_financeiro_pessoal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.ativo = true
        and p.acessos_externos ? 'financeiro-pessoal'
    );
$$;

create or replace function public.is_admin_financeiro_pessoal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.ativo = true
        and p.acessos_externos ->> 'financeiro-pessoal' = 'admin'
    );
$$;

revoke all on function public.can_access_financeiro_pessoal() from public;
revoke all on function public.is_admin_financeiro_pessoal() from public;
grant execute on function public.can_access_financeiro_pessoal() to authenticated;
grant execute on function public.is_admin_financeiro_pessoal() to authenticated;

-- updated_at / updated_by automáticos
create or replace function public.fp_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ============ CONTAS ============

create table if not exists public.fp_contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null default 'Conta corrente'
    check (tipo in ('Conta corrente', 'Poupança', 'Conta digital', 'Dinheiro em espécie')),
  saldo_inicial numeric(14, 2) not null default 0,          -- pode ser negativo
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- Saldo real informado ("às 18h a conta tinha R$ 5.400,00").
-- O app calcula: saldo atual = última conferência + lançamentos depois dela.
create table if not exists public.fp_conferencias_conta (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.fp_contas (id) on delete cascade,
  data date not null,
  hora time not null,
  saldo numeric(14, 2) not null,                             -- pode ser negativo
  responsavel text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (conta_id, data, hora)
);

create index if not exists fp_conferencias_conta_idx
  on public.fp_conferencias_conta (conta_id, data desc, hora desc);

-- ============ TAREFAS (modelos de pagamento) ============

create table if not exists public.fp_tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  recebedor text not null default '',
  recebedor_tipo text not null default 'empresa' check (recebedor_tipo in ('pessoa', 'empresa')),
  categoria text not null default 'Outros',
  valor_previsto numeric(14, 2) check (valor_previsto is null or valor_previsto > 0),  -- null = valor varia
  conta_id uuid references public.fp_contas (id) on delete set null,                  -- conta sugerida
  recorrencia text not null check (recorrencia in ('unica', 'mensal', 'anual')),
  a_cada_meses smallint not null default 1 check (a_cada_meses between 1 and 12),     -- mensal: 1, 2, 3, 6
  dia_inicio smallint check (dia_inicio between 1 and 31),                            -- janela "entre o dia X"
  dia_fim smallint check (dia_fim between 1 and 31),                                  -- "e o dia Y"
  mes_do_ano smallint check (mes_do_ano between 1 and 12),                            -- só anual
  data_inicio date,                                                                   -- só única
  data_fim date,                                                                      -- só única (vencimento)
  comeca_em date,                       -- primeiro dia do mês em que começa (recorrente)
  termina_em date,                      -- primeiro dia do último mês (opcional)
  pausada boolean not null default false,
  instrucoes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint fp_tarefas_janela check (
    case recorrencia
      when 'unica' then data_fim is not null and (data_inicio is null or data_inicio <= data_fim)
      when 'mensal' then dia_inicio is not null and dia_fim is not null and dia_inicio <= dia_fim and comeca_em is not null
      when 'anual' then dia_inicio is not null and dia_fim is not null and dia_inicio <= dia_fim
                        and mes_do_ano is not null and comeca_em is not null
    end
  ),
  constraint fp_tarefas_periodo check (termina_em is null or comeca_em is null or termina_em >= comeca_em)
);

create index if not exists fp_tarefas_ativas_idx on public.fp_tarefas (pausada, recorrencia);

-- ============ LANÇAMENTOS ============

create table if not exists public.fp_lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora time,                                   -- usada no cálculo do saldo após conferência
  tipo text not null check (tipo in ('receita', 'despesa')),
  descricao text not null check (length(trim(descricao)) > 0),
  categoria text not null default 'Outros',
  valor numeric(14, 2) not null check (valor > 0),
  conta_id uuid not null references public.fp_contas (id) on delete restrict,
  recebedor text,                              -- quem recebeu (despesa) / quem pagou (receita)
  responsavel text,                            -- quem fez o pagamento
  observacao text,
  tarefa_id uuid references public.fp_tarefas (id) on delete set null,
  tarefa_periodo text check (tarefa_periodo is null or tarefa_periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create index if not exists fp_lancamentos_data_idx on public.fp_lancamentos (data desc);
create index if not exists fp_lancamentos_conta_idx on public.fp_lancamentos (conta_id, data, hora);
create index if not exists fp_lancamentos_tarefa_idx on public.fp_lancamentos (tarefa_id);

-- ============ BAIXAS DAS TAREFAS ============
-- Uma linha por tarefa por mês: paga (com o lançamento gerado) ou dispensada.
-- Excluir o lançamento apaga a baixa (a tarefa volta a ficar pendente).

create table if not exists public.fp_tarefas_baixas (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.fp_tarefas (id) on delete cascade,
  periodo text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),   -- 'AAAA-MM'
  status text not null check (status in ('paga', 'dispensada')),
  lancamento_id uuid unique references public.fp_lancamentos (id) on delete cascade,
  valor numeric(14, 2) check (valor is null or valor > 0),
  conta_id uuid references public.fp_contas (id) on delete set null,
  data date,
  hora time,
  recebedor text,
  responsavel text,
  observacao text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (tarefa_id, periodo),
  constraint fp_baixa_paga check (
    status = 'dispensada'
    or (lancamento_id is not null and valor is not null and data is not null)
  )
);

create index if not exists fp_tarefas_baixas_periodo_idx on public.fp_tarefas_baixas (periodo);

-- ============ INVESTIMENTOS ============

create table if not exists public.fp_investimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null default 'Renda fixa',
  instituicao text not null default '',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- Saldo verificado de cada aplicação. Valor atual = último registro.
create table if not exists public.fp_investimentos_saldos (
  id uuid primary key default gen_random_uuid(),
  investimento_id uuid not null references public.fp_investimentos (id) on delete cascade,
  data date not null,
  hora time not null,
  saldo numeric(14, 2) not null check (saldo >= 0),
  responsavel text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (investimento_id, data, hora)
);

create index if not exists fp_investimentos_saldos_idx
  on public.fp_investimentos_saldos (investimento_id, data desc, hora desc);

-- ============ ANEXOS / COMPROVANTES ============
-- Metadados; o arquivo fica no Storage bucket fp-comprovantes.
-- storage_path sugerido: '<entidade>/<entidade_id>/<nome-do-arquivo>'.

create table if not exists public.fp_anexos (
  id uuid primary key default gen_random_uuid(),
  entidade text not null check (entidade in ('lancamento', 'baixa', 'tarefa')),
  entidade_id uuid not null,
  nome text not null,
  mime text,
  tamanho bigint check (tamanho is null or tamanho <= 10485760),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create index if not exists fp_anexos_entidade_idx on public.fp_anexos (entidade, entidade_id);

-- ============ CONFIGURAÇÕES ============

create table if not exists public.fp_config (
  chave text primary key,
  valor jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.fp_config (chave, valor)
values ('meta_reserva', '15000'::jsonb)
on conflict (chave) do nothing;

-- ============ AUDITORIA ============
-- Só inclusão: ninguém edita nem apaga o histórico pelo app.

create table if not exists public.fp_auditoria (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid default auth.uid() references public.profiles (id) on delete set null,
  actor_nome text,
  acao text not null,               -- ex.: 'lancamento.criar', 'tarefa.baixa', 'conta.saldo'
  entidade text,
  entidade_id uuid,
  detalhes jsonb not null default '{}'::jsonb
);

create index if not exists fp_auditoria_at_idx on public.fp_auditoria (at desc);

-- ============ TRIGGERS updated_at ============

drop trigger if exists fp_contas_touch on public.fp_contas;
create trigger fp_contas_touch before update on public.fp_contas
  for each row execute function public.fp_touch();

drop trigger if exists fp_tarefas_touch on public.fp_tarefas;
create trigger fp_tarefas_touch before update on public.fp_tarefas
  for each row execute function public.fp_touch();

drop trigger if exists fp_lancamentos_touch on public.fp_lancamentos;
create trigger fp_lancamentos_touch before update on public.fp_lancamentos
  for each row execute function public.fp_touch();

drop trigger if exists fp_investimentos_touch on public.fp_investimentos;
create trigger fp_investimentos_touch before update on public.fp_investimentos
  for each row execute function public.fp_touch();

drop trigger if exists fp_config_touch on public.fp_config;
create trigger fp_config_touch before update on public.fp_config
  for each row execute function public.fp_touch();

-- ============ RLS ============

alter table public.fp_contas enable row level security;
alter table public.fp_conferencias_conta enable row level security;
alter table public.fp_tarefas enable row level security;
alter table public.fp_lancamentos enable row level security;
alter table public.fp_tarefas_baixas enable row level security;
alter table public.fp_investimentos enable row level security;
alter table public.fp_investimentos_saldos enable row level security;
alter table public.fp_anexos enable row level security;
alter table public.fp_config enable row level security;
alter table public.fp_auditoria enable row level security;

-- Leitura: todo mundo que acessa o sistema lê todas as tabelas fp_*.
do $$
declare
  t text;
begin
  foreach t in array array[
    'fp_contas', 'fp_conferencias_conta', 'fp_tarefas', 'fp_lancamentos', 'fp_tarefas_baixas',
    'fp_investimentos', 'fp_investimentos_saldos', 'fp_anexos', 'fp_config', 'fp_auditoria'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_financeiro_pessoal())',
      t || '_select', t
    );
  end loop;
end $$;

-- Contas: criar/editar quem acessa; excluir só admin (e o app já impede
-- excluir conta que tem lançamentos — o banco também, via ON DELETE RESTRICT).
drop policy if exists fp_contas_insert on public.fp_contas;
create policy fp_contas_insert on public.fp_contas
  for insert to authenticated with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_contas_update on public.fp_contas;
create policy fp_contas_update on public.fp_contas
  for update to authenticated
  using (public.can_access_financeiro_pessoal())
  with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_contas_delete on public.fp_contas;
create policy fp_contas_delete on public.fp_contas
  for delete to authenticated using (public.is_admin_financeiro_pessoal());

-- Conferências de saldo: informar quem acessa; excluir admin ou quem informou.
drop policy if exists fp_conferencias_conta_insert on public.fp_conferencias_conta;
create policy fp_conferencias_conta_insert on public.fp_conferencias_conta
  for insert to authenticated with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_conferencias_conta_delete on public.fp_conferencias_conta;
create policy fp_conferencias_conta_delete on public.fp_conferencias_conta
  for delete to authenticated
  using (public.can_access_financeiro_pessoal()
         and (public.is_admin_financeiro_pessoal() or created_by = auth.uid()));

-- Tarefas: só admin cria/edita/pausa/exclui.
drop policy if exists fp_tarefas_insert on public.fp_tarefas;
create policy fp_tarefas_insert on public.fp_tarefas
  for insert to authenticated with check (public.is_admin_financeiro_pessoal());
drop policy if exists fp_tarefas_update on public.fp_tarefas;
create policy fp_tarefas_update on public.fp_tarefas
  for update to authenticated
  using (public.is_admin_financeiro_pessoal())
  with check (public.is_admin_financeiro_pessoal());
drop policy if exists fp_tarefas_delete on public.fp_tarefas;
create policy fp_tarefas_delete on public.fp_tarefas
  for delete to authenticated using (public.is_admin_financeiro_pessoal());

-- Lançamentos: criar/editar quem acessa; excluir admin ou quem lançou.
drop policy if exists fp_lancamentos_insert on public.fp_lancamentos;
create policy fp_lancamentos_insert on public.fp_lancamentos
  for insert to authenticated with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_lancamentos_update on public.fp_lancamentos;
create policy fp_lancamentos_update on public.fp_lancamentos
  for update to authenticated
  using (public.can_access_financeiro_pessoal())
  with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_lancamentos_delete on public.fp_lancamentos;
create policy fp_lancamentos_delete on public.fp_lancamentos
  for delete to authenticated
  using (public.can_access_financeiro_pessoal()
         and (public.is_admin_financeiro_pessoal() or created_by = auth.uid()));

-- Baixas: editor dá baixa (status 'paga'); dispensar mês e desfazer baixa é
-- só admin.
drop policy if exists fp_tarefas_baixas_insert on public.fp_tarefas_baixas;
create policy fp_tarefas_baixas_insert on public.fp_tarefas_baixas
  for insert to authenticated
  with check (public.can_access_financeiro_pessoal()
              and (status = 'paga' or public.is_admin_financeiro_pessoal()));
drop policy if exists fp_tarefas_baixas_update on public.fp_tarefas_baixas;
create policy fp_tarefas_baixas_update on public.fp_tarefas_baixas
  for update to authenticated
  using (public.is_admin_financeiro_pessoal())
  with check (public.is_admin_financeiro_pessoal());
drop policy if exists fp_tarefas_baixas_delete on public.fp_tarefas_baixas;
create policy fp_tarefas_baixas_delete on public.fp_tarefas_baixas
  for delete to authenticated using (public.is_admin_financeiro_pessoal());

-- Investimentos: criar/editar quem acessa; excluir só admin.
drop policy if exists fp_investimentos_insert on public.fp_investimentos;
create policy fp_investimentos_insert on public.fp_investimentos
  for insert to authenticated with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_investimentos_update on public.fp_investimentos;
create policy fp_investimentos_update on public.fp_investimentos
  for update to authenticated
  using (public.can_access_financeiro_pessoal())
  with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_investimentos_delete on public.fp_investimentos;
create policy fp_investimentos_delete on public.fp_investimentos
  for delete to authenticated using (public.is_admin_financeiro_pessoal());

-- Saldos dos investimentos: registrar quem acessa; excluir admin ou quem registrou.
drop policy if exists fp_investimentos_saldos_insert on public.fp_investimentos_saldos;
create policy fp_investimentos_saldos_insert on public.fp_investimentos_saldos
  for insert to authenticated with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_investimentos_saldos_delete on public.fp_investimentos_saldos;
create policy fp_investimentos_saldos_delete on public.fp_investimentos_saldos
  for delete to authenticated
  using (public.can_access_financeiro_pessoal()
         and (public.is_admin_financeiro_pessoal() or created_by = auth.uid()));

-- Anexos: anexar quem acessa; excluir admin ou quem anexou.
drop policy if exists fp_anexos_insert on public.fp_anexos;
create policy fp_anexos_insert on public.fp_anexos
  for insert to authenticated with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_anexos_delete on public.fp_anexos;
create policy fp_anexos_delete on public.fp_anexos
  for delete to authenticated
  using (public.can_access_financeiro_pessoal()
         and (public.is_admin_financeiro_pessoal() or created_by = auth.uid()));

-- Configurações: só admin altera.
drop policy if exists fp_config_insert on public.fp_config;
create policy fp_config_insert on public.fp_config
  for insert to authenticated with check (public.is_admin_financeiro_pessoal());
drop policy if exists fp_config_update on public.fp_config;
create policy fp_config_update on public.fp_config
  for update to authenticated
  using (public.is_admin_financeiro_pessoal())
  with check (public.is_admin_financeiro_pessoal());

-- Auditoria: só inclusão, e sempre em nome de quem está logado.
drop policy if exists fp_auditoria_insert on public.fp_auditoria;
create policy fp_auditoria_insert on public.fp_auditoria
  for insert to authenticated
  with check (public.can_access_financeiro_pessoal() and actor_id = auth.uid());

-- ============ STORAGE ============

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fp-comprovantes',
  'fp-comprovantes',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fp_comprovantes_select on storage.objects;
create policy fp_comprovantes_select on storage.objects
  for select to authenticated
  using (bucket_id = 'fp-comprovantes' and public.can_access_financeiro_pessoal());

drop policy if exists fp_comprovantes_insert on storage.objects;
create policy fp_comprovantes_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fp-comprovantes' and public.can_access_financeiro_pessoal());

-- Apagar arquivo: admin ou quem enviou (owner).
drop policy if exists fp_comprovantes_delete on storage.objects;
create policy fp_comprovantes_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fp-comprovantes'
    and public.can_access_financeiro_pessoal()
    and (public.is_admin_financeiro_pessoal() or owner = auth.uid())
  );

notify pgrst, 'reload schema';
