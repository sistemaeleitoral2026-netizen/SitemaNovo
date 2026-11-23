-- MR Terceiriza: permite classificar cada lançamento por centro de custo.

alter table public.mr_lancamentos
  add column if not exists centro_custo text;

create index if not exists mr_lancamentos_centro_custo_idx
  on public.mr_lancamentos (centro_custo)
  where centro_custo is not null;

notify pgrst, 'reload schema';
