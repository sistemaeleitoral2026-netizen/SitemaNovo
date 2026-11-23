-- MR Terceiriza: anexos (fichas/PDF/fotos) também nos contratos.
-- Reaproveita mr_anexos com entidade = 'contrato'.

do $$
begin
  if to_regclass('public.mr_anexos') is null then
    raise exception 'Rode 20261116f_mr_terceriza.sql antes deste.';
  end if;
  if to_regclass('public.mr_contratos') is null then
    raise exception 'Rode 20261117a_mr_contratos.sql antes deste.';
  end if;
  if to_regprocedure('public.mr_pode_empresa(text)') is null then
    raise exception 'Rode 20261117a_mr_contratos.sql antes deste (falta mr_pode_empresa).';
  end if;
end $$;

alter table public.mr_anexos
  drop constraint if exists mr_anexos_entidade_check;

alter table public.mr_anexos
  add constraint mr_anexos_entidade_check
  check (entidade in ('lancamento', 'contrato'));

-- Garante a função usada pelos anexos de lançamento (pode faltar se 20261117b
-- ainda não rodou neste projeto).
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

create or replace function public.mr_pode_anexo(p_entidade text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_entidade = 'lancamento' then coalesce(
      (select public.mr_pode_empresa(l.empresa) from public.mr_lancamentos l where l.id = p_id),
      false
    )
    when p_entidade = 'contrato' then coalesce(
      (select public.mr_pode_empresa(c.empresa) from public.mr_contratos c where c.id = p_id),
      false
    )
    else false
  end;
$$;

revoke all on function public.mr_pode_anexo(text, uuid) from public;
grant execute on function public.mr_pode_anexo(text, uuid) to authenticated;

drop policy if exists mr_anexos_select on public.mr_anexos;
create policy mr_anexos_select on public.mr_anexos
  for select to authenticated
  using (public.mr_pode_anexo(entidade, entidade_id));

drop policy if exists mr_anexos_insert on public.mr_anexos;
create policy mr_anexos_insert on public.mr_anexos
  for insert to authenticated
  with check (public.mr_pode_anexo(entidade, entidade_id));

drop policy if exists mr_anexos_update on public.mr_anexos;
create policy mr_anexos_update on public.mr_anexos
  for update to authenticated
  using (public.mr_pode_anexo(entidade, entidade_id))
  with check (public.mr_pode_anexo(entidade, entidade_id));

drop policy if exists mr_anexos_delete on public.mr_anexos;
create policy mr_anexos_delete on public.mr_anexos
  for delete to authenticated
  using (
    public.mr_pode_anexo(entidade, entidade_id)
    and (public.is_admin_mr_terceriza() or created_by = auth.uid())
  );

notify pgrst, 'reload schema';
