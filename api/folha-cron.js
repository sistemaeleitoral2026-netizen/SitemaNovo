// Rotina diária do Financeiro do Mandato (vercel.json -> crons).
// A) Folha da Câmara: salário do vereador + equipe do gabinete (só quando sai mês novo).
// B) Portal de despesas: VIEP, diárias e outros pagamentos em nome do vereador (todo dia).
// Chamada manual (carga inicial): GET /api/folha-cron com "Authorization: Bearer <CRON_SECRET>".
// A carga inicial grava até 4 meses por execução; chame de novo até "faltam" chegar a 0.
// Regravação completa: GET /api/folha-cron?forcar=1

const { criarDb, sincronizarFolha, sincronizarDespesas, diagnosticoFinanceiro } = require('./_financeiro')

module.exports = async function handler(req, res) {
  const json = (status, body) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  const segredo = process.env.CRON_SECRET
  if (!segredo || req.headers.authorization !== `Bearer ${segredo}`) {
    return json(401, { error: 'Não autorizado.' })
  }
  const url = process.env.GABINETE_SUPABASE_URL
  const key = process.env.GABINETE_SERVICE_ROLE_KEY
  if (!url || !key) return json(503, { error: 'GABINETE_SUPABASE_URL e GABINETE_SERVICE_ROLE_KEY faltam no servidor.' })

  const db = criarDb(url, key)
  const forcar = String((req.query && req.query.forcar) || '') === '1'
  const resultado = {}
  let falhou = false

  for (const [parte, fn] of [['folha', () => sincronizarFolha(db, { forcar })], ['despesas', () => sincronizarDespesas(db)]]) {
    try {
      resultado[parte] = await fn()
    } catch (err) {
      falhou = true
      console.error(`folha-cron [${parte}]`, err)
      resultado[parte] = { erro: err instanceof Error ? err.message : String(err) }
    }
  }

  try {
    resultado.base = await diagnosticoFinanceiro(db)
  } catch (err) {
    resultado.base = { erro: err instanceof Error ? err.message : String(err) }
  }

  return json(falhou ? 500 : 200, { ok: !falhou, ...resultado })
}
