-- Rode no SQL Editor do Supabase.
-- Financeiro: cada coordenação e cada liderança têm pagamento próprio.
-- Diretoria só agrupa (sem valor devido).

alter table public.financeiro_coordenador
  add column if not exists lider_id uuid references public.lideres (id) on delete cascade;

alter table public.financeiro_lancamentos
  add column if not exists lider_id uuid references public.lideres (id) on delete cascade;

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.financeiro_coordenador'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) ilike '%diretoria_id%'
    and pg_get_constraintdef(oid) ilike '%coordenador_id%'
    and pg_get_constraintdef(oid) not ilike '%lider_id%';
  if cname is not null then
    execute format('alter table public.financeiro_coordenador drop constraint %I', cname);
  end if;
end $$;

alter table public.financeiro_coordenador
  drop constraint if exists financeiro_coordenador_diretoria_id_coordenador_id_key;

create unique index if not exists financeiro_devido_coord_uidx
  on public.financeiro_coordenador (diretoria_id, coordenador_id)
  where lider_id is null;

create unique index if not exists financeiro_devido_lider_uidx
  on public.financeiro_coordenador (diretoria_id, lider_id)
  where lider_id is not null;

create index if not exists financeiro_coordenador_lider_idx
  on public.financeiro_coordenador (lider_id)
  where lider_id is not null;

create index if not exists financeiro_lancamentos_lider_idx
  on public.financeiro_lancamentos (lider_id)
  where lider_id is not null;

notify pgrst, 'reload schema';

-- Conferência
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('financeiro_coordenador', 'financeiro_lancamentos')
  and column_name = 'lider_id';
