-- Garante o tipo "documentacao" (menu Documentação) e anexos de pendência.
-- Idempotente. Rode no SQL Editor do projeto NERITES se cadastrar documentação falhar.

do $$
begin
  if to_regclass('public.fp_tarefas') is null then
    raise exception 'Rode 20261124_financeiro_pessoal.sql antes deste.';
  end if;
end $$;

alter table public.fp_tarefas
  add column if not exists tipo text;

update public.fp_tarefas
set tipo = 'pagamento'
where tipo is null or tipo = '';

alter table public.fp_tarefas
  alter column tipo set default 'pagamento';

alter table public.fp_tarefas
  alter column tipo set not null;

alter table public.fp_tarefas drop constraint if exists fp_tarefas_tipo_check;
alter table public.fp_tarefas
  add constraint fp_tarefas_tipo_check
  check (tipo in ('pagamento', 'documentacao', 'cobranca'));

alter table public.fp_tarefas_baixas drop constraint if exists fp_tarefas_baixas_status_check;
alter table public.fp_tarefas_baixas
  add constraint fp_tarefas_baixas_status_check
  check (status in ('paga', 'dispensada', 'concluida', 'cobrada'));

-- Anexos de pendência usam entidade = 'tarefa' (já previsto no schema base).
do $$
begin
  if not exists (
    select 1
    from information_schema.check_constraints c
    join information_schema.constraint_column_usage u
      on u.constraint_name = c.constraint_name
    where u.table_name = 'fp_anexos'
      and c.check_clause ilike '%tarefa%'
  ) then
    raise notice 'Confira o check de fp_anexos.entidade (deve incluir tarefa).';
  end if;
end $$;

comment on column public.fp_tarefas.tipo is
  'pagamento | documentacao | cobranca — documentacao = menu Documentação / Nova pendência';

notify pgrst, 'reload schema';

select 'OK: tipos pagamento/documentacao/cobranca liberados' as resultado;
