/**
 * Leitura local de PDF/imagem para Relatórios da Assessoria MB.
 * Usa PDF.js (texto + coordenadas) e Tesseract.js (OCR). Sem APIs externas.
 */
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import {
  aplicarClassificacaoMedica,
  detectarModeloMedico,
  type CatMedica,
} from './assessoriaMbClassificacaoMedica'
import type { RelLinha } from './assessoriaMbRelatorios'

export type ExtracaoPdf = {
  group: string
  method: string
  warnings: string[]
  rows: Omit<RelLinha, 'id'>[]
  declared?: number | null
  manual: boolean
  pages?: number
}

type Span = { x: number; y: number; w: number; str: string }
type Money = number | null

const DOC_RE =
  /(?<!\d)(?:\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}|\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})(?!\d)/

function clean(s: unknown) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function norm(s: unknown) {
  return clean(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function money(s: unknown): Money {
  if (typeof s === 'number') return Number.isFinite(s) ? Math.round(s * 100) : null
  const raw = clean(s)
  if (!raw) return null
  if (/^\s*(?:R\$\s*)?-?\d+\s*$/.test(raw)) {
    const n = Number(raw.replace(/[^0-9-]/g, ''))
    return Number.isFinite(n) ? n * 100 : null
  }
  const m = raw.match(/-?\d[\d., ]*[,.]\d{2}(?!\d)/)
  if (!m) return null
  const a = m[0].replace(/\s/g, '')
  const whole = a.slice(0, -3).replace(/\./g, '').replace(/,/g, '')
  const cents = a.slice(-2)
  const n = Number(`${whole}.${cents}`)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function row(
  name: string,
  doc: string,
  ref: string,
  bank: string,
  account: string,
  value: unknown,
  extra: Partial<Omit<RelLinha, 'id'>> = {},
): Omit<RelLinha, 'id'> {
  return {
    name: clean(name),
    doc: clean(doc),
    ref: clean(ref),
    bank: clean(bank),
    account: clean(account),
    value: money(value),
    profession: '',
    location: '',
    address: '',
    notes: '',
    ...extra,
  }
}

function detectGroup(s: string) {
  const n = norm(s)
  if (n.includes('CARECA')) return 'Careca'
  if (n.includes('CIMAR')) return 'Cimar Transportes'
  if (n.includes('ABASTECIMENTO') || n.includes('CONTAS DOS FUNCIONARIOS')) return 'Abastecimento de água'
  if (n.includes('COMPRAS') || n.includes('NOME / CPF') || n.includes('NOTAS AVULSAS DO SETOR'))
    return 'Setor de compras'
  if (n.includes('VEICULOS') || n.includes('TRASNPORTES') || n.includes('FOLHA DOS TRANSPORTES'))
    return 'Veículos e máquinas'
  if (n.includes('ESPECIALIST')) return 'Especialistas'
  if (n.includes('PLANTONIST')) return 'Plantonistas'
  if (n.includes('PSF') || n.includes('MEDICO')) return 'PSF / referência'
  return 'Outros'
}

function categoriaMedica(nome: string, heading = ''): CatMedica {
  return detectarModeloMedico(nome, heading)
}

async function pageSpans(page: PDFPageProxy): Promise<Span[]> {
  const tc = await page.getTextContent()
  const out: Span[] = []
  for (const it of tc.items) {
    if (!('str' in it) || !it.str?.trim()) continue
    const tr = 'transform' in it ? (it.transform as number[]) : [1, 0, 0, 1, 0, 0]
    const w = 'width' in it ? Number(it.width) || 0 : 0
    out.push({ str: clean(it.str), x: tr[4] || 0, y: tr[5] || 0, w })
  }
  return out
}

async function pageText(page: PDFPageProxy) {
  const spans = await pageSpans(page)
  return spans.map((s) => s.str).join(' ')
}

/** Agrupa spans em linhas pela coordenada Y (PDF: Y cresce para cima). */
function clusterRows(spans: Span[], yTol = 3): Span[][] {
  const sorted = [...spans].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; parts: Span[] }[] = []
  for (const s of sorted) {
    const last = lines[lines.length - 1]
    if (!last || Math.abs(last.y - s.y) > yTol) lines.push({ y: s.y, parts: [s] })
    else last.parts.push(s)
  }
  return lines.map((l) => l.parts.sort((a, b) => a.x - b.x))
}

/** Inferência de colunas por lacunas horizontais nas linhas com mais células. */
function matrixFromSpans(spans: Span[]): string[][] {
  const lines = clusterRows(spans, 4)
  if (!lines.length) return []
  // Usa a linha com mais fragmentos como referência de colunas
  const rich = [...lines].sort((a, b) => b.length - a.length)[0]
  const xs = rich.map((p) => p.x)
  // Merge xs próximos
  const cols: number[] = []
  for (const x of [...xs].sort((a, b) => a - b)) {
    if (!cols.length || x - cols[cols.length - 1] > 18) cols.push(x)
  }
  return lines.map((parts) => {
    const cells = cols.map(() => '')
    for (const p of parts) {
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < cols.length; i++) {
        const d = Math.abs(p.x - cols[i])
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      cells[best] = cells[best] ? `${cells[best]} ${p.str}` : p.str
    }
    return cells.map(clean)
  })
}

const ALIASES: Record<string, string[]> = {
  name: ['NOME TITULAR', 'NOME / CPF', 'NOME/CPF', 'NOME', 'BENEFICIARIO', 'FUNCIONARIO', 'TITULAR'],
  doc: ['CPF/CNPJ', 'CPF / CNPJ', 'CPF', 'CNPJ', 'DOCUMENTO'],
  ref: ['REFERENCIA', 'SERVIDOR', 'OBRA', 'DESCRICAO', 'N/A', 'SERVICO'],
  bank: ['BANCO/AGENCIA', 'BANCO / AGENCIA', 'BANCO / TIPO DE CONTA', 'BANCO'],
  agency: ['AGENCIA'],
  account: ['CONTA', 'NUMERO DA CONTA'],
  value: ['RESTANTE POR FORA', 'VALOR', 'VALOR (R$)', 'VALOR LIQUIDO', 'VALOR TOTAL', 'TOTAL'],
}

function matrixRows(matrix: string[][]): Omit<RelLinha, 'id'>[] {
  const out: Omit<RelLinha, 'id'>[] = []
  let mp: Partial<Record<string, number>> | null = null
  let carry = ''
  for (const raw of matrix) {
    const r = raw.map(clean)
    const n = r.map((c) => norm(c).trim())
    const cand: Partial<Record<string, number>> = {}
    for (const [k, vals] of Object.entries(ALIASES)) {
      const i = n.findIndex((a) => vals.includes(a))
      if (i >= 0) cand[k] = i
    }
    if (cand.name !== undefined && cand.value !== undefined) {
      mp = cand
      continue
    }
    if (!mp) continue
    const get = (k: string) => {
      const i = mp![k]
      return i !== undefined && i < r.length ? r[i] : ''
    }
    let nm = clean(get('name'))
    let doc = clean(get('doc'))
    const ref = clean(get('ref')) || carry
    const val = get('value')
    if (!doc) {
      const m = nm.match(DOC_RE)
      if (m) {
        doc = m[0]
        nm = nm.slice(0, m.index).replace(/CPF:?/i, '').trim()
      }
    }
    if (!nm || money(val) === null || /^(TOTAL|SUBTOTAL|MAIS 25)/.test(norm(nm))) continue
    carry = ref
    out.push(
      row(nm, doc, ref, `${get('bank')} ${get('agency')}`.trim(), get('account'), val, {
        sheet: 'PDF',
      }),
    )
  }
  return out
}

function cleanPdfCell(value: string) {
  return clean(value)
    .replace(/\s*([./-])\s*/g, '$1')
    .replace(/\bR\s*\$\b/gi, 'R$')
}

function spanCellText(spans: Span[], x0: number, x1: number, yTop: number, yBottom: number) {
  const selected = spans.filter((span) => {
    const centerX = span.x + span.w / 2
    return centerX >= x0 && centerX < x1 && span.y <= yTop && span.y >= yBottom
  })
  return cleanPdfCell(
    clusterRows(selected, 2.5)
      .map((line) => line.map((span) => span.str).join(' '))
      .join(' '),
  )
}

function docAnchors(spans: Span[], x0: number, x1: number) {
  return clusterRows(
    spans.filter((span) => span.x + span.w / 2 >= x0 && span.x + span.w / 2 < x1),
    2.5,
  )
    .map((line) => {
      const text = cleanPdfCell(line.map((span) => span.str).join(' '))
      const match = text.match(DOC_RE)
      return match
        ? { y: line.reduce((sum, span) => sum + span.y, 0) / line.length, doc: match[0] }
        : null
    })
    .filter((anchor): anchor is { y: number; doc: string } => Boolean(anchor))
    .sort((a, b) => b.y - a.y)
}

type CoordinateProfile = {
  lead: number
  name: [number, number]
  doc: [number, number]
  ref: [number, number]
  bank: [number, number]
  account: [number, number]
  value: [number, number]
  address?: [number, number]
}

function parseCoordinateRows(spans: Span[], profile: CoordinateProfile): Omit<RelLinha, 'id'>[] {
  const anchors = docAnchors(spans, ...profile.doc)
  const out: Omit<RelLinha, 'id'>[] = []
  for (let i = 0; i < anchors.length; i++) {
    const current = anchors[i]
    const next = anchors[i + 1]
    const previousGap = anchors[i - 1]
      ? anchors[i - 1].y - current.y
      : next
        ? current.y - next.y
        : 24
    // O CPF é a âncora da linha. `lead` cobre textos do mesmo registro que
    // começam um pouco acima do CPF, sem capturar a última linha do anterior.
    const yTop = current.y + profile.lead
    const yBottom = next ? next.y + profile.lead : current.y - previousGap + profile.lead
    const cell = (bounds: [number, number]) => spanCellText(spans, ...bounds, yTop, yBottom)
    out.push(
      row(
        cell(profile.name),
        current.doc,
        cell(profile.ref),
        cell(profile.bank),
        cell(profile.account),
        cell(profile.value),
        {
          address: profile.address ? cell(profile.address) : '',
          sheet: 'PDF',
          method: 'Tabela PDF por coordenadas',
        },
      ),
    )
  }
  return out
}

/** Careca / Cimar: células agrupadas pelas linhas de CPF reconstruídas. */
function parseCarecaCimar(spans: Span[]): Omit<RelLinha, 'id'>[] {
  return parseCoordinateRows(spans, {
    lead: 4,
    name: [65, 230],
    doc: [230, 310],
    ref: [310, 445],
    bank: [445, 505],
    account: [505, 600],
    address: [600, 735],
    value: [735, 825],
  })
}

/** Veículos e máquinas: mesma associação física, com seis colunas. */
function parseTransportes(spans: Span[]): Omit<RelLinha, 'id'>[] {
  return parseCoordinateRows(spans, {
    lead: 10,
    name: [15, 240],
    doc: [240, 350],
    ref: [350, 520],
    bank: [520, 615],
    account: [615, 685],
    value: [685, 825],
  })
}

function declaredTotalFromSpans(spans: Span[]): Money {
  for (const line of clusterRows(spans, 4)) {
    const text = cleanPdfCell(line.map((span) => span.str).join(' '))
    if (norm(text).includes('TOTAL GERAL')) {
      const value = money(text)
      if (value !== null) return value
    }
  }
  return null
}

function parseAbastecimento(matrix: string[][]): { rows: Omit<RelLinha, 'id'>[]; declared: Money } {
  const rows: Omit<RelLinha, 'id'>[] = []
  let declared: Money = null
  let ref = ''
  for (const r of matrix) {
    if (r.length < 9) continue
    const docCell = clean(r[4])
    if (DOC_RE.test(docCell)) {
      ref = clean(r[2]) || ref
      rows.push(row(r[3], r[4], ref, `${clean(r[5])} ${clean(r[6])}`.trim(), r[7], r[8], { sheet: 'PDF' }))
      const d = money(r[9])
      if (d !== null) declared = d
    }
  }
  return { rows, declared }
}

function parseSixCol(matrix: string[][]): { rows: Omit<RelLinha, 'id'>[]; declared: Money } {
  const rows: Omit<RelLinha, 'id'>[] = []
  let declared: Money = null
  for (const r of matrix) {
    if (r.length < 6) continue
    const head = norm(clean(r[0]))
    if (head === 'TOTAL GERAL' || head === 'SUBTOTAL') {
      declared = money(r[r.length - 1])
      continue
    }
    if (DOC_RE.test(clean(r[1]))) rows.push(row(r[0], r[1], r[2], r[3], r[4], r[r.length - 1], { sheet: 'PDF' }))
  }
  return { rows, declared }
}

function parseMedicalTables(
  matrix: string[][],
  kind: string,
  page: number,
): { rows: Omit<RelLinha, 'id'>[]; declared: Money } {
  const rows: Omit<RelLinha, 'id'>[] = []
  let declared: Money = null
  let adjusted: Money = null
  for (const raw of matrix) {
    const r = raw.map(clean)
    if (!r.length) continue
    const nm = r[0]
    const v = r[r.length - 1]
    if (norm(nm) === 'SUBTOTAL') {
      declared = money(v)
      continue
    }
    const m = nm.match(DOC_RE)
    if (!m) {
      if (norm(v).includes('AJUSTADO PARA')) adjusted = money(v)
      continue
    }
    let name = nm.slice(0, m.index).replace(/\bCPF\s*:?\s*$/i, '').trim()
    const doc = m[0]
    let val = money(v)
    let notes = ''
    if (adjusted !== null && norm(v).includes('DESCONTADO')) {
      val = adjusted
      notes = `Valor ajustado conforme documento. ${v}`
      adjusted = null
    }
    let profession = ''
    let location = ''
    let ref = ''
    let address = ''
    let bank = ''
    let account = ''
    if (kind === 'Especialistas') {
      ;[ref, address, bank, account] = [r[1] || '', r[2] || '', r[3] || '', r[4] || '']
      profession = ref
    } else {
      ;[profession, location, ref, address, bank] = [r[1] || '', r[2] || '', r[3] || '', r[4] || '', r[5] || '']
      location = location.replace(/^AL\s+/i, '')
      bank = bank.replace(/^BANCÁRIOS\s+/i, '').replace(/^BANCARIOS\s+/i, '')
      const parts = bank.split(/\b(?:CONTA(?: CORRENTE)?|CORRENTE)\s*:?\s*/i)
      bank = parts[0] || ''
      account = parts[1] || account
    }
    account = account.replace(/(?<=-)\s+(?=\d)/g, '')
    rows.push({
      name,
      doc,
      ref,
      bank: clean(bank),
      account: clean(account),
      value: val,
      category: kind,
      profession: clean(profession),
      location: clean(location),
      address: clean(address),
      notes,
      page,
      sheet: 'PDF',
    })
  }
  return { rows, declared }
}

async function renderPageCanvas(page: PDFPageProxy, scale = 2.2, rotate = 0) {
  if (typeof document === 'undefined') throw new Error('OCR só funciona no navegador.')
  const viewport = page.getViewport({ scale, rotation: rotate })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível para OCR.')
  await page.render({ canvasContext: ctx, viewport } as never).promise
  return canvas
}

type OcrWord = { text: string; left: number; top: number; width: number; height: number; conf: number }
type PsfOcrWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>

async function ocrCanvas(
  canvas: HTMLCanvasElement,
  psm?: unknown,
): Promise<{ text: string; words: OcrWord[] }> {
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker(['por', 'eng'])
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: (psm ?? PSM.SINGLE_BLOCK) as never,
    })
    const { data } = await worker.recognize(canvas)
    const words: OcrWord[] = []
    for (const w of data.words || []) {
      if (!w.text?.trim()) continue
      words.push({
        text: clean(w.text),
        left: w.bbox.x0,
        top: w.bbox.y0,
        width: w.bbox.x1 - w.bbox.x0,
        height: w.bbox.y1 - w.bbox.y0,
        conf: Number(w.confidence) || 0,
      })
    }
    return { text: data.text || '', words }
  } finally {
    await worker.terminate()
  }
}

