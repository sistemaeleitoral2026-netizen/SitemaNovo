-- Limpa quantidades da antiga mobilização sem lançamento Formigas (ativacao_em nulo).
-- Evita KPI "Casas: 1" fantasma sem registro real no módulo Formigas.

update public.cadastros
set
  adesivos_casa = 0,
  carros_adesivados = 0,
  postagens = 0
where ativacao_em is null
  and (
    coalesce(adesivos_casa, 0) > 0
    or coalesce(carros_adesivados, 0) > 0
    or coalesce(postagens, 0) > 0
  );

update public.lideres
set
  adesivos_casa = 0,
  carros_adesivados = 0,
  postagens = 0
where ativacao_em is null
  and (
    coalesce(adesivos_casa, 0) > 0
    or coalesce(carros_adesivados, 0) > 0
    or coalesce(postagens, 0) > 0
  );

update public.coordenadores
set
  adesivos_casa = 0,
  carros_adesivados = 0,
  postagens = 0
where ativacao_em is null
  and (
    coalesce(adesivos_casa, 0) > 0
    or coalesce(carros_adesivados, 0) > 0
    or coalesce(postagens, 0) > 0
  );
