-- Índices para busca de fichas por nome, CPF, título e telefone (listagens / import).
create extension if not exists pg_trgm;

create index if not exists cadastros_nome_trgm_idx
  on public.cadastros using gin (nome_completo gin_trgm_ops);

create index if not exists cadastros_titulo_trgm_idx
  on public.cadastros using gin (titulo gin_trgm_ops);

create index if not exists cadastros_cpf_idx
  on public.cadastros (cpf)
  where nullif(btrim(cpf), '') is not null;

create index if not exists cadastros_telefone_idx
  on public.cadastros (telefone)
  where nullif(btrim(telefone), '') is not null;

notify pgrst, 'reload schema';
