/**
 * Valores de todos os sistemas para o painel /admin.
 *
 * O admin (profiles.role = 'admin') passa no RLS de todas as tabelas, então lemos direto do Supabase.
 * Fluxo: `fetchAdminFinanceiroRaw()` carrega as linhas de cada sistema uma vez (com paginação) e
 * `computeAdminFinanceiro(raw, mes)` calcula tudo para qualquer mês, sem nova ida ao banco.
 * Um sistema que falhar vira "indisponível" sem derrubar os outros.
 */
import { carregarFinanceiro } from './gabinete'
import { carregarFinanceiroPessoal, type FpState, type FpTask } from './financeiroPessoal'
import { supabase } from './supabase'
import type { AdminSystemId } from './adminTypes'

/* ---------------- Tipos públicos ---------------- */
export type AdminTone = 'positive' | 'negative' | 'neutral'
export type AdminValueKind = 'money' | 'int' | 'pct' | 'text'

export type AdminFinanceMetric = {
  label: string
  value: number
  kind?: AdminValueKind
  tone?: AdminTone
  /** Valor do mês anterior, para mostrar a variação */
  prev?: number | null
  hint?: string
}

export type AdminSeriePonto = { mes: string; rotulo: string; a: number; b: number }

export type AdminFinColumn = { label: string; kind: AdminValueKind }
export type AdminFinRow = { cells: (string | number)[]; tone?: AdminTone }
export type AdminFinTable = { id: string; title: string; note?: string; columns: AdminFinColumn[]; rows: AdminFinRow[]; empty: string }

export type AdminFinSistema = {
  sistema: AdminSystemId
  nome: string
  home: string
  periodo: string
  available: boolean
  message?: string
  metrics: AdminFinanceMetric[]
  serie: AdminSeriePonto[]
  serieLabels: [string, string]
  tables: AdminFinTable[]
}

export type AdminFinConsolidado = {
  entradas: number; saidas: number; resultado: number; aReceber: number; patrimonio: number
  prevEntradas: number; prevSaidas: number; prevResultado: number
  fontes: string
}

export type AdminFinanceiro = { month: string; sistemas: AdminFinSistema[]; consolidado: AdminFinConsolidado }

type Row = Record<string, unknown>
type Loaded<T> = { ok: true; data: T } | { ok: false; error: string }

export type AdminFinRaw = {
  nerites: Loaded<{ devidos: Row[]; pagamentos: Row[]; coordenadores: Row[]; lideres: Row[] }>
  empresas: Loaded<{ lancamentos: Row[]; contratos: Row[] }>
  assessoria: Loaded<{ lancamentos: Row[]; tarefas: Row[] }>
  pessoal: Loaded<FpState>
  mandato: Loaded<Row>
  carregadoEm: string
}

