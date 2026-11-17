-- FINANCEIRO DO MANDATO — lançamento manual da equipe do gabinete e da VIEP.
-- Rode no SQL Editor do projeto GABINETE (não no Nerites). Pode rodar de novo sem perder dados.
-- A partir daqui, só o salário do vereador (fin_salario) continua vindo do portal oficial.
-- fin_gabinete_pessoa, fin_empenho e fin_pagamento (financeiro.sql) deixam de ser alimentadas,
-- mas não são apagadas — ficam como histórico do que já foi puxado.

do $$
begin
  if to_regclass('public.cadastros') is not null then
    raise exception 'Este SQL é do projeto GABINETE. O Nerites já tem cadastros. Pare aqui.';
  end if;
end $$;

-- Equipe do gabinete, cadastrada à mão pelo gabinete (substitui a leitura da folha da Câmara)
create table if not exists public.fin_gabinete_manual (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cargo         text,
  admissao      date,
  salario       numeric(12,2) not null default 0,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Um valor por mês, lançado à mão (legado: VIEP recebida). Preferir fin_verba.
create table if not exists public.fin_mes_manual (
  mes           text primary key,               -- 'AAAA-MM'
  viep_recebido numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now()
);

-- Verbas da Câmara lançadas à mão (VIEP, diárias e outras), com editar/excluir
create table if not exists public.fin_verba (
  id            uuid primary key default gen_random_uuid(),
  mes           text not null,                  -- 'AAAA-MM'
  tipo          text not null check (tipo in ('VIEP', 'DIARIA', 'OUTRA')),
  descricao     text not null default '',
  valor         numeric(12,2) not null check (valor > 0),
  data          date,
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists fin_verba_mes on public.fin_verba (mes);

-- Fundos: de onde sai o dinheiro que paga a equipe do gabinete (ex.: "Verba de gabinete",
-- "Recurso próprio", "Doação"). Cada fundo recebe lançamentos à mão, um por vez (mês, dia,
-- ou quantos quiser no mesmo mês), cada um com valor, origem e observação.
create table if not exists public.fin_fundos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  descricao     text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.fin_fundo_lancamento (
  id           uuid primary key default gen_random_uuid(),
  fundo_id     uuid not null references public.fin_fundos(id) on delete cascade,
  data         date not null,
  valor        numeric(12,2) not null check (valor > 0),
  origem       text,
  observacao   text,
  criado_em    timestamptz not null default now()
);
create index if not exists fin_fundo_lancamento_fundo on public.fin_fundo_lancamento (fundo_id);

-- Qual fundo paga o salário de cada pessoa da equipe
alter table public.fin_gabinete_manual
  add column if not exists fundo_id uuid references public.fin_fundos(id);

alter table public.fin_gabinete_manual    enable row level security;
alter table public.fin_mes_manual         enable row level security;
alter table public.fin_verba              enable row level security;
alter table public.fin_fundos             enable row level security;
alter table public.fin_fundo_lancamento   enable row level security;

-- Só o servidor (ponte /api/gabinete com a service key) lê e grava. O navegador não acessa direto.
revoke all on public.fin_gabinete_manual, public.fin_mes_manual, public.fin_verba, public.fin_fundos, public.fin_fundo_lancamento
  from anon, authenticated;
