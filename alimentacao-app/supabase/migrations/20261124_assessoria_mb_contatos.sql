-- Assessoria MB: histórico de contatos de cobrança nos lançamentos pendentes.
-- Cada item: { id, data, nota, previsao, actor, at }.

begin;

alter table public.mb_lancamentos
  add column if not exists contatos jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

commit;