/* ---------------- Datas ---------------- */
export function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value || String(new Date().getFullYear())
  const month = parts.find((p) => p.type === 'month')?.value || String(new Date().getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export function addMonths(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Lista de meses terminando em `month` (mais antigo primeiro). */
export function monthsBack(month: string, count: number) {
  return Array.from({ length: count }, (_, i) => addMonths(month, i - count + 1))
}

function monthDiff(a: string, b: string) {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
    .format(new Date(`${month}-15T12:00:00-03:00`))
}

export function monthShort(month: string) {
  const s = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(`${month}-15T12:00:00-03:00`))
  return `${s.replace('.', '')}/${month.slice(2, 4)}`
}

const ym = (value: unknown) => String(value || '').slice(0, 7)
const num = (value: unknown) => Number(value) || 0
const r2 = (value: number) => Math.round(value * 100) / 100
const txt = (value: unknown, fallback = '—') => String(value ?? '').trim() || fallback

/* ---------------- Cálculos (puros, testados) ---------------- */

/** Assessoria MB: mesmo critério do app (finKind em public/sistemas/assessoria-mb/app.js). */
export function mbKind(r: Row): 'receita' | 'entrada_por_fora' | 'saida' {
  const saved = String(r.tipo_lancamento || '')
  if (saved === 'receita' || saved === 'entrada_por_fora' || saved === 'saida') return saved
  return num(r.saida) > 0 && !num(r.previsto) && !num(r.recebido) ? 'saida' : 'receita'
}

/** Quanto falta receber de um lançamento de receita. */
export function mbFalta(r: Row) {
  return mbKind(r) === 'receita' ? Math.max(0, num(r.previsto) - num(r.recebido)) : 0
}

/** Financeiro Pessoal: saldo da conta = última conferência até o limite + lançamentos depois dela. */
export function fpAccountBalance(state: Pick<FpState, 'accChecks' | 'txs'>, account: { id: string; initial: number }, limit: string) {
  let last: FpState['accChecks'][number] | null = null
  for (const c of state.accChecks) {
    if (c.accId !== account.id) continue
    const st = `${c.date}T${c.time}`
    if (st > limit) continue
    if (!last || st > `${last.date}T${last.time}`) last = c
  }
  const from = last ? `${last.date}T${last.time}` : ''
  let balance = last ? last.balance : account.initial
  for (const x of state.txs) {
    if (x.account !== account.id) continue
    const st = `${x.date}T${x.time || '00:00'}`
    if (st > from && st <= limit) balance += x.kind === 'income' ? x.amount : -x.amount
  }
  return r2(balance)
}

/** Financeiro Pessoal: a programação cai no mês `k`? (mesma regra de occursIn do app). */
export function fpOccursIn(task: Pick<FpTask, 'rec' | 'start' | 'end'>, k: string) {
  const r = task.rec || ({ type: 'monthly' } as FpTask['rec'])
  const start = task.start ? ym(task.start) : ''
  const end = task.end ? ym(task.end) : ''
  if (r.type === 'once') return ym(r.dateTo || r.dateFrom || '') === k
  if (start && k < start) return false
  if (end && k > end) return false
  if (r.type === 'yearly') return Number(k.slice(5)) === Number(r.month)
  return monthDiff(start || k, k) % (r.every || 1) === 0
}

function fpDueDay(task: FpTask, k: string) {
  const r = task.rec
  if (r.type === 'once') return r.dateTo || r.dateFrom || `${k}-28`
  const last = new Date(Number(k.slice(0, 4)), Number(k.slice(5)), 0).getDate()
  const day = Math.min(Math.max(r.dayTo || r.dayFrom || last, r.dayFrom || 1), last)
  return `${k}-${String(day).padStart(2, '0')}`
}

/** Empresas: quanto do contrato já entrou (lançamentos de entrada ligados a ele). */
export function mrContratoExecucao(contrato: Row, lancamentos: Row[]) {
  const total = num(contrato.valor_total)
  const recebido = r2(lancamentos.filter((l) => l.contrato_id === contrato.id && l.tipo === 'entrada').reduce((s, l) => s + num(l.valor), 0))
  return { total, recebido, falta: Math.max(0, r2(total - recebido)), pct: total > 0 ? Math.min(1, recebido / total) : 0 }
}

/** Nerites: devido/pago/falta por alvo (coordenador e cada liderança separados, como em buildHierarquiaFinanceiro). */
export function neritesAlvos(devidos: Row[], pagamentos: Row[]) {
  const key = (r: Row) => `${r.coordenador_id}|${r.lider_id || ''}`
  const map = new Map<string, { coordenador_id: string; lider_id: string | null; devido: number; pago: number }>()
  const get = (r: Row) => {
    const k = key(r)
    let item = map.get(k)
    if (!item) { item = { coordenador_id: String(r.coordenador_id), lider_id: (r.lider_id as string) || null, devido: 0, pago: 0 }; map.set(k, item) }
    return item
  }
  devidos.forEach((r) => { get(r).devido += num(r.valor_devido) })
  pagamentos.forEach((r) => { get(r).pago += num(r.valor) })
  return [...map.values()].map((a) => ({ ...a, devido: r2(a.devido), pago: r2(a.pago), falta: Math.max(0, r2(a.devido - a.pago)) }))
}

/* ---------------- Carga ---------------- */
async function selectAll(table: string, columns = '*'): Promise<Row[]> {
  const out: Row[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + page - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data || []) as unknown as Row[]
    out.push(...rows)
    if (rows.length < page) break
  }
  return out
}

async function optional(table: string, columns = '*') {
  try { return await selectAll(table, columns) } catch { return [] }
}

async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try { return { ok: true, data: await fn() } } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

export async function fetchAdminFinanceiroRaw(): Promise<AdminFinRaw> {
  const [nerites, empresas, assessoria, pessoal, mandato] = await Promise.all([
    load(async () => {
      const [devidos, pagamentos, coordenadores, lideres] = await Promise.all([
        selectAll('financeiro_coordenador', 'coordenador_id,lider_id,valor_devido'),
        selectAll('financeiro_lancamentos', 'coordenador_id,lider_id,valor,forma,created_at'),
        optional('coordenadores', 'id,nome'),
        optional('lideres', 'id,nome'),
      ])
      return { devidos, pagamentos, coordenadores, lideres }
    }),
    load(async () => {
      const [lancamentos, contratos] = await Promise.all([selectAll('mr_lancamentos'), optional('mr_contratos')])
      return { lancamentos, contratos }
    }),
    load(async () => {
      const [lancamentos, tarefas] = await Promise.all([selectAll('mb_lancamentos'), optional('mb_tarefas', 'id,titulo,status,valor,prazo')])
      return { lancamentos, tarefas }
    }),
    load(async () => (await carregarFinanceiroPessoal()).estado),
    load(async () => (await carregarFinanceiro()) as Row),
  ])
  return { nerites, empresas, assessoria, pessoal, mandato, carregadoEm: new Date().toISOString() }
}

