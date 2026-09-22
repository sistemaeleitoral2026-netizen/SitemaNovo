-- =============================================================================
-- Juntar THASILLA + THASSIA (e grafias parecidas) em UMA liderança: THASSIA
-- Rode no SQL Editor do Supabase (como postgres / service role).
--
-- O que faz:
--  1) Escolhe 1 registro "vencedor" (prefere nome THASSIA, senão o mais antigo)
--  2) Renomeia o vencedor para THASSIA
--  3) Atualiza TODAS as fichas (cadastros.lider) com esses nomes → THASSIA
--  4) Aponta nerites (profiles.lider_id) para o vencedor
--  5) Apaga as lideranças duplicadas
--
-- ANTES: rode só o bloco "PREVIEW" e confira.
-- DEPOIS: rode o bloco "MERGE" (descomente).
-- =============================================================================

-- ---------- PREVIEW (seguro — só lê) ----------
select
  l.id,
  l.nome,
  l.ativo,
  l.diretoria_id,
  d.nome as diretoria,
  l.coordenador_id,
  c.nome as coordenador,
  (
    select count(*) from public.cadastros x
    where lower(btrim(x.lider)) = lower(btrim(l.nome))
      and (l.diretoria_id is null or x.diretoria_id = l.diretoria_id)
  ) as fichas_pelo_nome
from public.lideres l
left join public.profiles d on d.id = l.diretoria_id
left join public.coordenadores c on c.id = l.coordenador_id
where l.nome ~* 'thasill|thassia|thasilla|tasilla|tassia'
order by l.nome, l.created_at;

select lider, coordenador, diretoria_id, count(*) as fichas
from public.cadastros
where lider ~* 'thasill|thassia|thasilla|tasilla|tassia'
group by lider, coordenador, diretoria_id
order by fichas desc;


-- ---------- MERGE (escreve — descomente o bloco inteiro para executar) ----------
/*
do $$
declare
  v_keep uuid;
  v_keep_coord uuid;
  v_keep_coord_nome text;
  v_keep_dir uuid;
  r record;
  v_fichas int;
  v_nerites int;
begin
  -- 1) Vencedor: prefere nome exato THASSIA; senão o mais antigo
  select l.id, l.coordenador_id, l.diretoria_id
    into v_keep, v_keep_coord, v_keep_dir
  from public.lideres l
  where l.nome ~* 'thasill|thassia|thasilla|tasilla|tassia'
  order by
    case when upper(btrim(l.nome)) = 'THASSIA' then 0 else 1 end,
    l.created_at asc nulls last,
    l.id
  limit 1;

  if v_keep is null then
    raise exception 'Nenhuma liderança Thassia/Thasilla encontrada.';
  end if;

  select c.nome into v_keep_coord_nome
  from public.coordenadores c
  where c.id = v_keep_coord;

  -- 2) Garante nome final THASSIA no vencedor
  update public.lideres
  set nome = 'THASSIA', ativo = true
  where id = v_keep;

  -- 3) Fichas: qualquer grafia → THASSIA
  --    (na mesma diretoria do vencedor, se houver; senão todas as que batem o nome)
  update public.cadastros c
  set
    lider = 'THASSIA',
    coordenador = coalesce(v_keep_coord_nome, c.coordenador)
  where c.lider ~* 'thasill|thassia|thasilla|tasilla|tassia'
    and (v_keep_dir is null or c.diretoria_id = v_keep_dir or c.diretoria_id is null);

  get diagnostics v_fichas = row_count;

  -- 4) Nerites apontando para duplicatas → vencedor
  update public.profiles p
  set lider_id = v_keep,
      coordenador_id = coalesce(v_keep_coord, p.coordenador_id)
  where p.lider_id in (
    select id from public.lideres
    where id <> v_keep
      and nome ~* 'thasill|thassia|thasilla|tasilla|tassia'
  );
  get diagnostics v_nerites = row_count;

  -- 5) Apaga duplicatas (fica só THASSIA)
  for r in
    select id, nome from public.lideres
    where id <> v_keep
      and nome ~* 'thasill|thassia|thasilla|tasilla|tassia'
  loop
    delete from public.lideres where id = r.id;
    raise notice 'Removida duplicata: % (%)', r.nome, r.id;
  end loop;

  raise notice 'OK — manteve id %, nome THASSIA. Fichas atualizadas: %. Nerites: %.',
    v_keep, v_fichas, v_nerites;
end $$;
*/

-- ---------- CONFERÊNCIA (rode depois do MERGE) ----------
/*
select id, nome, ativo, coordenador_id, diretoria_id
from public.lideres
where nome ~* 'thas|tassi';

select lider, coordenador, count(*) as fichas
from public.cadastros
where lider ~* 'thas|tassi'
group by lider, coordenador;
*/
