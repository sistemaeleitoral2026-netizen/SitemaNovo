-- Contato/telefone das lideranças (WhatsApp na Equipe e na ficha)

alter table public.lideres
  add column if not exists telefone text;

comment on column public.lideres.telefone is 'Telefone/WhatsApp da liderança (DDD + número)';
