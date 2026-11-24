-- =============================================================================
-- Chat Seguro (/chat) — banco do Nerites, tudo com prefixo sc_
-- Porta do SecureChat: criptografia de ponta a ponta, uma visão com comprovante,
-- alertas de segurança, auditoria encadeada, limites de envio, Central de Segurança.
--
-- NÃO cria tabela profiles nem gatilho em auth.users/auth.sessions: usa o profiles do Nerites
-- (nome, email, role, extra_roles, acessos_externos) e não mexe no login dos outros sistemas.
--
-- Quem acessa: admin do Nerites (role/extra_roles) ou quem tiver acessos_externos->>'chat'
-- = 'admin' | 'editor' (liberado em /admin). Admin da Central de Segurança = admin do Nerites
-- ou nível "admin" do Chat.
--
-- Rode inteiro no SQL Editor do Supabase do Nerites. Depois rode 20261127b_chat_seguro_cron.sql.
-- =============================================================================

-- ----------------------------------------------------------------- acesso ao Chat Seguro
create or replace function public.sc_has_access(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user and coalesce(p.ativo, true)
      and (p.role = 'admin' or 'admin' = any(coalesce(p.extra_roles, '{}'))
           or coalesce(p.acessos_externos->>'chat', '') in ('admin', 'editor'))
  );
$$;

create or replace function public.sc_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and coalesce(p.ativo, true)
      and (p.role = 'admin' or 'admin' = any(coalesce(p.extra_roles, '{}'))
           or coalesce(p.acessos_externos->>'chat', '') = 'admin')
  );
$$;
revoke all on function public.sc_has_access, public.sc_is_admin from public, anon;
grant execute on function public.sc_has_access, public.sc_is_admin to authenticated, service_role;

-- =============================================================================
-- SecureChat no Supabase — esquema, segurança (RLS), funções e storage
-- Rode este arquivo inteiro no SQL Editor do Supabase (Dashboard > SQL Editor),
-- em um projeto novo.
--
-- Criptografia de ponta a ponta: o banco guarda só texto cifrado + chaves
-- "embrulhadas" para cada aparelho. Nem o servidor nem quem administra o
-- projeto conseguem ler conteúdo, nome ou tipo de arquivo.
--
-- Mapeamento para os nomes "clássicos":
--   conversations  -> sc_rooms + sc_room_members (suporta privada, grupo e temporária)
--   attachments    -> sc_messages.kind='file' / sc_once_secrets (uma visão)
--   sc_key_registry   -> sc_key_registry (uma chave por aparelho, até 3 por usuário)
--   typing_status  -> Realtime Broadcast em canal privado (não grava no banco)
--   read_at        -> sc_room_members.last_read_at (✓✓ azul)
--   sc_security_alerts, sc_audit_log (hash encadeado), sc_session_devices -> como no guia
--   rate limit     -> triggers no próprio Postgres (sem Redis)
-- =============================================================================

-- ----------------------------------------------------------------- tabelas
create table if not exists public.sc_key_registry (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles on delete cascade,
  public_key   text not null unique check (public_key ~ '^[A-Za-z0-9+/]{43}=$'),  -- X25519, 32 bytes base64
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz
);
create index if not exists sc_key_registry_user_idx on public.sc_key_registry (user_id) where revoked_at is null;

create table if not exists public.sc_rooms (
  id          bigint generated always as identity primary key,
  type        text not null check (type in ('global', 'direct', 'temp')),
  name        text check (char_length(name) <= 60),
  direct_key  text unique,                 -- "uuidA:uuidB" (ordenado) evita DM duplicada
  created_by  uuid references public.profiles on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz                  -- só conversas temporárias
);

