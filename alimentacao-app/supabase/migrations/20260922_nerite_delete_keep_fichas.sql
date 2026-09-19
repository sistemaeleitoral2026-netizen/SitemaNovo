-- Permite excluir nerite mantendo as fichas (operator_id fica null)

alter table public.cadastros
  alter column operator_id drop not null;

alter table public.cadastros
  drop constraint if exists cadastros_operator_id_fkey;

alter table public.cadastros
  add constraint cadastros_operator_id_fkey
  foreign key (operator_id) references public.profiles(id) on delete set null;

alter table public.importacoes
  alter column operator_id drop not null;

alter table public.importacoes
  drop constraint if exists importacoes_operator_id_fkey;

alter table public.importacoes
  add constraint importacoes_operator_id_fkey
  foreign key (operator_id) references public.profiles(id) on delete set null;

alter table public.auditoria
  drop constraint if exists auditoria_actor_id_fkey;

alter table public.auditoria
  add constraint auditoria_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;

comment on column public.cadastros.operator_id is
  'Nerite que cadastrou; null se a conta foi excluída (ficha permanece)';
