-- Mobilização: quantidades (carros, adesivos casa, postagens)
-- Substitui boolean adesivou_carro / postou_rede — tudo inicia em 0

alter table public.cadastros
  add column if not exists carros_adesivados integer not null default 0;
alter table public.cadastros
  add column if not exists adesivos_casa integer not null default 0;
alter table public.cadastros
  add column if not exists postagens integer not null default 0;

alter table public.coordenadores
  add column if not exists carros_adesivados integer not null default 0;
alter table public.coordenadores
  add column if not exists adesivos_casa integer not null default 0;
alter table public.coordenadores
  add column if not exists postagens integer not null default 0;

alter table public.lideres
  add column if not exists carros_adesivados integer not null default 0;
alter table public.lideres
  add column if not exists adesivos_casa integer not null default 0;
alter table public.lideres
  add column if not exists postagens integer not null default 0;

drop index if exists public.cadastros_adesivou_carro_idx;
drop index if exists public.cadastros_postou_rede_idx;

alter table public.cadastros drop column if exists adesivou_carro;
alter table public.cadastros drop column if exists postou_rede;
alter table public.coordenadores drop column if exists adesivou_carro;
alter table public.coordenadores drop column if exists postou_rede;
alter table public.lideres drop column if exists adesivou_carro;
alter table public.lideres drop column if exists postou_rede;

comment on column public.cadastros.carros_adesivados is 'Quantidade de carros adesivados';
comment on column public.cadastros.adesivos_casa is 'Quantidade de adesivos para casa';
comment on column public.cadastros.postagens is 'Quantidade de postagens';
comment on column public.coordenadores.carros_adesivados is 'Quantidade de carros adesivados';
comment on column public.coordenadores.adesivos_casa is 'Quantidade de adesivos para casa';
comment on column public.coordenadores.postagens is 'Quantidade de postagens';
comment on column public.lideres.carros_adesivados is 'Quantidade de carros adesivados';
comment on column public.lideres.adesivos_casa is 'Quantidade de adesivos para casa';
comment on column public.lideres.postagens is 'Quantidade de postagens';
