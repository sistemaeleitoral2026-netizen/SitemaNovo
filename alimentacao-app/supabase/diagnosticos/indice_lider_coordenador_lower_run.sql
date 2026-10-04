-- Índices para listagem/filtro de votação por liderança e coordenação.
-- Sem CONCURRENTLY (o SQL Editor do Supabase roda em transação e bloqueia isso).
-- Rode no SQL Editor do Supabase.

create index if not exists cadastros_lider_lower_idx
  on public.cadastros (lower(btrim(lider)));

create index if not exists cadastros_coordenador_lower_idx
  on public.cadastros (lower(btrim(coordenador)));

create index if not exists cadastros_coord_lider_lower_idx
  on public.cadastros (lower(btrim(coordenador)), lower(btrim(lider)));
