-- Histórico persistente do Relatório TXT (já testados / com erro).
-- Só admin lê e grava. Cada título entra uma vez; Salvar alimenta a lista.

create table if not exists public.relatorio_fichas_txt (
  titulo_key text primary key,
  titulo text not null,
  data_nascimento text not null default '',
  nome_mae text not null default '',
  status text not null check (status in ('ok', 'erro')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists relatorio_fichas_txt_status_idx
  on public.relatorio_fichas_txt (status, updated_at desc);

comment on table public.relatorio_fichas_txt is
  'Títulos já usados no Relatório TXT: ok (testado) ou erro. Impede repetir no gerar.';

alter table public.relatorio_fichas_txt enable row level security;

drop policy if exists relatorio_fichas_txt_admin on public.relatorio_fichas_txt;
create policy relatorio_fichas_txt_admin on public.relatorio_fichas_txt
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
