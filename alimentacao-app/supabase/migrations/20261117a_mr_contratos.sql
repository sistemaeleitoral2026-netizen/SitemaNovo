-- EMPRESAS (MR Terceriza) — CONTRATOS, CENTROS DE CUSTO e PERMISSÕES POR EMPRESA
-- Rode no SQL Editor do projeto NERITES. Pode rodar de novo sem perder dados.
--
-- Este arquivo só CRIA estrutura (não muda quem vê o quê no banco ainda).
-- A trava por empresa no banco fica em 20261117b_mr_permissoes_rls.sql —
-- rode aquele só depois de liberar as empresas de cada editor na tela Usuários.

do $$
begin
  if to_regclass('public.mr_lancamentos') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116f_mr_terceriza.sql antes deste. Pare aqui.';
  end if;
end $$;

-- ============ CENTROS DE CUSTO (lista única, vale pra todas as empresas) ============

create table if not exists public.mr_centros_custo (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

-- ============ CONTRATOS ============
-- Valor total dividido em "meses" parcelas previstas a partir de "inicio"
-- (primeiro dia do mês). Entradas/saídas se ligam via mr_lancamentos.contrato_id.

create table if not exists public.mr_contratos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,                  -- slug fixo: mr, globo, mcc...
  nome text not null,
  valor_total numeric(14, 2) not null default 0 check (valor_total >= 0),
  centro_custo text,                      -- nome de uma linha de mr_centros_custo
  inicio date not null,
  meses int not null default 1 check (meses between 1 and 240),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null
);

create index if not exists mr_contratos_empresa_idx
  on public.mr_contratos (empresa);

alter table public.mr_lancamentos
  add column if not exists contrato_id uuid references public.mr_contratos (id) on delete set null;

create index if not exists mr_lancamentos_contrato_idx
  on public.mr_lancamentos (contrato_id)
  where contrato_id is not null;

-- ============ PERMISSÕES: quais empresas cada editor vê/edita ============
-- Admin (Nerites admin ou acesso extra 'admin') vê todas e não precisa de linha aqui.

create table if not exists public.mr_permissoes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  empresa text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  primary key (user_id, empresa)
);

create or replace function public.mr_pode_empresa(p_empresa text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_mr_terceriza()
    and (
      public.is_admin_mr_terceriza()
      or exists (
        select 1 from public.mr_permissoes m
        where m.user_id = auth.uid() and m.empresa = p_empresa
      )
    );
$$;

revoke all on function public.mr_pode_empresa(text) from public;
grant execute on function public.mr_pode_empresa(text) to authenticated;

-- Todos os usuários ativos do Admin do Nerites, pra tela Usuários (só admin
-- chama). Só id/nome/nível/se consegue abrir o Empresas — nada de e-mail.
drop function if exists public.list_mr_usuarios();
create or replace function public.list_mr_usuarios()
returns table (id uuid, nome text, nivel text, pode_abrir boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome,
    case
      when p.role = 'admin' or p.acessos_externos ->> 'mr-terceiriza' = 'admin' then 'admin'
      else 'editor'
    end as nivel,
    (p.role <> 'externo' or p.acessos_externos ? 'mr-terceiriza') as pode_abrir
  from public.profiles p
  where public.is_admin_mr_terceriza()
    and p.ativo = true
  order by p.nome;
$$;

revoke all on function public.list_mr_usuarios() from public;
grant execute on function public.list_mr_usuarios() to authenticated;

-- ============ RLS ============

alter table public.mr_centros_custo enable row level security;
alter table public.mr_contratos enable row level security;
alter table public.mr_permissoes enable row level security;

drop policy if exists mr_centros_custo_select on public.mr_centros_custo;
create policy mr_centros_custo_select on public.mr_centros_custo
  for select to authenticated
  using (public.can_access_mr_terceriza());

drop policy if exists mr_centros_custo_insert on public.mr_centros_custo;
create policy mr_centros_custo_insert on public.mr_centros_custo
  for insert to authenticated
  with check (public.can_access_mr_terceriza());

drop policy if exists mr_contratos_select on public.mr_contratos;
create policy mr_contratos_select on public.mr_contratos
  for select to authenticated
  using (public.mr_pode_empresa(empresa));

drop policy if exists mr_contratos_insert on public.mr_contratos;
create policy mr_contratos_insert on public.mr_contratos
  for insert to authenticated
  with check (public.mr_pode_empresa(empresa));

drop policy if exists mr_contratos_update on public.mr_contratos;
create policy mr_contratos_update on public.mr_contratos
  for update to authenticated
  using (public.mr_pode_empresa(empresa))
  with check (public.mr_pode_empresa(empresa));

drop policy if exists mr_contratos_delete on public.mr_contratos;
create policy mr_contratos_delete on public.mr_contratos
  for delete to authenticated
  using (
    public.mr_pode_empresa(empresa)
    and (public.is_admin_mr_terceriza() or created_by = auth.uid())
  );

drop policy if exists mr_permissoes_select on public.mr_permissoes;
create policy mr_permissoes_select on public.mr_permissoes
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_mr_terceriza());

drop policy if exists mr_permissoes_insert on public.mr_permissoes;
create policy mr_permissoes_insert on public.mr_permissoes
  for insert to authenticated
  with check (public.is_admin_mr_terceriza());

drop policy if exists mr_permissoes_delete on public.mr_permissoes;
create policy mr_permissoes_delete on public.mr_permissoes
  for delete to authenticated
  using (public.is_admin_mr_terceriza());

notify pgrst, 'reload schema';