/** Layout típico do formulário PSF (frações da largura). */
const PSF_XS = [0.144, 0.195, 0.366, 0.513, 0.688, 0.855, 0.946]

type PsfGrid = { xs: number[]; ys: number[] }

const COMPRAS_XS = [0.024, 0.133, 0.264, 0.384, 0.51, 0.665, 0.768, 0.88, 0.982]

/** Detecta uma grade digitalizada usando bordas verticais e horizontais reais. */
function detectExpectedGrid(
  canvas: HTMLCanvasElement,
  expectedXs: number[],
  darkLimit = 195,
): PsfGrid | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const { width: w, height: h } = canvas
  const pixels = ctx.getImageData(0, 0, w, h).data
  const dark = (x: number, y: number) => {
    const safeX = Math.max(0, Math.min(w - 1, x))
    const safeY = Math.max(0, Math.min(h - 1, y))
    const index = (safeY * w + safeX) * 4
    return pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114 < darkLimit
  }
  const yScan0 = Math.round(h * 0.1)
  const yScan1 = Math.round(h * 0.92)
  const radius = Math.max(8, Math.round(w * 0.014))
  const xs = expectedXs.map((fraction) => {
    const center = Math.round(w * fraction)
    let bestX = center
    let bestScore = -1
    for (let x = Math.max(1, center - radius); x <= Math.min(w - 2, center + radius); x++) {
      let score = 0
      for (let y = yScan0; y < yScan1; y++) {
        if (dark(x - 1, y) || dark(x, y) || dark(x + 1, y)) score++
      }
      if (score > bestScore) {
        bestScore = score
        bestX = x
      }
    }
    return bestX
  })

  const support = new Uint8Array(h)
  for (let y = yScan0; y < yScan1; y++) {
    let hits = 0
    for (const x of xs) {
      let hit = false
      for (let dx = -3; dx <= 3 && !hit; dx++) hit = dark(x + dx, y)
      if (hit) hits++
    }
    support[y] = hits >= Math.ceil(xs.length * 0.55) ? 1 : 0
  }

  const maxGap = Math.max(7, Math.round(h * 0.009))
  let bestStart = 0
  let bestEnd = 0
  let start = -1
  let last = -1
  for (let y = yScan0; y <= yScan1; y++) {
    if (y < yScan1 && support[y]) {
      if (start < 0) start = y
      last = y
    } else if (start >= 0 && y - last > maxGap) {
      if (last - start > bestEnd - bestStart) {
        bestStart = start
        bestEnd = last
      }
      start = -1
      last = -1
    }
  }
  if (bestEnd - bestStart < h * 0.12) return null

  const candidates: { y: number; score: number }[] = []
  const x0 = xs[0]
  const x1 = xs[xs.length - 1]
  for (let y = Math.max(1, bestStart - maxGap); y <= Math.min(h - 2, bestEnd + maxGap); y++) {
    let longest = 0
    let run = 0
    for (let x = x0; x <= x1; x++) {
      if (dark(x, y - 1) || dark(x, y) || dark(x, y + 1)) {
        run++
        longest = Math.max(longest, run)
      } else run = 0
    }
    candidates.push({ y, score: longest / Math.max(1, x1 - x0) })
  }
  const ys: number[] = []
  let cluster: { y: number; score: number }[] = []
  const flush = () => {
    if (!cluster.length) return
    ys.push(cluster.reduce((a, b) => (b.score > a.score ? b : a)).y)
    cluster = []
  }
  for (const candidate of candidates) {
    if (candidate.score >= 0.18) cluster.push(candidate)
    else flush()
  }
  flush()
  const minRow = h * 0.035
  const compactYs = ys.filter((y, index) => index === 0 || y - ys[index - 1] >= minRow)
  return compactYs.length >= 2 ? { xs, ys: compactYs } : null
}

