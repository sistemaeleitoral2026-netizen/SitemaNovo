// Rotina diária do Financeiro do Mandato (vercel.json -> crons).
// Só o salário do vereador: puxa a folha da Câmara quando sai mês novo.
// Equipe do gabinete e VIEP recebida são lançadas à mão no menu Financeiro.
// Chamada manual (carga inicial): GET /api/folha-cron com "Authorization: Bearer <CRON_SECRET>".
// A carga inicial grava até 4 meses por execução; chame de novo até "faltam" chegar a 0.
// Regravação completa: GET /api/folha-cron?forcar=1

const { criarDb, sincronizarFolha, diagnosticoFinanceiro } = require('./_financeiro')

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

  try {
    resultado.folha = await sincronizarFolha(db, { forcar })
  } catch (err) {
    falhou = true
    console.error('folha-cron [folha]', err)
    resultado.folha = { erro: err instanceof Error ? err.message : String(err) }
  }

  try {
    resultado.base = await diagnosticoFinanceiro(db)
  } catch (err) {
    resultado.base = { erro: err instanceof Error ? err.message : String(err) }
  }

  return json(falhou ? 500 : 200, { ok: !falhou, ...resultado })
}
