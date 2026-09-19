-- Urgência nas demandas (layout Gestão de Demandas)

alter table public.demandas
  add column if not exists urgencia text not null default 'normal';

alter table public.demandas drop constraint if exists demandas_urgencia_check;
alter table public.demandas
  add constraint demandas_urgencia_check
  check (urgencia in ('baixa', 'normal', 'alta', 'urgente'));

notify pgrst, 'reload schema';
