-- Assessoria MB: reabre a demanda RECEBER GRAJAU e DESVINCULA os lançamentos
-- puxados por engano.
--
-- NÃO apaga nenhum lançamento do financeiro — só tira o vínculo com a tarefa
-- (tarefa_id = null). A demanda volta para Abertas (Pendente).
--
-- Rodar no SQL Editor do projeto NERITES (Supabase). Idempotente.

do $$
declare
  v_tarefa_id uuid;
  v_titulo text;
  v_status text;
  v_valor numeric;
  v_n int := 0;
  r record;
begin
  select t.id, t.titulo, t.status, t.valor
    into v_tarefa_id, v_titulo, v_status, v_valor
  from public.mb_tarefas t
  where upper(btrim(t.titulo)) like '%RECEBER%GRAJA%'
     or upper(btrim(coalesce(t.demanda, ''))) like '%RECEBER%GRAJA%'
  order by
    case when t.status = 'Concluída' then 0 else 1 end,
    case when coalesce(t.valor, 0) between 792000 and 793000 then 0 else 1 end,
    t.created_at desc nulls last
  limit 1;

  if v_tarefa_id is null then
    raise exception 'Tarefa RECEBER GRAJAU não encontrada.';
  end if;

  raise notice 'Tarefa: id=% titulo=% status=% valor=%',
    v_tarefa_id, v_titulo, v_status, v_valor;

  for r in
    select id, data, parceiro, empresa, previsto, recebido, saida
    from public.mb_lancamentos
    where tarefa_id = v_tarefa_id
  loop
    raise notice 'Desvinculando % | % | % | empresa=% | previsto=% | recebido=% | saida=%',
      r.id, r.data, r.parceiro, coalesce(r.empresa, '—'),
      r.previsto, r.recebido, r.saida;
  end loop;

  -- SQL Editor não tem auth.uid(); o trigger bloquearia a reabertura.
  alter table public.mb_tarefas disable trigger mb_tarefas_restrict_update_trg;

  update public.mb_lancamentos
  set tarefa_id = null
  where tarefa_id = v_tarefa_id;

  get diagnostics v_n = row_count;

  update public.mb_tarefas
  set
    status = 'Pendente',
    concluido_por = null,
    concluido_em = null,
    lancamento_id = null
  where id = v_tarefa_id;

  alter table public.mb_tarefas enable trigger mb_tarefas_restrict_update_trg;

  raise notice 'OK: % lançamento(ns) desvinculado(s); tarefa reaberta como Pendente.', v_n;
exception
  when others then
    begin
      alter table public.mb_tarefas enable trigger mb_tarefas_restrict_update_trg;
    exception when others then
      null;
    end;
    raise;
end $$;

-- Conferência da tarefa
select
  t.id,
  t.titulo,
  t.status,
  t.valor,
  t.responsavel,
  t.concluido_por,
  t.concluido_em
from public.mb_tarefas t
where upper(btrim(t.titulo)) like '%RECEBER%GRAJA%'
   or upper(btrim(coalesce(t.demanda, ''))) like '%RECEBER%GRAJA%';

-- Conferência: lançamentos GRAJAÚ devem ficar com tarefa_id nulo
select
  l.id,
  l.data,
  l.parceiro,
  l.empresa,
  l.previsto,
  l.recebido,
  l.saida,
  l.tarefa_id
from public.mb_lancamentos l
where upper(btrim(coalesce(l.parceiro, ''))) like '%GRAJA%'
   or upper(btrim(coalesce(l.empresa, ''))) like '%GRAJA%'
order by l.data desc;