/**
 * Localiza as linhas impressas da tabela no bitmap. O OCR continua sendo usado
 * somente para ler as palavras; os donos de cada palavra passam a ser definidos
 * pelos retângulos fechados da grade, e não pela proximidade entre CPFs.
 */
function detectPsfGrid(canvas: HTMLCanvasElement): PsfGrid | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const { width: w, height: h } = canvas
  const pixels = ctx.getImageData(0, 0, w, h).data
  const dark = (x: number, y: number) => {
    const i = (Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) * 4
    return pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114 < 165
  }

  // Cada coluna é procurada perto da posição esperada. A posição
  // esperada serve apenas para distinguir as sete bordas; a coordenada usada
  // na leitura é a linha preta efetivamente encontrada no documento.
  const yScan0 = Math.floor(h * 0.13)
  const yScan1 = Math.ceil(h * 0.86)
  let xs = PSF_XS.map((expected) => {
    let bestX = Math.round(expected * w)
    let bestScore = -1
    const radius = Math.max(12, Math.round(w * 0.018))
    for (let x = Math.max(1, bestX - radius); x <= Math.min(w - 2, bestX + radius); x++) {
      let score = 0
      for (let y = yScan0; y < yScan1; y += 2) {
        if (dark(x - 1, y) || dark(x, y) || dark(x + 1, y)) score++
      }
      if (score > bestScore) {
        bestScore = score
        bestX = x
      }
    }
    return bestX
  })

  // Uma borda muito clara pode fazer a busca cair sobre texto vizinho.
  // Mantemos nesse caso a geometria do formulário como ponto de partida.
  if (xs.some((x, i) => i > 0 && x - xs[i - 1] < w * 0.035)) {
    xs = PSF_XS.map((expected) => Math.round(expected * w))
  }

  // A faixa vertical comum a pelo menos quatro bordas elimina cabeçalho,
  // logotipos, assinatura e rodapé, mesmo que também contenham linhas longas.
  const support = new Uint8Array(h)
  const xRadius = Math.max(3, Math.round(w * 0.0025))
  for (let y = yScan0; y < yScan1; y++) {
    let hits = 0
    for (const x of xs) {
      let hit = false
      for (let dx = -xRadius; dx <= xRadius && !hit; dx++) hit = dark(x + dx, y)
      if (hit) hits++
    }
    support[y] = hits >= 4 ? 1 : 0
  }

  let bestStart = 0
  let bestEnd = 0
  let start = -1
  let lastHit = -1
  const maxGap = Math.max(8, Math.round(h * 0.008))
  for (let y = yScan0; y <= yScan1; y++) {
    if (y < yScan1 && support[y]) {
      if (start < 0) start = y
      lastHit = y
    } else if (start >= 0 && y - lastHit > maxGap) {
      if (lastHit - start > bestEnd - bestStart) {
        bestStart = start
        bestEnd = lastHit
      }
      start = -1
      lastHit = -1
    }
  }
  // Páginas finais podem conter apenas três linhas e ocupar menos de 20% da
  // altura. O comprimento mínimo deve validar uma tabela curta sem aceitar ruído.
  const supportedTable = bestEnd - bestStart >= h * 0.06

  const candidates: { y: number; score: number }[] = []
  const x0 = xs[0]
  const x1 = xs[xs.length - 1]
  const candidateStart = supportedTable ? Math.max(1, bestStart - maxGap) : yScan0
  const candidateEnd = supportedTable ? Math.min(h - 2, bestEnd + maxGap) : yScan1
  for (let y = candidateStart; y <= candidateEnd; y++) {
    let longestRun = 0
    let currentRun = 0
    for (let x = x0; x <= x1; x++) {
      if (dark(x, y - 1) || dark(x, y) || dark(x, y + 1)) {
        currentRun++
        if (currentRun > longestRun) longestRun = currentRun
      } else {
        currentRun = 0
      }
    }
    // Texto denso pode ocupar grande parte da largura, mas não forma um
    // traço escuro contínuo. A continuidade separa borda de linha de baseline.
    candidates.push({ y, score: longestRun / Math.max(1, x1 - x0) })
  }

  const ys: number[] = []
  let cluster: { y: number; score: number }[] = []
  const flush = () => {
    if (!cluster.length) return
    const peak = cluster.reduce((a, b) => (b.score > a.score ? b : a))
    ys.push(peak.y)
    cluster = []
  }
  for (const c of candidates) {
    if (c.score >= 0.05) cluster.push(c)
    else flush()
  }
  flush()

  const minRow = h * 0.018
  const compactYs = ys.filter((y, i) => i === 0 || y - ys[i - 1] >= minRow)
  // topo + ao menos uma linha física
  if (compactYs.length < 2) return null
  return { xs, ys: compactYs }
}

