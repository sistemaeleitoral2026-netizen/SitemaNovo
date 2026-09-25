-- WhatsApp do motorista na Garagem.

alter table public.garagem_carros
  add column if not exists telefone text not null default '';

notify pgrst, 'reload schema';
