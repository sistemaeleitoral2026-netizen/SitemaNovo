-- Rode no SQL Editor do projeto GABINETE, depois de mandato_vinculo.sql.
-- Não rode no Nerites.

do $$
begin
  if to_regclass('public.cadastros') is not null then
    raise exception 'Este SQL é do projeto GABINETE. O Nerites já tem cadastros. Pare aqui.';
  end if;
end $$;

create table if not exists public.proposicoes (
  id bigint primary key,
  identificacao text not null unique,
  tipo text not null,
  numero text,
  ano int,
  assunto text,
  url text not null,
  vereador_slug text default 'matheus-do-beiju',
  ultimo_andamento text,
  data_ultimo_andamento date,
  total_tramitacoes int default 0,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.proposicoes_tramitacoes (
  id bigserial primary key,
  proposicao_id bigint not null references public.proposicoes(id) on delete cascade,
  ordem int not null,
  data_andamento date not null,
  andamento text not null,
  created_at timestamptz default timezone('utc', now()),
  unique (proposicao_id, ordem, data_andamento, andamento)
);

create table if not exists public.proposicoes_documentos (
  id bigserial primary key,
  proposicao_id bigint not null references public.proposicoes(id) on delete cascade,
  titulo text not null,
  url text not null,
  download_url text,
  created_at timestamptz default timezone('utc', now()),
  unique (proposicao_id, url)
);

create table if not exists public.proposicoes_autores (
  id bigserial primary key,
  proposicao_id bigint not null references public.proposicoes(id) on delete cascade,
  nome text not null,
  partido text,
  link text,
  created_at timestamptz default timezone('utc', now()),
  unique (proposicao_id, nome)
);

alter table public.proposicoes enable row level security;
alter table public.proposicoes_tramitacoes enable row level security;
alter table public.proposicoes_documentos enable row level security;
alter table public.proposicoes_autores enable row level security;

revoke all on public.proposicoes from anon, authenticated;
revoke all on public.proposicoes_tramitacoes from anon, authenticated;
revoke all on public.proposicoes_documentos from anon, authenticated;
revoke all on public.proposicoes_autores from anon, authenticated;

grant select on public.proposicoes to anon, authenticated;
grant select on public.proposicoes_tramitacoes to anon, authenticated;
grant select on public.proposicoes_documentos to anon, authenticated;
grant select on public.proposicoes_autores to anon, authenticated;

drop policy if exists "leitura proposicoes" on public.proposicoes;
drop policy if exists "leitura tramitacoes" on public.proposicoes_tramitacoes;
drop policy if exists "leitura documentos" on public.proposicoes_documentos;
drop policy if exists "leitura autores" on public.proposicoes_autores;

create policy "leitura proposicoes" on public.proposicoes for select to anon, authenticated using (true);
create policy "leitura tramitacoes" on public.proposicoes_tramitacoes for select to anon, authenticated using (true);
create policy "leitura documentos" on public.proposicoes_documentos for select to anon, authenticated using (true);
create policy "leitura autores" on public.proposicoes_autores for select to anon, authenticated using (true);
