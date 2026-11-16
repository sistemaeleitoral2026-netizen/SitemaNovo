-- Assessoria MB: mb_auditoria nunca teve política de UPDATE nem DELETE —
-- só SELECT e INSERT. O painel reenvia o histórico de auditoria inteiro a
-- cada salvamento (upsert por id), então, assim que uma linha de auditoria
-- já existe (a partir do 2º salvamento em diante), o Postgres tenta um
-- UPDATE e cai em "new row violates row-level security policy (USING
-- expression) for table mb_auditoria" — isso já acontecia antes do acesso
-- extra existir, pra qualquer usuário (admin/diretoria incluídos).
--
-- Rode no SQL Editor do projeto NERITES, depois de 20261116_assessoria_mb.sql
-- e 20261116c_assessoria_mb_acesso_externo.sql. Pode rodar de novo sem perder dados.

do $$
begin
  if to_regclass('public.mb_auditoria') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116_assessoria_mb.sql antes deste. Pare aqui.';
  end if;
end $$;

drop policy if exists mb_auditoria_update on public.mb_auditoria;
create policy mb_auditoria_update on public.mb_auditoria
  for update to authenticated
  using (public.can_access_assessoria_mb())
  with check (public.can_access_assessoria_mb());

-- Apagar auditoria é sensível (é o próprio log) — só nível "admin".
drop policy if exists mb_auditoria_delete on public.mb_auditoria;
create policy mb_auditoria_delete on public.mb_auditoria
  for delete to authenticated
  using (public.can_delete_assessoria_mb());

notify pgrst, 'reload schema';
