-- Relatório TXT passa a gravar id da ficha e CPF para localizar e corrigir.

alter table public.relatorio_fichas_txt
  add column if not exists cadastro_id uuid references public.cadastros(id) on delete set null;

alter table public.relatorio_fichas_txt
  add column if not exists cpf text not null default '';

create unique index if not exists relatorio_fichas_txt_cadastro_id_uidx
  on public.relatorio_fichas_txt (cadastro_id)
  where cadastro_id is not null;

notify pgrst, 'reload schema';
