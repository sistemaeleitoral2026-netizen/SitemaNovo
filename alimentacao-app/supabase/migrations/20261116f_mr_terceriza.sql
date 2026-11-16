-- EMPRESAS (MR Terceriza) — rode no SQL Editor do projeto NERITES
-- (mesmo banco de https://uzewhebfshmhuymgungr.supabase.co).
-- Pode rodar de novo sem perder dados.
--
-- Prefixo mr_* para não misturar com mb_* (Assessoria MB), fin_* (Gabinete)
-- nem financeiro_* (Nerites).
--
-- As 7 empresas (MR, RE FASHION, IRON, GLOBO, MCC, LIMPOCAR SEMINOVOS,
-- TIPS GRÁF) continuam fixas no código do painel (não viram cadastro aqui) —
-- só os LANÇAMENTOS, CONTAS BANCÁRIAS, ANEXOS e AUDITORIA viram banco de
-- verdade. O "id" de empresa usado nas tabelas abaixo é o slug fixo
-- ('mr', 're-fashion', 'iron', 'globo', 'mcc', 'limpocar', 'tips-graf').

do $$
begin
  if to_regclass('public.cadastros') is null then
    raise exception 'Este SQL é do projeto NERITES (precisa existir public.cadastros). Pare aqui.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'acessos_externos'
  ) then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116b_acessos_externos.sql antes deste. Pare aqui.';
  end if;
end $$;

-- Quem pode abrir o painel Empresas e ler/escrever os dados dele.
-- Espelha a regra que já vale hoje na tela (DemoSiteRoute em App.tsx):
-- admin do Nerites, OU qualquer cargo do Nerites que não seja "externo"
-- (diretoria/operador/mobilizador/administrativo/coordenador/auxiliar — hoje
-- qualquer um desses abre a tela se escolher "Empresas" no login), OU um
-- login "externo" com acesso extra cadastrado em /admin pra "mr-terceiriza".
create or replace function public.can_access_mr_terceriza()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and (
        p.role <> 'externo'
        or p.acessos_externos ? 'mr-terceiriza'
      )
  );
$$;

revoke all on function public.can_access_mr_terceriza() from public;
grant execute on function public.can_access_mr_terceriza() to authenticated;

-- Nível "admin" (Nerites admin, ou acesso extra "admin" cadastrado em
-- /admin) — só quem tem isso exclui lançamento/anexo de QUALQUER pessoa.
-- Quem não é admin só exclui o que ele mesmo lançou (checado na policy de
-- DELETE via created_by = auth.uid(), não precisa de função separada).
create or replace function public.is_admin_mr_terceriza()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.ativo = true
        and p.acessos_externos ->> 'mr-terceiriza' = 'admin'
    );
$$;

revoke all on function public.is_admin_mr_terceriza() from public;
grant execute on function public.is_admin_mr_terceriza() to authenticated;

-- ============ CONTAS BANCÁRIAS ============
-- Espelha o mapa `accounts[company]` do painel.

