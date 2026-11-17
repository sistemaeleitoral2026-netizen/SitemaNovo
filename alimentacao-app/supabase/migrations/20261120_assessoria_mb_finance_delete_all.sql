-- Assessoria MB: qualquer usuário com acesso ao financeiro pode excluir
-- lançamentos (admin ou editor). A exclusão continua registrada na auditoria
-- do painel. Tarefas seguem a regra anterior (autor ou admin).
--
-- Idempotente. Rode no SQL Editor do projeto NERITES se a migration
-- automática ainda não tiver sido aplicada.

do $$
begin
  if to_regclass('public.mb_lancamentos') is null then
    raise exception 'Rode 20261116_assessoria_mb.sql antes deste.';
  end if;
end $$;

drop policy if exists mb_lancamentos_delete on public.mb_lancamentos;
create policy mb_lancamentos_delete on public.mb_lancamentos
  for delete to authenticated
  using (public.can_access_assessoria_mb());

-- Metadados de comprovante ligados a lançamento: quem pode excluir o
-- lançamento também precisa conseguir limpar o anexo.
drop policy if exists mb_anexos_delete on public.mb_anexos;
create policy mb_anexos_delete on public.mb_anexos
  for delete to authenticated
  using (
    public.can_access_assessoria_mb()
    and (
      entidade = 'lancamento'
      or public.can_delete_assessoria_mb()
      or created_by = auth.uid()
      or (
        entidade = 'tarefa'
        and exists (
          select 1 from public.mb_tarefas t
          where t.id = mb_anexos.entidade_id
            and t.created_by = auth.uid()
        )
      )
    )
  );

-- Arquivos no Storage dos comprovantes: acesso ao financeiro basta.
drop policy if exists mb_comprovantes_delete on storage.objects;
create policy mb_comprovantes_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'mb-comprovantes'
    and public.can_access_assessoria_mb()
  );

notify pgrst, 'reload schema';
