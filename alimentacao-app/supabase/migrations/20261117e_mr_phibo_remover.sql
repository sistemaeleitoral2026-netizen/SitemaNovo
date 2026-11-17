-- EMPRESAS (MR Terceriza) — DESFAZ a integração Phibo (20261117c/d).
-- Rode no SQL Editor do projeto NERITES. Pode rodar de novo sem problema.
--
-- Motivo: a API do Phibo fica atrás de um desafio anti-bot (AWS WAF Bot
-- Control) que só um navegador de verdade resolve — não dá pra chamar de
-- forma automática nem da Vercel nem de um script local. Confirmado no HAR
-- da sessão do Phibo (chamadas a *.token.awswaf.com antes de cada request).
-- Em vez de tentar contornar a proteção anti-bot de um sistema de terceiros,
-- a integração foi removida. As vendas da RE FASHION voltam a ser lançadas
-- manualmente, como qualquer outro lançamento.

select cron.unschedule('mr-phibo-vendas')
where exists (select 1 from cron.job where jobname = 'mr-phibo-vendas');

drop function if exists public.mr_phibo_rodar();
drop function if exists public.mr_phibo_marcar_ok();
drop function if exists public.mr_phibo_ler_refresh();
drop function if exists public.mr_phibo_status();
drop function if exists public.mr_phibo_conectar(text);

drop policy if exists mr_phibo_resumo_write on public.mr_phibo_resumo;
drop policy if exists mr_phibo_resumo_select on public.mr_phibo_resumo;
drop table if exists public.mr_phibo_resumo;
drop table if exists public.mr_phibo_sessao;

alter table public.mr_lancamentos drop column if exists origem;

notify pgrst, 'reload schema';