function formatCpf(digits: string) {
  const d = digits.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return digits
}

function wordOverlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

/** Reconstrói uma célula por linhas visuais, preservando a ordem de leitura. */
function psfCellText(words: OcrWord[], x0: number, x1: number, y0: number, y1: number) {
  const padX = Math.max(1, (x1 - x0) * 0.006)
  const padY = Math.max(1, (y1 - y0) * 0.012)
  const parts = words.filter((word) => {
    const wx0 = word.left
    const wx1 = word.left + word.width
    const wy0 = word.top
    const wy1 = word.top + word.height
    const xRatio = wordOverlap(wx0, wx1, x0 + padX, x1 - padX) / Math.max(1, word.width)
    const yRatio = wordOverlap(wy0, wy1, y0 + padY, y1 - padY) / Math.max(1, word.height)
    // Usa sobreposição, não apenas o centro: evita cortar a primeira e a
    // última linha quando a digitalização está levemente inclinada.
    return xRatio >= 0.55 && yRatio >= 0.45
  })
  if (!parts.length) return ''

  const medianHeight = [...parts.map((word) => word.height)].sort((a, b) => a - b)[
    Math.floor(parts.length / 2)
  ]
  const tolerance = Math.max(2, medianHeight * 0.42)
  const lines: { top: number; bottom: number; center: number; words: OcrWord[] }[] = []

  for (const word of [...parts].sort((a, b) => a.top + a.height / 2 - (b.top + b.height / 2))) {
    const top = word.top
    const bottom = word.top + word.height
    const center = (top + bottom) / 2
    let best: (typeof lines)[number] | undefined
    let bestScore = -Infinity
    for (const line of lines) {
      const overlap = wordOverlap(top, bottom, line.top, line.bottom)
      const overlapRatio = overlap / Math.max(1, Math.min(word.height, line.bottom - line.top))
      const centerDistance = Math.abs(center - line.center)
      if (overlapRatio < 0.28 && centerDistance > tolerance) continue
      const score = overlapRatio - centerDistance / Math.max(1, medianHeight) * 0.25
      if (score > bestScore) {
        best = line
        bestScore = score
      }
    }
    if (!best) {
      lines.push({ top, bottom, center, words: [word] })
      continue
    }
    best.words.push(word)
    best.top = Math.min(best.top, top)
    best.bottom = Math.max(best.bottom, bottom)
    best.center = best.words.reduce((sum, item) => sum + item.top + item.height / 2, 0) / best.words.length
  }

  return clean(
    lines
      .sort((a, b) => a.center - b.center)
      .map((line) =>
        line.words
          .sort((a, b) => a.left - b.left)
          .map((word) => word.text)
          .join(' '),
      )
      .join(' '),
  )
}

function cropPsfCell(
  source: HTMLCanvasElement,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  scale = 1.25,
) {
  const inset = Math.max(3, Math.round(Math.min(x1 - x0, y1 - y0) * 0.018))
  const sx = Math.max(0, Math.round(x0 + inset))
  const sy = Math.max(0, Math.round(y0 + inset))
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(x1 - x0 - inset * 2)))
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(y1 - y0 - inset * 2)))
  const padding = 14
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(sw * scale) + padding * 2
  canvas.height = Math.ceil(sh * scale) + padding * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível para recorte OCR.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(source, sx, sy, sw, sh, padding, padding, sw * scale, sh * scale)
  return canvas
}

async function ocrPsfCell(
  worker: PsfOcrWorker,
  source: HTMLCanvasElement,
  box: [number, number, number, number],
  psm: unknown,
  whitelist = '',
) {
  const canvas = cropPsfCell(source, ...box)
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: psm as never,
      tessedit_char_whitelist: whitelist,
      preserve_interword_spaces: '1',
    })
    const { data } = await worker.recognize(canvas)
    const words: OcrWord[] = (data.words || [])
      .filter((word) => word.text?.trim())
      .map((word) => ({
        text: clean(word.text),
        left: word.bbox.x0,
        top: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0,
        conf: Number(word.confidence) || 0,
      }))
    return psfCellText(words, 0, canvas.width, 0, canvas.height) || clean(data.text)
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

