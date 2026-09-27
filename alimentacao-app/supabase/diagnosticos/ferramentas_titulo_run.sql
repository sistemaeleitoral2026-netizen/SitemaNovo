-- Ferramentas > Título: consulta/validação de título nas fichas.
-- Após a primeira consulta, só quem consultou (ou admin/diretoria) edita.

alter table if exists public.cadastro_titulo_consultas
  drop constraint if exists cadastro_titulo_consultas_status_check;
alter table if exists public.cadastro_titulo_historico
  drop constraint if exists cadastro_titulo_historico_status_check;

create table if not exists public.cadastro_titulo_consultas (
  id uuid primary key default gen_random_uuid(),
  cadastro_id uuid not null unique references public.cadastros(id) on delete cascade,
  status text not null check (status in ('validado', 'nao_validado', 'com_problema')),
  consultado_por uuid not null references public.profiles(id) on delete restrict,
  consultado_por_nome text not null default '',
  consultado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cadastro_titulo_consultas_status_idx
  on public.cadastro_titulo_consultas (status, consultado_em desc);

create index if not exists cadastro_titulo_consultas_por_idx
  on public.cadastro_titulo_consultas (consultado_por, consultado_em desc);

create table if not exists public.cadastro_titulo_historico (
  id uuid primary key default gen_random_uuid(),
  cadastro_id uuid not null references public.cadastros(id) on delete cascade,
  tipo text not null check (tipo in ('consulta', 'edicao')),
  status text check (status in ('validado', 'nao_validado', 'com_problema')),
  ator_id uuid references public.profiles(id) on delete set null,
  ator_nome text not null default '',
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cadastro_titulo_historico_cadastro_idx
  on public.cadastro_titulo_historico (cadastro_id, created_at desc);

alter table public.cadastro_titulo_consultas
  drop constraint if exists cadastro_titulo_consultas_status_check;
alter table public.cadastro_titulo_consultas
  add constraint cadastro_titulo_consultas_status_check
  check (status in ('validado', 'nao_validado', 'com_problema'));

alter table public.cadastro_titulo_historico
  drop constraint if exists cadastro_titulo_historico_status_check;
alter table public.cadastro_titulo_historico
  add constraint cadastro_titulo_historico_status_check
  check (status in ('validado', 'nao_validado', 'com_problema'));

comment on table public.cadastro_titulo_consultas is
  'Consulta de título (validado / com problema). Uma por ficha.';

alter table public.cadastro_titulo_consultas enable row level security;
alter table public.cadastro_titulo_historico enable row level security;

drop policy if exists cadastro_titulo_consultas_select on public.cadastro_titulo_consultas;
create policy cadastro_titulo_consultas_select on public.cadastro_titulo_consultas
  for select to authenticated
  using (public.is_admin() or public.is_diretoria() or public.is_operador());

drop policy if exists cadastro_titulo_historico_select on public.cadastro_titulo_historico;
create policy cadastro_titulo_historico_select on public.cadastro_titulo_historico
  for select to authenticated
  using (public.is_admin() or public.is_diretoria() or public.is_operador());

create or replace function public.titulo_pode_ferramentas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.is_diretoria() or public.is_operador();
$$;

create or replace function public.titulo_marcar(p_cadastro_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_nome text;
  v_row public.cadastro_titulo_consultas%rowtype;
begin
  if v_me is null then
    raise exception 'Não autenticado';
  end if;
  if not public.titulo_pode_ferramentas() then
    raise exception 'Sem permissão';
  end if;
  if p_status not in ('validado', 'nao_validado', 'com_problema') then
    raise exception 'Status inválido';
  end if;
  if not exists (select 1 from public.cadastros where id = p_cadastro_id) then
    raise exception 'Ficha não encontrada';
  end if;

  select coalesce(nome, '—') into v_nome from public.profiles where id = v_me;
  v_nome := coalesce(v_nome, '—');

  select * into v_row
  from public.cadastro_titulo_consultas
  where cadastro_id = p_cadastro_id;

  if found then
    if v_row.consultado_por <> v_me and not (public.is_admin() or public.is_diretoria()) then
      raise exception 'Só quem consultou esta ficha pode alterar';
    end if;
    update public.cadastro_titulo_consultas
      set status = p_status,
          updated_at = now()
      where cadastro_id = p_cadastro_id;
  else
    insert into public.cadastro_titulo_consultas (
      cadastro_id, status, consultado_por, consultado_por_nome
    ) values (
      p_cadastro_id, p_status, v_me, v_nome
    );
  end if;

  insert into public.cadastro_titulo_historico (
    cadastro_id, tipo, status, ator_id, ator_nome
  ) values (
    p_cadastro_id, 'consulta', p_status, v_me, v_nome
  );
end;
$$;

create or replace function public.titulo_editar_ficha(
  p_cadastro_id uuid,
  p_nome_completo text,
  p_nome_mae text,
  p_data_nascimento text,
  p_titulo text,
  p_cpf text,
  p_zona text,
  p_secao text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_nome text;
  v_row public.cadastro_titulo_consultas%rowtype;
  v_antes jsonb;
  v_nasc date;
begin
  if v_me is null then
    raise exception 'Não autenticado';
  end if;
  if not public.titulo_pode_ferramentas() then
    raise exception 'Sem permissão';
  end if;

  select * into v_row
  from public.cadastro_titulo_consultas
  where cadastro_id = p_cadastro_id;

  if found and v_row.consultado_por <> v_me and not (public.is_admin() or public.is_diretoria()) then
    raise exception 'Só quem consultou esta ficha pode editar';
  end if;

  select coalesce(nome, '—') into v_nome from public.profiles where id = v_me;
  v_nome := coalesce(v_nome, '—');

  v_nasc := null;
  if coalesce(trim(p_data_nascimento), '') <> '' then
    begin
      v_nasc := p_data_nascimento::date;
    exception when others then
      raise exception 'Data de nascimento inválida';
    end;
  end if;

  select jsonb_build_object(
    'nome_completo', nome_completo,
    'nome_mae', nome_mae,
    'data_nascimento', data_nascimento,
    'titulo', titulo,
    'cpf', cpf,
    'zona', zona,
    'secao', secao
  )
  into v_antes
  from public.cadastros
  where id = p_cadastro_id;

  if v_antes is null then
    raise exception 'Ficha não encontrada';
  end if;

  update public.cadastros
    set nome_completo = coalesce(nullif(trim(p_nome_completo), ''), nome_completo),
        nome_mae = coalesce(trim(p_nome_mae), ''),
        data_nascimento = v_nasc,
        titulo = coalesce(trim(p_titulo), ''),
        cpf = nullif(trim(p_cpf), ''),
        zona = coalesce(trim(p_zona), ''),
        secao = coalesce(trim(p_secao), ''),
        updated_at = now()
    where id = p_cadastro_id;

  insert into public.cadastro_titulo_historico (
    cadastro_id, tipo, status, ator_id, ator_nome, detalhes
  ) values (
    p_cadastro_id,
    'edicao',
    v_row.status,
    v_me,
    v_nome,
    jsonb_build_object(
      'antes', v_antes,
      'depois', jsonb_build_object(
        'nome_completo', trim(coalesce(p_nome_completo, '')),
        'nome_mae', trim(coalesce(p_nome_mae, '')),
        'data_nascimento', p_data_nascimento,
        'titulo', trim(coalesce(p_titulo, '')),
        'cpf', trim(coalesce(p_cpf, '')),
        'zona', trim(coalesce(p_zona, '')),
        'secao', trim(coalesce(p_secao, ''))
      )
    )
  );
end;
$$;

revoke all on function public.titulo_marcar(uuid, text) from public;
revoke all on function public.titulo_editar_ficha(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.titulo_pode_ferramentas() to authenticated;
grant execute on function public.titulo_marcar(uuid, text) to authenticated;
grant execute on function public.titulo_editar_ficha(uuid, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
