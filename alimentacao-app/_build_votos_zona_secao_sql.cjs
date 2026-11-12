/**
 * Gera SQL de diagnóstico: votos por zona/seção com local TSE.
 * Saídas: (1) local encontrado  (2) local NÃO encontrado.
 * Rode: node alimentacao-app/_build_votos_zona_secao_sql.cjs
 */
const fs = require('fs')
const path = require('path')

const root = __dirname
const jsonPath = path.join(root, 'public', 'data', 'locais-votacao-ma.json')
const outPath = path.join(root, 'supabase', 'diagnosticos', 'votos_por_zona_secao.sql')

const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

function esc(s) {
  return String(s ?? '').replace(/'/g, "''")
}

function padZona(z) {
  const d = String(z ?? '').replace(/\D/g, '')
  return d ? d.padStart(3, '0') : ''
}

function padSecao(s) {
  const d = String(s ?? '').replace(/\D/g, '')
  return d ? d.padStart(4, '0') : ''
}

const rows = []
for (const [key, v] of Object.entries(raw)) {
  if (!v || !v.l) continue
  const parts = String(key).split('|')
  const zona = padZona(parts[0])
  const secao = padSecao(parts[1])
  if (!zona || !secao) continue
  rows.push(`('${esc(zona)}','${esc(secao)}','${esc(v.l)}')`)
}

const CHUNK = 400
const inserts = []
for (let i = 0; i < rows.length; i += CHUNK) {
  inserts.push(
    `insert into _locais_tse (zona, secao, local) values\n${rows.slice(i, i + CHUNK).join(',\n')};`,
  )
}

const sql = `-- Contagem de votos por zona/seção com local de votação (TSE).
-- Rode no SQL Editor do Supabase (pode demorar alguns segundos no INSERT).
--
-- Resultado 1: zona/seção COM local correto (nome do colégio) + votos
-- Resultado 2: zona/seção preenchida mas NÃO encontrada no TSE + votos
-- (Ignora fichas sem zona ou sem seção.)

create temporary table _locais_tse (
  zona text not null,
  secao text not null,
  local text not null,
  primary key (zona, secao)
) on commit drop;

${inserts.join('\n\n')}

-- Pares zona/seção das fichas (só com zona+seção preenchidas), normalizados como no app
create temporary table _pares on commit drop as
select
  lpad(regexp_replace(coalesce(c.zona, ''), '[^0-9]', '', 'g'), 3, '0') as zona,
  lpad(regexp_replace(coalesce(c.secao, ''), '[^0-9]', '', 'g'), 4, '0') as secao,
  count(*) filter (where c.votou is true) as votos_sim,
  count(*) filter (where c.votou is false) as nao_votou,
  count(*) filter (where c.votou is null) as pendente,
  count(*) as total_fichas
from public.cadastros c
where nullif(regexp_replace(coalesce(c.zona, ''), '[^0-9]', '', 'g'), '') is not null
  and nullif(regexp_replace(coalesce(c.secao, ''), '[^0-9]', '', 'g'), '') is not null
group by 1, 2;

-- 1) Local de votação CORRETO (achado no TSE)
select
  p.zona,
  p.secao,
  t.local as local_votacao,
  p.votos_sim,
  p.nao_votou,
  p.pendente,
  p.total_fichas
from _pares p
join _locais_tse t on t.zona = p.zona and t.secao = p.secao
order by p.votos_sim desc, p.total_fichas desc, t.local, p.zona, p.secao;

-- 2) Local NÃO encontrado no TSE (zona/seção na ficha, fora da base)
select
  p.zona,
  p.secao,
  'Local não encontrado no TSE' as local_votacao,
  p.votos_sim,
  p.nao_votou,
  p.pendente,
  p.total_fichas
from _pares p
left join _locais_tse t on t.zona = p.zona and t.secao = p.secao
where t.zona is null
order by p.votos_sim desc, p.total_fichas desc, p.zona, p.secao;
`

fs.writeFileSync(outPath, sql)
console.log(`OK ${rows.length} locais → ${outPath} (${(Buffer.byteLength(sql) / 1024 / 1024).toFixed(2)} MB)`)
