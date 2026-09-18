-- CPF opcional: vários cadastros sem CPF são permitidos.
-- Antes, unique(cpf) barrava o 2º registro com cpf '' (string vazia).

update public.cadastros
set cpf = null
where cpf is not null and btrim(cpf) = '';

alter table public.cadastros drop constraint if exists cadastros_cpf_unique;
drop index if exists public.cadastros_cpf_unique;
drop index if exists public.cadastros_cpf_unique_filled;

create unique index if not exists cadastros_cpf_unique_filled
  on public.cadastros (cpf)
  where cpf is not null and btrim(cpf) <> '';

notify pgrst, 'reload schema';
