-- Limpa vínculos duplicados de liderança do auxiliar (mesmo nome, case/espaço).
-- Mantém o menor lider_id de cada grupo; apaga os demais.
-- Rode auxiliar_liderancas_duplicadas.sql antes para conferir.

WITH ranked AS (
  SELECT
    al.auxiliar_id,
    al.lider_id,
    row_number() OVER (
      PARTITION BY al.auxiliar_id, lower(btrim(l.nome))
      ORDER BY al.lider_id
    ) AS rn
  FROM auxiliar_lideres al
  JOIN lideres l ON l.id = al.lider_id
)
DELETE FROM auxiliar_lideres al
USING ranked r
WHERE al.auxiliar_id = r.auxiliar_id
  AND al.lider_id = r.lider_id
  AND r.rn > 1;

-- Conferência (deve voltar 0 linhas):
SELECT
  p.nome AS auxiliar,
  lower(btrim(l.nome)) AS nome_key,
  count(*) AS vinculos
FROM auxiliar_lideres al
JOIN profiles p ON p.id = al.auxiliar_id
JOIN lideres l ON l.id = al.lider_id
GROUP BY p.nome, lower(btrim(l.nome))
HAVING count(*) > 1;
