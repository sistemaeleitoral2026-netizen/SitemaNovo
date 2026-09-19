-- Endereço completo na ficha (opcional — não quebra cadastros em andamento)

alter table public.cadastros
  add column if not exists endereco text;

alter table public.cadastros
  add column if not exists numero text;

alter table public.cadastros
  add column if not exists complemento text;

alter table public.cadastros
  add column if not exists bairro text;

comment on column public.cadastros.endereco is 'Logradouro (rua/avenida) — opcional';
comment on column public.cadastros.numero is 'Número da casa — opcional';
comment on column public.cadastros.complemento is 'Complemento (apto, bloco) — opcional';
comment on column public.cadastros.bairro is 'Bairro — opcional';
