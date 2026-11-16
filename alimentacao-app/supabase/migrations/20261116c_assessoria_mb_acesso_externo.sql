-- Assessoria MB: libera quem tem acesso extra (cadastrado em /admin) a
-- escrever nas tabelas mb_* e no bucket mb-comprovantes. Sem isso, um
-- usuario cadastrado so com acessos_externos->>'assessoria-mb' cai em erro
-- de RLS ao salvar (ex.: "new row violates row-level security policy ...
-- mb_auditoria" ao anexar um comprovante).
--
-- Admin/diretoria do Nerites continuam exatamente como estavam (OR
-- aditivo). Novo: nivel "editor" pode ler/criar/editar, mas nao EXCLUIR
-- tarefas, lancamentos ou anexos — so nivel "admin" (Nerites admin/
-- diretoria, ou acesso extra "admin") pode excluir, como ja era pro
-- admin/diretoria.
--
-- Rode no SQL Editor do projeto NERITES, depois de 20261116_assessoria_mb.sql
-- e 20261116b_acessos_externos.sql. Pode rodar de novo sem perder dados.

do $$
begin
  if to_regclass('public.mb_tarefas') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116_assessoria_mb.sql antes deste. Pare aqui.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'acessos_externos'
  ) then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116b_acessos_externos.sql antes deste. Pare aqui.';
  end if;
end $$;

create or replace function public.can_access_assessoria_mb()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.is_diretoria()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.ativo = true
        and p.acessos_externos ? 'assessoria-mb'
    );
$$;

create or replace function public.can_delete_assessoria_mb()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.is_diretoria()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.ativo = true
        and p.acessos_externos ->> 'assessoria-mb' = 'admin'
    );
$$;

revoke all on function public.can_delete_assessoria_mb() from public;
grant execute on function public.can_delete_assessoria_mb() to authenticated;

-- Tarefas: insert/update para quem acessa o painel; excluir só quem é "admin".
drop policy if exists mb_tarefas_write on public.mb_tarefas;
drop policy if exists mb_tarefas_insert on public.mb_tarefas;
create policy mb_tarefas_insert on public.mb_tarefas
  for insert to authenticated
  with check (public.can_access_assessoria_mb());
drop policy if exists mb_tarefas_update on public.mb_tarefas;
create policy mb_tarefas_update on public.mb_tarefas
  for update to authenticated
  using (public.can_access_assessoria_mb())
  with check (public.can_access_assessoria_mb());
drop policy if exists mb_tarefas_delete on public.mb_tarefas;
create policy mb_tarefas_delete on public.mb_tarefas
  for delete to authenticated
  using (public.can_delete_assessoria_mb());

-- Lançamentos financeiros: mesma regra.
drop policy if exists mb_lancamentos_write on public.mb_lancamentos;
drop policy if exists mb_lancamentos_insert on public.mb_lancamentos;
create policy mb_lancamentos_insert on public.mb_lancamentos
  for insert to authenticated
  with check (public.can_access_assessoria_mb());
drop policy if exists mb_lancamentos_update on public.mb_lancamentos;
create policy mb_lancamentos_update on public.mb_lancamentos
  for update to authenticated
  using (public.can_access_assessoria_mb())
  with check (public.can_access_assessoria_mb());
drop policy if exists mb_lancamentos_delete on public.mb_lancamentos;
create policy mb_lancamentos_delete on public.mb_lancamentos
  for delete to authenticated
  using (public.can_delete_assessoria_mb());

-- Anexos/comprovantes (metadados): mesma regra.
drop policy if exists mb_anexos_write on public.mb_anexos;
drop policy if exists mb_anexos_insert on public.mb_anexos;
create policy mb_anexos_insert on public.mb_anexos
  for insert to authenticated
  with check (public.can_access_assessoria_mb());
drop policy if exists mb_anexos_update on public.mb_anexos;
create policy mb_anexos_update on public.mb_anexos
  for update to authenticated
  using (public.can_access_assessoria_mb())
  with check (public.can_access_assessoria_mb());
drop policy if exists mb_anexos_delete on public.mb_anexos;
create policy mb_anexos_delete on public.mb_anexos
  for delete to authenticated
  using (public.can_delete_assessoria_mb());

-- Arquivo do comprovante no Storage: mesma regra pra excluir.
drop policy if exists mb_comprovantes_delete on storage.objects;
create policy mb_comprovantes_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'mb-comprovantes' and public.can_delete_assessoria_mb());

notify pgrst, 'reload schema';
