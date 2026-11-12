-- MANEQUINHO deixa a ARANHA e vira liderança do coordenador PRETO (Nicole).
-- As 8 fichas vão junto. O nome da liderança continua MANEQUINHO.

do $$
declare
  v_preto uuid;
  v_preto_nome text;
  v_dir uuid;
  v_lid uuid;
  v_lid_nome text;
  v_fichas int := 0;
  v_nerites int := 0;
begin
  alter table public.cadastros disable trigger trg_formigas_owners_cadastros;
  alter table public.lideres disable trigger trg_formigas_owners_lideres;

  begin
    select c.id, c.nome, c.diretoria_id
      into v_preto, v_preto_nome, v_dir
    from public.coordenadores c
    left join public.profiles p on p.id = c.diretoria_id
    where regexp_replace(upper(btrim(c.nome)), '\s+', ' ', 'g') ~ '^PRETO$'
    order by
      case when p.nome ilike '%nicole%' then 0 else 1 end,
      c.ativo desc,
      c.created_at asc
    limit 1;

    if v_preto is null then
      raise exception 'Coordenador PRETO não encontrado.';
    end if;

    select id, nome into v_lid, v_lid_nome
    from public.lideres
    where regexp_replace(upper(btrim(nome)), '\s+', ' ', 'g') in ('MANEQUINHO', 'MANEKIM', 'MANE KIM')
    order by
      case when coordenador_id is distinct from v_preto then 0 else 1 end,
      ativo desc,
      created_at asc
    limit 1;

    if v_lid is null then
      raise exception 'Liderança MANEQUINHO não encontrada.';
    end if;

    update public.lideres
    set
      ativo = true,
      coordenador_id = v_preto,
      diretoria_id = coalesce(v_dir, diretoria_id)
    where id = v_lid;

    update public.cadastros
    set
      lider = v_lid_nome,
      coordenador = v_preto_nome,
      diretoria_id = coalesce(v_dir, diretoria_id)
    where regexp_replace(upper(btrim(lider)), '\s+', ' ', 'g') in ('MANEQUINHO', 'MANEKIM', 'MANE KIM');
    get diagnostics v_fichas = row_count;

    update public.profiles
    set
      lider_id = v_lid,
      coordenador_id = v_preto,
      diretoria_id = coalesce(v_dir, diretoria_id)
    where lider_id = v_lid;
    get diagnostics v_nerites = row_count;

    raise notice 'OK — MANEQUINHO % agora no coordenador PRETO %. Fichas: %. Nerites: %.',
      v_lid, v_preto, v_fichas, v_nerites;
  exception
    when others then
      alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
      alter table public.lideres enable trigger trg_formigas_owners_lideres;
      raise;
  end;

  alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
  alter table public.lideres enable trigger trg_formigas_owners_lideres;
end $$;

select lider, coordenador, count(*) as fichas
from public.cadastros
where regexp_replace(upper(btrim(lider)), '\s+', ' ', 'g') in ('MANEQUINHO', 'MANEKIM', 'MANE KIM')
group by lider, coordenador;

select l.nome as lideranca, l.ativo, co.nome as coordenador, d.nome as diretora
from public.lideres l
left join public.coordenadores co on co.id = l.coordenador_id
left join public.profiles d on d.id = l.diretoria_id
where regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') in ('MANEQUINHO', 'MANEKIM', 'MANE KIM');
