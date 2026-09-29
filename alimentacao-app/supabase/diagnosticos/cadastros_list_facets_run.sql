-- Cole no SQL Editor do Supabase (acelera Cadastros — facetas sem baixar a tabela).

create or replace function public.cadastros_list_facets(p_operator_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total bigint := 0;
  v_zonas text[];
  v_secoes jsonb := '[]'::jsonb;
  v_dups text[];
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  if not (
    public.is_admin()
    or public.is_diretoria()
    or public.is_operador()
  ) then
    raise exception 'Sem permissão';
  end if;

  if public.is_operador() and not public.is_admin() and not public.is_diretoria() then
    p_operator_id := v_uid;
  end if;

  select count(*) into v_total
  from public.cadastros c
  where (p_operator_id is null or c.operator_id = p_operator_id);

  select coalesce(array_agg(z order by z), '{}') into v_zonas
  from (
    select distinct nullif(btrim(c.zona), '') as z
    from public.cadastros c
    where (p_operator_id is null or c.operator_id = p_operator_id)
      and nullif(btrim(c.zona), '') is not null
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object('zona', zona, 'secao', secao) order by zona, secao), '[]'::jsonb)
  into v_secoes
  from (
    select distinct nullif(btrim(c.zona), '') as zona, nullif(btrim(c.secao), '') as secao
    from public.cadastros c
    where (p_operator_id is null or c.operator_id = p_operator_id)
      and nullif(btrim(c.secao), '') is not null
  ) s;

  select coalesce(array_agg(sample order by sample), '{}') into v_dups
  from (
    select min(nullif(btrim(c.titulo), '')) as sample
    from public.cadastros c
    where (p_operator_id is null or c.operator_id = p_operator_id)
      and nullif(btrim(c.titulo), '') is not null
    group by lower(btrim(c.titulo))
    having count(*) > 1
  ) d;

  return jsonb_build_object(
    'totalAll', v_total,
    'zonas', to_jsonb(v_zonas),
    'secoes', v_secoes,
    'dupTitulos', to_jsonb(v_dups)
  );
end;
$$;

revoke all on function public.cadastros_list_facets(uuid) from public;
grant execute on function public.cadastros_list_facets(uuid) to authenticated;

notify pgrst, 'reload schema';
