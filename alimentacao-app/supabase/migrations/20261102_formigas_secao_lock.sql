-- Formigas: data do primeiro lançamento por seção + trava de moto/adesivo.

do $$
declare
  t text;
begin
  foreach t in array array['cadastros', 'lideres', 'coordenadores']
  loop
    execute format('alter table public.%I add column if not exists formigas_wa_em timestamptz', t);
    execute format('alter table public.%I add column if not exists formigas_carros_em timestamptz', t);
    execute format('alter table public.%I add column if not exists formigas_casa_em timestamptz', t);
    execute format('alter table public.%I add column if not exists formigas_links_em timestamptz', t);
  end loop;
end $$;
