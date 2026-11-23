-- MR Terceiriza: cadastro central de contas bancárias, com descrição,
-- observações e vínculo da mesma conta com uma ou várias empresas.
-- Cada vínculo continua sendo uma linha em mr_contas para preservar as RLS e
-- os lançamentos antigos; grupo_id reúne essas linhas como um único cadastro.

alter table public.mr_contas
  add column if not exists grupo_id uuid,
  add column if not exists descricao text,
  add column if not exists observacoes text;

update public.mr_contas
set grupo_id = id
where grupo_id is null;

-- As contas padrão antigas foram criadas uma vez por empresa. Agrupa as de
-- mesmo nome para que já apareçam como um único cadastro compartilhado.
with grupos as (
  select lower(btrim(nome)) as chave, min(id::text)::uuid as grupo_id
  from public.mr_contas
  group by lower(btrim(nome))
)
update public.mr_contas c
set grupo_id = g.grupo_id
from grupos g
where lower(btrim(c.nome)) = g.chave;

alter table public.mr_contas
  alter column grupo_id set not null;

create index if not exists mr_contas_grupo_idx
  on public.mr_contas (grupo_id);

create unique index if not exists mr_contas_grupo_empresa_uidx
  on public.mr_contas (grupo_id, empresa);

-- O painel usa exclusão segura (ativo=false), para não apagar o histórico de
-- lançamentos que já referencia a conta. Edição e reativação precisam de UPDATE.
drop policy if exists mr_contas_update on public.mr_contas;
create policy mr_contas_update on public.mr_contas
  for update to authenticated
  using (public.mr_pode_empresa(empresa))
  with check (public.mr_pode_empresa(empresa));

notify pgrst, 'reload schema';
