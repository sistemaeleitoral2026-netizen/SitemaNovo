-- Múltiplas fotos por demanda

alter table public.demandas
  add column if not exists foto_paths text[] not null default '{}';

update public.demandas
set foto_paths = array[foto_path]
where foto_path is not null
  and foto_path <> ''
  and (foto_paths is null or cardinality(foto_paths) = 0);

notify pgrst, 'reload schema';
