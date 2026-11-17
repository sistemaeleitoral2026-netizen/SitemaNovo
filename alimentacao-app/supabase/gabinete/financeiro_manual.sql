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

-- Um valor por mês, lançado à mão (hoje só a VIEP recebida da Câmara)
create table if not exists public.fin_mes_manual (
  mes           text primary key,               -- 'AAAA-MM'
  viep_recebido numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now()
);

alter table public.fin_gabinete_manual enable row level security;
alter table public.fin_mes_manual      enable row level security;

-- Só o servidor (ponte /api/gabinete com a service key) lê e grava. O navegador não acessa direto.
revoke all on public.fin_gabinete_manual, public.fin_mes_manual from anon, authenticated;
