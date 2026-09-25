alter table public.relatorio_fichas_txt
  add column if not exists zona text not null default '';

alter table public.relatorio_fichas_txt
  add column if not exists secao text not null default '';

notify pgrst, 'reload schema';
