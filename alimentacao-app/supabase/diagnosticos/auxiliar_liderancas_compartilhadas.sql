-- Diagnóstico: mesma liderança (lider_id) em mais de um auxiliar.
-- Só leitura. Não apaga ninguém.

SELECT
  l.nome AS lideranca,
  l.id AS lider_id,
  count(*) AS auxiliares,
  string_agg(p.nome, ' | ' ORDER BY p.nome) AS quem_tem
FROM auxiliar_lideres al
JOIN lideres l ON l.id = al.lider_id
JOIN profiles p ON p.id = al.auxiliar_id
GROUP BY l.id, l.nome
HAVING count(*) > 1
ORDER BY l.nome;

-- Mesmo nome na mesma coordenação, ids diferentes:
SELECT
  c.nome AS coordenacao,
  lower(btrim(l.nome)) AS nome_key,
  count(DISTINCT al.auxiliar_id) AS auxiliares,
  string_agg(DISTINCT p.nome, ' | ' ORDER BY p.nome) AS quem_tem,
  string_agg(DISTINCT l.nome, ' | ') AS nomes_originais
FROM auxiliar_lideres al
JOIN lideres l ON l.id = al.lider_id
JOIN profiles p ON p.id = al.auxiliar_id
LEFT JOIN coordenadores c ON c.id = coalesce(p.coordenador_id, l.coordenador_id)
GROUP BY c.nome, lower(btrim(l.nome))
HAVING count(DISTINCT al.auxiliar_id) > 1
ORDER BY c.nome, nome_key;
