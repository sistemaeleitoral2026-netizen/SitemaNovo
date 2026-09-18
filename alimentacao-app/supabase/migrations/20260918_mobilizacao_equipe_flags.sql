-- Mobilização também para coordenadores e lideranças (eles como pessoa)
alter table public.coordenadores
  add column if not exists adesivou_carro boolean not null default false;

alter table public.coordenadores
  add column if not exists postou_rede boolean not null default false;

alter table public.lideres
  add column if not exists adesivou_carro boolean not null default false;

alter table public.lideres
  add column if not exists postou_rede boolean not null default false;

comment on column public.coordenadores.adesivou_carro is 'Coordenador adesivou o carro';
comment on column public.coordenadores.postou_rede is 'Coordenador postou nas redes';
comment on column public.lideres.adesivou_carro is 'Liderança adesivou o carro';
comment on column public.lideres.postou_rede is 'Liderança postou nas redes';
