-- FINANCEIRO DO MANDATO — rode no SQL Editor do projeto GABINETE (não no Nerites).
-- Pode rodar de novo sem perder dados.

do $$
begin
  if to_regclass('public.cadastros') is not null then
    raise exception 'Este SQL é do projeto GABINETE. O Nerites já tem cadastros. Pare aqui.';
  end if;
end $$;

-- ============ DADOS OFICIAIS (preenchidos pela rotina /api/folha-cron) ============

-- Quando cada folha mensal apareceu no portal de remuneração da Câmara
create table if not exists public.fin_folha_publicacao (
  mes           text primary key,               -- '2026-10'
  referencia    text not null,                  -- como o portal escreve: '10/2026', '12/25'
  detectada_em  timestamptz not null default now(),
  carga_inicial boolean not null default false  -- true = data é da 1ª carga, não da publicação real
);

-- Subsídio (salário) do vereador, por mês
create table if not exists public.fin_salario (
  mes           text primary key,
  referencia    text not null,
  bruto         numeric(12,2) not null default 0,
  desconto      numeric(12,2) not null default 0,
  liquido       numeric(12,2) not null default 0,
  recebeu       boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- Cada pessoa lotada no gabinete acompanhado, por mês (folha da Câmara)
create table if not exists public.fin_gabinete_pessoa (
  mes        text not null,
  lotacao    text not null,
  matricula  text not null,
  servidor   text not null,
  cargo      text,
  vinculo    text,                               -- 'VERBA DE GABINETE', 'SERVIOS PRESTADOS', 'ISOS'...
  admissao   text,
  exoneracao text,
  bruto      numeric(12,2) not null default 0,
  desconto   numeric(12,2) not null default 0,
  liquido    numeric(12,2) not null default 0,
  primary key (mes, matricula)
);

-- Empenhos em nome do vereador no portal de despesas (VIEP, diárias, outros)
create table if not exists public.fin_empenho (
  empenho          text not null,               -- '102/2026'
  tipo             text not null,               -- 'O' orçamentário | 'R' restos a pagar
  categoria        text not null,               -- 'VIEP' | 'DIARIAS' | 'OUTROS'
  data_empenho     date,
  objeto           text,
  natureza_despesa text,
  empenhado        numeric(12,2) not null default 0,
  liquidado        numeric(12,2) not null default 0,
  pago             numeric(12,2) not null default 0,
  anulado          numeric(12,2) not null default 0,
  atualizado_em    timestamptz not null default now(),
  primary key (empenho, tipo)
);

-- Cada pagamento desses empenhos (o dinheiro que caiu na conta)
create table if not exists public.fin_pagamento (
  empenho       text not null,
  num_pagamento text not null,
  data          date not null,
  categoria     text not null,
  valor         numeric(12,2) not null,
  competencia   text,                             -- mês a que o reembolso se refere (o gabinete define na Conciliação)
  detectado_em  timestamptz not null default now(),
  primary key (empenho, num_pagamento, data)
);

-- ============ DADOS DO GABINETE (lançados pela equipe no menu Financeiro) ============

-- Cada despesa do mandato
create table if not exists public.fin_lancamento (
  id           uuid primary key default gen_random_uuid(),
  data         date not null,                    -- data da nota / do pagamento ao fornecedor
  competencia  text not null,                    -- mês da despesa 'AAAA-MM'
  origem       text not null check (origem in ('VIEP', 'PROPRIO', 'OUTRO')),
  categoria    text not null,
  descricao    text not null,
  fornecedor   text,
  documento    text,                             -- nº da nota fiscal / recibo
  valor        numeric(12,2) not null check (valor > 0),
  status       text not null default 'pendente' check (status in ('pendente', 'enviado', 'reembolsado', 'glosado', 'pago')),
  observacao   text,
  criado_por   uuid,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists fin_lancamento_comp on public.fin_lancamento (competencia);

-- Complemento da equipe (o que a folha não mostra)
create table if not exists public.fin_equipe_info (
  matricula     text primary key,
  funcao_real   text,
  telefone      text,
  indicado_por  text,
  observacao    text,
  atualizado_em timestamptz not null default now()
);

alter table public.fin_folha_publicacao enable row level security;
alter table public.fin_salario          enable row level security;
alter table public.fin_gabinete_pessoa  enable row level security;
alter table public.fin_empenho          enable row level security;
alter table public.fin_pagamento        enable row level security;
alter table public.fin_lancamento       enable row level security;
alter table public.fin_equipe_info      enable row level security;

-- Só o servidor (ponte /api/gabinete com a service key) lê e grava. O navegador não acessa direto.
revoke all on public.fin_folha_publicacao, public.fin_salario, public.fin_gabinete_pessoa,
  public.fin_empenho, public.fin_pagamento, public.fin_lancamento, public.fin_equipe_info
  from anon, authenticated;
