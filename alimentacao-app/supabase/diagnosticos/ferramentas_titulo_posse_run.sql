-- Posse temporária da ficha no Título.
-- Só some das outras se alguém estiver com ela agora (heartbeat)
-- ou se já editou. Só abrir e clicar Próximo sem editar libera.

create table if not exists public.cadastro_titulo_posse (
  cadastro_id uuid primary key references public.cadastros(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_nome text not null default '',
  heartbeat_em timestamptz not null default now(),
  editou boolean not null default false
);

create index if not exists cadastro_titulo_posse_user_idx
  on public.cadastro_titulo_posse (user_id, heartbeat_em desc);

alter table public.cadastro_titulo_posse enable row level security;

drop policy if exists cadastro_titulo_posse_select on public.cadastro_titulo_posse;
create policy cadastro_titulo_posse_select on public.cadastro_titulo_posse
  for select to authenticated
  using (public.is_admin() or public.is_diretoria() or public.is_operador());

create or replace function public.titulo_posse_ativa(p_cadastro_id uuid, p_me uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cadastro_titulo_posse p
    where p.cadastro_id = p_cadastro_id
      and p.user_id <> p_me
      and (
        p.editou = true
        or p.heartbeat_em > now() - interval '2 minutes'
      )
  );
$$;

drop function if exists public.titulo_pegar(uuid);

create or replace function public.titulo_pegar(p_atual uuid default null, p_pular uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_nome text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Não autenticado';
  end if;
  if not public.titulo_pode_ferramentas() then
    raise exception 'Sem permissão';
  end if;

  select coalesce(nome, '—') into v_nome from public.profiles where id = v_me;
  v_nome := coalesce(v_nome, '—');

  delete from public.cadastro_titulo_posse
  where user_id <> v_me
    and editou = false
    and heartbeat_em <= now() - interval '2 minutes';

  if p_atual is not null
     and (p_pular is null or p_atual <> p_pular)
     and exists (select 1 from public.cadastros c where c.id = p_atual and c.data_nascimento is not null)
     and not exists (select 1 from public.cadastro_titulo_consultas t where t.cadastro_id = p_atual)
     and not public.titulo_posse_ativa(p_atual, v_me)
  then
    v_id := p_atual;
  end if;

  if v_id is null and p_pular is null then
    select p.cadastro_id into v_id
    from public.cadastro_titulo_posse p
    join public.cadastros c on c.id = p.cadastro_id
    where p.user_id = v_me
      and p.editou = true
      and c.data_nascimento is not null
      and not exists (select 1 from public.cadastro_titulo_consultas t where t.cadastro_id = p.cadastro_id)
    order by p.heartbeat_em desc
    limit 1;
  end if;

  if v_id is null then
    select c.id into v_id
    from public.cadastros c
    where c.data_nascimento is not null
      and (p_pular is null or c.id <> p_pular)
      and not exists (select 1 from public.cadastro_titulo_consultas t where t.cadastro_id = c.id)
      and not public.titulo_posse_ativa(c.id, v_me)
    order by random()
    limit 1;
  end if;

  if v_id is null then
    return null;
  end if;

  insert into public.cadastro_titulo_posse (cadastro_id, user_id, user_nome, heartbeat_em, editou)
  values (v_id, v_me, v_nome, now(), false)
  on conflict (cadastro_id) do update
    set user_id = excluded.user_id,
        user_nome = excluded.user_nome,
        heartbeat_em = now(),
        editou = public.cadastro_titulo_posse.editou or excluded.editou;

  return v_id;
end;
$$;

create or replace function public.titulo_manter(p_cadastro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.titulo_pode_ferramentas() then
    raise exception 'Sem permissão';
  end if;
  update public.cadastro_titulo_posse
    set heartbeat_em = now()
    where cadastro_id = p_cadastro_id
      and user_id = auth.uid();
end;
$$;

create or replace function public.titulo_soltar(p_cadastro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  delete from public.cadastro_titulo_posse
  where cadastro_id = p_cadastro_id
    and user_id = auth.uid()
    and editou = false;
end;
$$;

create or replace function public.titulo_marcar_editou(p_cadastro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_nome text;
begin
  if v_me is null or not public.titulo_pode_ferramentas() then
    raise exception 'Sem permissão';
  end if;
  select coalesce(nome, '—') into v_nome from public.profiles where id = v_me;
  insert into public.cadastro_titulo_posse (cadastro_id, user_id, user_nome, heartbeat_em, editou)
  values (p_cadastro_id, v_me, coalesce(v_nome, '—'), now(), true)
  on conflict (cadastro_id) do update
    set user_id = excluded.user_id,
        user_nome = excluded.user_nome,
        heartbeat_em = now(),
        editou = true;
end;
$$;

create or replace function public.titulo_limpa_posse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.cadastro_titulo_posse where cadastro_id = new.cadastro_id;
  return new;
end;
$$;

drop trigger if exists trg_titulo_consulta_limpa_posse on public.cadastro_titulo_consultas;
create trigger trg_titulo_consulta_limpa_posse
after insert or update on public.cadastro_titulo_consultas
for each row execute function public.titulo_limpa_posse();

grant execute on function public.titulo_posse_ativa(uuid, uuid) to authenticated;
grant execute on function public.titulo_pegar(uuid, uuid) to authenticated;
grant execute on function public.titulo_manter(uuid) to authenticated;
grant execute on function public.titulo_soltar(uuid) to authenticated;
grant execute on function public.titulo_marcar_editou(uuid) to authenticated;

notify pgrst, 'reload schema';
