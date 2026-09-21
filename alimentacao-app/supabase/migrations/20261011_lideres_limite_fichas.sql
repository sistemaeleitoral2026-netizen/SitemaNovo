-- Limite de fichas por liderança (padrão 20; editável no Equipe)

alter table public.lideres
  add column if not exists limite_fichas integer not null default 20;

alter table public.lideres
  drop constraint if exists lideres_limite_fichas_check;

alter table public.lideres
  add constraint lideres_limite_fichas_check check (limite_fichas >= 1 and limite_fichas <= 9999);

comment on column public.lideres.limite_fichas is
  'Meta de fichas da liderança (padrão 20). Editável no Equipe. Não bloqueia cadastros acima da meta.';

notify pgrst, 'reload schema';
