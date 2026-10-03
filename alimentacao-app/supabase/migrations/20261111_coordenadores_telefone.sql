-- Telefone oficial do coordenador (WhatsApp / Formigas / Progresso).
alter table public.coordenadores
  add column if not exists telefone text;

alter table public.lideres
  add column if not exists telefone text;

notify pgrst, 'reload schema';
