-- EMPRESAS (MR Terceriza) — TRAVA POR EMPRESA NO BANCO
-- Rode no SQL Editor do projeto NERITES DEPOIS de:
--   1) rodar 20261117a_mr_contratos.sql, e
--   2) liberar na tela Usuários (Empresas) as empresas de cada editor.
-- A partir daqui o editor só lê/grava lançamentos, anexos, contas e auditoria
-- das empresas liberadas pra ele. Admin continua vendo tudo.
-- Pode rodar de novo.

do $$
begin
  if to_regprocedure('public.mr_pode_empresa(text)') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261117a_mr_contratos.sql antes deste. Pare aqui.';
  end if;
end $$;

create or replace function public.mr_pode_lancamento(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.mr_pode_empresa(l.empresa) from public.mr_lancamentos l where l.id = p_id),
    false
  );
$$;

revoke all on function public.mr_pode_lancamento(uuid) from public;
grant execute on function public.mr_pode_lancamento(uuid) to authenticated;

-- ---- contas bancárias ----
drop policy if exists mr_contas_select on public.mr_contas;
create policy mr_contas_select on public.mr_contas
  for select to authenticated
  using (public.mr_pode_empresa(empresa));

drop policy if exists mr_contas_insert on public.mr_contas;
create policy mr_contas_insert on public.mr_contas
  for insert to authenticated
  with check (public.mr_pode_empresa(empresa));

-- ---- lançamentos ----
drop policy if exists mr_lancamentos_select on public.mr_lancamentos;
create policy mr_lancamentos_select on public.mr_lancamentos
  for select to authenticated
  using (public.mr_pode_empresa(empresa));

drop policy if exists mr_lancamentos_insert on public.mr_lancamentos;
create policy mr_lancamentos_insert on public.mr_lancamentos
  for insert to authenticated
  with check (public.mr_pode_empresa(empresa));

drop policy if exists mr_lancamentos_update on public.mr_lancamentos;
create policy mr_lancamentos_update on public.mr_lancamentos
  for update to authenticated
  using (public.mr_pode_empresa(empresa))
  with check (public.mr_pode_empresa(empresa));

drop policy if exists mr_lancamentos_delete on public.mr_lancamentos;
create policy mr_lancamentos_delete on public.mr_lancamentos
  for delete to authenticated
  using (
    public.mr_pode_empresa(empresa)
    and (public.is_admin_mr_terceriza() or created_by = auth.uid())
  );

-- ---- anexos (seguem a empresa do lançamento) ----
drop policy if exists mr_anexos_select on public.mr_anexos;
create policy mr_anexos_select on public.mr_anexos
  for select to authenticated
  using (public.mr_pode_lancamento(entidade_id));

drop policy if exists mr_anexos_insert on public.mr_anexos;
create policy mr_anexos_insert on public.mr_anexos
  for insert to authenticated
  with check (public.mr_pode_lancamento(entidade_id));

drop policy if exists mr_anexos_delete on public.mr_anexos;
create policy mr_anexos_delete on public.mr_anexos
  for delete to authenticated
  using (
    public.mr_pode_lancamento(entidade_id)
    and (public.is_admin_mr_terceriza() or created_by = auth.uid())
  );

-- ---- auditoria (registro sem empresa = só admin) ----
drop policy if exists mr_auditoria_select on public.mr_auditoria;
create policy mr_auditoria_select on public.mr_auditoria
  for select to authenticated
  using (
    case when empresa is null or empresa = '' then public.is_admin_mr_terceriza()
    else public.mr_pode_empresa(empresa) end
  );

drop policy if exists mr_auditoria_insert on public.mr_auditoria;
create policy mr_auditoria_insert on public.mr_auditoria
  for insert to authenticated
  with check (
    case when empresa is null or empresa = '' then public.is_admin_mr_terceriza()
    else public.mr_pode_empresa(empresa) end
  );

drop policy if exists mr_auditoria_update on public.mr_auditoria;
create policy mr_auditoria_update on public.mr_auditoria
  for update to authenticated
  using (
    case when empresa is null or empresa = '' then public.is_admin_mr_terceriza()
    else public.mr_pode_empresa(empresa) end
  )
  with check (
    case when empresa is null or empresa = '' then public.is_admin_mr_terceriza()
    else public.mr_pode_empresa(empresa) end
  );

drop policy if exists mr_auditoria_delete on public.mr_auditoria;
create policy mr_auditoria_delete on public.mr_auditoria
  for delete to authenticated
  using (
    case when empresa is null or empresa = '' then public.is_admin_mr_terceriza()
    else public.mr_pode_empresa(empresa) end
  );

notify pgrst, 'reload schema';
