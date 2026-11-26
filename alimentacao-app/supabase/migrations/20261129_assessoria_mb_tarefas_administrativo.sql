-- Assessoria MB: cargo administrativo (Nerites) também pode CRIAR tarefa.
-- Admin do painel (can_delete_assessoria_mb) continua podendo criar.
-- Exclusão, "Todas as demandas" e aprovação de relatório seguem só admin.
--
-- Rode no SQL Editor do projeto NERITES depois de
-- 20261122_assessoria_mb_tarefas_conclusao.sql (e 20261110_extra_roles_helpers_aianka.sql).

do $$
begin
  if to_regclass('public.mb_tarefas') is null then
    raise exception 'Rode 20261116_assessoria_mb.sql antes deste. Pare aqui.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'can_delete_assessoria_mb') then
    raise exception 'Rode 20261116c_assessoria_mb_acesso_externo.sql antes deste. Pare aqui.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_administrativo') then
    raise exception 'Rode 20261110_extra_roles_helpers_aianka.sql antes deste. Pare aqui.';
  end if;
end $$;

create or replace function public.can_create_assessoria_mb_tarefa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_delete_assessoria_mb()
    or public.is_administrativo();
$$;

revoke all on function public.can_create_assessoria_mb_tarefa() from public;
grant execute on function public.can_create_assessoria_mb_tarefa() to authenticated;

drop policy if exists mb_tarefas_insert on public.mb_tarefas;
create policy mb_tarefas_insert on public.mb_tarefas
  for insert to authenticated
  with check (public.can_create_assessoria_mb_tarefa());

notify pgrst, 'reload schema';
