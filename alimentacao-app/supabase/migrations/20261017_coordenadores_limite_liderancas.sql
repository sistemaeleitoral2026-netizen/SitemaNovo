-- Meta de lideranças por coordenador (padrão 20; editável no Equipe)

alter table public.coordenadores
  add column if not exists limite_liderancas integer not null default 20;

alter table public.coordenadores
  drop constraint if exists coordenadores_limite_liderancas_check;

alter table public.coordenadores
  add constraint coordenadores_limite_liderancas_check
  check (limite_liderancas >= 1 and limite_liderancas <= 9999);

comment on column public.coordenadores.limite_liderancas is
  'Meta de lideranças do coordenador (padrão 20). Editável no Equipe. Não bloqueia cadastros acima da meta.';

notify pgrst, 'reload schema';
