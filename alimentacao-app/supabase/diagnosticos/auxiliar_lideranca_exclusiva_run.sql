-- Garante: cada lider_id só pode estar com UM auxiliar.
-- 1) Se dois auxiliares tinham o mesmo lider_id, mantém o vínculo mais antigo
--    (menor auxiliar_id) e remove só o vínculo extra — não apaga auxiliar nem liderança.
-- 2) Cria índice único em auxiliar_lideres(lider_id).

WITH ranked AS (
  SELECT
    al.auxiliar_id,
    al.lider_id,
    row_number() OVER (
      PARTITION BY al.lider_id
      ORDER BY al.auxiliar_id
    ) AS rn
  FROM auxiliar_lideres al
)
DELETE FROM auxiliar_lideres al
USING ranked r
WHERE al.auxiliar_id = r.auxiliar_id
  AND al.lider_id = r.lider_id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS auxiliar_lideres_lider_id_unique
  ON public.auxiliar_lideres (lider_id);

-- Conferência (deve 0 linhas):
SELECT lider_id, count(*) AS auxiliares
FROM auxiliar_lideres
GROUP BY lider_id
HAVING count(*) > 1;