create table if not exists public.mr_contas (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,                  -- slug fixo: mr, re-fashion, iron...
  nome text not null,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists mr_contas_empresa_idx
  on public.mr_contas (empresa);

-- ============ LANÇAMENTOS (ENTRADAS/SAÍDAS) ============
-- Espelha o array `entries` do painel.

create table if not exists public.mr_lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,                  -- slug fixo da empresa
  data date not null,
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text not null default '',
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  conta text,                              -- nome de uma linha de mr_contas
  forma_pagamento text,                    -- PIX, Transferência bancária, Dinheiro, Boleto, Outro
  observacoes text,
  status text not null default 'aprovado'
    check (status in ('aprovado', 'revisao', 'sem-comprovante')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null
);

create index if not exists mr_lancamentos_data_idx
  on public.mr_lancamentos (data desc);

create index if not exists mr_lancamentos_empresa_idx
  on public.mr_lancamentos (empresa);

create index if not exists mr_lancamentos_status_idx
  on public.mr_lancamentos (status);

-- ============ AUDITORIA DO PAINEL ============

create table if not exists public.mr_auditoria (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_nome text,
  action text not null,
  detail text,
  empresa text,
  created_at timestamptz not null default now()
);

create index if not exists mr_auditoria_at_idx
  on public.mr_auditoria (at desc);

-- ============ ANEXOS / COMPROVANTES ============
-- Metadados; arquivo fica no Storage bucket mr-comprovantes.

create table if not exists public.mr_anexos (
  id uuid primary key default gen_random_uuid(),
  entidade text not null check (entidade in ('lancamento')),
  entidade_id uuid not null,
  nome text not null,
  mime text,
  tamanho bigint,
  storage_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create index if not exists mr_anexos_entidade_idx
  on public.mr_anexos (entidade, entidade_id);

-- ============ SEEDS (contas padrão que já existem no protótipo) ============

insert into public.mr_contas (empresa, nome, ordem)
select v.empresa, v.nome, v.ordem
from (values
  ('mr', 'Mateus do Beiju', 0),
  ('mr', 'Conta operacional', 1),
  ('mr', 'Caixa', 2),
  ('re-fashion', 'Conta operacional', 1),
  ('re-fashion', 'Caixa', 2),
  ('iron', 'Conta operacional', 1),
  ('iron', 'Caixa', 2),
  ('globo', 'Conta operacional', 1),
  ('globo', 'Caixa', 2),
  ('mcc', 'Conta operacional', 1),
  ('mcc', 'Caixa', 2),
  ('limpocar', 'Conta operacional', 1),
  ('limpocar', 'Caixa', 2),
  ('tips-graf', 'Conta operacional', 1),
  ('tips-graf', 'Caixa', 2)
) as v(empresa, nome, ordem)
where not exists (
  select 1 from public.mr_contas c where c.empresa = v.empresa and c.nome = v.nome
);

-- ============ RLS ============

alter table public.mr_contas enable row level security;
alter table public.mr_lancamentos enable row level security;
alter table public.mr_auditoria enable row level security;
alter table public.mr_anexos enable row level security;

-- Contas bancárias: ler/criar quem acessa o painel. Sem editar/excluir por
-- enquanto (o painel também não oferece isso hoje).
drop policy if exists mr_contas_select on public.mr_contas;
create policy mr_contas_select on public.mr_contas
  for select to authenticated
  using (public.can_access_mr_terceriza());

drop policy if exists mr_contas_insert on public.mr_contas;
create policy mr_contas_insert on public.mr_contas
  for insert to authenticated
  with check (public.can_access_mr_terceriza());

-- Lançamentos: ler/criar/editar quem acessa; excluir só quem lançou ou admin.
drop policy if exists mr_lancamentos_select on public.mr_lancamentos;
create policy mr_lancamentos_select on public.mr_lancamentos
  for select to authenticated
  using (public.can_access_mr_terceriza());

drop policy if exists mr_lancamentos_insert on public.mr_lancamentos;
create policy mr_lancamentos_insert on public.mr_lancamentos
  for insert to authenticated
  with check (public.can_access_mr_terceriza());

drop policy if exists mr_lancamentos_update on public.mr_lancamentos;
create policy mr_lancamentos_update on public.mr_lancamentos
  for update to authenticated
  using (public.can_access_mr_terceriza())
  with check (public.can_access_mr_terceriza());

drop policy if exists mr_lancamentos_delete on public.mr_lancamentos;
create policy mr_lancamentos_delete on public.mr_lancamentos
  for delete to authenticated
  using (
    public.can_access_mr_terceriza()
    and (public.is_admin_mr_terceriza() or created_by = auth.uid())
  );

-- Anexos: mesma regra dos lançamentos (ler/criar quem acessa; excluir quem
-- anexou ou admin).
drop policy if exists mr_anexos_select on public.mr_anexos;
create policy mr_anexos_select on public.mr_anexos
  for select to authenticated
  using (public.can_access_mr_terceriza());

drop policy if exists mr_anexos_insert on public.mr_anexos;
create policy mr_anexos_insert on public.mr_anexos
  for insert to authenticated
  with check (public.can_access_mr_terceriza());

drop policy if exists mr_anexos_delete on public.mr_anexos;
create policy mr_anexos_delete on public.mr_anexos
  for delete to authenticated
  using (
    public.can_access_mr_terceriza()
    and (public.is_admin_mr_terceriza() or created_by = auth.uid())
  );

-- Auditoria: todo mundo que acessa lê/grava. O painel reenvia a lista
-- inteira de auditoria a cada salvamento (upsert por id) e, quando corta o
-- histórico antigo do próprio array local, isso vira um DELETE no banco —
-- por isso UPDATE e DELETE aqui liberam pra quem acessa o painel (não só
-- admin), senão o salvamento de um usuário comum quebra por RLS.
drop policy if exists mr_auditoria_select on public.mr_auditoria;
create policy mr_auditoria_select on public.mr_auditoria
  for select to authenticated
  using (public.can_access_mr_terceriza());

drop policy if exists mr_auditoria_insert on public.mr_auditoria;
create policy mr_auditoria_insert on public.mr_auditoria
  for insert to authenticated
  with check (public.can_access_mr_terceriza());

drop policy if exists mr_auditoria_update on public.mr_auditoria;
create policy mr_auditoria_update on public.mr_auditoria
  for update to authenticated
  using (public.can_access_mr_terceriza())
  with check (public.can_access_mr_terceriza());

drop policy if exists mr_auditoria_delete on public.mr_auditoria;
create policy mr_auditoria_delete on public.mr_auditoria
  for delete to authenticated
  using (public.can_access_mr_terceriza());

-- ============ STORAGE ============

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mr-comprovantes',
  'mr-comprovantes',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists mr_comprovantes_select on storage.objects;
create policy mr_comprovantes_select on storage.objects
  for select to authenticated
  using (bucket_id = 'mr-comprovantes' and public.can_access_mr_terceriza());

drop policy if exists mr_comprovantes_insert on storage.objects;
create policy mr_comprovantes_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mr-comprovantes' and public.can_access_mr_terceriza());

drop policy if exists mr_comprovantes_update on storage.objects;
create policy mr_comprovantes_update on storage.objects
  for update to authenticated
  using (bucket_id = 'mr-comprovantes' and public.can_access_mr_terceriza())
  with check (bucket_id = 'mr-comprovantes' and public.can_access_mr_terceriza());

-- Igual mb-comprovantes: quem tem acesso ao painel apaga o arquivo (a regra
-- fina de "só quem anexou ou admin" já vale pro metadado em mr_anexos acima;
-- storage.objects não guarda quem criou de um jeito confiável pra checar aqui).
drop policy if exists mr_comprovantes_delete on storage.objects;
create policy mr_comprovantes_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'mr-comprovantes' and public.can_access_mr_terceriza());

notify pgrst, 'reload schema';
