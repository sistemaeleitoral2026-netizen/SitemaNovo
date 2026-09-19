-- Contato WhatsApp no módulo Formigas

alter table public.cadastros
  add column if not exists contato_whatsapp boolean not null default false;

alter table public.lideres
  add column if not exists contato_whatsapp boolean not null default false;

alter table public.coordenadores
  add column if not exists contato_whatsapp boolean not null default false;

notify pgrst, 'reload schema';
