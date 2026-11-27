-- Programações semanais no Financeiro Pessoal.
-- Permite uma baixa por data nas recorrências semanais, mantendo AAAA-MM nas demais.

alter table public.fp_tarefas
  add column if not exists dia_semana smallint check (dia_semana between 0 and 6);

alter table public.fp_tarefas drop constraint if exists fp_tarefas_recorrencia_check;
alter table public.fp_tarefas
  add constraint fp_tarefas_recorrencia_check
  check (recorrencia in ('unica', 'semanal', 'mensal', 'anual'));

alter table public.fp_tarefas drop constraint if exists fp_tarefas_janela;
alter table public.fp_tarefas
  add constraint fp_tarefas_janela check (
    case recorrencia
      when 'unica' then data_fim is not null and (data_inicio is null or data_inicio <= data_fim)
      when 'semanal' then dia_semana is not null and comeca_em is not null
      when 'mensal' then dia_inicio is not null and dia_fim is not null and dia_inicio <= dia_fim and comeca_em is not null
      when 'anual' then dia_inicio is not null and dia_fim is not null and dia_inicio <= dia_fim
                         and mes_do_ano is not null and comeca_em is not null
    end
  );

alter table public.fp_lancamentos drop constraint if exists fp_lancamentos_tarefa_periodo_check;
alter table public.fp_lancamentos
  add constraint fp_lancamentos_tarefa_periodo_check
  check (tarefa_periodo is null or tarefa_periodo ~ '^\d{4}-(0[1-9]|1[0-2])(-([0-2][0-9]|3[0-1]))?$');

alter table public.fp_tarefas_baixas drop constraint if exists fp_tarefas_baixas_periodo_check;
alter table public.fp_tarefas_baixas
  add constraint fp_tarefas_baixas_periodo_check
  check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])(-([0-2][0-9]|3[0-1]))?$');

comment on column public.fp_tarefas.dia_semana is
  'Recorrência semanal: 0=domingo, 1=segunda, ..., 6=sábado.';
