-- Reduz pressão de RAM no Postgres nano:
-- índices para COUNT/filtros frequentes + RPCs agregadas (sem dump de milhares de linhas).

create index if not exists cadastros_created_at_idx
  on public.cadastros (created_at desc);

create index if not exists cadastros_operator_id_idx
  on public.cadastros (operator_id)
  where operator_id is not null;

create index if not exists cadastros_diretoria_id_idx
  on public.cadastros (diretoria_id)
  where diretoria_id is not null;

create index if not exists cadastros_lider_trim_idx
  on public.cadastros (lower(btrim(lider)))
  where nullif(btrim(lider), '') is not null;

-- Totais por nerite em uma única query (substitui N× COUNT + N× last row)
create or replace function public.operator_cadastro_stats(p_ids uuid[] default null)
returns table (
  operator_id uuid,
  total int,
  ultima timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.operator_id,
    count(*)::int as total,
    max(c.created_at) as ultima
  from public.cadastros c
  where c.operator_id is not null
    and (p_ids is null or cardinality(p_ids) = 0 or c.operator_id = any (p_ids))
  group by c.operator_id;
$$;

revoke all on function public.operator_cadastro_stats(uuid[]) from public;
grant execute on function public.operator_cadastro_stats(uuid[]) to authenticated;

-- Contagens agrupadas para Equipe / Liderança (substitui paginar todas as fichas)
create or replace function public.cadastro_ficha_stats()
returns table (
  operator_id uuid,
  coordenador text,
  lider text,
  diretoria_id uuid,
  total int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.operator_id,
    nullif(btrim(c.coordenador), '') as coordenador,
    nullif(btrim(c.lider), '') as lider,
    c.diretoria_id,
    count(*)::int as total
  from public.cadastros c
  group by 1, 2, 3, 4;
$$;

revoke all on function public.cadastro_ficha_stats() from public;
grant execute on function public.cadastro_ficha_stats() to authenticated;

notify pgrst, 'reload schema';
