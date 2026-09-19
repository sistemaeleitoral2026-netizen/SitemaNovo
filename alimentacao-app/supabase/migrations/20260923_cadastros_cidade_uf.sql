-- Cidade/UF do endereço (ViaCEP) — opcional

alter table public.cadastros
  add column if not exists cidade text;

alter table public.cadastros
  add column if not exists uf text;

comment on column public.cadastros.cidade is 'Cidade (ViaCEP) — opcional';
comment on column public.cadastros.uf is 'UF (ViaCEP) — opcional';
