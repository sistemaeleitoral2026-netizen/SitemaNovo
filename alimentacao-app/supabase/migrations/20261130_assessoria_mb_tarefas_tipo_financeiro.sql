-- Assessoria MB: novo painel "Demandas e Tarefas".
--
-- A tarefa passa a ter tipo (Financeira / Documental, guardado na coluna
-- já existente `demanda`) e, quando Financeira, o tipo de lançamento
-- (receita, entrada_por_fora, saida) e o centro de custo. O botão
-- "Realizar" usa esses dados para abrir o lançamento já preenchido.
--
-- Rode no SQL Editor do projeto NERITES, depois de
-- 20261123_assessoria_mb_tarefas_vincular_lancamento.sql e
-- 20261129_assessoria_mb_tarefas_administrativo.sql. Pode rodar de novo sem
-- perder dados.

do $$
begin
  if to_regclass('public.mb_tarefas') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116_assessoria_mb.sql antes deste. Pare aqui.';
  end if;
end $$;

-- ============ COLUNAS NOVAS ============

alter table public.mb_tarefas
  add column if not exists tipo_lancamento text,
  add column if not exists centro_custo text;

alter table public.mb_tarefas
  drop constraint if exists mb_tarefas_tipo_lancamento_check;
alter table public.mb_tarefas
  add constraint mb_tarefas_tipo_lancamento_check
  check (tipo_lancamento is null or tipo_lancamento in ('receita', 'entrada_por_fora', 'saida'));

-- Tarefas antigas não são alteradas: sem tipo, o app trata como Financeira
-- (saída) quando há valor e como Documental quando não há.

-- ============ TAREFAS: responsável não altera os campos novos ============

create or replace function public.mb_tarefas_restrict_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin_level boolean;
  my_nome text;
begin
  is_admin_level := public.can_delete_assessoria_mb();
  if is_admin_level then
    return new;
  end if;

  select nome into my_nome from public.profiles where id = auth.uid();

  if old.responsavel is null
     or trim(lower(old.responsavel)) <> trim(lower(coalesce(my_nome, '')))
     or trim(coalesce(my_nome, '')) = ''
  then
    raise exception 'Só o responsável pela tarefa (ou um admin) pode alterá-la.';
  end if;

  if old.status = 'Concluída' then
    raise exception 'Tarefa já concluída — só um admin pode reabri-la.';
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
