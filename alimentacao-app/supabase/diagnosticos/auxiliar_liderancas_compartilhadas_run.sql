-- Liderança em mais de um auxiliar (mesmo nome na mesma coordenação)
-- → remove o vínculo de TODOS. Fica sem auxiliar até escolher de novo.
-- NÃO apaga auxiliar, liderança nem ficha.
-- A ÚLTIMA query é a lista — é ela que o Supabase mostra.

CREATE UNIQUE INDEX IF NOT EXISTS auxiliar_lideres_lider_id_unique
  ON public.auxiliar_lideres (lider_id);

WITH por_nome AS (
  SELECT
    coalesce(p.coordenador_id, l.coordenador_id) AS coord_id,
    lower(btrim(l.nome)) AS nome_key
  FROM auxiliar_lideres al
  JOIN lideres l ON l.id = al.lider_id
  JOIN profiles p ON p.id = al.auxiliar_id
  GROUP BY 1, 2
  HAVING count(DISTINCT al.auxiliar_id) > 1
),
por_id AS (
  SELECT
    coalesce(p.coordenador_id, l.coordenador_id) AS coord_id,
    lower(btrim(l.nome)) AS nome_key
  FROM auxiliar_lideres al
  JOIN lideres l ON l.id = al.lider_id
  JOIN profiles p ON p.id = al.auxiliar_id
  WHERE al.lider_id IN (
    SELECT lider_id FROM auxiliar_lideres GROUP BY lider_id HAVING count(*) > 1
  )
),
dups AS (
  SELECT DISTINCT coord_id, nome_key
  FROM (
    SELECT * FROM por_nome
    UNION
    SELECT * FROM por_id
  ) u
),
liberadas AS (
  SELECT
    c.nome AS coordenacao,
    l.nome AS lideranca,
    p.nome AS auxiliar_nome,
    al.auxiliar_id,
    al.lider_id
  FROM auxiliar_lideres al
  JOIN lideres l ON l.id = al.lider_id
  JOIN profiles p ON p.id = al.auxiliar_id
  LEFT JOIN coordenadores c ON c.id = coalesce(p.coordenador_id, l.coordenador_id)
  JOIN dups d
    ON d.coord_id IS NOT DISTINCT FROM coalesce(p.coordenador_id, l.coordenador_id)
   AND d.nome_key = lower(btrim(l.nome))
),
apagados AS (
  DELETE FROM auxiliar_lideres al
  USING liberadas x
  WHERE al.auxiliar_id = x.auxiliar_id
    AND al.lider_id = x.lider_id
  RETURNING al.lider_id
)
SELECT
  l.coordenacao,
  l.lideranca,
  string_agg(DISTINCT l.auxiliar_nome, ' | ' ORDER BY l.auxiliar_nome) AS antes_estava_com,
  'sem auxiliar — escolha de novo na Equipe' AS status
FROM liberadas l
GROUP BY l.coordenacao, l.lideranca
ORDER BY l.coordenacao NULLS LAST, l.lideranca;
