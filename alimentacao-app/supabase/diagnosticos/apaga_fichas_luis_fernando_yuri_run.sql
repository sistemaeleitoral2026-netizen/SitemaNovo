-- APAGA só as 10 fichas (cadastros) do Luís Fernando / Yuri Limpocar.
-- NÃO apaga liderança, coordenador, nerite nem nada da equipe.

do $$
declare
  v_ids uuid[] := array[
    '757d11a3-fef5-445f-b453-678fbc7e2ab9'::uuid,
    'fd9f830b-8299-4411-b9db-687b0fcf8330'::uuid,
    '40d33ff6-a7db-49e0-8754-9426999ffe98'::uuid,
    '1dd6f5b9-2ff0-4639-8431-09202648cb03'::uuid,
    '1963b1e0-8f59-41a1-b012-294d4ceacb9f'::uuid,
    'd0ce4940-f623-4f11-ad1a-d6f44c8b62e7'::uuid,
    'd939dda7-87c7-49a5-b0c1-822394cc1dce'::uuid,
    'bdc158a7-1480-4222-be94-3030059f4fa4'::uuid,
    'bef93dfb-5d0a-497e-a767-6a5693af217a'::uuid,
    'cf4b204f-f2cb-47a3-98a9-66b039aa4178'::uuid
  ];
  v_ok int := 0;
  v_fichas int := 0;
  v_hist int := 0;
  v_claims int := 0;
begin
  select count(*) into v_ok
  from public.cadastros c
  where c.id = any(v_ids)
    and regexp_replace(upper(btrim(coalesce(c.lider, ''))), '\s+', ' ', 'g') ~ 'LU[IÍ]S FERNANDO'
    and regexp_replace(upper(btrim(coalesce(c.coordenador, ''))), '\s+', ' ', 'g') ~ 'YURI';

  if v_ok <> coalesce(array_length(v_ids, 1), 0) then
    raise exception
      'Abortado: esperava % fichas Luís Fernando/Yuri, achei %. Confira os IDs.',
      array_length(v_ids, 1), v_ok;
  end if;

  alter table public.cadastros disable trigger trg_formigas_owners_cadastros;

  begin
    if to_regclass('public.formigas_historico') is not null then
      delete from public.formigas_historico
      where tipo = 'eleitor'
        and pessoa_id = any(v_ids);
      get diagnostics v_hist = row_count;
    end if;

    if to_regclass('public.ativacao_claims') is not null then
      delete from public.ativacao_claims
      where tipo = 'eleitor'
        and pessoa_id = any(v_ids);
      get diagnostics v_claims = row_count;
    end if;

    -- Título / posse / histórico de título: FK costuma ser cascade; limpa se existir.
    if to_regclass('public.cadastro_titulo_posse') is not null then
      delete from public.cadastro_titulo_posse where cadastro_id = any(v_ids);
    end if;

    delete from public.cadastros
    where id = any(v_ids)
      and regexp_replace(upper(btrim(coalesce(lider, ''))), '\s+', ' ', 'g') ~ 'LU[IÍ]S FERNANDO'
      and regexp_replace(upper(btrim(coalesce(coordenador, ''))), '\s+', ' ', 'g') ~ 'YURI';
    get diagnostics v_fichas = row_count;

    raise notice 'OK — fichas apagadas: %. Histórico Formigas: %. Claims: %.',
      v_fichas, v_hist, v_claims;
  exception
    when others then
      alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
      raise;
  end;

  alter table public.cadastros enable trigger trg_formigas_owners_cadastros;
end $$;

-- Conferência: tem que voltar 0
select count(*) as fichas_restantes
from public.cadastros
where id in (
  '757d11a3-fef5-445f-b453-678fbc7e2ab9',
  'fd9f830b-8299-4411-b9db-687b0fcf8330',
  '40d33ff6-a7db-49e0-8754-9426999ffe98',
  '1dd6f5b9-2ff0-4639-8431-09202648cb03',
  '1963b1e0-8f59-41a1-b012-294d4ceacb9f',
  'd0ce4940-f623-4f11-ad1a-d6f44c8b62e7',
  'd939dda7-87c7-49a5-b0c1-822394cc1dce',
  'bdc158a7-1480-4222-be94-3030059f4fa4',
  'bef93dfb-5d0a-497e-a767-6a5693af217a',
  'cf4b204f-f2cb-47a3-98a9-66b039aa4178'
);

-- Liderança e coordenador devem continuar existindo
select l.id, l.nome as lideranca, c.nome as coordenador, l.ativo
from public.lideres l
left join public.coordenadores c on c.id = l.coordenador_id
where regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') ~ 'LU[IÍ]S'
  and regexp_replace(upper(btrim(l.nome)), '\s+', ' ', 'g') ~ 'FERNANDO'
  and regexp_replace(upper(btrim(coalesce(c.nome, ''))), '\s+', ' ', 'g') ~ 'YURI';
