-- Histórico de baixas/recebimentos por lançamento (opcional; o app também
-- guarda em observacao se a coluna ainda não existir).
alter table public.mb_lancamentos
  add column if not exists recebimentos jsonb not null default '[]'::jsonb;
