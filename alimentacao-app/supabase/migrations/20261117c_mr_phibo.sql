-- EMPRESAS (MR Terceriza) — INTEGRAÇÃO PHIBO (vendas da loja RE FASHION)
-- Rode no SQL Editor do projeto NERITES, depois de 20261117a_mr_contratos.sql.
--
-- ANTES DE RODAR: troque COLE_AQUI_O_CRON_SECRET pelo mesmo valor da variável
-- CRON_SECRET da Vercel (o mesmo usado no agendamento do Financeiro).
-- Pode rodar de novo (ex.: pra trocar o segredo) sem duplicar nada.
--
-- Como funciona: de hora em hora o Supabase chama
-- https://sitema-novo.vercel.app/api/phibo-cron, que renova a sessão do Phibo
-- (refreshToken), puxa as vendas do mês e grava:
--   • uma ENTRADA por dia na RE FASHION (mr_lancamentos, origem = 'phibo');
--   • o resumo do mês (vendedoras, meta, a receber) em mr_phibo_resumo.

do $$
begin
  if to_regprocedure('public.mr_pode_empresa(text)') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261117a_mr_contratos.sql antes deste. Pare aqui.';
  end if;
end $$;

-- ============ LANÇAMENTOS AUTOMÁTICOS ============
alter table public.mr_lancamentos
  add column if not exists origem text;   -- null = digitado no painel; 'phibo' = importado

-- ============ SESSÃO DO PHIBO (só o servidor lê) ============
-- RLS ligado e SEM policies: ninguém logado lê o token; só a service role (Vercel).
create table if not exists public.mr_phibo_sessao (
  id int primary key default 1 check (id = 1),
  refresh_token text,
  access_token text,
  token_atualizado_em timestamptz,
  ultima_tentativa timestamptz,
  ultimo_ok timestamptz,
  ultimo_erro text,
  conectado_por uuid references public.profiles (id) on delete set null
);
alter table public.mr_phibo_sessao enable row level security;
revoke all on public.mr_phibo_sessao from anon, authenticated;

-- Admin cola o refreshToken do Phibo na tela Configurações do Empresas.
create or replace function public.mr_phibo_conectar(p_refresh text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v text := btrim(coalesce(p_refresh, ''), E' \t\r\n"');
begin
  if not public.is_admin_mr_terceriza() then
    raise exception 'Só administrador conecta o Phibo.';
  end if;
  if length(v) < 20 then
    raise exception 'Chave do Phibo inválida.';
  end if;
  insert into public.mr_phibo_sessao (id, refresh_token, access_token, token_atualizado_em, ultimo_erro, conectado_por)
  values (1, v, null, now(), null, auth.uid())
  on conflict (id) do update set
    refresh_token = excluded.refresh_token,
    access_token = null,
    token_atualizado_em = now(),
    ultimo_erro = null,
    conectado_por = auth.uid();
end;
$$;
revoke all on function public.mr_phibo_conectar(text) from public, anon;
grant execute on function public.mr_phibo_conectar(text) to authenticated;

-- Status sem o token (pra tela).
create or replace function public.mr_phibo_status()
returns table (conectado boolean, token_atualizado_em timestamptz, ultima_tentativa timestamptz, ultimo_ok timestamptz, ultimo_erro text)
language sql
stable
security definer
set search_path = public
as $$
  select s.refresh_token is not null, s.token_atualizado_em, s.ultima_tentativa, s.ultimo_ok, s.ultimo_erro
  from public.mr_phibo_sessao s
  where s.id = 1 and public.mr_pode_empresa('re-fashion');
$$;
revoke all on function public.mr_phibo_status() from public, anon;
grant execute on function public.mr_phibo_status() to authenticated;

-- ============ RESUMO DO MÊS (vendedoras, meta, totais/a receber) ============
create table if not exists public.mr_phibo_resumo (
  empresa text not null,
  mes text not null,                       -- YYYY-MM
  vendas_mes jsonb,                        -- /dashboard/vendasMes
  totais jsonb,                            -- /relacaoVendas/periodo/totais
  atualizado_em timestamptz not null default now(),
  primary key (empresa, mes)
);
alter table public.mr_phibo_resumo enable row level security;

drop policy if exists mr_phibo_resumo_select on public.mr_phibo_resumo;
create policy mr_phibo_resumo_select on public.mr_phibo_resumo
  for select to authenticated
  using (public.mr_pode_empresa(empresa));

-- ============ AGENDAMENTO (de hora em hora) ============
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from vault.secrets where name = 'mr_phibo_cron_secret') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'mr_phibo_cron_secret'),
      'COLE_AQUI_O_CRON_SECRET'
    );
  else
    perform vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'mr_phibo_cron_secret', 'Segredo da rotina /api/phibo-cron');
  end if;
end $$;

-- Também serve pra rodar na mão: select public.mr_phibo_rodar();
create or replace function public.mr_phibo_rodar()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  select net.http_get(
    url := 'https://sitema-novo.vercel.app/api/phibo-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mr_phibo_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
$$;
revoke all on function public.mr_phibo_rodar() from public, anon, authenticated;

-- Minuto 7 de toda hora (o accessToken do Phibo vale 1h; o refreshToken, 16–24h).
select cron.unschedule('mr-phibo-vendas')
where exists (select 1 from cron.job where jobname = 'mr-phibo-vendas');
select cron.schedule('mr-phibo-vendas', '7 * * * *', 'select public.mr_phibo_rodar();');

notify pgrst, 'reload schema';

-- ================== PARA CONFERIR ==================
-- Resposta das últimas chamadas:
--   select id, status_code, left(content::text, 300) as resposta, created
--   from net._http_response order by created desc limit 5;
-- Status da integração:
--   select ultima_tentativa, ultimo_ok, ultimo_erro from public.mr_phibo_sessao;
-- Desligar:
--   select cron.unschedule('mr-phibo-vendas');