/* ---------------- Montagem por sistema ---------------- */
const SERIE_MESES = 6
const MR_EMPRESAS: Record<string, string> = {
  mr: 'MR', 're-fashion': 'RE FASHION', iron: 'IRON', globo: 'GLOBO', mcc: 'MCC', limpocar: 'LIMPOCAR SEMINOVOS', 'tips-graf': 'TIPS GRÁF',
}
const FORMAS: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', transferencia: 'Transferência' }

const money = (label: string): AdminFinColumn => ({ label, kind: 'money' })
const text = (label: string): AdminFinColumn => ({ label, kind: 'text' })
const toneOf = (value: number): AdminTone => (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral')

function base(sistema: AdminSystemId, nome: string, home: string, periodo: string): AdminFinSistema {
  return { sistema, nome, home, periodo, available: true, metrics: [], serie: [], serieLabels: ['Entradas', 'Saídas'], tables: [] }
}

function unavailable(s: AdminFinSistema, error: string): AdminFinSistema {
  return { ...s, available: false, message: `Dados indisponíveis: ${error}` }
}

function serieDe(month: string, fn: (k: string) => [number, number]): AdminSeriePonto[] {
  return monthsBack(month, SERIE_MESES).map((k) => { const [a, b] = fn(k); return { mes: k, rotulo: monthShort(k), a: r2(a), b: r2(b) } })
}

function buildNerites(raw: AdminFinRaw['nerites'], month: string) {
  const s = base('nerites', 'Sistema Nerites', '/financeiro', 'Posição atual')
  if (!raw.ok) return { sistema: unavailable(s, raw.error), aReceber: 0 }
  const { devidos, pagamentos, coordenadores, lideres } = raw.data
  const alvos = neritesAlvos(devidos, pagamentos)
  const devido = r2(alvos.reduce((t, a) => t + a.devido, 0))
  const pago = r2(alvos.reduce((t, a) => t + a.pago, 0))
  const falta = r2(alvos.reduce((t, a) => t + a.falta, 0))
  const pagoMes = (k: string) => pagamentos.filter((p) => ym(p.created_at) === k).reduce((t, p) => t + num(p.valor), 0)
  s.metrics = [
    { label: 'Valor devido', value: devido },
    { label: 'Já pago', value: pago, tone: 'positive' },
    { label: 'Falta pagar', value: falta, tone: falta > 0 ? 'negative' : 'positive' },
    { label: 'Pago no mês', value: r2(pagoMes(month)), prev: r2(pagoMes(addMonths(month, -1))) },
    { label: 'Quitado', value: devido > 0 ? pago / devido : 0, kind: 'pct' },
  ]
  s.serieLabels = ['Pagamentos', '']
  s.serie = serieDe(month, (k) => [pagoMes(k), 0])

  const nomeCoord = new Map(coordenadores.map((c) => [String(c.id), txt(c.nome)]))
  const nomeLider = new Map(lideres.map((l) => [String(l.id), txt(l.nome)]))
  const porCoord = new Map<string, { devido: number; pago: number; falta: number }>()
  for (const a of alvos) {
    const item = porCoord.get(a.coordenador_id) || { devido: 0, pago: 0, falta: 0 }
    item.devido += a.devido; item.pago += a.pago; item.falta += a.falta
    porCoord.set(a.coordenador_id, item)
  }
  s.tables.push({
    id: 'nerites-coord', title: 'Coordenadores — devido × pago', note: 'Inclui as lideranças de cada coordenador.',
    columns: [text('Coordenador'), money('Devido'), money('Pago'), money('Falta'), { label: 'Quitado', kind: 'pct' }],
    rows: [...porCoord.entries()].sort((a, b) => b[1].falta - a[1].falta).map(([id, v]) => ({
      cells: [nomeCoord.get(id) || 'Coordenador', r2(v.devido), r2(v.pago), r2(v.falta), v.devido > 0 ? v.pago / v.devido : 0],
      tone: v.falta > 0 ? 'negative' : 'positive',
    })),
    empty: 'Nenhum valor devido cadastrado.',
  })
  const formas = new Map<string, { total: number; qtd: number; mes: number }>()
  for (const p of pagamentos) {
    const f = String(p.forma || 'outro')
    const item = formas.get(f) || { total: 0, qtd: 0, mes: 0 }
    item.total += num(p.valor); item.qtd += 1
    if (ym(p.created_at) === month) item.mes += num(p.valor)
    formas.set(f, item)
  }
  s.tables.push({
    id: 'nerites-formas', title: 'Pagamentos por forma',
    columns: [text('Forma'), { label: 'Qtd.', kind: 'int' }, money('No mês'), money('Total')],
    rows: [...formas.entries()].sort((a, b) => b[1].total - a[1].total).map(([f, v]) => ({ cells: [FORMAS[f] || f, v.qtd, r2(v.mes), r2(v.total)] })),
    empty: 'Nenhum pagamento lançado.',
  })
  const pendLider = alvos.filter((a) => a.lider_id && a.falta > 0).sort((a, b) => b.falta - a.falta).slice(0, 15)
  s.tables.push({
    id: 'nerites-lider', title: 'Lideranças com maior valor a pagar',
    columns: [text('Liderança'), text('Coordenador'), money('Devido'), money('Pago'), money('Falta')],
    rows: pendLider.map((a) => ({ cells: [nomeLider.get(String(a.lider_id)) || 'Liderança', nomeCoord.get(a.coordenador_id) || '—', a.devido, a.pago, a.falta], tone: 'negative' })),
    empty: 'Nenhuma liderança com valor em aberto.',
  })
  return { sistema: s, aReceber: falta }
}

function buildEmpresas(raw: AdminFinRaw['empresas'], month: string) {
  const s = base('mr-terceiriza', 'Empresas', '/mr-terceiriza', monthLabel(month))
  const zero = { sistema: s, entradas: 0, saidas: 0, prevEntradas: 0, prevSaidas: 0 }
  if (!raw.ok) return { ...zero, sistema: unavailable(s, raw.error) }
  const { lancamentos, contratos } = raw.data
  const tot = (k: string | ((d: string) => boolean), tipo: 'entrada' | 'saida', empresa?: string) =>
    lancamentos.filter((l) => l.tipo === tipo && (typeof k === 'string' ? ym(l.data) === k : k(String(l.data || ''))) && (!empresa || l.empresa === empresa))
      .reduce((t, l) => t + num(l.valor), 0)
  const prev = addMonths(month, -1)
  const ano = (d: string) => d.slice(0, 4) === month.slice(0, 4) && ym(d) <= month
  const ent = tot(month, 'entrada'), sai = tot(month, 'saida')
  const pEnt = tot(prev, 'entrada'), pSai = tot(prev, 'saida')
  const resAno = tot(ano, 'entrada') - tot(ano, 'saida')
  const hoje = todayISO()
  const ativos = contratos.filter((c) => {
    const ini = String(c.inicio || '')
    if (!ini) return false
    const fim = `${addMonths(ym(ini), Math.max(1, num(c.meses)) - 1)}-31`
    return ini <= hoje && hoje <= fim
  })
  s.metrics = [
    { label: 'Entradas', value: r2(ent), prev: r2(pEnt), tone: 'positive' },
    { label: 'Saídas', value: r2(sai), prev: r2(pSai), tone: 'negative' },
    { label: 'Resultado', value: r2(ent - sai), prev: r2(pEnt - pSai), tone: toneOf(ent - sai) },
    { label: `Resultado ${month.slice(0, 4)}`, value: r2(resAno), tone: toneOf(resAno), hint: 'Do início do ano até o mês' },
    { label: 'Contratos ativos', value: ativos.length, kind: 'int', hint: `${ativos.length ? formatAdminMoney(ativos.reduce((t, c) => t + num(c.valor_total), 0)) : 'R$ 0'} em valor total` },
  ]
  s.serie = serieDe(month, (k) => [tot(k, 'entrada'), tot(k, 'saida')])

  const empresas = new Set([...Object.keys(MR_EMPRESAS), ...lancamentos.map((l) => String(l.empresa || ''))].filter(Boolean))
  s.tables.push({
    id: 'mr-empresas', title: 'Por empresa',
    columns: [text('Empresa'), money('Entradas no mês'), money('Saídas no mês'), money('Resultado no mês'), money(`Resultado ${month.slice(0, 4)}`)],
    rows: [...empresas].map((e) => {
      const en = tot(month, 'entrada', e), sa = tot(month, 'saida', e)
      const an = tot(ano, 'entrada', e) - tot(ano, 'saida', e)
      return { cells: [MR_EMPRESAS[e] || e.toUpperCase(), r2(en), r2(sa), r2(en - sa), r2(an)], tone: toneOf(en - sa) }
    }).sort((a, b) => Number(b.cells[4]) - Number(a.cells[4])),
    empty: 'Nenhuma empresa com lançamentos.',
  })
  const centros = new Map<string, { e: number; s: number }>()
  for (const l of lancamentos) {
    if (ym(l.data) !== month) continue
    const c = txt(l.centro_custo, 'Sem centro de custo')
    const item = centros.get(c) || { e: 0, s: 0 }
    if (l.tipo === 'entrada') item.e += num(l.valor); else item.s += num(l.valor)
    centros.set(c, item)
  }
  s.tables.push({
    id: 'mr-centros', title: 'Centros de custo no mês',
    columns: [text('Centro de custo'), money('Entradas'), money('Saídas'), money('Resultado')],
    rows: [...centros.entries()].sort((a, b) => b[1].s - a[1].s).map(([c, v]) => ({ cells: [c, r2(v.e), r2(v.s), r2(v.e - v.s)], tone: toneOf(v.e - v.s) })),
    empty: 'Nenhum lançamento no mês.',
  })
  s.tables.push({
    id: 'mr-contratos', title: 'Contratos', note: 'Recebido = entradas lançadas ligadas ao contrato.',
    columns: [text('Contrato'), text('Empresa'), money('Valor total'), money('Recebido'), money('Falta'), { label: 'Executado', kind: 'pct' }, text('Situação')],
    rows: contratos.map((c) => {
      const ex = mrContratoExecucao(c, lancamentos)
      const ativo = ativos.includes(c)
      return { cells: [txt(c.nome), MR_EMPRESAS[String(c.empresa)] || txt(c.empresa), ex.total, ex.recebido, ex.falta, ex.pct, ativo ? 'Ativo' : String(c.inicio || '') > hoje ? 'A iniciar' : 'Encerrado'] }
    }).sort((a, b) => Number(b.cells[4]) - Number(a.cells[4])),
    empty: 'Nenhum contrato cadastrado.',
  })
  return { sistema: s, entradas: ent, saidas: sai, prevEntradas: pEnt, prevSaidas: pSai }
}

function buildAssessoria(raw: AdminFinRaw['assessoria'], month: string) {
  const s = base('assessoria-mb', 'Assessoria MB', '/assessoria-mb', monthLabel(month))
  const zero = { sistema: s, entradas: 0, saidas: 0, prevEntradas: 0, prevSaidas: 0, aReceber: 0 }
  if (!raw.ok) return { ...zero, sistema: unavailable(s, raw.error) }
  const { lancamentos, tarefas } = raw.data
  const doMes = (k: string) => lancamentos.filter((r) => ym(r.data) === k)
  const resumo = (k: string) => {
    const rows = doMes(k)
    const receitas = rows.filter((r) => mbKind(r) !== 'saida')
    return {
      previsto: receitas.filter((r) => mbKind(r) === 'receita').reduce((t, r) => t + num(r.previsto), 0),
      recebido: receitas.reduce((t, r) => t + num(r.recebido), 0),
      saidas: rows.reduce((t, r) => t + num(r.saida), 0),
      falta: rows.reduce((t, r) => t + mbFalta(r), 0),
    }
  }
  const cur = resumo(month), prv = resumo(addMonths(month, -1))
  const abertos = lancamentos.filter((r) => mbFalta(r) > 0.009)
  const faltaTotal = r2(abertos.reduce((t, r) => t + mbFalta(r), 0))
  const tarefasAbertas = tarefas.filter((t) => t.status !== 'Concluída')
  s.metrics = [
    { label: 'Previsto', value: r2(cur.previsto), prev: r2(prv.previsto) },
    { label: 'Recebido', value: r2(cur.recebido), prev: r2(prv.recebido), tone: 'positive' },
    { label: 'Saídas', value: r2(cur.saidas), prev: r2(prv.saidas), tone: 'negative' },
    { label: 'Saldo do mês', value: r2(cur.recebido - cur.saidas), tone: toneOf(cur.recebido - cur.saidas) },
    { label: 'A receber (total)', value: faltaTotal, tone: faltaTotal > 0 ? 'negative' : 'neutral', hint: `${abertos.length} lançamento(s) em aberto` },
  ]
  s.serieLabels = ['Recebido', 'Saídas']
  s.serie = serieDe(month, (k) => { const r = resumo(k); return [r.recebido, r.saidas] })
  const centros = new Map<string, { p: number; r: number; s: number; f: number }>()
  for (const r of doMes(month)) {
    const c = txt(r.centro, 'Sem centro')
    const item = centros.get(c) || { p: 0, r: 0, s: 0, f: 0 }
    if (mbKind(r) === 'receita') item.p += num(r.previsto)
    item.r += num(r.recebido); item.s += num(r.saida); item.f += mbFalta(r)
    centros.set(c, item)
  }
  s.tables.push({
    id: 'mb-centros', title: 'Centros no mês', note: 'Por competência (data do lançamento).',
    columns: [text('Centro'), money('Previsto'), money('Recebido'), money('Falta'), money('Saídas')],
    rows: [...centros.entries()].sort((a, b) => b[1].p - a[1].p).map(([c, v]) => ({ cells: [c, r2(v.p), r2(v.r), r2(v.f), r2(v.s)] })),
    empty: 'Nenhum lançamento no mês.',
  })
  s.tables.push({
    id: 'mb-abertos', title: 'Maiores valores a receber',
    columns: [text('Parceiro'), text('Centro'), text('Data'), money('Previsto'), money('Recebido'), money('Falta')],
    rows: abertos.sort((a, b) => mbFalta(b) - mbFalta(a)).slice(0, 20).map((r) => ({
      cells: [txt(r.parceiro), txt(r.centro), String(r.data || ''), num(r.previsto), num(r.recebido), r2(mbFalta(r))], tone: 'negative',
    })),
    empty: 'Nada a receber.',
  })
  s.tables.push({
    id: 'mb-tarefas', title: 'Tarefas em aberto',
    columns: [text('Tarefa'), text('Situação'), text('Prazo'), money('Valor')],
    rows: tarefasAbertas.sort((a, b) => String(a.prazo || '9999').localeCompare(String(b.prazo || '9999'))).slice(0, 20)
      .map((t) => ({ cells: [txt(t.titulo), txt(t.status), String(t.prazo || '—'), num(t.valor)] })),
    empty: 'Nenhuma tarefa em aberto.',
  })
  return { sistema: s, entradas: cur.recebido, saidas: cur.saidas, prevEntradas: prv.recebido, prevSaidas: prv.saidas, aReceber: faltaTotal }
}

function buildPessoal(raw: AdminFinRaw['pessoal'], month: string) {
  const s = base('financeiro-pessoal', 'Financeiro Pessoal', '/financeiro-pessoal', monthLabel(month))
  const zero = { sistema: s, entradas: 0, saidas: 0, prevEntradas: 0, prevSaidas: 0, patrimonio: 0 }
  if (!raw.ok) return { ...zero, sistema: unavailable(s, raw.error) }
  const st = raw.data
  const tot = (k: string, kind: 'income' | 'expense') => st.txs.filter((x) => x.kind === kind && ym(x.date) === k).reduce((t, x) => t + x.amount, 0)
  const isCurrent = month === currentMonth()
  const limit = isCurrent ? `${todayISO()}T23:59` : `${month}-31T23:59`
  const contas = st.accounts.map((a) => ({ nome: a.name, tipo: a.type, saldo: fpAccountBalance(st, a, limit) }))
  const totalContas = r2(contas.reduce((t, c) => t + c.saldo, 0))
  const invest = st.investments.map((i) => {
    const snaps = st.snapshots.filter((x) => x.invId === i.id && `${x.date}T${x.time}` <= limit).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    const last = snaps.at(-1)
    return { nome: i.name, inst: i.institution, saldo: last?.balance ?? 0, data: last?.date || '' }
  })
  const totalInvest = r2(invest.reduce((t, i) => t + i.saldo, 0))
  const rec = tot(month, 'income'), des = tot(month, 'expense')
  const pRec = tot(addMonths(month, -1), 'income'), pDes = tot(addMonths(month, -1), 'expense')
  const hoje = todayISO()
  const programados = st.tasks
    .filter((t) => (t.kind || 'pagamento') === 'pagamento' && fpOccursIn(t, month) && !t.paused)
    .map((t) => {
      const done = st.taskDone.find((d) => d.taskId === t.id && d.period === month)
      const due = fpDueDay(t, month)
      const situacao = done ? (done.status === 'dispensada' ? 'Dispensado' : 'Pago') : due < hoje ? 'Atrasado' : 'A pagar'
      return { t, done, due, situacao, valor: done?.amount ?? t.expected ?? 0 }
    })
  const pendentes = programados.filter((p) => !p.done)
  const valorPend = r2(pendentes.reduce((t, p) => t + (p.t.expected || 0), 0))
  const atrasados = pendentes.filter((p) => p.situacao === 'Atrasado').length
  s.metrics = [
    { label: 'Receitas', value: r2(rec), prev: r2(pRec), tone: 'positive' },
    { label: 'Despesas', value: r2(des), prev: r2(pDes), tone: 'negative' },
    { label: 'Resultado', value: r2(rec - des), prev: r2(pRec - pDes), tone: toneOf(rec - des) },
    { label: 'Saldo em contas', value: totalContas, tone: toneOf(totalContas), hint: isCurrent ? 'Hoje' : 'No fim do mês' },
    { label: 'Investido', value: totalInvest, hint: 'Último saldo verificado' },
    { label: 'Pagamentos a fazer', value: valorPend, tone: atrasados ? 'negative' : 'neutral', hint: `${pendentes.length} pendente(s)${atrasados ? `, ${atrasados} atrasado(s)` : ''}` },
  ]
  s.serieLabels = ['Receitas', 'Despesas']
  s.serie = serieDe(month, (k) => [tot(k, 'income'), tot(k, 'expense')])
  s.tables.push({
    id: 'fp-contas', title: 'Contas', note: s.metrics[3].hint,
    columns: [text('Conta'), text('Tipo'), money('Saldo')],
    rows: contas.sort((a, b) => b.saldo - a.saldo).map((c) => ({ cells: [c.nome, c.tipo, c.saldo], tone: toneOf(c.saldo) })),
    empty: 'Nenhuma conta cadastrada.',
  })
  s.tables.push({
    id: 'fp-invest', title: 'Investimentos',
    columns: [text('Aplicação'), text('Instituição'), text('Verificado em'), money('Saldo')],
    rows: invest.sort((a, b) => b.saldo - a.saldo).map((i) => ({ cells: [i.nome, txt(i.inst), i.data || '—', i.saldo] })),
    empty: 'Nenhum investimento cadastrado.',
  })
  s.tables.push({
    id: 'fp-programados', title: 'Pagamentos programados do mês',
    columns: [text('Pagamento'), text('Para'), text('Vence'), money('Valor'), text('Situação')],
    rows: programados.sort((a, b) => a.due.localeCompare(b.due)).map((p) => ({
      cells: [p.t.title, txt(p.t.payee), p.due, num(p.valor), p.situacao],
      tone: p.situacao === 'Atrasado' ? 'negative' : p.situacao === 'Pago' ? 'positive' : undefined,
    })),
    empty: 'Nenhum pagamento programado no mês.',
  })
  const cats = new Map<string, number>()
  st.txs.filter((x) => x.kind === 'expense' && ym(x.date) === month).forEach((x) => cats.set(x.category || 'Outros', (cats.get(x.category || 'Outros') || 0) + x.amount))
  s.tables.push({
    id: 'fp-categorias', title: 'Despesas por categoria no mês',
    columns: [text('Categoria'), money('Valor'), { label: 'Do total', kind: 'pct' }],
    rows: [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ cells: [c, r2(v), des > 0 ? v / des : 0] })),
    empty: 'Nenhuma despesa no mês.',
  })
  return { sistema: s, entradas: rec, saidas: des, prevEntradas: pRec, prevSaidas: pDes, patrimonio: r2(totalContas + totalInvest) }
}

