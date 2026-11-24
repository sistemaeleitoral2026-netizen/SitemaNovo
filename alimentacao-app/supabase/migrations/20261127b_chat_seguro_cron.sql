-- Chat Seguro — limpeza automática a cada 1 minuto (rode DEPOIS de 20261127_chat_seguro.sql
-- e depois que /api/chat-cleanup estiver publicado na Vercel).
-- Antes: Database > Extensions > ative "pg_cron" e "pg_net".
-- Troque SEU_CHAT_WEBHOOK_SECRET pelo mesmo valor da variável CHAT_WEBHOOK_SECRET da Vercel.
-- É UM job global — não crie um job por mensagem.
select cron.schedule(
  'chat-seguro-cleanup', '* * * * *',
  $$ select net.http_post(
       url := 'https://sitema-novo.vercel.app/api/chat-cleanup',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', 'SEU_CHAT_WEBHOOK_SECRET'),
       body := '{}'::jsonb) $$
);
-- Mesmo antes da limpeza física rodar, o RLS já esconde tudo que expirou.
