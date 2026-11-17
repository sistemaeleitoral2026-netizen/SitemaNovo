-- Assessoria MB: conta bancária nos lançamentos (controle interno).
-- Não entra na prestação de contas — só filtro/listagem financeira.

begin;

alter table public.mb_lancamentos
  add column if not exists conta_bancaria text;

create index if not exists mb_lancamentos_conta_bancaria_idx
  on public.mb_lancamentos (conta_bancaria);

notify pgrst, 'reload schema';

commit;
