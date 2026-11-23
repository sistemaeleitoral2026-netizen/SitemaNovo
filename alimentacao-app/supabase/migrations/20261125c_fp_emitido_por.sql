-- Quem emitiu a programação (nome legível; created_by continua sendo o uuid).

alter table public.fp_tarefas
  add column if not exists emitido_por text not null default '';

comment on column public.fp_tarefas.emitido_por is
  'Nome de quem cadastrou a programação (visível na tabela)';
