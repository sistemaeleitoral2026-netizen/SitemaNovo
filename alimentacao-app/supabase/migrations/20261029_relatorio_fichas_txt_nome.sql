alter table public.relatorio_fichas_txt
  add column if not exists nome text not null default '';

notify pgrst, 'reload schema';
