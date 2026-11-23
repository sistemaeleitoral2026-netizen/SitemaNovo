-- MR Terceiriza: centro de custo vinculado a uma ou várias empresas.
-- Cada vínculo vira uma linha (empresa + nome). Cadastro novo no app
-- já grava todas as empresas; na edição dá para deixar só algumas.

do $$
begin
  if to_regclass('public.mr_centros_custo') is null then
    raise exception 'Rode 20261117a_mr_contratos.sql antes deste.';
  end if;
end $$;

alter table public.mr_centros_custo
  add column if not exists empresa text;

alter table public.mr_centros_custo
  add column if not exists descricao text;

-- Nome deixou de ser único global: o mesmo centro pode existir em várias empresas.
alter table public.mr_centros_custo
  drop constraint if exists mr_centros_custo_nome_key;

-- Centros antigos (lista global) passam a valer para todas as empresas conhecidas.
-- Um único WITH cobre o INSERT; linhas sem empresa são removidas depois.
with empresas as (
  select distinct btrim(empresa) as empresa
  from (
    select empresa from public.mr_contas
    union all select empresa from public.mr_contratos
    union all select empresa from public.mr_lancamentos
    union all select empresa from public.mr_permissoes
    union all select unnest(array[
      'mr','re-fashion','iron','globo','mcc','limpocar','tips-graf'
    ])
  ) e
  where empresa is not null and btrim(empresa) <> ''
),
origem as (
  select distinct on (lower(btrim(nome)))
    nome,
    coalesce(descricao, '') as descricao,
    ativo,
    created_at,
    created_by
  from public.mr_centros_custo
  order by lower(btrim(nome)), created_at nulls last
)
insert into public.mr_centros_custo (nome, descricao, ativo, created_at, created_by, empresa)
select o.nome,
       nullif(o.descricao, ''),
       o.ativo,
       o.created_at,
       o.created_by,
       e.empresa
from origem o
cross join empresas e
where not exists (
  select 1
  from public.mr_centros_custo c
  where c.empresa = e.empresa
    and lower(btrim(c.nome)) = lower(btrim(o.nome))
);

-- Remove placeholders sem empresa (já cobertos pelas linhas novas).
delete from public.mr_centros_custo
where empresa is null or btrim(empresa) = '';

-- Se a tabela estiver vazia de empresas conhecidas, não deve sobrar null.
update public.mr_centros_custo
set empresa = 'mr'
where empresa is null or btrim(empresa) = '';

alter table public.mr_centros_custo
  alter column empresa set not null;

create unique index if not exists mr_centros_custo_empresa_nome_uidx
  on public.mr_centros_custo (empresa, lower(btrim(nome)));

create index if not exists mr_centros_custo_empresa_idx
  on public.mr_centros_custo (empresa);

-- RLS por empresa (igual contas/contratos).
drop policy if exists mr_centros_custo_select on public.mr_centros_custo;
create policy mr_centros_custo_select on public.mr_centros_custo
  for select to authenticated
  using (public.mr_pode_empresa(empresa));

drop policy if exists mr_centros_custo_insert on public.mr_centros_custo;
create policy mr_centros_custo_insert on public.mr_centros_custo
  for insert to authenticated
  with check (public.mr_pode_empresa(empresa));

drop policy if exists mr_centros_custo_update on public.mr_centros_custo;
create policy mr_centros_custo_update on public.mr_centros_custo
  for update to authenticated
  using (public.mr_pode_empresa(empresa))
  with check (public.mr_pode_empresa(empresa));

drop policy if exists mr_centros_custo_delete on public.mr_centros_custo;
create policy mr_centros_custo_delete on public.mr_centros_custo
  for delete to authenticated
  using (public.mr_pode_empresa(empresa));

notify pgrst, 'reload schema';
