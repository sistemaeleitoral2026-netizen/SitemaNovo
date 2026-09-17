-- Add coordenador to cadastros (nerite informs coordinator per ficha)
alter table public.cadastros
  add column if not exists coordenador text;

update public.cadastros
set coordenador = ''
where coordenador is null;

alter table public.cadastros
  alter column coordenador set default '';

-- Keep existing rows valid; new inserts should send coordenador from the app.
comment on column public.cadastros.coordenador is 'Nome do coordenador informado pela nerite na ficha';
