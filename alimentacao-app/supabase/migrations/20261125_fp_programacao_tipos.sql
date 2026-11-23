-- Controle Financeiro Pessoal: Programação com tipos (pagamento / documentação / cobrança)
-- e baixas concluida/cobrada (documentação sem lançamento; cobrança gera receita).

-- Tipo da programação (padrão = comportamento antigo)
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

-- Status de baixa ampliados
alter table public.fp_tarefas_baixas drop constraint if exists fp_tarefas_baixas_status_check;
alter table public.fp_tarefas_baixas
  add constraint fp_tarefas_baixas_status_check
  check (status in ('paga', 'dispensada', 'concluida', 'cobrada'));

alter table public.fp_tarefas_baixas drop constraint if exists fp_baixa_paga;
alter table public.fp_tarefas_baixas
  add constraint fp_baixa_paga check (
    status in ('dispensada', 'concluida')
    or (lancamento_id is not null and valor is not null and data is not null)
  );

comment on column public.fp_tarefas.tipo is
  'pagamento = despesa ao dar baixa; documentacao = só concluir; cobranca = receita ao lançar';