create table if not exists public.sc_room_members (
  room_id      bigint not null references public.sc_rooms on delete cascade,
  user_id      uuid   not null references public.profiles on delete cascade,
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists sc_room_members_user_idx on public.sc_room_members (user_id);

create table if not exists public.sc_messages (
  id         bigint generated always as identity primary key,
  room_id    bigint not null references public.sc_rooms on delete cascade,
  sender_id  uuid   not null references public.profiles on delete cascade,
  kind       text   not null check (kind in ('text', 'file', 'once')),
  ciphertext text   check (char_length(ciphertext) <= 24000),  -- AES-256-GCM (base64)
  iv         text   check (char_length(iv) = 16),              -- 12 bytes aleatórios (base64)
  sender_key text,                                             -- chave pública do aparelho remetente
  keys       jsonb  check (pg_column_size(keys) <= 262144),   -- { chave_publica_destino: chave_embrulhada }
  file_path  text,                                             -- só bytes cifrados no storage
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists sc_messages_room_idx on public.sc_messages (room_id, id);
create index if not exists sc_messages_expiry_idx on public.sc_messages (expires_at) where expires_at is not null;
create index if not exists sc_messages_sender_time_idx on public.sc_messages (sender_id, created_at);

-- envelope de "uma visão": tabela sem nenhuma policy => ninguém lê pelo cliente.
-- Só a Edge Function "reveal" (service role) entrega UMA vez e apaga.
create table if not exists public.sc_once_secrets (
  message_id bigint primary key references public.sc_messages on delete cascade,
  envelope   jsonb not null check (pg_column_size(envelope) <= 300000),
  file_path  text
);

create table if not exists public.sc_push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- alertas de comportamento suspeito (print, cópia, impressão, devtools, toque longo, novo aparelho)
create table if not exists public.sc_security_alerts (
  id         bigint generated always as identity primary key,
  room_id    bigint references public.sc_rooms on delete cascade,
  message_id bigint references public.sc_messages on delete set null,
  user_id    uuid not null references public.profiles on delete cascade,   -- quem disparou
  alert_type text not null check (alert_type in ('screenshot_attempt', 'copy_attempt', 'print_attempt',
               'devtools_open', 'long_press', 'context_menu', 'selection_attempt', 'new_device')),
  severity   text not null check (severity in ('low', 'medium', 'high')),
  metadata   jsonb check (pg_column_size(metadata) <= 2048),
  created_at timestamptz not null default now()
);
create index if not exists sc_security_alerts_room_idx on public.sc_security_alerts (room_id, created_at);
create index if not exists sc_security_alerts_user_idx on public.sc_security_alerts (user_id, created_at);

-- aparelhos/sessões de cada conta (avisar login novo e desconectar remotamente)
create table if not exists public.sc_session_devices (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles on delete cascade,
  fingerprint text not null check (char_length(fingerprint) <= 64),
  label       text check (char_length(label) <= 80),
  public_key  text,
  ip          text,
  user_agent  text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  revoked_at  timestamptz,
  unique (user_id, fingerprint)
);

-- log de auditoria imutável, com hash encadeado POR USUÁRIO (cada um consegue verificar a própria cadeia)
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.sc_audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  action     text not null,
  room_id    bigint,
  metadata   jsonb,
  ip         text,
  user_agent text,
  created_at timestamptz not null default now(),
  payload    text not null,     -- exatamente o texto que entrou no hash
  prev_hash  text,
  hash       text not null
);
create index if not exists sc_audit_log_user_idx on public.sc_audit_log (user_id, id);

-- sala geral única
insert into public.sc_rooms (type, name)
select 'global', 'Sala Geral'
where not exists (select 1 from public.sc_rooms where type = 'global');

-- ----------------------------------------------------------------- helpers
-- membro de uma sala ainda válida (não expirada)
create or replace function public.sc_is_member(p_room bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sc_room_members rm join sc_rooms r on r.id = rm.room_id
    where rm.room_id = p_room and rm.user_id = auth.uid()
      and (r.expires_at is null or r.expires_at > now())
  ) and public.sc_has_access();   -- acesso retirado em /admin => corta na hora
$$;

-- caminho no storage é "<room_id>/<uuid>"; extrai a sala com segurança
create or replace function public.sc_is_member_path(p_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v text := split_part(p_path, '/', 1);
begin
  if v !~ '^[0-9]+$' then return false; end if;
  return public.sc_is_member(v::bigint);
end $$;

-- tópico do Realtime privado é "sc-room:<id>"
create or replace function public.sc_is_member_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v text := split_part(p_topic, ':', 2);
begin
  if split_part(p_topic, ':', 1) <> 'sc-room' or v !~ '^[0-9]+$' then return false; end if;
  return public.sc_is_member(v::bigint);
end $$;

-- a chave pública pertence ao usuário logado e está ativa
create or replace function public.sc_owns_active_key(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sc_key_registry
                 where public_key = p_key and user_id = auth.uid() and revoked_at is null);
$$;

-- registra um evento no log de auditoria (encadeado por usuário). Só o servidor chama.
create or replace function public.sc_audit(p_user uuid, p_action text, p_room bigint default null, p_meta jsonb default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare prev text; hdrs json; v_ip text; v_ua text; ts timestamptz := clock_timestamp(); pl text;
begin
  if p_user is null then return; end if;
  perform pg_advisory_xact_lock(hashtext('sc_audit:' || p_user::text));
  select hash into prev from sc_audit_log where user_id = p_user order by id desc limit 1;
  begin hdrs := nullif(current_setting('request.headers', true), '')::json; exception when others then hdrs := null; end;
  v_ip := nullif(trim(split_part(coalesce(hdrs->>'x-forwarded-for', hdrs->>'cf-connecting-ip', ''), ',', 1)), '');
  v_ua := left(hdrs->>'user-agent', 200);
  pl := concat_ws('|', p_user::text, p_action, coalesce(p_room::text, ''), coalesce(p_meta::text, '{}'),
                  coalesce(v_ip, ''), coalesce(v_ua, ''), to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  insert into sc_audit_log (user_id, action, room_id, metadata, ip, user_agent, created_at, payload, prev_hash, hash)
  values (p_user, p_action, p_room, p_meta, v_ip, v_ua, ts, pl, prev,
          encode(digest(coalesce(prev, '') || '|' || pl, 'sha256'), 'hex'));
end $$;

-- ninguém altera nem apaga o log pelo app
create or replace function public.sc_audit_immutable()
returns trigger language plpgsql as $$
begin raise exception 'sc_audit_log e imutavel'; end $$;
drop trigger if exists audit_no_change on public.sc_audit_log;
create trigger audit_no_change before update or delete on public.sc_audit_log
  for each row execute function public.sc_audit_immutable();

-- eventos que só o aparelho conhece (sair, bloquear, desbloquear, apagar dados, PIN)
create or replace function public.sc_audit_client_event(p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_action not in ('chat_open', 'logout', 'unlock', 'lock', 'wipe_device', 'pin_set', 'pin_removed') then
    raise exception 'evento invalido';
  end if;
  perform public.sc_audit(auth.uid(), p_action);
end $$;

-- limite de envio: 60 mensagens/min e 300 em 10 min por usuário
create or replace function public.sc_enforce_message_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from sc_messages where sender_id = new.sender_id
        and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'limite de envio: 60 mensagens por minuto';
  end if;
  if (select count(*) from sc_messages where sender_id = new.sender_id
        and created_at > now() - interval '10 minutes') >= 300 then
    raise exception 'atividade anormal: envio bloqueado por alguns minutos';
  end if;
  return new;
end $$;

-- limite de anexos: 10 por minuto
create or replace function public.sc_upload_rate_ok()
returns boolean language sql stable security definer set search_path = public, storage as $$
  select (select count(*) from storage.objects
          where owner_id = auth.uid()::text and created_at > now() - interval '1 minute') < 10;
$$;

-- ----------------------------------------------------------------- RLS
alter table public.sc_key_registry       enable row level security;
alter table public.sc_rooms              enable row level security;
alter table public.sc_room_members       enable row level security;
alter table public.sc_messages           enable row level security;
alter table public.sc_once_secrets       enable row level security;
alter table public.sc_push_subscriptions enable row level security;
alter table public.sc_security_alerts    enable row level security;
alter table public.sc_session_devices    enable row level security;
alter table public.sc_audit_log          enable row level security;

drop policy if exists "chaves publicas visiveis" on public.sc_key_registry;
create policy "chaves publicas visiveis" on public.sc_key_registry for select to authenticated using (true);

drop policy if exists "ve salas onde e membro" on public.sc_rooms;
create policy "ve salas onde e membro" on public.sc_rooms for select to authenticated
  using (public.sc_is_member(id));

drop policy if exists "ve membros das suas salas" on public.sc_room_members;
create policy "ve membros das suas salas" on public.sc_room_members for select to authenticated
  using (public.sc_is_member(room_id));

-- UMA policy de leitura com as duas condições ligadas por AND.
-- (Duas policies separadas seriam somadas com OR e a de "não expirada"
--  sozinha liberaria mensagens de qualquer conversa.)
drop policy if exists "le mensagens das suas salas" on public.sc_messages;
create policy "le mensagens das suas salas" on public.sc_messages for select to authenticated
  using (public.sc_is_member(room_id) and (expires_at is null or expires_at > now()));

-- texto/arquivo só entram cifrados e com uma chave ativa do próprio remetente;
-- "uma visão" só pela função sc_send_once
drop policy if exists "envia mensagem cifrada" on public.sc_messages;
create policy "envia mensagem cifrada" on public.sc_messages for insert to authenticated
  with check (
    sender_id = auth.uid() and public.sc_is_member(room_id) and kind in ('text', 'file')
    and ciphertext is not null and iv is not null and keys is not null
    and public.sc_owns_active_key(sender_key)
    and ((kind = 'text' and file_path is null)
      or (kind = 'file' and file_path like room_id::text || '/%'))
  );

-- cada um apaga só as próprias mensagens ("apagar para todos")
drop policy if exists "apaga as proprias mensagens" on public.sc_messages;
create policy "apaga as proprias mensagens" on public.sc_messages for delete to authenticated
  using (sender_id = auth.uid());

drop policy if exists "gerencia proprias inscricoes push" on public.sc_push_subscriptions;
create policy "gerencia proprias inscricoes push" on public.sc_push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- sc_once_secrets: RLS ligado e nenhuma policy (de propósito)

-- alertas: quem está na conversa vê; o próprio usuário vê os dele (ex.: novo aparelho)
drop policy if exists "alertas visiveis aos participantes" on public.sc_security_alerts;
create policy "alertas visiveis aos participantes" on public.sc_security_alerts for select to authenticated
  using ((room_id is not null and public.sc_is_member(room_id)) or user_id = auth.uid());
drop policy if exists "registra alerta proprio" on public.sc_security_alerts;
create policy "registra alerta proprio" on public.sc_security_alerts for insert to authenticated
  with check (user_id = auth.uid() and alert_type <> 'new_device'
              and (room_id is null or public.sc_is_member(room_id)));

-- aparelhos e log: cada um vê só os seus; escrita só pelas funções do servidor
drop policy if exists "ve os proprios aparelhos" on public.sc_session_devices;
create policy "ve os proprios aparelhos" on public.sc_session_devices for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "ve o proprio log" on public.sc_audit_log;
create policy "ve o proprio log" on public.sc_audit_log for select to authenticated
  using (user_id = auth.uid());

-- expiração herdada da sala temporária; uma visão não aberta some em 24h
create or replace function public.sc_set_message_expiry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select expires_at into new.expires_at from sc_rooms where id = new.room_id;
  if new.kind = 'once' and new.expires_at is null then
    new.expires_at := now() + interval '24 hours';
  end if;
  return new;
end $$;
drop trigger if exists messages_expiry on public.sc_messages;
create trigger messages_expiry before insert on public.sc_messages
  for each row execute function public.sc_set_message_expiry();
drop trigger if exists messages_rate on public.sc_messages;
create trigger messages_rate before insert on public.sc_messages
  for each row execute function public.sc_enforce_message_rate();

-- auditoria automática (só metadados: nunca conteúdo)
create or replace function public.sc_audit_message_sent()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.sc_audit(new.sender_id, 'message_sent', new.room_id, jsonb_build_object('kind', new.kind)); return new; end $$;
drop trigger if exists messages_audit on public.sc_messages;
create trigger messages_audit after insert on public.sc_messages
  for each row execute function public.sc_audit_message_sent();

-- alertas: limite de 20/min por usuário + entrada no log
create or replace function public.sc_alert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from sc_security_alerts where user_id = new.user_id
        and created_at > now() - interval '1 minute') >= 20 then
    return null;   -- descarta em silêncio (evita spam de alertas)
  end if;
  perform public.sc_audit(new.user_id, 'security_alert', new.room_id,
    jsonb_build_object('type', new.alert_type, 'severity', new.severity));
  return new;
end $$;
drop trigger if exists alerts_guard on public.sc_security_alerts;
create trigger alerts_guard before insert on public.sc_security_alerts
  for each row execute function public.sc_alert_guard();


-- ----------------------------------------------------------------- RPCs
-- registra/renova a chave e o aparelho; mantém só os 3 aparelhos usados mais recentemente.
-- Aparelho nunca visto (e a conta já tinha outro) => alerta "novo aparelho" + log.
create or replace function public.sc_register_device(p_key text, p_fingerprint text default null, p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); is_new boolean := false; hdrs json; v_ip text; v_ua text; had_any boolean;
begin
  if me is null then raise exception 'nao autenticado'; end if;
  if not public.sc_has_access() then raise exception 'sem acesso ao Chat Seguro'; end if;
  if exists (select 1 from sc_key_registry where public_key = p_key and user_id <> me) then
    raise exception 'chave pertence a outro usuario';
  end if;
  if not exists (select 1 from sc_key_registry where public_key = p_key) then
    perform public.sc_audit(me, 'device_key_registered', null, jsonb_build_object('key', left(p_key, 12)));
  end if;
  insert into sc_key_registry (user_id, public_key) values (me, p_key)
  on conflict (public_key) do update set last_seen_at = now(), revoked_at = null;
  update sc_key_registry set revoked_at = now()
  where user_id = me and revoked_at is null and id not in (
    select id from sc_key_registry where user_id = me and revoked_at is null
    order by last_seen_at desc limit 3);

  if p_fingerprint is not null then
    begin hdrs := nullif(current_setting('request.headers', true), '')::json; exception when others then hdrs := null; end;
    v_ip := nullif(trim(split_part(coalesce(hdrs->>'x-forwarded-for', ''), ',', 1)), '');
    v_ua := left(hdrs->>'user-agent', 200);
    select exists (select 1 from sc_session_devices where user_id = me) into had_any;
    is_new := not exists (select 1 from sc_session_devices where user_id = me and fingerprint = p_fingerprint);
    insert into sc_session_devices (user_id, fingerprint, label, public_key, ip, user_agent)
    values (me, p_fingerprint, left(p_label, 80), p_key, v_ip, v_ua)
    on conflict (user_id, fingerprint) do update
      set last_seen = now(), public_key = excluded.public_key, ip = excluded.ip,
          user_agent = excluded.user_agent, label = excluded.label, revoked_at = null;
    if is_new and had_any then
      insert into sc_security_alerts (user_id, alert_type, severity, metadata)
      values (me, 'new_device', 'high', jsonb_build_object('label', left(p_label, 80), 'ip', v_ip));
    end if;
  end if;
  return jsonb_build_object('new_device', is_new);
end $$;

-- "desconectar outros aparelhos": revoga as chaves deles (mensagens novas não são mais cifradas para eles)
create or replace function public.sc_revoke_other_devices(p_keep_key text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update sc_key_registry set revoked_at = now()
  where user_id = auth.uid() and revoked_at is null and public_key <> p_keep_key;
  get diagnostics n = row_count;
  update sc_session_devices set revoked_at = now()
  where user_id = auth.uid() and revoked_at is null and coalesce(public_key, '') <> p_keep_key;
  perform public.sc_audit(auth.uid(), 'devices_revoked', null, jsonb_build_object('count', n));
  return n;
end $$;

-- "sair e apagar dados deste aparelho": revoga a chave deste aparelho
create or replace function public.sc_revoke_device(p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update sc_key_registry set revoked_at = now() where user_id = auth.uid() and public_key = p_key;
  update sc_session_devices set revoked_at = now() where user_id = auth.uid() and public_key = p_key;
  perform public.sc_audit(auth.uid(), 'device_revoked', null, jsonb_build_object('key', left(p_key, 12)));
end $$;

create or replace function public.sc_open_direct(p_other uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; rid bigint;
begin
  if me is null then raise exception 'nao autenticado'; end if;
  if not public.sc_has_access() then raise exception 'sem acesso ao Chat Seguro'; end if;
  if p_other = me or not public.sc_has_access(p_other) then
    raise exception 'usuario invalido';
  end if;
  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  select id into rid from sc_rooms where direct_key = k;
  if rid is null then
    insert into sc_rooms (type, direct_key, created_by) values ('direct', k, me) returning id into rid;
    insert into sc_room_members (room_id, user_id) values (rid, me), (rid, p_other);
  end if;
  return rid;
end $$;

create or replace function public.sc_create_temp(p_name text, p_hours int, p_members uuid[])
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid bigint;
begin
  if me is null then raise exception 'nao autenticado'; end if;
  if not public.sc_has_access() then raise exception 'sem acesso ao Chat Seguro'; end if;
  if p_hours not in (1, 24, 72, 168) then raise exception 'duracao invalida'; end if;
  insert into sc_rooms (type, name, created_by, expires_at)
  values ('temp', coalesce(nullif(trim(p_name), ''), 'Conversa temporária'), me,
          now() + make_interval(hours => p_hours))
  returning id into rid;
  insert into sc_room_members (room_id, user_id)
  select rid, u from (select me as u union select unnest(coalesce(p_members, '{}'))) s
  where public.sc_has_access(s.u)
  on conflict do nothing;
  return rid;
end $$;

-- uma visão (texto ou arquivo): o envelope cifrado vai para sc_once_secrets
create or replace function public.sc_send_once(p_room bigint, p_env jsonb, p_file_path text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare mid bigint;
begin
  if not public.sc_is_member(p_room) then raise exception 'voce nao esta nesta sala'; end if;
  if not (p_env ? 'c' and p_env ? 'iv' and p_env ? 'sk' and p_env ? 'keys') then
    raise exception 'envelope invalido';
  end if;
  if not public.sc_owns_active_key(p_env->>'sk') then raise exception 'chave do aparelho invalida'; end if;
  if p_file_path is not null and p_file_path not like p_room::text || '/%' then
    raise exception 'arquivo invalido';
  end if;
  insert into sc_messages (room_id, sender_id, kind) values (p_room, auth.uid(), 'once') returning id into mid;
  insert into sc_once_secrets (message_id, envelope, file_path) values (mid, p_env, p_file_path);
  return mid;
end $$;

-- "apagar para todos": devolve os caminhos para o app remover os bytes do storage
create or replace function public.sc_delete_message(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select m.sender_id, m.file_path, o.file_path as once_path into r
  from sc_messages m left join sc_once_secrets o on o.message_id = m.id where m.id = p_id;
  if not found or r.sender_id <> auth.uid() then raise exception 'so quem enviou pode apagar'; end if;
  delete from sc_messages where id = p_id;
  perform public.sc_audit(auth.uid(), 'message_deleted', null, jsonb_build_object('id', p_id));
  return jsonb_build_object('files', r.file_path, 'once', r.once_path);
end $$;

create or replace function public.sc_mark_read(p_room bigint)
returns void language sql security definer set search_path = public as $$
  update sc_room_members set last_read_at = now() where room_id = p_room and user_id = auth.uid();
$$;

-- lista de conversas com membros (+ leitura), última mensagem (cifrada) e não lidas
create or replace function public.sc_get_rooms()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'sort_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', r.id, 'type', r.type, 'name', r.name, 'created_by', r.created_by,
      'created_at', extract(epoch from r.created_at),
      'expires_at', extract(epoch from r.expires_at),
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', p.id, 'username', case when p.id = auth.uid() then split_part(p.email, '@', 1) end, 'display_name', p.nome,
                    'last_read_at', extract(epoch from m2.last_read_at))), '[]')
                  from sc_room_members m2 join profiles p on p.id = m2.user_id where m2.room_id = r.id),
      'last_message', (select jsonb_build_object(
                    'id', m.id, 'kind', m.kind, 'sender_id', m.sender_id, 'room_id', m.room_id,
                    'display_name', p.nome,
                    'created_at', extract(epoch from m.created_at),
                    'ciphertext', m.ciphertext, 'iv', m.iv, 'sender_key', m.sender_key, 'keys', m.keys)
                  from sc_messages m join profiles p on p.id = m.sender_id
                  where m.room_id = r.id and (m.expires_at is null or m.expires_at > now())
                  order by m.id desc limit 1),
      'unread', (select count(*) from sc_messages m
                 where m.room_id = r.id and m.sender_id <> auth.uid()
                   and m.created_at > rm.last_read_at
                   and (m.expires_at is null or m.expires_at > now())),
      'sort_at', greatest(r.created_at, (select max(created_at) from sc_messages where room_id = r.id))
    ) as x
    from sc_room_members rm join sc_rooms r on r.id = rm.room_id
    where rm.user_id = auth.uid() and (r.expires_at is null or r.expires_at > now())
  ) s;
$$;

revoke all on function public.sc_get_rooms, public.sc_open_direct, public.sc_create_temp, public.sc_send_once,
  public.sc_mark_read, public.sc_delete_message, public.sc_register_device, public.sc_revoke_other_devices,
  public.sc_revoke_device, public.sc_audit_client_event from anon;
-- sc_audit() só pelo servidor (triggers, funções e Edge Functions com service role)
revoke all on function public.sc_audit from public, anon, authenticated;
grant execute on function public.sc_audit to service_role;

-- ----------------------------------------------------------------- realtime
do $$ begin
  alter publication supabase_realtime add table public.sc_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.sc_room_members;   -- novas salas e ✓✓ lido
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.sc_security_alerts;  -- aviso em tempo real
exception when duplicate_object then null; end $$;

-- "digitando…" usa Broadcast em canal PRIVADO "sc-room:<id>": só membros recebem/enviam
do $$ begin
  drop policy if exists "chat seguro: membros recebem broadcast da sala" on realtime.messages;
  create policy "chat seguro: membros recebem broadcast da sala" on realtime.messages for select to authenticated
    using (public.sc_is_member_topic(realtime.topic()));
  drop policy if exists "chat seguro: membros enviam broadcast da sala" on realtime.messages;
  create policy "chat seguro: membros enviam broadcast da sala" on realtime.messages for insert to authenticated
    with check (public.sc_is_member_topic(realtime.topic()));
exception when undefined_table or undefined_function then
  raise notice 'Realtime Authorization indisponivel neste projeto: "digitando" ficara desligado';
end $$;

-- ----------------------------------------------------------------- storage
-- "files": anexos salvos. "once": uma visão (ninguém baixa pelo cliente; só a função reveal).
-- Os dois só recebem bytes cifrados no aparelho.
insert into storage.buckets (id, name, public, file_size_limit)
values ('sc-files', 'sc-files', false, 26214400), ('sc-once', 'sc-once', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "chat seguro: membros leem anexos" on storage.objects;
create policy "chat seguro: membros leem anexos" on storage.objects for select to authenticated
  using (bucket_id = 'sc-files' and public.sc_is_member_path(name));

drop policy if exists "chat seguro: membros enviam anexos" on storage.objects;
create policy "chat seguro: membros enviam anexos" on storage.objects for insert to authenticated
  with check (bucket_id in ('sc-files', 'sc-once') and public.sc_is_member_path(name) and public.sc_upload_rate_ok());

drop policy if exists "chat seguro: dono apaga o proprio anexo" on storage.objects;
create policy "chat seguro: dono apaga o proprio anexo" on storage.objects for delete to authenticated
  using (bucket_id in ('sc-files', 'sc-once') and owner_id = (select auth.uid())::text);


-- =============================================================================
-- SecureChat — Central de Segurança, eventos tipados, visualizações protegidas
-- Migration ADITIVA: não apaga dados nem altera o Auth existente.
--
-- Admin da Central = admin do Nerites ou nível "admin" do Chat em /admin.
-- =============================================================================

-- ---------------------------------------------------------------- admin (só pelo SQL / service_role)

-- ---------------------------------------------------------------- sessões ativas (para "taxa" do ranking)
create table if not exists public.sc_activity_days (
  user_id uuid not null references public.profiles on delete cascade,
  day     date not null default (timezone('utc', now()))::date,
  touches int  not null default 1 check (touches >= 0),
  primary key (user_id, day)
);
alter table public.sc_activity_days enable row level security;
drop policy if exists "ve a propria atividade" on public.sc_activity_days;
create policy "ve a propria atividade" on public.sc_activity_days for select to authenticated
  using (user_id = auth.uid() or public.sc_is_admin());

create or replace function public.sc_touch_activity()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into sc_activity_days (user_id, day, touches) values (auth.uid(), (timezone('utc', now()))::date, 1)
  on conflict (user_id, day) do update set touches = sc_activity_days.touches + 1;
end $$;
revoke all on function public.sc_touch_activity from public, anon;
grant execute on function public.sc_touch_activity to authenticated;

-- ---------------------------------------------------------------- histórico de uma-visão consumida (reabertura server-proven)
create table if not exists public.sc_consumed_onces (
  message_id   bigint primary key,
  room_id      bigint not null references public.sc_rooms on delete cascade,
  sender_id    uuid not null,
  viewer_id    uuid not null references public.profiles on delete cascade,
  view_seconds int  not null check (view_seconds in (5, 10, 15, 30)),
  claimed_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  closed_at    timestamptz,
  had_file     boolean not null default false
);
create index if not exists sc_consumed_onces_room_idx on public.sc_consumed_onces (room_id, claimed_at);
create index if not exists sc_consumed_onces_viewer_idx on public.sc_consumed_onces (viewer_id, claimed_at);

alter table public.sc_consumed_onces enable row level security;
-- sem select para authenticated: só Edge Function (service_role) e RPCs security definer

-- duração pedida pelo remetente (fica no servidor; o envelope continua cifrado)
alter table public.sc_once_secrets
  add column if not exists view_seconds int not null default 10
    check (view_seconds in (5, 10, 15, 30));

-- ---------------------------------------------------------------- alertas: novos tipos + origem/confiabilidade
alter table public.sc_security_alerts drop constraint if exists security_alerts_alert_type_check;
alter table public.sc_security_alerts add constraint security_alerts_alert_type_check check (alert_type in (
  'screenshot_attempt',  -- PrintScreen / atalho recebido pela página (NÃO prova captura nativa)
  'capture_shortcut',    -- atalho de captura observado pela página
  'copy_attempt',
  'cut_attempt',
  'paste_detected',
  'print_attempt',
  'devtools_open',
  'long_press',
  'context_menu',
  'selection_attempt',
  'new_device',
  'visibility_hidden',
  'image_opened',        -- server_proven
  'view_expired',        -- pode ser client_reported (fecho) ou server (prazo)
  'reopen_denied'        -- server_proven
));

alter table public.sc_security_alerts
  add column if not exists source text not null default 'client_reported'
    check (source in ('client_reported', 'server_proven'));
alter table public.sc_security_alerts
  add column if not exists reliability text not null default 'observed'
    check (reliability in ('observed', 'proven'));

-- ---------------------------------------------------------------- agregados diários SEM room_id (Central administrativa)
create table if not exists public.sc_security_stats_daily (
  day        date not null,
  user_id    uuid not null references public.profiles on delete cascade,
  alert_type text not null,
  source     text not null check (source in ('client_reported', 'server_proven')),
  cnt        int  not null default 0 check (cnt >= 0),
  primary key (day, user_id, alert_type, source)
);
create index if not exists sc_security_stats_daily_day_idx on public.sc_security_stats_daily (day);
create index if not exists sc_security_stats_daily_user_idx on public.sc_security_stats_daily (user_id, day);

alter table public.sc_security_stats_daily enable row level security;
-- sem policy de select direto: acesso só via RPCs sc_is_admin()

create or replace function public.sc_bump_security_stats()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into sc_security_stats_daily (day, user_id, alert_type, source, cnt)
  values ((timezone('utc', new.created_at))::date, new.user_id, new.alert_type, new.source, 1)
  on conflict (day, user_id, alert_type, source)
  do update set cnt = sc_security_stats_daily.cnt + 1;
  return new;
end $$;
drop trigger if exists security_alerts_stats on public.sc_security_alerts;
create trigger security_alerts_stats after insert on public.sc_security_alerts
  for each row execute function public.sc_bump_security_stats();

-- ---------------------------------------------------------------- RPC: cliente reporta evento (autor = auth.uid(); tipos limitados)
create or replace function public.sc_report_client_event(
  p_room bigint,
  p_type text,
  p_severity text default 'medium',
  p_message_id bigint default null,
  p_meta jsonb default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare mid bigint; me uuid := auth.uid();
begin
  if me is null then raise exception 'nao autenticado'; end if;
  if p_type not in (
    'screenshot_attempt', 'capture_shortcut', 'copy_attempt', 'cut_attempt',
    'paste_detected', 'print_attempt', 'devtools_open', 'long_press',
    'context_menu', 'selection_attempt', 'visibility_hidden', 'view_expired'
  ) then
    raise exception 'tipo de evento nao permitido ao cliente';
  end if;
  if p_severity not in ('low', 'medium', 'high') then raise exception 'severidade invalida'; end if;
  if p_room is not null and not public.sc_is_member(p_room) then raise exception 'voce nao esta nesta sala'; end if;

  -- anti-spam: 1 igual (tipo+sala) a cada 20 s; teto geral no trigger sc_alert_guard
  if exists (
    select 1 from sc_security_alerts
    where user_id = me and alert_type = p_type
      and coalesce(room_id, -1) = coalesce(p_room, -1)
      and created_at > now() - interval '20 seconds'
  ) then
    return null;
  end if;

  insert into sc_security_alerts (room_id, message_id, user_id, alert_type, severity, metadata, source, reliability)
  values (p_room, p_message_id, me, p_type, p_severity,
          case when p_meta is null then null else jsonb_strip_nulls(p_meta - 'body' - 'ciphertext' - 'text' - 'content') end,
          'client_reported', 'observed')
  returning id into mid;
  return mid;
end $$;
revoke all on function public.sc_report_client_event from public, anon;
grant execute on function public.sc_report_client_event to authenticated;

-- inserir alerta server-proven (só service_role / funções internas)
create or replace function public.sc_insert_server_alert(
  p_user uuid,
  p_room bigint,
  p_type text,
  p_severity text,
  p_message_id bigint default null,
  p_meta jsonb default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare mid bigint;
begin
  if p_type not in ('image_opened', 'view_expired', 'reopen_denied', 'new_device') then
    raise exception 'tipo server invalido';
  end if;
  insert into sc_security_alerts (room_id, message_id, user_id, alert_type, severity, metadata, source, reliability)
  values (p_room, p_message_id, p_user, p_type, p_severity, p_meta, 'server_proven', 'proven')
  returning id into mid;
  return mid;
end $$;
revoke all on function public.sc_insert_server_alert from public, anon, authenticated;
grant execute on function public.sc_insert_server_alert to service_role;

-- trava INSERT direto do cliente: só via sc_report_client_event (ou service_role)
drop policy if exists "registra alerta proprio" on public.sc_security_alerts;
-- sem policy de INSERT => authenticated não insere direto; RPC é security definer

-- ---------------------------------------------------------------- sc_send_once com duração
-- substitui a versão de 3 parâmetros (senão a chamada pelo Supabase fica ambígua)
drop function if exists public.sc_send_once(bigint, jsonb, text);
create or replace function public.sc_send_once(
  p_room bigint,
  p_env jsonb,
  p_file_path text default null,
  p_view_seconds int default 10
) returns bigint language plpgsql security definer set search_path = public as $$
declare mid bigint; vs int := coalesce(p_view_seconds, 10);
begin
  if not public.sc_is_member(p_room) then raise exception 'voce nao esta nesta sala'; end if;
  if vs not in (5, 10, 15, 30) then raise exception 'duracao invalida'; end if;
  if not (p_env ? 'c' and p_env ? 'iv' and p_env ? 'sk' and p_env ? 'keys') then
    raise exception 'envelope invalido';
  end if;
  if not public.sc_owns_active_key(p_env->>'sk') then raise exception 'chave do aparelho invalida'; end if;
  if p_file_path is not null and p_file_path not like p_room::text || '/%' then
    raise exception 'arquivo invalido';
  end if;
  insert into sc_messages (room_id, sender_id, kind) values (p_room, auth.uid(), 'once') returning id into mid;
  insert into sc_once_secrets (message_id, envelope, file_path, view_seconds)
  values (mid, p_env, p_file_path, vs);
  return mid;
end $$;

-- ---------------------------------------------------------------- fechar visualização (cliente informa; não prova captura)
create or replace function public.sc_close_protected_view(p_message_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from sc_consumed_onces where message_id = p_message_id and viewer_id = auth.uid();
  if not found then return; end if;
  if c.closed_at is not null then return; end if;
  update sc_consumed_onces set closed_at = now() where message_id = p_message_id;
  perform public.sc_report_client_event(c.room_id, 'view_expired', 'low', p_message_id,
    jsonb_build_object('reason', 'client_close', 'view_seconds', c.view_seconds));
end $$;
revoke all on function public.sc_close_protected_view from public, anon;
grant execute on function public.sc_close_protected_view to authenticated;

-- ---------------------------------------------------------------- RPCs administrativas (sem room_id / sem conteúdo)
create or replace function public.sc_admin_security_overview(
  p_from timestamptz default null,
  p_to   timestamptz default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d0 date; d1 date; total bigint; out jsonb;
begin
  if not public.sc_is_admin() then raise exception 'acesso negado'; end if;
  d0 := coalesce(p_from::date, (timezone('utc', now()) - interval '30 days')::date);
  d1 := coalesce(p_to::date, (timezone('utc', now()))::date);

  select coalesce(sum(cnt), 0) into total from sc_security_stats_daily where day between d0 and d1;

  select jsonb_build_object(
    'total', total,
    'from', d0, 'to', d1,
    'by_type', coalesce((
      select jsonb_object_agg(alert_type, c) from (
        select alert_type, sum(cnt)::bigint as c from sc_security_stats_daily
        where day between d0 and d1 group by alert_type
      ) s
    ), '{}'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day) from (
        select day, sum(cnt)::bigint as c from sc_security_stats_daily
        where day between d0 and d1 group by day
      ) s
    ), '[]'::jsonb),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'count', c) order by m) from (
        select to_char(day, 'YYYY-MM') as m, sum(cnt)::bigint as c
        from sc_security_stats_daily where day between d0 and d1 group by 1
      ) s
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_object_agg(source, c) from (
        select source, sum(cnt)::bigint as c from sc_security_stats_daily
        where day between d0 and d1 group by source
      ) s
    ), '{}'::jsonb)
  ) into out;
  return out;
end $$;

create or replace function public.sc_admin_security_ranking(
  p_from timestamptz default null,
  p_to   timestamptz default null,
  p_user uuid default null,
  p_type text default null,
  p_q text default null,
  p_sort text default 'total',
  p_dir text default 'desc',
  p_limit int default 50,
  p_offset int default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d0 date; d1 date; lim int; off int; total_rows bigint; rows jsonb;
begin
  if not public.sc_is_admin() then raise exception 'acesso negado'; end if;
  d0 := coalesce(p_from::date, (timezone('utc', now()) - interval '30 days')::date);
  d1 := coalesce(p_to::date, (timezone('utc', now()))::date);
  lim := least(greatest(coalesce(p_limit, 50), 1), 200);
  off := greatest(coalesce(p_offset, 0), 0);

  with base as (
    select s.user_id,
      sum(s.cnt) filter (where s.alert_type = 'copy_attempt') as copies,
      sum(s.cnt) filter (where s.alert_type = 'cut_attempt') as cuts,
      sum(s.cnt) filter (where s.alert_type = 'paste_detected') as pastes,
      sum(s.cnt) filter (where s.alert_type = 'print_attempt') as prints,
      sum(s.cnt) filter (where s.alert_type in ('screenshot_attempt', 'capture_shortcut')) as captures,
      sum(s.cnt) filter (where s.alert_type = 'image_opened') as images,
      sum(s.cnt) filter (where s.alert_type = 'reopen_denied') as reopens,
      sum(s.cnt) filter (where s.alert_type = 'view_expired') as expired,
      sum(s.cnt) as total
    from sc_security_stats_daily s
    where s.day between d0 and d1
      and (p_user is null or s.user_id = p_user)
      and (p_type is null or s.alert_type = p_type)
    group by s.user_id
  ),
  joined as (
    select b.*, p.nome as display_name, split_part(coalesce(p.email, ''), '@', 1) as username,
      coalesce((select sum(a.touches) from sc_activity_days a
                where a.user_id = b.user_id and a.day between d0 and d1), 0) as sessions,
      case when coalesce((select sum(a.touches) from sc_activity_days a
                where a.user_id = b.user_id and a.day between d0 and d1), 0) > 0
           then round(b.total::numeric / (select sum(a.touches) from sc_activity_days a
                where a.user_id = b.user_id and a.day between d0 and d1), 3)
           else b.total::numeric end as rate
    from base b join profiles p on p.id = b.user_id
    where (p_q is null or p_q = '' or p.nome ilike '%' || p_q || '%' or p.email ilike '%' || p_q || '%')
  ),
  counted as (select count(*) as n from joined)
  select n into total_rows from counted;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.pos), '[]'::jsonb) into rows from (
    select row_number() over (
      order by
        case when lower(coalesce(p_sort,'total')) = 'name' and lower(coalesce(p_dir,'desc')) = 'asc' then display_name end asc nulls last,
        case when lower(coalesce(p_sort,'total')) = 'name' and lower(coalesce(p_dir,'desc')) <> 'asc' then display_name end desc nulls last,
        case when lower(coalesce(p_sort,'total')) <> 'name' and lower(coalesce(p_dir,'desc')) = 'asc' then
          case lower(coalesce(p_sort,'total'))
            when 'copies' then copies when 'cuts' then cuts when 'pastes' then pastes
            when 'prints' then prints when 'captures' then captures when 'images' then images
            when 'reopens' then reopens when 'rate' then rate else total end
        end asc nulls last,
        case when lower(coalesce(p_sort,'total')) <> 'name' and lower(coalesce(p_dir,'desc')) <> 'asc' then
          case lower(coalesce(p_sort,'total'))
            when 'copies' then copies when 'cuts' then cuts when 'pastes' then pastes
            when 'prints' then prints when 'captures' then captures when 'images' then images
            when 'reopens' then reopens when 'rate' then rate else total end
        end desc nulls last,
        display_name
    ) as pos,
      user_id, display_name, username,
      coalesce(copies,0) as copies, coalesce(cuts,0) as cuts, coalesce(pastes,0) as pastes,
      coalesce(prints,0) as prints, coalesce(captures,0) as captures,
      coalesce(images,0) as images, coalesce(reopens,0) as reopens, coalesce(expired,0) as expired,
      coalesce(total,0) as total, coalesce(sessions,0) as sessions, coalesce(rate,0) as rate
    from joined
    order by pos
    limit lim offset off
  ) x;

  return jsonb_build_object(
    'from', d0, 'to', d1, 'total_rows', total_rows, 'limit', lim, 'offset', off, 'rows', rows,
    'disclaimer', 'Eventos do navegador sao observacoes, nao prova de captura de tela ou vazamento. Revisao humana obrigatoria.'
  );
end $$;

create or replace function public.sc_admin_security_series(
  p_from timestamptz default null,
  p_to   timestamptz default null,
  p_metric text default 'by_day'
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d0 date; d1 date;
begin
  if not public.sc_is_admin() then raise exception 'acesso negado'; end if;
  d0 := coalesce(p_from::date, (timezone('utc', now()) - interval '30 days')::date);
  d1 := coalesce(p_to::date, (timezone('utc', now()))::date);

  if p_metric = 'copy_by_user' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('name', display_name, 'count', c) order by c desc)
      from (
        select p.nome as display_name, sum(s.cnt)::bigint as c
        from sc_security_stats_daily s join profiles p on p.id = s.user_id
        where s.day between d0 and d1 and s.alert_type = 'copy_attempt'
        group by p.nome order by c desc limit 15
      ) t
    ), '[]'::jsonb);
  elsif p_metric = 'print_by_day' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day) from (
        select day, sum(cnt)::bigint as c from sc_security_stats_daily
        where day between d0 and d1 and alert_type = 'print_attempt' group by day
      ) t
    ), '[]'::jsonb);
  elsif p_metric = 'types' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('type', alert_type, 'count', c) order by c desc) from (
        select alert_type, sum(cnt)::bigint as c from sc_security_stats_daily
        where day between d0 and d1 group by alert_type
      ) t
    ), '[]'::jsonb);
  elsif p_metric = 'images' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'opened', opened, 'reopens', reopens) order by day) from (
        select day,
          sum(cnt) filter (where alert_type = 'image_opened')::bigint as opened,
          sum(cnt) filter (where alert_type = 'reopen_denied')::bigint as reopens
        from sc_security_stats_daily where day between d0 and d1
          and alert_type in ('image_opened', 'reopen_denied')
        group by day
      ) t
    ), '[]'::jsonb);
  elsif p_metric = 'monthly' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'count', c) order by m) from (
        select to_char(day, 'YYYY-MM') as m, sum(cnt)::bigint as c
        from sc_security_stats_daily where day between d0 and d1 group by 1
      ) t
    ), '[]'::jsonb);
  else
    return coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day) from (
        select day, sum(cnt)::bigint as c from sc_security_stats_daily
        where day between d0 and d1 group by day
      ) t
    ), '[]'::jsonb);
  end if;
