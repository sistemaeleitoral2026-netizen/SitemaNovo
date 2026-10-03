-- Telefone em coordenadores (WhatsApp no Progresso).
-- Rode no SQL Editor do Supabase se aparecer:
-- "column coordenadores.telefone does not exist"

alter table public.coordenadores
  add column if not exists telefone text;

alter table public.lideres
  add column if not exists telefone text;

notify pgrst, 'reload schema';
