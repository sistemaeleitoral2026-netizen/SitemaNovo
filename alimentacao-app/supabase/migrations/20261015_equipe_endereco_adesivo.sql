-- Endereço do adesivo residencial também para lideranças e coordenadores
-- (Formigas informam CEP/rua como nos eleitores)

do $$
declare
  t text;
begin
  foreach t in array array['lideres', 'coordenadores']
  loop
    execute format('alter table public.%I add column if not exists cep text', t);
    execute format('alter table public.%I add column if not exists endereco text not null default ''''', t);
    execute format('alter table public.%I add column if not exists numero text not null default ''''', t);
    execute format('alter table public.%I add column if not exists complemento text not null default ''''', t);
    execute format('alter table public.%I add column if not exists bairro text not null default ''''', t);
    execute format('alter table public.%I add column if not exists cidade text not null default ''''', t);
    execute format('alter table public.%I add column if not exists uf text not null default ''''', t);
    execute format('alter table public.%I add column if not exists lat double precision', t);
    execute format('alter table public.%I add column if not exists lng double precision', t);
  end loop;
end $$;

comment on column public.lideres.cep is 'CEP da casa com adesivo (Formigas)';
comment on column public.coordenadores.cep is 'CEP da casa com adesivo (Formigas)';

notify pgrst, 'reload schema';
