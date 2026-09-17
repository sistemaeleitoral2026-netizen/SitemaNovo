alter table public.cadastros
  add column if not exists data_nascimento date;

comment on column public.cadastros.data_nascimento is 'Data de nascimento do eleitor informada na ficha';