function buildMandato(raw: AdminFinRaw['mandato'], month: string) {
  const s = base('painel-do-mandato', 'Painel do Mandato', '/painel-do-mandato', monthLabel(month))
  if (!raw.ok) return { sistema: unavailable(s, raw.error), aReceber: 0 }
  const meses = (raw.data.meses || []) as Row[]
  const mes = (k: string) => meses.find((m) => m.mes === k)
  const viep = (k: string) => (mes(k)?.viep || {}) as Row
  const totais = (k: string) => (mes(k)?.totais || {}) as Row
  const v = viep(month), t = totais(month), pv = viep(addMonths(month, -1)), pt = totais(addMonths(month, -1))
  const fundos = (raw.data.fundos || []) as Row[]
  s.metrics = [
    { label: 'Salário líquido', value: num(t.salarioLiquido), prev: num(pt.salarioLiquido) },
    { label: 'VIEP gasta', value: num(v.gasto), prev: num(pv.gasto), tone: 'negative', hint: `Teto ${formatAdminMoney(num(v.teto))}` },
    { label: 'VIEP recebida', value: num(v.reembolsado), prev: num(pv.reembolsado), tone: 'positive' },
    { label: 'VIEP a receber', value: num(v.aReceber), tone: num(v.aReceber) > 0 ? 'negative' : 'neutral' },
    { label: 'Despesas próprias', value: num(t.despesasProprias), prev: num(pt.despesasProprias) },
    { label: 'Sobra do salário', value: num(t.sobraSalario), tone: toneOf(num(t.sobraSalario)) },
  ]
  if (!mes(month)) s.message = 'Sem dados do mês no Gabinete.'
  s.serieLabels = ['VIEP recebida', 'VIEP gasta']
  s.serie = serieDe(month, (k) => [num(viep(k).reembolsado), num(viep(k).gasto)])
  s.tables.push({
    id: 'mandato-mes', title: 'VIEP e salário no mês',
    columns: [text('Item'), money('Valor')],
    rows: [
      ['Teto da VIEP', num(v.teto)], ['Gasto da VIEP', num(v.gasto)], ['Saldo da VIEP', num(v.saldo)], ['VIEP recebida', num(v.reembolsado)],
      ['VIEP a receber', num(v.aReceber)], ['VIEP a comprovar', num(v.aComprovar)], ['Salário bruto', num(t.salarioBruto)], ['Descontos', num(t.descontos)],
      ['Salário líquido', num(t.salarioLiquido)], ['Despesas próprias', num(t.despesasProprias)], ['Sobra do salário', num(t.sobraSalario)],
    ].map(([l, val]) => ({ cells: [l, val] })),
    empty: 'Sem dados.',
  })
  s.tables.push({
    id: 'mandato-categorias', title: 'Gastos por categoria no mês',
    columns: [text('Categoria'), money('Valor')],
    rows: ((mes(month)?.porCategoria || []) as Row[]).map((c) => ({ cells: [txt(c.categoria), num(c.valor)] })),
    empty: 'Sem gastos no mês.',
  })
  s.tables.push({
    id: 'mandato-fundos', title: 'Fundos',
    columns: [text('Fundo'), money('Total')],
    rows: fundos.filter((f) => f.ativo !== false).map((f) => ({ cells: [txt(f.nome), num(f.total)] })),
    empty: 'Nenhum fundo cadastrado.',
  })
  return { sistema: s, aReceber: num(v.aReceber) }
}

