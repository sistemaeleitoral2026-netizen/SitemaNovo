-- Rodar no SQL Editor do projeto NERITES (Assessoria MB).
-- Idempotente. Cópia de 20261118_assessoria_mb_owner_delete.sql
-- Editor passa a poder excluir o que ELE lançou (created_by = auth.uid()).

do $$
begin
  if to_regclass('public.mb_lancamentos') is null then
    raise exception 'Rode 20261116_assessoria_mb.sql antes deste.';
  end if;
end $$;

drop policy if exists mb_lancamentos_delete on public.mb_lancamentos;
create policy mb_lancamentos_delete on public.mb_lancamentos
  for delete to authenticated
  using (
    public.can_access_assessoria_mb()
    and (
      public.can_delete_assessoria_mb()
      or created_by = auth.uid()
    )
  );

drop policy if exists mb_tarefas_delete on public.mb_tarefas;
create policy mb_tarefas_delete on public.mb_tarefas
  for delete to authenticated
  using (
    public.can_access_assessoria_mb()
    and (
      public.can_delete_assessoria_mb()
      or created_by = auth.uid()
    )
  );

drop policy if exists mb_anexos_delete on public.mb_anexos;
create policy mb_anexos_delete on public.mb_anexos
  for delete to authenticated
  using (
    public.can_access_assessoria_mb()
    and (
      public.can_delete_assessoria_mb()
      or created_by = auth.uid()
      or (
        entidade = 'lancamento'
        and exists (
          select 1 from public.mb_lancamentos l
          where l.id = mb_anexos.entidade_id
            and l.created_by = auth.uid()
        )
      )
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

drop policy if exists mb_comprovantes_delete on storage.objects;
create policy mb_comprovantes_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'mb-comprovantes'
    and (
      public.can_delete_assessoria_mb()
      or owner = auth.uid()
    )
  );
