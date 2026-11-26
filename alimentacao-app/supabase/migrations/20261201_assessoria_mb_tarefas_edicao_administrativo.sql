-- Assessoria MB: cargo administrativo também pode EDITAR qualquer tarefa
-- (como o admin do painel). Excluir continua só para admin.
--
-- Rode no SQL Editor do projeto NERITES depois de
-- 20261129_assessoria_mb_tarefas_administrativo.sql e
-- 20261130_assessoria_mb_tarefas_tipo_financeiro.sql. Pode rodar de novo
-- sem perder dados.

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'can_create_assessoria_mb_tarefa') then
    raise exception 'Rode 20261129_assessoria_mb_tarefas_administrativo.sql antes deste. Pare aqui.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mb_tarefas' and column_name = 'tipo_lancamento'
  ) then
    raise exception 'Rode 20261130_assessoria_mb_tarefas_tipo_financeiro.sql antes deste. Pare aqui.';
  end if;
end $$;

create or replace function public.mb_tarefas_restrict_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  my_nome text;
begin
  -- Admin do painel ou administrativo: edição livre.
  if public.can_create_assessoria_mb_tarefa() then
    return new;
  end if;

  select nome into my_nome from public.profiles where id = auth.uid();

  if old.responsavel is null
     or trim(lower(old.responsavel)) <> trim(lower(coalesce(my_nome, '')))
     or trim(coalesce(my_nome, '')) = ''
  then
    raise exception 'Só o responsável pela tarefa (ou um admin/administrativo) pode alterá-la.';
  end if;

  if old.status = 'Concluída' then
    raise exception 'Tarefa já concluída — só um admin ou administrativo pode reabri-la.';
  end if;

  if new.status = 'Pendente' or new.status not in ('Em andamento', 'Concluída') then
    raise exception 'Você só pode marcar a tarefa como em andamento ou concluída.';
  end if;

  if new.titulo is distinct from old.titulo
     or new.nome is distinct from old.nome
     or new.responsavel is distinct from old.responsavel
     or new.prazo is distinct from old.prazo
     or new.valor is distinct from old.valor
     or new.origem_pagamento is distinct from old.origem_pagamento
     or new.demanda is distinct from old.demanda
     or new.empresa is distinct from old.empresa
     or new.tipo_lancamento is distinct from old.tipo_lancamento
     or new.centro_custo is distinct from old.centro_custo
     or new.recorrente is distinct from old.recorrente
     or new.recorrente_origem_id is distinct from old.recorrente_origem_id
  then
    raise exception 'Você só pode concluir a tarefa, não editar os outros campos.';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
