// Financeiro do Mandato — módulo compartilhado (o "_" no nome impede a Vercel de publicar como rota).
// Usado por api/folha-cron.js (coleta diária) e api/gabinete.js (recurso=financeiro*).
//
// Só o salário do vereador vem automático (folha da Câmara). Equipe do gabinete e VIEP
// recebida são lançadas à mão pelo gabinete — ver fin_gabinete_manual e fin_mes_manual
// em supabase/gabinete/financeiro_manual.sql.

// ===================== CONFIGURAÇÃO =====================
const CONFIG = {
  // Nome COMPLETO como está na folha da Câmara
  vereador: 'MATHEUS MENDES LIMA DE MORAES',
  // Primeiro mês buscado na carga inicial
  desde: process.env.FIN_DESDE || '2026-01',
  // Teto mensal da VIEP (verba indenizatória) por vereador
  tetoViep: Number(process.env.FIN_TETO_VIEP || 20000),
  // Teto mensal da cota de gabinete, para comparar com a soma dos salários cadastrados
  tetoGabinete: Number(process.env.FIN_TETO_GABINETE || 48331),
}

const CATEGORIAS = [
  'Combustível', 'Locação de veículo', 'Aluguel de escritório', 'Material de expediente',
  'Material gráfico e divulgação', 'Telefonia e internet', 'Alimentação', 'Passagens e hospedagem',
  'Consultoria e serviços', 'Manutenção', 'Eventos', 'Outros',
]

// ===================== UTILIDADES =====================
const MESES_ABREV = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 }
const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const normNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const num = (s) => Number(String(s ?? '0').replace(/\./g, '').replace(',', '.')) || 0
const r2 = (n) => Math.round(n * 100) / 100
const rotuloMes = (m) => `${NOMES_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`

/** "10/2026" | "12/25" | "jun/25" -> "2026-10"; null para 13º e formatos estranhos */
function refParaMes(ref) {
  const [m, a] = String(ref).split('/')
  const mes = MESES_ABREV[String(m).toLowerCase()] ?? Number(m)
  let ano = Number(a)
  if (ano < 100) ano += 2000
  if (!ano || !(mes >= 1 && mes <= 12)) return null
  return `${ano}-${String(mes).padStart(2, '0')}`
}

