-- Agrega progresso da votação no banco (rápido com 5k+ fichas).
-- Rode no SQL Editor do Supabase. A app usa isso no Progresso; se não existir, cai no modo antigo.

create or replace function public.votacao_progresso_agg(
  p_coordenadores text[] default null,
  p_lideres text[] default null
)
returns table (
  coordenador text,
  lider text,
  total bigint,
  pendente bigint,
  votou bigint,
  nao_votou bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(nullif(btrim(c.coordenador), ''), 'Sem coordenação') as coordenador,
    coalesce(nullif(btrim(c.lider), ''), 'Sem liderança') as lider,
    count(*)::bigint as total,
    count(*) filter (where c.votou is null)::bigint as pendente,
    count(*) filter (where c.votou is true)::bigint as votou,
    count(*) filter (where c.votou is false)::bigint as nao_votou
  from public.cadastros c
  where
    (
      p_coordenadores is null
      or cardinality(p_coordenadores) = 0
      or exists (
        select 1
        from unnest(p_coordenadores) as x(nome)
        where lower(btrim(c.coordenador)) = lower(btrim(x.nome))
      )
    )
    and (
      p_lideres is null
      or cardinality(p_lideres) = 0
      or exists (
        select 1
        from unnest(p_lideres) as y(nome)
        where lower(btrim(c.lider)) = lower(btrim(y.nome))
      )
    )
  group by 1, 2;
$$;

grant execute on function public.votacao_progresso_agg(text[], text[]) to authenticated;
grant execute on function public.votacao_progresso_agg(text[], text[]) to service_role;

notify pgrst, 'reload schema';