export function computeAdminFinanceiro(raw: AdminFinRaw, month: string): AdminFinanceiro {
  const ne = buildNerites(raw.nerites, month)
  const mr = buildEmpresas(raw.empresas, month)
  const mb = buildAssessoria(raw.assessoria, month)
  const fp = buildPessoal(raw.pessoal, month)
  const md = buildMandato(raw.mandato, month)
  const entradas = r2(mr.entradas + mb.entradas + fp.entradas)
  const saidas = r2(mr.saidas + mb.saidas + fp.saidas)
  const prevEntradas = r2(mr.prevEntradas + mb.prevEntradas + fp.prevEntradas)
  const prevSaidas = r2(mr.prevSaidas + mb.prevSaidas + fp.prevSaidas)
  return {
    month,
    sistemas: [mr.sistema, mb.sistema, fp.sistema, md.sistema, ne.sistema],
    consolidado: {
      entradas, saidas, resultado: r2(entradas - saidas), prevEntradas, prevSaidas, prevResultado: r2(prevEntradas - prevSaidas),
      aReceber: r2(mb.aReceber + ne.aReceber + md.aReceber),
      patrimonio: fp.patrimonio,
      fontes: 'Empresas + Assessoria MB + Financeiro Pessoal',
    },
  }
}

/** Compatibilidade: valores do mês atual. */
export async function fetchAdminFinanceiro(month = currentMonth()) {
  return computeAdminFinanceiro(await fetchAdminFinanceiroRaw(), month)
}

/* ---------------- Formatação ---------------- */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export function formatAdminMoney(value: number) {
  return BRL.format(value)
}

export function formatAdminValue(value: string | number, kind: AdminValueKind) {
  if (typeof value === 'string') return value
  if (kind === 'money') return BRL.format(value)
  if (kind === 'pct') return `${Math.round(value * 100)}%`
  if (kind === 'int') return value.toLocaleString('pt-BR')
  return String(value)
}

/** Variação percentual em relação ao mês anterior (null quando não dá para calcular). */
export function variacao(value: number, prev: number | null | undefined) {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null
  return (value - prev) / Math.abs(prev)
}

/** CSV (separador ;) de uma tabela, para abrir no Excel. */
export function tabelaParaCsv(table: AdminFinTable) {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const head = table.columns.map((c) => esc(c.label)).join(';')
  const body = table.rows.map((r) => r.cells.map((cell, i) => {
    const kind = table.columns[i]?.kind || 'text'
    if (typeof cell === 'number' && kind === 'money') return cell.toFixed(2).replace('.', ',')
    if (typeof cell === 'number' && kind === 'pct') return `${Math.round(cell * 100)}%`
    return esc(String(cell))
  }).join(';'))
  return '﻿' + [head, ...body].join('\r\n')
}
