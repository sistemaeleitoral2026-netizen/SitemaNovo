-- Diagnóstico: auxiliar com a mesma liderança mais de uma vez
-- (mesmo nome em `lideres`, ignorando maiúsculas/espaços).
-- Só leitura.

SELECT
  p.nome AS auxiliar,
  p.email,
  lower(btrim(l.nome)) AS nome_key,
  count(*) AS vinculos,
  array_agg(l.id ORDER BY l.id) AS lider_ids,
  array_agg(l.nome ORDER BY l.id) AS nomes_originais
FROM auxiliar_lideres al
JOIN profiles p ON p.id = al.auxiliar_id
JOIN lideres l ON l.id = al.lider_id
GROUP BY p.nome, p.email, lower(btrim(l.nome))
HAVING count(*) > 1
ORDER BY p.nome, nome_key;