end $$;

create or replace function public.sc_admin_access_audit()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sc_is_admin() then raise exception 'acesso negado'; end if;
  perform public.sc_audit(auth.uid(), 'admin_panel_open', null, jsonb_build_object('panel', 'security_center'));
end $$;

revoke all on function public.sc_admin_security_overview, public.sc_admin_security_ranking,
  public.sc_admin_security_series, public.sc_admin_access_audit from public, anon;
grant execute on function public.sc_admin_security_overview, public.sc_admin_security_ranking,
  public.sc_admin_security_series, public.sc_admin_access_audit to authenticated;

-- retenção: limpa agregados e alertas antigos (180 dias) — só service_role / cron
create or replace function public.sc_purge_old_security_data(p_days int default 180)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n1 int; n2 int; n3 int; cutoff timestamptz;
begin
  cutoff := now() - make_interval(days => greatest(p_days, 30));
  delete from sc_security_alerts where created_at < cutoff;
  get diagnostics n1 = row_count;
  delete from sc_security_stats_daily where day < cutoff::date;
  get diagnostics n2 = row_count;
  delete from sc_consumed_onces where claimed_at < cutoff;
  get diagnostics n3 = row_count;
  return jsonb_build_object('alerts', n1, 'stats', n2, 'consumed', n3);
