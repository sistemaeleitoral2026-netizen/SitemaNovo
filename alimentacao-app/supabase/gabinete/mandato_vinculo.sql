-- Rode este arquivo no SQL Editor do projeto GABINETE (plano free).
-- Não rode no Nerites. O bloco abaixo interrompe se achar a tabela cadastros.

do $$
begin
  if to_regclass('public.cadastros') is not null then
    raise exception 'Este SQL é do projeto GABINETE. O Nerites já tem cadastros. Pare aqui.';
  end if;
end $$;

-- Só entra quem foi usado no mandato. A ficha inteira continua no Nerites.
create table if not exists public.mandato_pessoas (
  id uuid primary key default gen_random_uuid(),
  nerites_id uuid not null,
  tipo text not null check (tipo in ('cidadao', 'lideranca')),
  nome text not null,
  telefone text,
  bairro text,
  atualizado_em timestamptz not null default now(),
  unique (tipo, nerites_id)
);

create table if not exists public.demandas (
  id uuid primary key default gen_random_uuid(),
  nerites_cadastro_id uuid,
  cidadao_nome text not null,
  titulo text not null,
  bairro text,
  status text not null default 'nova',
  criado_por uuid,
  criado_em timestamptz not null default now()
);

alter table public.mandato_pessoas enable row level security;
alter table public.demandas enable row level security;

revoke all on public.mandato_pessoas from anon, authenticated;
revoke all on public.demandas from anon, authenticated;
