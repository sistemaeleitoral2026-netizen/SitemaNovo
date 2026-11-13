// Financeiro do Mandato — módulo compartilhado (o "_" no nome impede a Vercel de publicar como rota).
// Usado por api/folha-cron.js (coleta diária) e api/gabinete.js (recurso=financeiro*).

// ===================== CONFIGURAÇÃO =====================
const CONFIG = {
  // Nome COMPLETO como na folha da Câmara e como no portal de despesas
  vereador: 'MATHEUS MENDES LIMA DE MORAES',
  vereadorDespesas: 'MATHEUS MENDES LIMA DE MORAES',
  // Primeiro mês buscado na carga inicial
  desde: process.env.FIN_DESDE || '2026-01',
  // Teto mensal da VIEP (verba indenizatória) por vereador
  tetoViep: Number(process.env.FIN_TETO_VIEP || 20000),
  // Teto mensal da cota de gabinete. ESTIMADO: vários gabinetes fecham exatamente nesse valor.
  // Confirme com a Câmara (e-SIC) e ajuste a variável FIN_TETO_GABINETE.
  tetoGabinete: Number(process.env.FIN_TETO_GABINETE || 48331),
  // Gabinetes usados pelo vereador. "ate" vazio = em aberto.
  // Na suplência (jun–set/2026) ele ocupou a vaga do Aldir Júnior e usou a estrutura desse gabinete.
  // Quando sair o gabinete próprio dele (2027), acrescente aqui a lotação nova, com "desde".
  gabinetes: [
    { lotacao: 'GAB VER ALDIR JUNIOR', desde: '2026-06', ate: '2026-09', nota: 'Suplência na vaga do Aldir Júnior' },
  ],
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

/** Gabinete atribuído ao vereador naquele mês (ou null) */
function gabineteDoMes(mes) {
  return CONFIG.gabinetes.find((g) => mes >= g.desde && (!g.ate || mes <= g.ate)) || null
}

async function baixar(url) {
  // Não invente um User-Agent de navegador aqui. O portal da Câmara rejeita
  // especificamente o identificador incompleto "Mozilla/5.0" com HTTP 406.
  // A rota pública responde normalmente ao fetch padrão do servidor.
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Portal respondeu ${res.status} em ${url.slice(0, 60)}`)
  return res
}

// ===================== PORTAL DE REMUNERAÇÃO DA CÂMARA =====================
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
      nome: String(x.nome || '').trim(), matricula: String(x.matricula || '').trim(),
      lotacao: String(x.lotacao || '').trim(), cargo: String(x.cargo_funcao || '').trim(),
      vinculo: String(x.vinculo || '').trim(), admissao: String(x.admissao || '').trim(),
      exoneracao: String(x.exoneracao || '').trim(),
      bruto: num(x.valor), desconto: num(x.desconto), liquido: num(x.liquido),
    }))
}

// ===================== PORTAL DE DESPESAS (GIAP / SISVETOR) =====================
const GIAP = 'https://saoluis.sisvetor.com.br/ords/saoluis/'

const decod = (s) => String(s)
  .replace(/<[^>]+>/g, '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim()
const dataISO = (br) => { const m = String(br).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }

function celulas(tr) {
  const out = {}
  for (const m of tr.matchAll(/<td[^>]*headers="([A-Z_0-9]+)"[^>]*>([\s\S]*?)<\/td>/gi)) {
    const href = m[2].match(/href="([^"]+)"/i)?.[1]
    out[m[1]] = { texto: decod(m[2]), href: href ? decod(href) : null }
  }
  return out
}

function categoriaEmpenho(objeto, natureza) {
  if (/VIEP|VERBA INDENIZAT/i.test(objeto)) return 'VIEP'
  if (/DI[AÁ]RIA/i.test(objeto) || /339014/.test(natureza)) return 'DIARIAS'
  return 'OUTROS'
}

/** Empenhos da Câmara (instituição 2) num ano. tipo O = orçamentário, R = restos a pagar */
async function listarEmpenhos(ano, tipo) {
  const url = `${GIAP}f?p=839:7::PESQUISAR:::INSTITUICAO,GLOBAL_EXERCICIO,P7_TIPO_DESPESA,P7_MODALIDADE,P7_SECRETARIA_SOLICITANTE,P7_DATA_FILTRO,P7_DATA_FILTRO_FIM,P7_SUBMIT,P7_COD_APLICACAO_COVID,P7_NUM_FICHA:2,${ano},${tipo},,,01%2F01%2F${ano},31%2F12%2F${ano},N,,`
  const html = await (await baixar(url)).text()
  return html.split(/<tr/i).filter((t) => /headers="CREDOR"/i.test(t)).map((tr) => {
    const c = celulas(tr)
    const objeto = c.OBJETO?.texto || ''
    const natureza = c.NAT_DESPESA?.texto || ''
    return {
      empenho: c.EMPENHO?.texto || '',
      credor: (c.CREDOR?.texto || '').replace(/\s+-\s+[\d./-]+$/, '').trim(), // CPF não é guardado
      data_empenho: dataISO(c.DAT_INCLUSAO?.texto || '') || null,
      objeto, natureza_despesa: natureza, categoria: categoriaEmpenho(objeto, natureza),
      empenhado: num(c.VLR_EMPENHADO?.texto), liquidado: num(c.VLR_LIQUIDADO?.texto),
      pago: num(c.VLR_PAGO_ACUMULADO?.texto), anulado: num(c.VLR_ANULADO?.texto),
      tipo, linkPagamentos: c.VLR_PAGO_ACUMULADO?.href || null,
    }
  })
}

async function listarPagamentos(link) {
  const html = await (await baixar(GIAP + link.replace(/^\/?ords\/saoluis\//, ''))).text()
  return html.split(/<tr/i).filter((t) => /headers="DAT_EFETIVACAO"/i.test(t)).map((tr) => {
    const c = celulas(tr)
    return { num_pagamento: c.NUM_PAGTO?.texto || '', data: dataISO(c.DAT_EFETIVACAO?.texto || ''), valor: num(c.VLR_PAGO?.texto) }
  }).filter((p) => p.data)
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
      throw new Error(faltaTabela ? 'Rode supabase/gabinete/financeiro.sql no projeto GABINETE.' : msg)
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

// ===================== COLETA (rotina diária) =====================
const MAX_MESES_POR_EXECUCAO = 4 // a carga inicial termina em poucas execuções, sem estourar o tempo da função

async function sincronizarFolha(db, { forcar = false } = {}) {
  const gravados = new Set((await db.get('fin_folha_publicacao?select=mes')).map((r) => r.mes))
  const cargaInicial = gravados.size === 0
  const esperado = mesEsperado()
  const publicados = (await listarMesesPublicados())
    .filter((p) => p.mes >= CONFIG.desde)
    .sort((a, b) => a.mes.localeCompare(b.mes))

  // Sem forçar: só meses que ainda não entraram na base.
  // Com forçar: regrava todos os meses publicados (alimenta de novo salário/equipe).
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
  const lotacoes = new Set(CONFIG.gabinetes.map((g) => g.lotacao.toUpperCase()))
  const desdeGab = CONFIG.gabinetes.reduce((m, g) => (g.desde < m ? g.desde : m), '9999-99')

  for (const { mes, referencia } of lote) {
    const folha = await buscarFolha(referencia)
    const sal = folha.find((f) => normNome(f.nome) === alvo)
    await db.upsert('fin_salario', 'mes', {
      mes, referencia, bruto: sal?.bruto || 0, desconto: sal?.desconto || 0, liquido: sal?.liquido || 0,
      recebeu: !!sal, atualizado_em: new Date().toISOString(),
    })

    // Equipe: grava a partir do 1º mês configurado e continua depois do "ate", para ver quem saiu
    if (mes >= desdeGab) {
      const porMat = new Map()
      for (const p of folha.filter((f) => lotacoes.has(f.lotacao.toUpperCase()))) {
        const k = p.matricula || p.nome
        const ja = porMat.get(k)
        if (ja) { ja.bruto += p.bruto; ja.desconto += p.desconto; ja.liquido += p.liquido } else porMat.set(k, { ...p })
      }
      const linhas = [...porMat.values()].map((p) => ({
        mes, lotacao: p.lotacao, matricula: p.matricula || p.nome, servidor: p.nome, cargo: p.cargo, vinculo: p.vinculo,
        admissao: p.admissao, exoneracao: p.exoneracao, bruto: r2(p.bruto), desconto: r2(p.desconto), liquido: r2(p.liquido),
      }))
      if (linhas.length) await db.upsert('fin_gabinete_pessoa', 'mes,matricula', linhas)
    }

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
  const [pubs, sal, emp, pag, pes, lan] = await Promise.all([
    db.get('fin_folha_publicacao?select=mes'),
    db.get('fin_salario?select=mes,recebeu,bruto'),
    db.get('fin_empenho?select=empenho'),
    db.get('fin_pagamento?select=empenho'),
    db.get('fin_gabinete_pessoa?select=mes'),
    db.get('fin_lancamento?select=id'),
  ])
  return {
    publicacoes: pubs.length,
    salarios: sal.length,
    salariosComValor: sal.filter((s) => s.recebeu || Number(s.bruto) > 0).length,
    empenhos: emp.length,
    pagamentos: pag.length,
    pessoasFolha: pes.length,
    lancamentos: lan.length,
    mesesSalario: sal.map((s) => s.mes).sort(),
  }
}

async function sincronizarDespesas(db) {
  const existentes = await db.get('fin_empenho?select=empenho,tipo,pago')
  const pagoAnterior = new Map(existentes.map((e) => [`${e.empenho}|${e.tipo}`, Number(e.pago)]))
  const anoAtual = agoraSP().getFullYear()
  const anoInicial = pagoAnterior.size === 0 ? Number(CONFIG.desde.slice(0, 4)) : anoAtual
  const alvo = normNome(CONFIG.vereadorDespesas)
  let empenhos = 0, detalhes = 0, novos = 0

  for (let ano = anoInicial; ano <= anoAtual; ano++) {
    for (const tipo of ['O', 'R']) {
      const lista = (await listarEmpenhos(ano, tipo)).filter((e) => normNome(e.credor) === alvo)
      for (const e of lista) {
        empenhos++
        const chave = `${e.empenho}|${tipo}`
        if (e.pago > 0 && e.linkPagamentos && pagoAnterior.get(chave) !== e.pago) {
          detalhes++
          const pags = await listarPagamentos(e.linkPagamentos)
          if (pags.length) {
            const ins = await db.insertIgnorando('fin_pagamento', 'empenho,num_pagamento,data',
              pags.map((p) => ({ empenho: e.empenho, num_pagamento: p.num_pagamento, data: p.data, categoria: e.categoria, valor: p.valor })))
            novos += Array.isArray(ins) ? ins.length : 0
          }
        }
        const { linkPagamentos, credor, ...linha } = e
        await db.upsert('fin_empenho', 'empenho,tipo', { ...linha, atualizado_em: new Date().toISOString() })
      }
    }
  }
  return { empenhos, detalhes, pagamentosNovos: novos }
}

// ===================== RESUMO PARA O PAINEL =====================
const ehCota = (vinculo) => String(vinculo || '').toUpperCase().startsWith('VERBA DE GABINETE')

async function montarResumo(db) {
  const [sal, pessoas, empenhos, pagamentos, lancamentos, info, pubs] = await Promise.all([
    db.get('fin_salario?select=*&order=mes.desc'),
    db.get('fin_gabinete_pessoa?select=*'),
    db.get('fin_empenho?select=*&order=data_empenho.desc'),
    db.get('fin_pagamento?select=*&order=data.desc'),
    db.get('fin_lancamento?select=*&order=data.desc,criado_em.desc'),
    db.get('fin_equipe_info?select=*'),
    db.get('fin_folha_publicacao?select=*&order=mes.desc'),
  ])

  const meses = new Map()
  const M = (mes) => {
    if (!meses.has(mes)) {
      meses.set(mes, {
        mes, rotulo: rotuloMes(mes),
        salario: null,
        viep: { teto: CONFIG.tetoViep, gasto: 0, saldo: CONFIG.tetoViep, reembolsado: 0 },
        gabinete: null,
        proprio: 0, outrosGastos: 0, diarias: 0, outrosRecebidos: 0,
        porCategoria: {}, qtdLancamentos: 0,
      })
    }
    return meses.get(mes)
  }

  for (const s of sal) M(s.mes).salario = { bruto: +s.bruto, desconto: +s.desconto, liquido: +s.liquido, recebeu: s.recebeu }

  // reembolsos e pagamentos da Câmara: entram na COMPETÊNCIA definida na conciliação; sem ela, no mês do pagamento
  for (const p of pagamentos) {
    const mes = p.competencia || String(p.data).slice(0, 7)
    const m = M(mes)
    if (p.categoria === 'VIEP') m.viep.reembolsado += +p.valor
    else if (p.categoria === 'DIARIAS') m.diarias += +p.valor
    else m.outrosRecebidos += +p.valor
  }

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

  // Gabinete: só nos meses atribuídos ao vereador
  const porMesGab = new Map()
  for (const p of pessoas) {
    const g = gabineteDoMes(p.mes)
    if (!g || g.lotacao.toUpperCase() !== String(p.lotacao).toUpperCase()) continue
    const a = porMesGab.get(p.mes) || { lotacao: g.lotacao, nota: g.nota || '', pessoas: 0, cota: 0, foraCota: 0 }
    a.pessoas++
    if (ehCota(p.vinculo)) a.cota += +p.bruto; else a.foraCota += +p.bruto
    porMesGab.set(p.mes, a)
  }
  for (const [mes, a] of porMesGab) {
    M(mes).gabinete = { ...a, cota: r2(a.cota), foraCota: r2(a.foraCota), teto: CONFIG.tetoGabinete, saldo: r2(CONFIG.tetoGabinete - a.cota) }
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

  // Equipe: quem passou pelos gabinetes no período do vereador, acompanhado até sair
  const ultimoMes = pessoas.reduce((x, p) => (p.mes > x ? p.mes : x), '')
  const infoMap = new Map(info.map((i) => [i.matricula, i]))
  const porPessoa = new Map()
  for (const p of pessoas) porPessoa.set(p.matricula, [...(porPessoa.get(p.matricula) || []), p])
  const equipe = [...porPessoa.values()]
    .filter((ls) => ls.some((l) => { const g = gabineteDoMes(l.mes); return g && g.lotacao.toUpperCase() === String(l.lotacao).toUpperCase() }))
    .map((ls) => {
      ls.sort((a, b) => a.mes.localeCompare(b.mes))
      const u = ls[ls.length - 1]
      const ativo = u.mes === ultimoMes
      const extra = infoMap.get(u.matricula) || {}
      return {
        matricula: u.matricula, servidor: u.servidor, cargo: u.cargo, vinculo: u.vinculo,
        origem: ehCota(u.vinculo) ? 'Cota de gabinete' : 'Orçamento geral da Câmara (a confirmar)',
        situacao: ativo ? 'No gabinete' : 'Saiu', primeiroMes: ls[0].mes, ultimoMes: u.mes,
        bruto: +u.bruto, liquido: +u.liquido, admissao: u.admissao,
        funcao_real: extra.funcao_real || '', telefone: extra.telefone || '', indicado_por: extra.indicado_por || '', observacao: extra.observacao || '',
        historico: ls.map((l) => ({ mes: l.mes, cargo: l.cargo, vinculo: l.vinculo, bruto: +l.bruto })),
      }
    })
    .sort((a, b) => (a.situacao === b.situacao ? a.servidor.localeCompare(b.servidor) : a.situacao === 'No gabinete' ? -1 : 1))

  const soma = (f) => r2(lista.reduce((s, m) => s + f(m), 0))
  return {
    atualizadoEm: new Date().toISOString(),
    config: { tetoViep: CONFIG.tetoViep, tetoGabinete: CONFIG.tetoGabinete, gabinetes: CONFIG.gabinetes, desde: CONFIG.desde },
    categorias: CATEGORIAS,
    meses: lista,
    totais: {
      salarioBruto: soma((m) => m.totais.salarioBruto), salarioLiquido: soma((m) => m.totais.salarioLiquido),
      viepNotas: soma((m) => m.viep.gasto), viepReembolsado: soma((m) => m.viep.reembolsado),
      despesasProprias: soma((m) => m.proprio), notasLancadas: soma((m) => m.totais.notasLancadas),
      gabineteCota: soma((m) => m.gabinete?.cota || 0), gabineteForaCota: soma((m) => m.gabinete?.foraCota || 0),
    },
    lancamentos: lancamentos.map((l) => ({ ...l, valor: +l.valor })),
    pagamentosCamara: pagamentos.map((p) => ({ ...p, valor: +p.valor })),
    empenhos: empenhos.map((e) => ({ ...e, empenhado: +e.empenhado, pago: +e.pago, liquidado: +e.liquidado, anulado: +e.anulado })),
    equipe,
    ultimaFolha: ultimoMes || (sal[0] && sal[0].mes) || null,
    publicacoes: pubs.filter((p) => !p.carga_inicial),
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

module.exports = {
  CONFIG, CATEGORIAS, criarDb, limparUrlSupabase, sincronizarFolha, sincronizarDespesas, montarResumo, validarLancamento,
  diagnosticoFinanceiro,
  // exportados para teste
  refParaMes, listarEmpenhos, listarPagamentos, normNome, mesEsperado,
}
