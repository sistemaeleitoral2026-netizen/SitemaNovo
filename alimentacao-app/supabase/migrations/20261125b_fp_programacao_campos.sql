-- Campos próprios de Documentação e Cobrança (não misturar com recebedor/valor de pagamento).

alter table public.fp_tarefas
  add column if not exists cobrado text not null default '';

alter table public.fp_tarefas
  add column if not exists responsavel_doc text not null default '';

comment on column public.fp_tarefas.cobrado is
  'Cobrança: quem será cobrado (independente do recebedor de pagamento)';
comment on column public.fp_tarefas.responsavel_doc is
  'Documentação: quem deve resolver (sem relação financeira)';
