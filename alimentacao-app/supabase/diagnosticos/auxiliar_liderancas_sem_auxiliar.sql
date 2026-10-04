-- Lideranças da coordenação que hoje NÃO têm nenhum auxiliar.
-- Use pra saber o que ainda precisa escolher de novo na Equipe.

SELECT
  c.nome AS coordenacao,
  l.nome AS lideranca,
  l.id AS lider_id
FROM lideres l
LEFT JOIN coordenadores c ON c.id = l.coordenador_id
WHERE NOT EXISTS (
  SELECT 1 FROM auxiliar_lideres al WHERE al.lider_id = l.id
)
ORDER BY c.nome NULLS LAST, l.nome;