function psfNameParts(raw: string) {
  const docMatch = raw.match(DOC_RE)
  return {
    doc: docMatch ? formatCpf(docMatch[0]) : '',
    name: cleanPsfName(raw.replace(DOC_RE, ' ')),
  }
}

function psfNameScore(raw: string) {
  const parts = psfNameParts(raw)
  const tokens = parts.name.split(/\s+/).filter((token) => /[A-ZÀ-Ü]{2}/i.test(token)).length
  const incompleteEnding = /\b(?:DA|DE|DO|DAS|DOS|E)$/i.test(parts.name) ? 30 : 0
  const numericNoise = /\d/.test(parts.name) ? 30 : 0
  return (parts.doc ? 60 : 0) + Math.min(40, parts.name.length) + tokens * 6 - incompleteEnding - numericNoise
}

function cleanPsfName(raw: string) {
  return clean(
    raw
      .replace(/\bCPF\s*:?\s*/gi, ' ')
      .replace(/\bCNPJ\s*:?\s*/gi, ' ')
      .replace(/[|\[\]]+/g, ' ')
      .replace(/^[^A-ZÀ-Ü]+|[^A-ZÀ-Ü]+$/gi, ' ')
      .replace(/\s{2,}/g, ' '),
  )
}

function cleanPsfBank(raw: string) {
  const s = clean(
    raw
      .replace(/[|\[\]]+/g, ' ')
      .replace(/\b(BANCO|DO|BRASIL|BRADESCO|AG[EÊ]NCIA|AG)\b(?:\s+\1\b)+/gi, '$1')
      .replace(/\s{2,}/g, ' '),
  )
  const agency = s.match(/\b(?:AG[EÊ]NCIA|AG)\s*:?\s*(\d{3,5}(?:-[\dXx])?)/i)?.[1] || ''
  let account =
    s.match(/\b(?:CONTA(?:\s+CORRENTE|\s+POUPAN[CÇ]A)?|CORRENTE)\s*:?\s*([\d.]{3,14}-[\dXx])/i)?.[1] || ''
  if (!account) {
    const numbers = [...s.matchAll(/(?<!\d)([\d.]{3,14}-[\dXx])(?!\d)/g)]
      .map((match) => match[1])
      .filter((value) => value !== agency)
    account = numbers[numbers.length - 1] || ''
  }
  let bank = ''
  if (/BRADESCO/i.test(s)) bank = 'Bradesco'
  else if (/BANCO\s+DO\s+BRASIL|\bBRASIL\b/i.test(s)) bank = 'Banco do Brasil'
  else if (/CAIXA|CEF/i.test(s)) bank = 'Caixa Econômica Federal'
  else if (/NUBANK/i.test(s)) bank = 'Nubank'
  else if (/SANTANDER/i.test(s)) bank = 'Santander'
  else if (/ITA[UÚ]/i.test(s)) bank = 'Itaú'
  if (agency) bank = bank ? `${bank} — ${agency}` : `Agência ${agency}`
  return { bank: clean(bank), account: clean(account) }
}

