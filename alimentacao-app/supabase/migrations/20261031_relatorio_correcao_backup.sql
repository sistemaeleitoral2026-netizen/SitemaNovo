-- Relatório/Correção: diretoras entram, falhas guardam responsável
-- e cada correção gera backup reversível.

alter table public.relatorio_fichas_txt
  add column if not exists operador_nome text not null default '';
alter table public.relatorio_fichas_txt
  add column if not exists coordenador text not null default '';
alter table public.relatorio_fichas_txt
  add column if not exists lider text not null default '';
alter table public.relatorio_fichas_txt
  add column if not exists linha_txt text not null default '';
alter table public.relatorio_fichas_txt
  add column if not exists motivo text not null default '';

create table if not exists public.cadastro_correcao_backup (
  id uuid primary key default gen_random_uuid(),
  cadastro_id uuid not null references public.cadastros(id) on delete cascade,
  nome_completo text not null default '',
  antes jsonb not null default '{}'::jsonb,
  depois jsonb not null default '{}'::jsonb,
  linha_txt text not null default '',
  alterado_por uuid references public.profiles(id) on delete set null,
  alterado_por_nome text not null default '',
  alterado_em timestamptz not null default now(),
  revertido boolean not null default false,
  revertido_em timestamptz,
  revertido_por uuid references public.profiles(id) on delete set null
);

create index if not exists cadastro_correcao_backup_nome_idx
  on public.cadastro_correcao_backup (nome_completo, alterado_em desc);
create index if not exists cadastro_correcao_backup_em_idx
  on public.cadastro_correcao_backup (alterado_em desc);

alter table public.cadastro_correcao_backup enable row level security;

drop policy if exists relatorio_fichas_txt_admin on public.relatorio_fichas_txt;
create policy relatorio_fichas_txt_staff on public.relatorio_fichas_txt
  for all to authenticated
  using (public.is_admin() or public.is_diretoria())
  with check (public.is_admin() or public.is_diretoria());

drop policy if exists cadastro_correcao_backup_staff on public.cadastro_correcao_backup;
create policy cadastro_correcao_backup_staff on public.cadastro_correcao_backup
  for all to authenticated
  using (public.is_admin() or public.is_diretoria())
  with check (public.is_admin() or public.is_diretoria());

notify pgrst, 'reload schema';