function agoraSP() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
}
function mesEsperado() {
  const d = agoraSP(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function baixar(url) {
  // Não invente um User-Agent de navegador aqui. O portal da Câmara rejeita
  // especificamente o identificador incompleto "Mozilla/5.0" com HTTP 406.
  // A rota pública responde normalmente ao fetch padrão do servidor.
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Portal respondeu ${res.status} em ${url.slice(0, 60)}`)
  return res
}

// ===================== PORTAL DE REMUNERAÇÃO DA CÂMARA (só o salário do vereador) =====================
const FOLHA = 'https://cmsaoluis.portalremuneracao.com.br'

async function listarMesesPublicados() {
  const html = await (await baixar(`${FOLHA}/`)).text()
  const porMes = new Map()
  for (const m of html.matchAll(/<option[^>]*value="([^"]+)"/g)) {
    const mes = refParaMes(m[1])
    if (mes && !porMes.has(mes)) porMes.set(mes, m[1])
  }
  return [...porMes].map(([mes, referencia]) => ({ mes, referencia }))
}

async function buscarFolha(referencia) {
  const q = new URLSearchParams({ draw: '1', start: '0', length: '5000', referencia, nome: '' })
  const json = await (await baixar(`${FOLHA}/data?${q}`)).json()
  return (json.data || [])
    .filter((x) => x.tipo_folha === 'Folha Mensal')
    .map((x) => ({
      nome: String(x.nome || '').trim(),
      bruto: num(x.valor), desconto: num(x.desconto), liquido: num(x.liquido),
    }))
}

// ===================== BANCO DO GABINETE (REST com service key) =====================
// Aceita a URL do projeto com barra no fim, com /rest/v1 colado, com espaços ou quebras de linha
function limparUrlSupabase(url) {
  return String(url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '').replace(/\/+$/, '')
}

function criarDb(urlBruta, keyBruta) {
  const url = limparUrlSupabase(urlBruta)
  const key = String(keyBruta || '').trim()
  async function req(path, { method = 'GET', body, prefer } = {}) {
    const headers = { Authorization: `Bearer ${key}`, apikey: key }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers.Prefer = prefer || 'return=representation,resolution=merge-duplicates'
    }
    const res = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || `Erro ${res.status}`
      const faltaTabela = /fin_|schema cache|PGRST205/i.test(String(msg))
      throw new Error(faltaTabela ? 'Rode supabase/gabinete/financeiro.sql e financeiro_manual.sql no projeto GABINETE.' : msg)
    }
    return data
  }
  return {
    get: (path) => req(path),
    upsert: (tabela, conflito, linhas) => req(`${tabela}?on_conflict=${conflito}`, { method: 'POST', body: linhas }),
    insertIgnorando: (tabela, conflito, linhas) => req(`${tabela}?on_conflict=${conflito}`, {
      method: 'POST', body: linhas, prefer: 'return=representation,resolution=ignore-duplicates',
    }),
    patch: (path, body) => req(path, { method: 'PATCH', body }),
    del: (path) => req(path, { method: 'DELETE' }),
  }
}

// ===================== COLETA (rotina diária) — só o salário do vereador =====================
const MAX_MESES_POR_EXECUCAO = 4 // a carga inicial termina em poucas execuções, sem estourar o tempo da função

async function sincronizarFolha(db, { forcar = false } = {}) {
  const gravados = new Set((await db.get('fin_folha_publicacao?select=mes')).map((r) => r.mes))
  const cargaInicial = gravados.size === 0
  const esperado = mesEsperado()
  const publicados = (await listarMesesPublicados())
    .filter((p) => p.mes >= CONFIG.desde)
    .sort((a, b) => a.mes.localeCompare(b.mes))

  // Sem forçar: só meses que ainda não entraram na base.
  // Com forçar: regrava todos os meses publicados (alimenta de novo o salário).
  const pendentes = forcar
    ? publicados
    : publicados.filter((p) => !gravados.has(p.mes))

  if (!forcar && !pendentes.length && gravados.has(esperado)) {
    return { status: `folha ${esperado} já gravada`, gravados: gravados.size, publicados: publicados.length }
  }
  if (!pendentes.length) {
    return {
      status: publicados.length
        ? `folha em dia (${gravados.size} mês(es) na base)`
        : `folha ${esperado} ainda não publicada`,
      gravados: gravados.size,
      publicados: publicados.length,
      faltam: 0,
    }
  }

  const lote = pendentes.slice(0, MAX_MESES_POR_EXECUCAO)
  const alvo = normNome(CONFIG.vereador)

  for (const { mes, referencia } of lote) {
    const folha = await buscarFolha(referencia)
    const sal = folha.find((f) => normNome(f.nome) === alvo)
    await db.upsert('fin_salario', 'mes', {
      mes, referencia, bruto: sal?.bruto || 0, desconto: sal?.desconto || 0, liquido: sal?.liquido || 0,
      recebeu: !!sal, atualizado_em: new Date().toISOString(),
    })
    await db.insertIgnorando('fin_folha_publicacao', 'mes', { mes, referencia, carga_inicial: cargaInicial })
  }
  return {
    status: 'folha gravada',
    meses: lote.map((l) => l.mes),
    faltam: pendentes.length - lote.length,
    gravados: gravados.size + lote.filter((l) => !gravados.has(l.mes)).length,
    publicados: publicados.length,
  }
}

/** Contagens rápidas para saber se a base GABINETE tem dados. */
async function diagnosticoFinanceiro(db) {
  const [pubs, sal, lan, eq, mesManual] = await Promise.all([
    db.get('fin_folha_publicacao?select=mes'),
    db.get('fin_salario?select=mes,recebeu,bruto'),
    db.get('fin_lancamento?select=id'),
    db.get('fin_gabinete_manual?select=id'),
    db.get('fin_mes_manual?select=mes'),
  ])
  return {
    publicacoes: pubs.length,
    salarios: sal.length,
    salariosComValor: sal.filter((s) => s.recebeu || Number(s.bruto) > 0).length,
    lancamentos: lan.length,
    equipeGabinete: eq.length,
    mesesComViepManual: mesManual.length,
    mesesSalario: sal.map((s) => s.mes).sort(),
  }
}

// ===================== RESUMO PARA O PAINEL =====================
async function montarResumo(db) {
  const [sal, lancamentos, equipe, viepManual, fundos, fundoLancamentos] = await Promise.all([
    db.get('fin_salario?select=*&order=mes.desc'),
    db.get('fin_lancamento?select=*&order=data.desc,criado_em.desc'),
    db.get('fin_gabinete_manual?select=*&order=criado_em.asc'),
    db.get('fin_mes_manual?select=*'),
    db.get('fin_fundos?select=*&order=criado_em.asc'),
    db.get('fin_fundo_lancamento?select=*&order=data.desc,criado_em.desc'),
  ])
  const viepPorMes = new Map(viepManual.map((v) => [v.mes, +v.viep_recebido]))

  const meses = new Map()
  const M = (mes) => {
    if (!meses.has(mes)) {
      meses.set(mes, {
        mes, rotulo: rotuloMes(mes),
        salario: null,
        viep: { teto: CONFIG.tetoViep, gasto: 0, saldo: CONFIG.tetoViep, reembolsado: viepPorMes.get(mes) || 0 },
        proprio: 0, outrosGastos: 0,
        porCategoria: {}, qtdLancamentos: 0,
      })
    }
    return meses.get(mes)
  }

  for (const s of sal) M(s.mes).salario = { bruto: +s.bruto, desconto: +s.desconto, liquido: +s.liquido, recebeu: s.recebeu }
  for (const mes of viepPorMes.keys()) M(mes) // garante que meses só com VIEP manual também apareçam

  for (const l of lancamentos) {
    const m = M(l.competencia)
    const v = +l.valor
    m.qtdLancamentos++
    if (l.status === 'glosado') continue // glosado não conta como gasto reembolsável
    if (l.origem === 'VIEP') m.viep.gasto += v
    else if (l.origem === 'PROPRIO') m.proprio += v
    else m.outrosGastos += v
    m.porCategoria[l.categoria] = (m.porCategoria[l.categoria] || 0) + v
  }

  const lista = [...meses.values()].filter((m) => m.mes >= CONFIG.desde).sort((a, b) => b.mes.localeCompare(a.mes)).map((m) => {
    m.viep.gasto = r2(m.viep.gasto); m.viep.reembolsado = r2(m.viep.reembolsado)
    m.viep.saldo = r2(m.viep.teto - m.viep.gasto)
    m.viep.aReceber = r2(Math.max(0, m.viep.gasto - m.viep.reembolsado))
    m.viep.aComprovar = r2(Math.max(0, m.viep.reembolsado - m.viep.gasto))
    m.viep.qtdNotas = lancamentos.filter((l) => l.competencia === m.mes && l.origem === 'VIEP' && l.status !== 'glosado').length
    // Salário e VIEP NUNCA se misturam: VIEP é reembolso de despesa, não remuneração
    const bruto = m.salario?.bruto || 0
    const liquido = m.salario?.liquido || 0
    m.totais = {
      salarioBruto: r2(bruto), descontos: r2(m.salario?.desconto || 0), salarioLiquido: r2(liquido),
      despesasProprias: r2(m.proprio), sobraSalario: r2(liquido - m.proprio),
      notasLancadas: r2(m.viep.gasto + m.proprio + m.outrosGastos),
    }
    m.porCategoria = Object.entries(m.porCategoria).map(([categoria, valor]) => ({ categoria, valor: r2(valor) })).sort((a, b) => b.valor - a.valor)
    return m
  })

  // Fundos: de onde sai o dinheiro que paga a equipe, cada um com seus lançamentos à mão
  const lancPorFundo = new Map()
  for (const l of fundoLancamentos) {
    const arr = lancPorFundo.get(l.fundo_id) || []
    arr.push(l)
    lancPorFundo.set(l.fundo_id, arr)
  }
  const fundosResumo = fundos.map((f) => {
    const lancs = lancPorFundo.get(f.id) || []
    return {
      id: f.id, nome: f.nome, descricao: f.descricao || '', ativo: f.ativo !== false,
      total: r2(lancs.reduce((s, l) => s + (+l.valor || 0), 0)),
      lancamentos: lancs.map((l) => ({ ...l, valor: +l.valor })),
    }
  })
  const fundoNomePorId = new Map(fundos.map((f) => [f.id, f.nome]))

  // Equipe do gabinete: cadastro manual, sem histórico mensal
  const equipeAtivos = equipe.filter((e) => e.ativo !== false)
  const totalGabinete = r2(equipeAtivos.reduce((s, e) => s + (+e.salario || 0), 0))

  const soma = (f) => r2(lista.reduce((s, m) => s + f(m), 0))
  return {
    atualizadoEm: new Date().toISOString(),
    config: { tetoViep: CONFIG.tetoViep, tetoGabinete: CONFIG.tetoGabinete, desde: CONFIG.desde },
    categorias: CATEGORIAS,
    meses: lista,
    totais: {
      salarioBruto: soma((m) => m.totais.salarioBruto), salarioLiquido: soma((m) => m.totais.salarioLiquido),
      viepNotas: soma((m) => m.viep.gasto), viepReembolsado: soma((m) => m.viep.reembolsado),
      despesasProprias: soma((m) => m.proprio), notasLancadas: soma((m) => m.totais.notasLancadas),
    },
    lancamentos: lancamentos.map((l) => ({ ...l, valor: +l.valor })),
    equipeGabinete: equipe.map((e) => ({
      ...e, salario: +e.salario,
      fundoNome: e.fundo_id ? fundoNomePorId.get(e.fundo_id) || '' : '',
    })),
    fundos: fundosResumo,
    gabinete: { teto: CONFIG.tetoGabinete, total: totalGabinete, saldo: r2(CONFIG.tetoGabinete - totalGabinete), pessoas: equipeAtivos.length },
    ultimaFolha: (sal[0] && sal[0].mes) || null,
  }
}

// ===================== VALIDAÇÃO DOS LANÇAMENTOS =====================
function validarLancamento(b) {
  const erro = (m) => { throw Object.assign(new Error(m), { status: 400 }) }
  const data = String(b.data || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) erro('Informe a data no formato AAAA-MM-DD.')
  const competencia = String(b.competencia || data.slice(0, 7)).slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(competencia)) erro('Competência inválida (AAAA-MM).')
  const origem = ['VIEP', 'PROPRIO', 'OUTRO'].includes(b.origem) ? b.origem : erro('Origem inválida.')
  const categoria = String(b.categoria || '').trim().slice(0, 60) || erro('Escolha a categoria.')
  const descricao = String(b.descricao || '').trim().slice(0, 240) || erro('Descreva a despesa.')
  const valor = r2(typeof b.valor === 'number' ? b.valor : num(b.valor))
  if (!(valor > 0)) erro('Valor precisa ser maior que zero.')
  const status = ['pendente', 'enviado', 'reembolsado', 'glosado', 'pago'].includes(b.status) ? b.status : (origem === 'VIEP' ? 'pendente' : 'pago')
  return {
    data, competencia, origem, categoria, descricao, valor, status,
    fornecedor: b.fornecedor ? String(b.fornecedor).trim().slice(0, 160) : null,
    documento: b.documento ? String(b.documento).trim().slice(0, 60) : null,
    observacao: b.observacao ? String(b.observacao).trim().slice(0, 500) : null,
  }
}

/** Valida o cadastro manual de uma pessoa do gabinete. */
function validarEquipeManual(b) {
  const erro = (m) => { throw Object.assign(new Error(m), { status: 400 }) }
  const nome = String(b.nome || '').trim().slice(0, 160) || erro('Informe o nome.')
  const cargo = b.cargo ? String(b.cargo).trim().slice(0, 120) : null
  const admissao = b.admissao ? String(b.admissao).slice(0, 10) : null
  if (admissao && !/^\d{4}-\d{2}-\d{2}$/.test(admissao)) erro('Data de admissão inválida.')
  const salario = r2(typeof b.salario === 'number' ? b.salario : num(b.salario))
  if (!(salario >= 0)) erro('Salário inválido.')
  const fundo_id = String(b.fundo_id || '').trim() || erro('Informe de onde sai o dinheiro.')
  if (!/^[0-9a-f-]{36}$/i.test(fundo_id)) erro('Fundo inválido.')
  return { nome, cargo, admissao, salario, fundo_id }
}

/** Valida um fundo (de onde sai o dinheiro que paga a equipe). */
function validarFundo(b) {
  const erro = (m) => { throw Object.assign(new Error(m), { status: 400 }) }
  const nome = String(b.nome || '').trim().slice(0, 120) || erro('Informe o nome do fundo.')
  const descricao = b.descricao ? String(b.descricao).trim().slice(0, 300) : null
  return { nome, descricao }
}

/** Valida um lançamento (depósito) num fundo: valor, origem e observação, num dia. */
function validarFundoLancamento(b) {
  const erro = (m) => { throw Object.assign(new Error(m), { status: 400 }) }
  const fundo_id = String(b.fundo_id || '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(fundo_id)) erro('Fundo inválido.')
  const data = String(b.data || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) erro('Informe a data no formato AAAA-MM-DD.')
  const valor = r2(typeof b.valor === 'number' ? b.valor : num(b.valor))
  if (!(valor > 0)) erro('Valor precisa ser maior que zero.')
  const origem = b.origem ? String(b.origem).trim().slice(0, 160) : null
  const observacao = b.observacao ? String(b.observacao).trim().slice(0, 500) : null
  return { fundo_id, data, valor, origem, observacao }
}

/** Valida o valor de VIEP recebido num mês. */
function validarViepManual(b) {
  const erro = (m) => { throw Object.assign(new Error(m), { status: 400 }) }
  const mes = String(b.mes || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(mes)) erro('Mês inválido (AAAA-MM).')
  const viep_recebido = r2(typeof b.valor === 'number' ? b.valor : num(b.valor))
  if (!(viep_recebido >= 0)) erro('Valor inválido.')
  return { mes, viep_recebido }
}

module.exports = {
  CONFIG, CATEGORIAS, criarDb, limparUrlSupabase, sincronizarFolha, montarResumo,
  validarLancamento, validarEquipeManual, validarViepManual, validarFundo, validarFundoLancamento,
  diagnosticoFinanceiro,
  // exportados para teste
  refParaMes, normNome, mesEsperado,
}
