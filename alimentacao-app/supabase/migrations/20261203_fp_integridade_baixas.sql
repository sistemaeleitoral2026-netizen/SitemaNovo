-- Controle Financeiro Pessoal: integridade das baixas e preservacao de historico.
-- Rode depois de 20261202_fp_editor_tudo_auditoria.sql (e da programacao semanal, se usar).

alter table public.fp_tarefas
  add column if not exists arquivada boolean not null default false;

comment on column public.fp_tarefas.arquivada is
  'Oculta novas ocorrencias sem apagar a programacao nem seu historico.';

create or replace function public.fp_registrar_baixa_atomica(
  p_lancamento jsonb,
  p_baixa jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lancamento_id uuid := (p_lancamento ->> 'id')::uuid;
  v_baixa_id uuid := (p_baixa ->> 'id')::uuid;
  v_tarefa_id uuid := (p_baixa ->> 'tarefa_id')::uuid;
begin
  if not public.can_access_financeiro_pessoal() then
    raise exception 'Sem permissao para acessar o Controle Financeiro Pessoal.';
  end if;

  if v_lancamento_id is null or v_baixa_id is null or v_tarefa_id is null then
    raise exception 'Dados incompletos para registrar a baixa.';
  end if;

  if (p_lancamento ->> 'tarefa_id')::uuid is distinct from v_tarefa_id
     or p_lancamento ->> 'tarefa_periodo' is distinct from p_baixa ->> 'periodo' then
    raise exception 'O lancamento e a baixa nao pertencem a mesma ocorrencia.';
  end if;

  -- As duas inclusoes pertencem a mesma transacao da funcao. Se a restricao
  -- unique(tarefa_id, periodo) recusar a baixa, o lancamento tambem e desfeito.
  insert into public.fp_lancamentos (
    id, data, hora, tipo, descricao, categoria, valor, conta_id,
    recebedor, responsavel, observacao, tarefa_id, tarefa_periodo
  ) values (
    v_lancamento_id,
    (p_lancamento ->> 'data')::date,
    nullif(p_lancamento ->> 'hora', '')::time,
    p_lancamento ->> 'tipo',
    p_lancamento ->> 'descricao',
    coalesce(nullif(p_lancamento ->> 'categoria', ''), 'Outros'),
    (p_lancamento ->> 'valor')::numeric,
    (p_lancamento ->> 'conta_id')::uuid,
    nullif(p_lancamento ->> 'recebedor', ''),
    nullif(p_lancamento ->> 'responsavel', ''),
    nullif(p_lancamento ->> 'observacao', ''),
    v_tarefa_id,
    p_lancamento ->> 'tarefa_periodo'
  );

  insert into public.fp_tarefas_baixas (
    id, tarefa_id, periodo, status, lancamento_id, valor, conta_id,
    data, hora, recebedor, responsavel, observacao
  ) values (
    v_baixa_id,
    v_tarefa_id,
    p_baixa ->> 'periodo',
    p_baixa ->> 'status',
    v_lancamento_id,
    (p_baixa ->> 'valor')::numeric,
    nullif(p_baixa ->> 'conta_id', '')::uuid,
    nullif(p_baixa ->> 'data', '')::date,
    nullif(p_baixa ->> 'hora', '')::time,
    nullif(p_baixa ->> 'recebedor', ''),
    nullif(p_baixa ->> 'responsavel', ''),
    nullif(p_baixa ->> 'observacao', '')
  );
end;
$$;

create or replace function public.fp_desfazer_baixa_atomica(
  p_lancamento_id uuid,
  p_baixa_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.can_access_financeiro_pessoal() then
    raise exception 'Sem permissao para acessar o Controle Financeiro Pessoal.';
  end if;

  if not exists (
    select 1
    from public.fp_tarefas_baixas b
    where b.id = p_baixa_id and b.lancamento_id = p_lancamento_id
  ) then
    raise exception 'Baixa e lancamento nao correspondem.';
  end if;

  delete from public.fp_tarefas_baixas where id = p_baixa_id;
  delete from public.fp_lancamentos where id = p_lancamento_id;
end;
$$;

revoke all on function public.fp_registrar_baixa_atomica(jsonb, jsonb) from public;
revoke all on function public.fp_desfazer_baixa_atomica(uuid, uuid) from public;
grant execute on function public.fp_registrar_baixa_atomica(jsonb, jsonb) to authenticated;
grant execute on function public.fp_desfazer_baixa_atomica(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