end $$;
revoke all on function public.sc_purge_old_security_data from public, anon, authenticated;
grant execute on function public.sc_purge_old_security_data to service_role;

-- backfill leve: se já existirem alertas, popular stats (idempotente por day+user+type+source)
insert into sc_security_stats_daily (day, user_id, alert_type, source, cnt)
select (timezone('utc', created_at))::date, user_id, alert_type, coalesce(source, 'client_reported'), count(*)
from sc_security_alerts
group by 1, 2, 3, 4
on conflict (day, user_id, alert_type, source) do update
  set cnt = greatest(sc_security_stats_daily.cnt, excluded.cnt);


-- =============================================================================
-- SecureChat — comprovante de "uma visão" (rode DEPOIS da 001 e da 003)
--
-- Quando uma mensagem de uma visão é aberta, o conteúdo some (como antes), mas fica
-- na conversa um COMPROVANTE visível para todos os participantes:
--   "Mensagem de uma visão · enviada 14:02 · aberta por Bruno às 14:05"
--   "Mensagem de uma visão · enviada 14:02 · expirou sem ser aberta"
-- Assim quem recebeu não pode dizer que não chegou nada, e quem enviou sabe se foi vista.
--
-- Quem escreve é só o servidor (triggers); o cliente não consegue forjar nem apagar.
-- Nada do conteúdo vai para cá: só datas, quem abriu e se era arquivo.
-- =============================================================================

