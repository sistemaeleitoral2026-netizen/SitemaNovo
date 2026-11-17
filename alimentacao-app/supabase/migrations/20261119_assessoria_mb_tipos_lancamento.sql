-- Assessoria MB: três tipos explícitos de lançamento e histórico separado
-- da observação. Idempotente e compatível com os registros existentes.

begin;

alter table public.mb_lancamentos
  add column if not exists tipo_lancamento text,
  add column if not exists recebimentos jsonb not null default '[]'::jsonb,
  add column if not exists observacao text;

-- Recupera históricos gravados pelo formato antigo em observacao.
update public.mb_lancamentos
set recebimentos = (observacao::jsonb -> '__mb_rx__')
where coalesce(jsonb_array_length(recebimentos), 0) = 0
  and observacao ~ '^\s*\{"__mb_rx__"'
  and jsonb_typeof(observacao::jsonb -> '__mb_rx__') = 'array';

-- Preserva eventual tipo gravado pelo modo de compatibilidade; caso não
-- exista, classifica saída pela mesma regra que o painel já utilizava.
update public.mb_lancamentos
set tipo_lancamento = case
  when observacao ~ '^\s*\{"__mb_rx__"'
   and observacao::jsonb ->> '__mb_tipo__' in ('receita', 'entrada_por_fora', 'saida')
    then observacao::jsonb ->> '__mb_tipo__'
  when coalesce(saida, 0) > 0
   and coalesce(previsto, 0) = 0
   and coalesce(recebido, 0) = 0
    then 'saida'
  else 'receita'
end
where tipo_lancamento is null
   or tipo_lancamento not in ('receita', 'entrada_por_fora', 'saida');

-- Libera observacao para o texto humano, retirando o envelope legado.
update public.mb_lancamentos
set observacao = nullif(observacao::jsonb ->> '__mb_obs__', '')
where observacao ~ '^\s*\{"__mb_rx__"';

alter table public.mb_lancamentos
  alter column tipo_lancamento set default 'receita',
  alter column tipo_lancamento set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.mb_lancamentos'::regclass
      and conname = 'mb_tipo_lancamento_check'
  ) then
    alter table public.mb_lancamentos
      add constraint mb_tipo_lancamento_check
      check (tipo_lancamento in ('receita', 'entrada_por_fora', 'saida'));
  end if;
end $$;

create index if not exists mb_lancamentos_tipo_idx
  on public.mb_lancamentos (tipo_lancamento);

notify pgrst, 'reload schema';

commit;
