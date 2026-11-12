-- AGENDAMENTO DO FINANCEIRO — rode no SQL Editor do projeto GABINETE (depois do financeiro.sql).
-- Todo dia às 9h (Brasília) o Supabase chama a rotina https://sitema-novo.vercel.app/api/folha-cron,
-- que puxa salário, VIEP e equipe dos portais da Câmara e grava nas tabelas fin_*.
--
-- ANTES DE RODAR: troque COLE_AQUI_O_CRON_SECRET pelo mesmo valor da variável CRON_SECRET da Vercel.
-- Pode rodar de novo quando quiser (ex.: para trocar o segredo): ele recria tudo sem duplicar.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Segredo guardado cifrado no cofre do Supabase (não fica visível no agendamento)
do $$
begin
  if exists (select 1 from vault.secrets where name = 'folha_cron_secret') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'folha_cron_secret'),
      'COLE_AQUI_O_CRON_SECRET'
    );
  else
    perform vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'folha_cron_secret', 'Segredo da rotina /api/folha-cron');
  end if;
end $$;

-- 2) Função que chama a rotina (também serve para rodar na mão: select public.fin_rodar_coleta();)
create or replace function public.fin_rodar_coleta()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  select net.http_get(
    url := 'https://sitema-novo.vercel.app/api/folha-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'folha_cron_secret')
    ),
    timeout_milliseconds := 60000   -- a rotina pode levar até ~1 minuto na carga inicial
  );
$$;
revoke all on function public.fin_rodar_coleta() from public, anon, authenticated;

-- 3) Agenda: todo dia às 12:00 UTC = 9:00 de Brasília
select cron.unschedule('financeiro-coleta-diaria')
where exists (select 1 from cron.job where jobname = 'financeiro-coleta-diaria');
select cron.schedule('financeiro-coleta-diaria', '0 12 * * *', 'select public.fin_rodar_coleta();');

-- 4) Carga inicial agora (grava até 4 meses por vez; rode esta linha mais 1 ou 2 vezes, com 1 minuto de intervalo)
select public.fin_rodar_coleta();

-- ================== PARA CONFERIR ==================
-- Resposta das últimas chamadas (status 200 = ok; o corpo mostra "faltam"):
--   select id, status_code, left(content::text, 300) as resposta, created
--   from net._http_response order by created desc limit 5;
-- Histórico do agendamento:
--   select status, start_time, return_message from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'financeiro-coleta-diaria')
--   order by start_time desc limit 10;
-- Desligar o agendamento:
--   select cron.unschedule('financeiro-coleta-diaria');
