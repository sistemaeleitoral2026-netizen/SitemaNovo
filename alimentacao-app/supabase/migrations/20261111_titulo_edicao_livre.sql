-- Ferramenta Título: quem tem acesso ao menu pode editar qualquer ficha
-- (não só a própria nerite / quem consultou).

create or replace function public.enforce_cadastro_operator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Admin, diretoria, formiga e ferramenta Título podem alterar fichas de terceiros,
  -- mas nunca trocam o operator_id (dono da ficha).
  if public.is_admin()
     or public.is_diretoria()
     or public.is_mobilizador()
     or public.titulo_pode_ferramentas() then
    if tg_op = 'INSERT' and new.operator_id is null then
      new.operator_id := auth.uid();
    elsif tg_op = 'UPDATE' then
      new.operator_id := old.operator_id;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.operator_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    if old.operator_id is distinct from auth.uid() then
      raise exception 'Sem permissão para alterar cadastro de outra nerite';
    end if;
    new.operator_id := old.operator_id;
  end if;
  return new;
end;
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

create or replace function public.titulo_salvar_mapa(
  p_cadastro_id uuid,
  p_lat double precision,
  p_lng double precision
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
begin
  if v_me is null then
    raise exception 'Não autenticado';
  end if;
  if not public.titulo_pode_ferramentas() then
    raise exception 'Sem permissão';
  end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Ponto do mapa inválido';
  end if;
  if not exists (select 1 from public.cadastros where id = p_cadastro_id) then
    raise exception 'Ficha não encontrada';
  end if;

  select * into v_row
  from public.cadastro_titulo_consultas
  where cadastro_id = p_cadastro_id;

  select coalesce(nome, '—') into v_nome from public.profiles where id = v_me;
  v_nome := coalesce(v_nome, '—');

  update public.cadastros
    set lat = p_lat,
        lng = p_lng,
        updated_at = now()
    where id = p_cadastro_id;

  insert into public.cadastro_titulo_historico (
    cadastro_id, tipo, status, ator_id, ator_nome, detalhes
  ) values (
    p_cadastro_id,
    'mapa',
    v_row.status,
    v_me,
    v_nome,
    jsonb_build_object('lat', p_lat, 'lng', p_lng)
  );
end;
$$;

notify pgrst, 'reload schema';
