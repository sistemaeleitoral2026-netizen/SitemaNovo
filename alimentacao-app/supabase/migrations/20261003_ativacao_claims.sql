-- Claims curtos para o botão "Próximo" no Lançar Formigas (anti-conflito entre formigas).

create table if not exists public.ativacao_claims (
  tipo text not null check (tipo in ('eleitor', 'lideranca', 'coordenador')),
  pessoa_id uuid not null,
  claimed_by uuid not null references public.profiles(id) on delete cascade,
  claimed_until timestamptz not null,
  primary key (tipo, pessoa_id)
);

create index if not exists ativacao_claims_until_idx
  on public.ativacao_claims (claimed_until);

create index if not exists ativacao_claims_by_idx
  on public.ativacao_claims (claimed_by);

alter table public.ativacao_claims enable row level security;

drop policy if exists ativacao_claims_select on public.ativacao_claims;
create policy ativacao_claims_select on public.ativacao_claims
  for select to authenticated
  using (true);

drop policy if exists ativacao_claims_insert on public.ativacao_claims;
create policy ativacao_claims_insert on public.ativacao_claims
  for insert to authenticated
  with check (
    claimed_by = auth.uid()
    and (public.is_mobilizador() or public.is_admin() or public.is_diretoria())
  );

drop policy if exists ativacao_claims_update on public.ativacao_claims;
create policy ativacao_claims_update on public.ativacao_claims
  for update to authenticated
  using (
    claimed_by = auth.uid()
    or public.is_admin()
    or public.is_diretoria()
  )
  with check (
    claimed_by = auth.uid()
    or public.is_admin()
    or public.is_diretoria()
  );

drop policy if exists ativacao_claims_delete on public.ativacao_claims;
create policy ativacao_claims_delete on public.ativacao_claims
  for delete to authenticated
  using (
    claimed_by = auth.uid()
    or public.is_admin()
    or public.is_diretoria()
  );

-- Pendente = sem lançamento de Formigas ainda
create or replace function public.ativacao_is_pendente(
  p_carros int,
  p_casa int,
  p_postagens int,
  p_links jsonb,
  p_contato boolean,
  p_ativacao_em timestamptz
)
returns boolean
language sql
immutable
as $$
  select
    p_ativacao_em is null
    and coalesce(p_carros, 0) = 0
    and coalesce(p_casa, 0) = 0
    and coalesce(p_postagens, 0) = 0
    and coalesce(p_contato, false) = false
    and (
      p_links is null
      or p_links = '[]'::jsonb
      or jsonb_typeof(p_links) <> 'array'
      or jsonb_array_length(p_links) = 0
    );
$$;

create or replace function public.claim_next_ativacao(p_diretoria_id uuid default null)
returns table (out_tipo text, out_pessoa_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tipo text;
  v_id uuid;
  v_until timestamptz := now() + interval '5 minutes';
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  if not (public.is_mobilizador() or public.is_admin() or public.is_diretoria()) then
    raise exception 'Sem permissão para Formigas';
  end if;

  -- limpa claims expirados (leve)
  delete from public.ativacao_claims where claimed_until < now();

  -- libera claim anterior deste usuário (só um por vez)
  delete from public.ativacao_claims where claimed_by = v_uid;

  select c.tipo, c.pessoa_id
  into v_tipo, v_id
  from (
    select 'eleitor'::text as tipo, c.id as pessoa_id
    from public.cadastros c
    where public.ativacao_is_pendente(
      c.carros_adesivados::int,
      c.adesivos_casa::int,
      c.postagens::int,
      c.postagem_links,
      c.contato_whatsapp,
      c.ativacao_em
    )
      and (p_diretoria_id is null or c.diretoria_id = p_diretoria_id)
      and not exists (
        select 1 from public.ativacao_claims ac
        where ac.tipo = 'eleitor'
          and ac.pessoa_id = c.id
          and ac.claimed_until >= now()
      )

    union all

    select 'lideranca'::text, l.id
    from public.lideres l
    where l.ativo = true
      and public.ativacao_is_pendente(
        l.carros_adesivados::int,
        l.adesivos_casa::int,
        l.postagens::int,
        l.postagem_links,
        l.contato_whatsapp,
        l.ativacao_em
      )
      and (p_diretoria_id is null or l.diretoria_id = p_diretoria_id)
      and not exists (
        select 1 from public.ativacao_claims ac
        where ac.tipo = 'lideranca'
          and ac.pessoa_id = l.id
          and ac.claimed_until >= now()
      )

    union all

    select 'coordenador'::text, o.id
    from public.coordenadores o
    where o.ativo = true
      and public.ativacao_is_pendente(
        o.carros_adesivados::int,
        o.adesivos_casa::int,
        o.postagens::int,
        o.postagem_links,
        o.contato_whatsapp,
        o.ativacao_em
      )
      and (p_diretoria_id is null or o.diretoria_id = p_diretoria_id)
      and not exists (
        select 1 from public.ativacao_claims ac
        where ac.tipo = 'coordenador'
          and ac.pessoa_id = o.id
          and ac.claimed_until >= now()
      )
  ) c
  order by random()
  limit 1;

  if v_id is null then
    return;
  end if;

  insert into public.ativacao_claims (tipo, pessoa_id, claimed_by, claimed_until)
  values (v_tipo, v_id, v_uid, v_until)
  on conflict (tipo, pessoa_id) do update
    set claimed_by = excluded.claimed_by,
        claimed_until = excluded.claimed_until
  where public.ativacao_claims.claimed_until < now()
     or public.ativacao_claims.claimed_by = v_uid;

  if not exists (
    select 1 from public.ativacao_claims
    where tipo = v_tipo and pessoa_id = v_id and claimed_by = v_uid and claimed_until >= now()
  ) then
    -- perdeu a corrida; cliente pode clicar Próximo de novo
    return;
  end if;

  out_tipo := v_tipo;
  out_pessoa_id := v_id;
  return next;
end;
$$;

create or replace function public.release_ativacao_claim(p_tipo text, p_pessoa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  delete from public.ativacao_claims
  where tipo = p_tipo
    and pessoa_id = p_pessoa_id
    and (
      claimed_by = auth.uid()
      or public.is_admin()
      or public.is_diretoria()
    );
end;
$$;

grant execute on function public.claim_next_ativacao(uuid) to authenticated;
grant execute on function public.release_ativacao_claim(text, uuid) to authenticated;

notify pgrst, 'reload schema';
