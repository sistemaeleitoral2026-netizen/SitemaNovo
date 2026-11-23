-- CONTROLE FINANCEIRO PESSOAL — ajuste 1 (rode depois de 20261124_financeiro_pessoal.sql)
-- Rode no SQL Editor do projeto NERITES. Pode rodar de novo sem perder dados.
--
-- 1) Cada aplicação (investimento) fica ligada a uma conta cadastrada (fp_contas):
--    "Nova aplicação" escolhe o banco/conta em vez de digitar a instituição.
-- 2) Editor pode fazer tudo fora de Tarefas: criar, editar e EXCLUIR contas,
--    aplicações, saldos e lançamentos. Em Tarefas, continua só dando baixa.
--    Excluir lançamento que veio de uma tarefa (= desfazer a baixa) segue só admin.

do $$
begin
  if to_regclass('public.fp_investimentos') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261124_financeiro_pessoal.sql antes deste. Pare aqui.';
  end if;
end $$;

-- ============ APLICAÇÃO LIGADA À CONTA ============

alter table public.fp_investimentos
  add column if not exists conta_id uuid references public.fp_contas (id) on delete set null;

create index if not exists fp_investimentos_conta_idx on public.fp_investimentos (conta_id);

comment on column public.fp_investimentos.conta_id is
  'Conta (banco) onde a aplicação está. instituicao guarda o nome da conta no momento do cadastro.';

-- ============ EDITOR PODE EXCLUIR FORA DE TAREFAS ============

drop policy if exists fp_contas_delete on public.fp_contas;
create policy fp_contas_delete on public.fp_contas
  for delete to authenticated using (public.can_access_financeiro_pessoal());

drop policy if exists fp_conferencias_conta_delete on public.fp_conferencias_conta;
create policy fp_conferencias_conta_delete on public.fp_conferencias_conta
  for delete to authenticated using (public.can_access_financeiro_pessoal());

drop policy if exists fp_investimentos_delete on public.fp_investimentos;
create policy fp_investimentos_delete on public.fp_investimentos
  for delete to authenticated using (public.can_access_financeiro_pessoal());

drop policy if exists fp_investimentos_saldos_delete on public.fp_investimentos_saldos;
create policy fp_investimentos_saldos_delete on public.fp_investimentos_saldos
  for delete to authenticated using (public.can_access_financeiro_pessoal());

-- Lançamento comum: qualquer um com acesso exclui. Lançamento de tarefa: só admin.
drop policy if exists fp_lancamentos_delete on public.fp_lancamentos;
create policy fp_lancamentos_delete on public.fp_lancamentos
  for delete to authenticated
  using (public.can_access_financeiro_pessoal()
         and (tarefa_id is null or public.is_admin_financeiro_pessoal()));

drop policy if exists fp_anexos_delete on public.fp_anexos;
create policy fp_anexos_delete on public.fp_anexos
  for delete to authenticated using (public.can_access_financeiro_pessoal());

drop policy if exists fp_comprovantes_delete on storage.objects;
create policy fp_comprovantes_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'fp-comprovantes' and public.can_access_financeiro_pessoal());

notify pgrst, 'reload schema';