/** Reconhecimento específico do formulário Médicos PSF (scan). */
async function parsePsfPage(
  page: PDFPageProxy,
  pageNo: number,
): Promise<{ rows: Omit<RelLinha, 'id'>[]; warnings: string[] }> {
  const canvas = await renderPageCanvas(page, 3.2, 0)
  const warnings: string[] = []
  try {
    const { createWorker, PSM } = await import('tesseract.js')
    const { words } = await ocrCanvas(canvas, PSM.SINGLE_BLOCK)
    const grid = detectPsfGrid(canvas)
    if (!grid) {
      return {
        rows: [],
        warnings: [
          `Pág. ${pageNo}: não foi possível confirmar os limites físicos da tabela; nenhum dado foi associado automaticamente.`,
        ],
      }
    }
    const { xs, ys } = grid
    const cellWorker = await createWorker(['por', 'eng'])
    const rows: Omit<RelLinha, 'id'>[] = []
    try {
      // Cada intervalo é uma linha física. Somente a primeira página possui
      // cabeçalho dentro da grade; as demais começam diretamente no registro.
      for (let i = 0; i < ys.length - 1; i++) {
        const y0 = ys[i]
        const y1 = ys[i + 1]
        const ordinal = norm(psfCellText(words, xs[0], xs[1], y0, y1))
        const pageNameCell = psfCellText(words, xs[1], xs[2], y0, y1)
        // Nome/CPF e dados bancários são relidos diretamente nos recortes:
        // são os campos em que o OCR de página mais perde linhas ou mistura rótulos.
        const directNameCell = await ocrPsfCell(
          cellWorker,
          canvas,
          [xs[1], xs[2], y0, y1],
          PSM.SINGLE_BLOCK,
        )
        const headerProbe = norm(`${pageNameCell} ${directNameCell}`)
        const header =
          /\bNOME\b|\bCPF\b/.test(headerProbe) &&
          !DOC_RE.test(`${pageNameCell} ${directNameCell}`)
        if (header) continue

        let nameCell =
          psfNameScore(directNameCell) >= psfNameScore(pageNameCell) ? directNameCell : pageNameCell
        let nameParts = psfNameParts(nameCell)
        if (!nameParts.doc) {
          const cpfText = await ocrPsfCell(
            cellWorker,
            canvas,
            [xs[1], xs[2], y0 + (y1 - y0) * 0.48, y1],
            PSM.SINGLE_LINE,
            '0123456789.-',
          )
          const cpfMatch = cpfText.match(DOC_RE)
          if (cpfMatch) nameParts = { ...nameParts, doc: formatCpf(cpfMatch[0]) }
        }

        let ref = clean(psfCellText(words, xs[2], xs[3], y0, y1).replace(/[|\[\]]+/g, ' '))
        if (ref.length < 4) {
          ref = clean(
            (
              await ocrPsfCell(cellWorker, canvas, [xs[2], xs[3], y0, y1], PSM.SINGLE_BLOCK)
            ).replace(/[|\[\]]+/g, ' '),
          )
        }

        let address = clean(psfCellText(words, xs[3], xs[4], y0, y1).replace(/[|\[\]]+/g, ' '))
        if (address.length < 12) {
          address = clean(
            (
              await ocrPsfCell(cellWorker, canvas, [xs[3], xs[4], y0, y1], PSM.SINGLE_BLOCK)
            ).replace(/[|\[\]]+/g, ' '),
          )
        }

        const pageBankRaw = psfCellText(words, xs[4], xs[5], y0, y1)
        const directBankRaw = await ocrPsfCell(
          cellWorker,
          canvas,
          [xs[4], xs[5], y0, y1],
          PSM.SINGLE_BLOCK,
        )
        const pageBank = cleanPsfBank(pageBankRaw)
        const directBank = cleanPsfBank(directBankRaw)
        const pageBankScore = (pageBank.bank ? 20 : 0) + (pageBank.account ? 30 : 0) + pageBankRaw.length * 0.1
        const directBankScore =
          (directBank.bank ? 20 : 0) + (directBank.account ? 30 : 0) + directBankRaw.length * 0.1
        const bankParts = directBankScore >= pageBankScore ? directBank : pageBank

        let valTxt = psfCellText(words, xs[5], xs[6], y0, y1)
        let refVal = money(valTxt)
        if (refVal === null) {
          valTxt = await ocrPsfCell(
            cellWorker,
            canvas,
            [xs[5], xs[6], y0, y1],
            PSM.SINGLE_LINE,
            'R$0123456789., ',
          )
          refVal = money(valTxt)
        }
        if (refVal !== null && refVal > 200000000) {
          const parts = [...valTxt.matchAll(/(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,5},\d{2})/g)]
          refVal = parts.length ? money(parts[0][1]) : null
        }

        // Cabeçalhos/rodapés podem ficar entre dois traços longos e, portanto,
        // parecer uma linha física. Um lançamento real deste formulário possui
        // ordinal numérico ou ao menos CPF/valor; rótulos estruturais não viram
        // registros independentes.
        const structuralText = norm(
          `${pageNameCell} ${directNameCell} ${ref} ${address} ${pageBankRaw} ${directBankRaw} ${valTxt}`,
        )
        const structuralLabel =
          /\bNOME\b|\bCPF\b|\bSAUDE\b|\bENDERECO\b|\bBANCO\b|\bVALOR\b/.test(structuralText)
        if (!nameParts.doc && refVal === null && (structuralLabel || !/\d/.test(ordinal))) continue

        // Nunca cria ou elimina registros por fragmentos/CPF. Uma linha física
        // confirmada produz exatamente um registro, mesmo quando algum campo falha.
        rows.push({
          name: nameParts.name,
          doc: nameParts.doc,
          ref,
          bank: bankParts.bank,
          account: bankParts.account,
          value: null,
          referenceValue: refVal,
          category: 'PSF / referência',
          profession: '',
          location: '',
          address,
          notes:
            'Pagamento PSF original: ' +
            (refVal != null ? (refVal / 100).toFixed(2).replace('.', ',') : 'não reconhecido') +
            `; linha física ${ordinal || i + 1}, página ${pageNo}; confirmar categoria e valor do novo serviço.`,
          page: pageNo,
          sheet: 'OCR',
          method: 'OCR por célula',
        })
      }

      // O formulário usa células cadastrais mescladas para dois pagamentos do
      // mesmo médico. Mantemos ambos os lançamentos e reconstruímos a célula
      // cadastral no retângulo combinado, sem deduplicar pelo CPF.
      for (let startRow = 0; startRow < rows.length; ) {
        const doc = clean(rows[startRow].doc).replace(/\D/g, '')
        let endRow = startRow + 1
        while (
          doc &&
          endRow < rows.length &&
          clean(rows[endRow].doc).replace(/\D/g, '') === doc
        ) {
          endRow++
        }
        if (doc && endRow - startRow > 1) {
          const bestIdentity = rows
            .slice(startRow, endRow)
            .sort(
              (a, b) =>
                psfNameScore(`${b.name} ${b.doc}`) - psfNameScore(`${a.name} ${a.doc}`),
            )[0]
          if (bestIdentity?.name) {
            for (let j = startRow; j < endRow; j++) {
              rows[j].name = bestIdentity.name
              rows[j].doc = bestIdentity.doc
            }
          }

          const bestRef = rows
            .slice(startRow, endRow)
            .map((item) => clean(item.ref))
            .sort((a, b) => b.length - a.length)[0]
          const bestAddress = rows
            .slice(startRow, endRow)
            .map((item) => clean(item.address))
            .sort((a, b) => b.length - a.length)[0]
          const bestBank = rows
            .slice(startRow, endRow)
            .sort(
              (a, b) =>
                Number(Boolean(b.bank)) + Number(Boolean(b.account)) -
                Number(Boolean(a.bank)) - Number(Boolean(a.account)),
            )[0]
          for (let j = startRow; j < endRow; j++) {
            if (bestRef) rows[j].ref = bestRef
            if (bestAddress) rows[j].address = bestAddress
            if (bestBank?.bank) rows[j].bank = bestBank.bank
            if (bestBank?.account) rows[j].account = bestBank.account
          }
        }
        startRow = endRow
      }
    } finally {
      await cellWorker.terminate()
    }

    warnings.push(`Pág. ${pageNo}: ${rows.length} linha(s) física(s) processada(s).`)
    if (!rows.length) warnings.push(`Pág. ${pageNo}: nenhuma linha da tabela foi reconhecida.`)
    const semNome = rows.filter((r) => !r.name || r.name.length < 5).length
    const semDoc = rows.filter((r) => !r.doc).length
    const semValor = rows.filter((r) => r.referenceValue == null).length
    if (semNome) warnings.push(`Pág. ${pageNo}: ${semNome} linha(s) sem nome completo; revise o original.`)
    if (semDoc) warnings.push(`Pág. ${pageNo}: ${semDoc} linha(s) sem CPF reconhecido; revise o original.`)
    if (semValor) warnings.push(`Pág. ${pageNo}: ${semValor} linha(s) sem valor reconhecido; revise o original.`)

    const lowConf = words.filter((t) => t.conf > 0 && t.conf < 55).length
    if (lowConf > 25)
      warnings.push(`Pág. ${pageNo}: OCR com baixa confiança em várias palavras — revise a conferência.`)
    return { rows, warnings }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/** OCR específico do relatório digitalizado e girado do setor de compras. */
async function parseComprasPage(
  page: PDFPageProxy,
  pageNo: number,
): Promise<{ rows: Omit<RelLinha, 'id'>[]; warnings: string[]; declared: Money }> {
  // O scan está 90° anti-horário no PDF; a rotação positiva do PDF.js o
  // normaliza para a orientação de leitura antes de calcular coordenadas.
  const canvas = await renderPageCanvas(page, 2.8, 90)
  const warnings: string[] = []
  try {
    const { createWorker, PSM } = await import('tesseract.js')
    const { text, words } = await ocrCanvas(canvas, PSM.SINGLE_BLOCK)
    const grid = detectExpectedGrid(canvas, COMPRAS_XS)
    if (!grid) {
      return {
        rows: [],
        warnings: [`Pág. ${pageNo}: limites físicos da tabela de compras não confirmados.`],
        declared: null,
      }
    }
    const { xs, ys } = grid
    const worker = await createWorker(['por', 'eng'])
    const rows: Omit<RelLinha, 'id'>[] = []
    try {
      for (let index = 0; index < ys.length - 1; index++) {
        const y0 = ys[index]
        const y1 = ys[index + 1]
        const cells = Array.from({ length: 8 }, (_, cell) =>
          clean(psfCellText(words, xs[cell], xs[cell + 1], y0, y1).replace(/[|\[\]]+/g, ' ')),
        )
        const headerText = norm(cells.join(' '))
        if (/NOME\s*\/\s*CPF/.test(headerText) || (/CHAVE PIX/.test(headerText) && /VALOR/.test(headerText))) {
          continue
        }

        let identityText = cells[1]
        let identity = psfNameParts(identityText)
        if (!identity.doc || identity.name.length < 4) {
          identityText = await ocrPsfCell(
            worker,
            canvas,
            [xs[1], xs[2], y0, y1],
            PSM.SINGLE_BLOCK,
          )
          identity = psfNameParts(identityText)
        }

        let valueText = cells[7]
        let value = money(valueText)
        if (value === null) {
          valueText = await ocrPsfCell(
            worker,
            canvas,
            [xs[7], xs[8], y0, y1],
            PSM.SINGLE_LINE,
            'R$0123456789., ',
          )
          value = money(valueText)
        }
        if (!identity.doc && value === null) continue

        rows.push(
          row(identity.name, identity.doc, cells[0], `${cells[4]} ${cells[5]}`, cells[6], valueText, {
            address: cells[2],
            notes: cells[3] ? `Chave PIX: ${cells[3]}` : '',
            page: pageNo,
            sheet: 'OCR',
            method: 'OCR por célula física',
          }),
        )
      }
    } finally {
      await worker.terminate()
    }

    const declaredMatch = text.match(/TOTAL\s+GERAL\s*(?:R\$)?\s*[:=]?\s*([0-9., ]+)/i)
    const declared = declaredMatch ? money(declaredMatch[1]) : null
    warnings.push(`Pág. ${pageNo}: ${rows.length} linha(s) física(s) de compras processada(s).`)
    const missingDoc = rows.filter((item) => !item.doc).length
    const missingValue = rows.filter((item) => item.value == null).length
    if (missingDoc) warnings.push(`Pág. ${pageNo}: ${missingDoc} linha(s) sem CPF/CNPJ reconhecido.`)
    if (missingValue) warnings.push(`Pág. ${pageNo}: ${missingValue} linha(s) sem valor reconhecido.`)
    return { rows, warnings, declared }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

function ocrMatrixFromWords(words: OcrWord[], width: number, height: number): string[][] {
  if (!words.length) return []
  // Agrupa por faixa vertical aproximada
  const sorted = [...words].sort((a, b) => a.top - b.top || a.left - b.left)
  const rows: { top: number; words: OcrWord[] }[] = []
  const yTol = Math.max(10, height * 0.012)
  for (const w of sorted) {
    const last = rows[rows.length - 1]
    if (!last || Math.abs(w.top - last.top) > yTol) rows.push({ top: w.top, words: [w] })
    else last.words.push(w)
  }
  // Colunas pela distribuição de X nas linhas densas
  const rich = [...rows].sort((a, b) => b.words.length - a.words.length)[0]
  const xs: number[] = []
  for (const w of [...rich.words].sort((a, b) => a.left - b.left)) {
    const cx = w.left + w.width / 2
    if (!xs.length || cx - xs[xs.length - 1] > Math.max(24, width * 0.04)) xs.push(cx)
  }
  return rows.map((r) => {
    const cells = xs.map(() => '')
    for (const w of r.words) {
      const cx = w.left + w.width / 2
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < xs.length; i++) {
        const d = Math.abs(cx - xs[i])
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      cells[best] = cells[best] ? `${cells[best]} ${w.text}` : w.text
    }
    return cells.map(clean)
  })
}

async function ocrPageRows(
  page: PDFPageProxy,
  group: string,
  rotate = 0,
): Promise<{ rows: Omit<RelLinha, 'id'>[]; warnings: string[]; declared: Money; matrix: string[][] }> {
  const canvas = await renderPageCanvas(page, 2.5, rotate)
  try {
    const { text, words } = await ocrCanvas(canvas)
    const matrix = ocrMatrixFromWords(words, canvas.width, canvas.height)
    const warnings = [
      'OCR: confirme nomes, documentos, contas e valores com o original.',
    ]
    let declared: Money = null
    let rows: Omit<RelLinha, 'id'>[] = []
    if (group === 'Setor de compras') {
      const mt = text.match(/TOTAL\s+GERAL\s*(?:R\$)?\s*[:=]?\s*([0-9.,]+)/i)
      if (mt) declared = money(mt[1])
      for (const r of matrix) {
        if (r.length < 5) continue
        const cell = r[1] || r[0] || ''
        const m = cell.match(DOC_RE)
        const val = money(r[r.length - 1])
        if (m && val !== null) {
          const name = cell.slice(0, m.index).replace(/\bCP[FE]\s*:?\s*$/i, '').replace(/\|/g, '').trim()
          rows.push(
            row(
              name,
              m[0],
              r[0] || '',
              `${r[4] || ''} ${r[5] || ''}`.trim(),
              r[6] || r[r.length - 2] || '',
              r[r.length - 1],
              { sheet: 'OCR' },
            ),
          )
        }
      }
    }
    if (!rows.length) rows = matrixRows(matrix).map((r) => ({ ...r, sheet: 'OCR' }))
    if (!rows.length) warnings.push('Grade não identificada com segurança. Use inclusão manual se necessário.')
    const lowConf = words.filter((w) => w.conf > 0 && w.conf < 60).length
    if (lowConf > 8) warnings.push('Há palavras com baixa confiança no OCR — revise a conferência.')
    return { rows, warnings, declared, matrix }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

function ensurePdfWorker() {
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
  }
}

async function openPdf(dataBase64: string): Promise<PDFDocumentProxy> {
  ensurePdfWorker()
  const bin = atob(dataBase64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  try {
    return await getDocument({
      data: bytes,
      useSystemFonts: true,
      isEvalSupported: false,
    } as never).promise
  } catch {
    return await getDocument({
      data: bytes,
      useSystemFonts: true,
      isEvalSupported: false,
      disableWorker: true,
    } as never).promise
  }
}

async function parseGeneralPdf(
  pdf: PDFDocumentProxy,
  nome: string,
): Promise<ExtracaoPdf> {
  const firstText = pdf.numPages ? await pageText(await pdf.getPage(1)) : ''
  const group = detectGroup(`${nome} ${firstText}`)
  const warnings: string[] = []
  const rows: Omit<RelLinha, 'id'>[] = []
  let declared: Money = null
  let method = 'Tabela PDF'

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const text = await pageText(page)
    const spans = await pageSpans(page)
    let pageRows: Omit<RelLinha, 'id'>[] = []

    if (group === 'Setor de compras' && clean(text).replace(/\s/g, '').length < 40) {
      method = 'OCR'
      const compras = await parseComprasPage(page, i)
      pageRows = compras.rows
      warnings.push(...compras.warnings)
      if (compras.declared !== null) declared = compras.declared
    } else if (clean(text).replace(/\s/g, '').length < 40) {
      method = 'OCR'
      const ocr = await ocrPageRows(page, group)
      pageRows = ocr.rows
      warnings.push(...ocr.warnings.map((w) => `Pág. ${i}: ${w}`))
      if (ocr.declared !== null) declared = ocr.declared
    } else if (group === 'Careca' || group === 'Cimar Transportes') {
      pageRows = parseCarecaCimar(spans)
    } else if (group === 'Veículos e máquinas') {
      pageRows = parseTransportes(spans)
      const pageDeclared = declaredTotalFromSpans(spans)
      if (pageDeclared !== null) declared = pageDeclared
    } else {
      const matrix = matrixFromSpans(spans)
      if (group === 'Abastecimento de água' && matrix.some((r) => r.length >= 9)) {
        const p = parseAbastecimento(matrix)
        pageRows = p.rows
        if (p.declared !== null) declared = p.declared
      } else if (matrix.some((r) => r.length === 6 || r.length === 7)) {
        const p = parseSixCol(matrix)
        pageRows = p.rows
        if (p.declared !== null) declared = p.declared
      } else {
        pageRows = matrixRows(matrix)
      }
    }

    for (const r of pageRows) r.page = i
    if (!pageRows.length) warnings.push(`Página ${i}: nenhum registro identificado; confira o original.`)
    rows.push(...pageRows)
  }

  if (!rows.length) warnings.push('Nenhum lançamento identificado. Revise o arquivo ou insira manualmente.')
  const sum = rows.reduce((s, r) => s + (r.value || 0), 0)
  if (declared !== null && declared !== sum)
    warnings.push('Total declarado diverge da soma dos lançamentos.')

  return {
    group,
    method,
    warnings: [...new Set(warnings)],
    rows,
    declared,
    manual: !rows.length,
    pages: pdf.numPages,
  }
}

async function parseMedicalPdf(pdf: PDFDocumentProxy, nome: string): Promise<ExtracaoPdf> {
  const heading = pdf.numPages ? await pageText(await pdf.getPage(1)) : ''
  const kind = categoriaMedica(nome, heading.slice(0, 900))
  const warnings: string[] = []
  let rows: Omit<RelLinha, 'id'>[] = []
  let declared: Money = null
  let method = 'Tabela PDF'

  if (kind === 'PSF / referência') {
    method = 'OCR'
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page = await pdf.getPage(i)
      const psf = await parsePsfPage(page, i)
      rows.push(...psf.rows)
      warnings.push(...psf.warnings)
    }
    warnings.push(
      'PSF é referência cadastral: não gera sozinho os relatórios de plantonistas/especialistas. Use “Criar plantão/especialidade” ou importe MEDICOS_PLANTONISTAS / MEDICOS_ESPECIALISTAS.',
    )
    warnings.push(
      `${rows.length} linhas de referência identificadas. A classificação é por lançamento (serviço), não por CPF.`,
    )
    return {
      group: kind,
      method,
      warnings: [...new Set(warnings)],
      rows,
      declared: null,
      manual: !rows.length,
      pages: pdf.numPages,
    }
  }

  // Modelo do documento: Plantonistas / Especialistas / Não classificado
  const parseKind = kind === 'Não classificado' ? 'Plantonistas' : kind

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const text = await pageText(page)
    const spans = await pageSpans(page)
    let pageRows: Omit<RelLinha, 'id'>[] = []
    if (clean(text).replace(/\s/g, '').length < 40) {
      method = 'OCR'
      const ocr = await ocrPageRows(page, 'Outros')
      const fromOcr = parseMedicalTables(ocr.matrix, parseKind, i)
      pageRows = fromOcr.rows.length
        ? fromOcr.rows
        : ocr.rows.map((r) => ({ ...r, category: parseKind, page: i }))
      if (fromOcr.declared !== null) declared = fromOcr.declared
      warnings.push(...ocr.warnings.map((w) => `Pág. ${i}: ${w}`))
    } else {
      const matrix = matrixFromSpans(spans)
      // Detecta cabeçalho na própria página (PLANTAO vs ESPECIALIDADE)
      const headJoin = matrix.slice(0, 3).map((r) => r.join(' ')).join(' ')
      const pageModelo = detectarModeloMedico(nome, `${heading} ${headJoin}`)
      const colKind =
        pageModelo === 'Especialistas' || pageModelo === 'Plantonistas' ? pageModelo : parseKind
      const p = parseMedicalTables(matrix, colKind, i)
      pageRows = p.rows
      if (p.declared !== null) declared = p.declared
    }
    rows.push(...pageRows)
  }

  rows = aplicarClassificacaoMedica(rows, kind)
  const nP = rows.filter((r) => r.category === 'Plantonistas').length
  const nE = rows.filter((r) => r.category === 'Especialistas').length
  const nU = rows.filter((r) => r.category === 'Não classificado').length
  if (nU)
    warnings.push(
      `${nU} lançamento(s) sem classificação automática — use a aba “Não classificados” e escolha Plantonista ou Especialista.`,
    )
  warnings.push(`Classificação: ${nP} plantonista(s) · ${nE} especialista(s) · ${nU} sem classificar.`)

  const total = rows.reduce((s, r) => s + (r.value || 0), 0)
  if (declared !== null && total !== declared)
    warnings.push('Subtotal declarado diverge da soma das linhas. Confira ajustes e descontos.')
  if (rows.some((r) => r.notes))
    warnings.push('Há ajuste de valor no documento. Confira o valor líquido sem duplicá-lo.')

  const groupLabel =
    nP && nE ? 'Plantonistas + Especialistas' : nP ? 'Plantonistas' : nE ? 'Especialistas' : kind

  return {
    group: groupLabel,
    method,
    warnings: [...new Set(warnings)],
    rows,
    declared,
    manual: !rows.length,
    pages: pdf.numPages,
  }
}

export async function extrairPdf(
  nome: string,
  dataBase64: string,
  kind: 'general' | 'medical',
): Promise<ExtracaoPdf> {
  const pdf = await openPdf(dataBase64)
  try {
    if (kind === 'medical' || /medico|médico|psf|planton|especialist/i.test(nome)) {
      return await parseMedicalPdf(pdf, nome)
    }
    return await parseGeneralPdf(pdf, nome)
  } finally {
    try {
      pdf.destroy()
    } catch {
      /* ignore */
    }
  }
}

/** OCR de imagem avulsa (png/jpg/webp). */
export async function extrairImagem(
  nome: string,
  dataBase64: string,
  kind: 'general' | 'medical',
): Promise<ExtracaoPdf> {
  if (typeof document === 'undefined') throw new Error('OCR de imagem só funciona no navegador.')
  const mime =
    /\.png$/i.test(nome) ? 'image/png' : /\.webp$/i.test(nome) ? 'image/webp' : 'image/jpeg'
  const url = `data:${mime};base64,${dataBase64}`
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image()
    el.onload = () => res(el)
    el.onerror = () => rej(new Error('Não foi possível abrir a imagem.'))
    el.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível.')
  ctx.drawImage(img, 0, 0)
  const { text, words } = await ocrCanvas(canvas)
  canvas.width = 0
  canvas.height = 0
  const matrix = ocrMatrixFromWords(words, img.naturalWidth, img.naturalHeight)
  const group = detectGroup(`${nome} ${text}`)
  let rows = matrixRows(matrix)
  if (kind === 'medical') {
    const cat = categoriaMedica(nome, text.slice(0, 400))
    rows = rows.map((r) => ({
      ...r,
      category: cat,
      ...(cat === 'PSF / referência'
        ? { referenceValue: r.value, value: null as number | null }
        : {}),
    }))
  }
  const warnings = [
    'OCR de imagem: confira os dados com o original.',
    ...(rows.length ? [] : ['Nenhum lançamento identificado na imagem.']),
  ]
  return {
    group: kind === 'medical' ? categoriaMedica(nome, text) : group,
    method: 'OCR',
    warnings,
    rows,
    manual: !rows.length,
    pages: 1,
  }
}
