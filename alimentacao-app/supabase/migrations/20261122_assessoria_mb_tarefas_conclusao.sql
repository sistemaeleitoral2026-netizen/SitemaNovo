-- Assessoria MB: botão "Concluir" em tarefas + geração automática de
-- lançamento financeiro ao concluir.
--
-- Hoje qualquer pessoa com acesso ao painel (admin ou acesso externo
-- "editor") pode inserir E editar QUALQUER campo de QUALQUER tarefa em
-- mb_tarefas (policies de 20261116c_assessoria_mb_acesso_externo.sql).
-- A partir daqui:
--   - só nível "admin" (public.can_delete_assessoria_mb()) pode CRIAR tarefa;
--   - quem não é admin só pode fazer UPDATE numa tarefa se for a
--     responsável por ela (nome do perfil = campo responsavel), e só para
--     marcá-la como Concluída — qualquer outro campo "de dono" (título,
--     favorecido, responsável, prazo, valor, origem do pagamento, demanda,
--     empresa, recorrência) continua travado por trigger.
--
-- Rode no SQL Editor do projeto NERITES, depois de
-- 20261116c_assessoria_mb_acesso_externo.sql. Pode rodar de novo sem perder
-- dados.

do $$
begin
  if to_regclass('public.mb_tarefas') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116_assessoria_mb.sql antes deste. Pare aqui.';
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'can_delete_assessoria_mb'
  ) then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116c_assessoria_mb_acesso_externo.sql antes deste. Pare aqui.';
  end if;
end $$;

-- ============ COLUNAS NOVAS ============

alter table public.mb_tarefas
  add column if not exists concluido_por text,
  add column if not exists concluido_em timestamptz,
  -- Sem FK de propósito: syncLancamentos()/syncTarefas() no app rodam em
  -- paralelo (Promise.all), então o lançamento e a tarefa podem ser
  -- inseridos "ao mesmo tempo" — uma FK aqui causaria erro intermitente de
  -- ordem. Mesmo padrão já usado em mb_tarefas.demanda / mb_anexos.entidade_id.
  add column if not exists lancamento_id uuid;

-- ============ CRIAÇÃO: só admin ============

drop policy if exists mb_tarefas_insert on public.mb_tarefas;
create policy mb_tarefas_insert on public.mb_tarefas
  for insert to authenticated
  with check (public.can_delete_assessoria_mb());

-- ============ UPDATE: não-admin só conclui a própria tarefa ============

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

  if new.status is distinct from 'Concluída' then
    raise exception 'Você só pode marcar a tarefa como concluída.';
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

revoke all on function public.mb_tarefas_restrict_update() from public;

drop trigger if exists mb_tarefas_restrict_update_trg on public.mb_tarefas;
create trigger mb_tarefas_restrict_update_trg
  before update on public.mb_tarefas
  for each row
  execute function public.mb_tarefas_restrict_update();

notify pgrst, 'reload schema';