-- hora em que a mensagem foi enviada (a linha em sc_messages é apagada ao abrir)
alter table public.sc_consumed_onces add column if not exists sent_at timestamptz;

create table if not exists public.sc_once_receipts (
  message_id bigint primary key,
  room_id    bigint not null references public.sc_rooms on delete cascade,
  sender_id  uuid   not null references public.profiles on delete cascade,
  sent_at    timestamptz not null,
  status     text   not null check (status in ('opened', 'expired')),
  viewer_id  uuid   references public.profiles on delete set null,
  opened_at  timestamptz,
  had_file   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists sc_once_receipts_room_idx on public.sc_once_receipts (room_id, sent_at);

alter table public.sc_once_receipts enable row level security;
drop policy if exists "participantes veem comprovantes" on public.sc_once_receipts;
create policy "participantes veem comprovantes" on public.sc_once_receipts for select to authenticated
  using (public.sc_is_member(room_id));
-- sem insert/update/delete para clientes (de propósito)

-- aberta: a Edge Function "reveal" grava em sc_consumed_onces -> vira comprovante
create or replace function public.sc_receipt_from_consumed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sc_rooms where id = new.room_id) then return new; end if;
  insert into sc_once_receipts (message_id, room_id, sender_id, sent_at, status, viewer_id, opened_at, had_file)
  values (new.message_id, new.room_id, new.sender_id, coalesce(new.sent_at, new.claimed_at),
          'opened', new.viewer_id, new.claimed_at, new.had_file)
  on conflict (message_id) do update
    set status = 'opened', viewer_id = excluded.viewer_id, opened_at = excluded.opened_at,
        had_file = excluded.had_file,
        sent_at = least(sc_once_receipts.sent_at, excluded.sent_at);
  return new;
