-- Allow optional fields on cadastros (no required form fields)
alter table public.cadastros alter column nome_completo drop not null;
alter table public.cadastros alter column telefone drop not null;
alter table public.cadastros alter column titulo drop not null;
alter table public.cadastros alter column zona drop not null;
alter table public.cadastros alter column secao drop not null;
alter table public.cadastros alter column nome_mae drop not null;

alter table public.cadastros alter column nome_completo set default '';
alter table public.cadastros alter column telefone set default '';
alter table public.cadastros alter column zona set default '';
alter table public.cadastros alter column secao set default '';
alter table public.cadastros alter column nome_mae set default '';
alter table public.cadastros alter column coordenador set default '';
alter table public.cadastros alter column lider set default '';

-- Unique titulo only when filled (multiple empty/null allowed)
alter table public.cadastros drop constraint if exists cadastros_titulo_unique;
drop index if exists cadastros_titulo_unique;
create unique index if not exists cadastros_titulo_unique_filled
  on public.cadastros (titulo)
  where titulo is not null and btrim(titulo) <> '';
