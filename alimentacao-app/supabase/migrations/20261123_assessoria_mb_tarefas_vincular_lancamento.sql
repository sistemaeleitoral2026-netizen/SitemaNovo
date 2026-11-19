-- Assessoria MB: em vez de gerar um lançamento sozinho ao concluir uma
-- tarefa (migration anterior), quem é responsável por uma tarefa com valor
-- agora faz o(s) lançamento(s) de verdade em Financeiro e depois VINCULA
-- esse(s) lançamento(s) à tarefa ali no painel de tarefas. O valor vinculado
-- é comparado com o valor da tarefa:
--   - bateu certinho  -> tarefa vira Concluída
--   - faltou          -> tarefa continua Em andamento, mostrando quanto falta
--   - passou do valor -> tarefa continua Em andamento até o admin revisar
--
-- Tarefa sem valor continua usando o "Concluir" simples (sem vínculo).
--
-- Rode no SQL Editor do projeto NERITES, depois de
-- 20261122_assessoria_mb_tarefas_conclusao.sql. Pode rodar de novo sem
-- perder dados.

do $$
begin
  if to_regclass('public.mb_lancamentos') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116_assessoria_mb.sql antes deste. Pare aqui.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mb_tarefas' and column_name = 'concluido_em'
  ) then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261122_assessoria_mb_tarefas_conclusao.sql antes deste. Pare aqui.';
  end if;
end $$;

-- ============ COLUNA NOVA ============

-- Sem FK de propósito (mesmo motivo de mb_tarefas.lancamento_id): o app faz
-- os upserts de lançamentos e tarefas em paralelo.
alter table public.mb_lancamentos
  add column if not exists tarefa_id uuid;

create index if not exists mb_lancamentos_tarefa_id_idx
  on public.mb_lancamentos (tarefa_id);

-- ============ TAREFAS: permite "Em andamento" por quem não é admin ============
--
-- A trigger de 20261122 só deixava o não-admin ir direto para 'Concluída'.
-- Agora ela também pode marcar 'Em andamento' (foi fazer o lançamento) e,
-- depois, 'Concluída' (quando o vínculo bate com o valor).

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
     or new.recorrente is distinct from old.recorrente
     or new.recorrente_origem_id is distinct from old.recorrente_origem_id
  then
    raise exception 'Você só pode concluir a tarefa, não editar os outros campos.';
  end if;

  return new;
end;
$$;

-- ============ LANÇAMENTOS: vínculo não trava a edição normal ============
--
-- Propositalmente SEM trigger aqui: quem acessa o painel (admin ou editor)
-- continua podendo editar lançamentos normalmente, como hoje — isso já
-- serve pra registrar baixas/recebimentos e corrigir dados. A regra de
-- "um lançamento só vincula a uma tarefa" é aplicada no app (a tela de
-- vínculo só lista lançamentos ainda soltos), não no banco.

notify pgrst, 'reload schema';
