-- Verbas da Câmara (VIEP e outras) no projeto GABINETE.
-- Rode no SQL Editor do projeto GABINETE se financeiro_manual.sql ainda não tiver fin_verba.

create table if not exists public.fin_verba (
  id            uuid primary key default gen_random_uuid(),
  mes           text not null,
  tipo          text not null check (tipo in ('VIEP', 'DIARIA', 'OUTRA')),
  descricao     text not null default '',
  valor         numeric(12,2) not null check (valor > 0),
  data          date,
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists fin_verba_mes on public.fin_verba (mes);

alter table public.fin_verba enable row level security;
revoke all on public.fin_verba from anon, authenticated;