end $$;
drop trigger if exists consumed_onces_receipt on public.sc_consumed_onces;
create trigger consumed_onces_receipt after insert or update of claimed_at on public.sc_consumed_onces
  for each row execute function public.sc_receipt_from_consumed();

-- expirou sem abrir: a limpeza apaga a mensagem vencida -> comprovante "expirou"
-- (apagar pelo remetente ou apagar a conversa inteira NÃO gera comprovante)
create or replace function public.sc_receipt_from_expired_once()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.kind <> 'once' or old.expires_at is null or old.expires_at > now() then return old; end if;
  if not exists (select 1 from sc_rooms where id = old.room_id) then return old; end if;   -- conversa sendo apagada
  insert into sc_once_receipts (message_id, room_id, sender_id, sent_at, status, had_file)
  values (old.id, old.room_id, old.sender_id, old.created_at, 'expired',
          exists (select 1 from sc_once_secrets where message_id = old.id and file_path is not null))
  on conflict (message_id) do nothing;
  return old;
end $$;
drop trigger if exists messages_once_expired_receipt on public.sc_messages;
create trigger messages_once_expired_receipt before delete on public.sc_messages
  for each row execute function public.sc_receipt_from_expired_once();

-- avisa em tempo real (o remetente vê "aberta por..." na hora)
do $$ begin
  alter publication supabase_realtime add table public.sc_once_receipts;
exception when duplicate_object then null; end $$;


-- ----------------------------------------------------------------- entrada no chat e diretório
-- entra na Sala Geral (só quem tem acesso); chamado pelo app ao abrir
create or replace function public.sc_join()
returns jsonb language plpgsql security definer set search_path = public as $$
declare g bigint;
begin
  if not public.sc_has_access() then raise exception 'sem acesso ao Chat Seguro'; end if;
  select id into g from sc_rooms where type = 'global' limit 1;
  if g is not null then
    insert into sc_room_members (room_id, user_id) values (g, auth.uid()) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'admin', public.sc_is_admin());
end $$;

-- contatos: só quem tem acesso ao chat (nome; o e-mail fica escondido)
create or replace function public.sc_directory()
returns table (id uuid, display_name text, username text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, case when p.id = auth.uid() then split_part(p.email, '@', 1) end
  from profiles p
  where public.sc_has_access() and public.sc_has_access(p.id)
  order by p.nome;
$$;
revoke all on function public.sc_join, public.sc_directory from public, anon;
grant execute on function public.sc_join, public.sc_directory to authenticated;
