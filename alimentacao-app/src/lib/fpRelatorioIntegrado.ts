/**
 * Relatório Financeiro Integrado (Controle Financeiro Pessoal).
 *
 * O iframe consolida os números com as regras das telas (ocorrências virtuais,
 * baixas, saldos) e manda um modelo pronto. Aqui:
 *   1. buscamos os comprovantes originais em fp_anexos (entidade = 'lancamento');
 *   2. baixamos e preparamos cada arquivo (imagens e todas as páginas de PDFs);
 *   3. montamos um único PDF A4 (conteúdo → controle/índice → anexos),
 *      calculando a paginação em duas passadas para o índice apontar a página certa;
 *   4. renderizamos as páginas desse mesmo PDF para a pré-visualização.
 * Nada é inventado: arquivo que não pode ser incorporado aparece como indisponível.
 */
import { jsPDF } from 'jspdf'
import autoTable, { type CellDef, type CellHookData, type RowInput, type Styles, type UserOptions } from 'jspdf-autotable'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { supabase } from './supabase'

const BUCKET = 'fp-comprovantes'

/* ---------- Modelo enviado pelo iframe ---------- */
type Origem = 'avulso' | 'pagamento' | 'cobranca'
export type FpRelMovimento = {
  n: number; id: string; data: string; hora: string; descricao: string; pessoa: string; responsavel: string
  origem: Origem; categoria: string; conta: string; tipo: 'entrada' | 'saida'
  previsto: number | null; realizado: number; situacao: string; programacao: string
}
export type FpRelPendente = {
  descricao: string; pessoa: string; categoria: string; conta: string; inicio: string | null; prazo: string
  previsto: number | null; vencido: boolean; situacao: string
}
export type FpRelProg = {
  programados: number; previsto: number; semValor: number; realizados: number; realizado: number
  pendentes: number; pendente: number; pendSemValor: number; vencidos: number; vencido: number; dispensados: number
}
export type FpRelModelo = {
  periodo: { ini: string; fim: string }
  emissor: string
  geradoEm: string
  filtros: { origem: string; origemLabel: string; categoria: string; conta: string; situacao: string; situacaoLabel: string }
  secoes: Record<'resumo' | 'pagamentos' | 'cobrancas' | 'categorias' | 'contas' | 'movimentos' | 'pendPag' | 'pendCob' | 'comprovantes', boolean>
  receitas: number
  despesas: number
  saldo:
    | { disponivel: false; motivo: string }
    | { disponivel: true; anterior: number; final: number; ajuste: number; conferencias: number; foraDasContas: number; contas: number }
  pagamentos: FpRelProg
  cobrancas: FpRelProg
  categorias: { nome: string; receitas: number; despesas: number }[]
  contas: { nome: string; entradas: number; saidas: number }[]
  movimentos: FpRelMovimento[]
  pendPag: FpRelPendente[]
  pendCob: FpRelPendente[]
  temTransferencia: boolean
}

export type FpRelResultado = {
  pdf: Blob
  pages: Blob[]
  fileName: string
  avisos: string[]
  resumo: { paginas: number; movimentos: number; pendentes: number; comprovantes: number | null; incorporados: number }
}

/* ---------- Aparência (mesmo padrão da tela: azul-marinho, faixas claras, selos de situação) ---------- */
type RGB = [number, number, number]
const NAVY: RGB = [16, 40, 86]
const INK: RGB = [20, 30, 50]
const GREY: RGB = [100, 112, 132]
const LINE: RGB = [210, 217, 229]
const HEAD: RGB = [232, 237, 245]
const FOOT: RGB = [221, 228, 239]
const CARD_LINE: RGB = [204, 212, 226]
const GREEN: RGB = [22, 120, 66]
const RED: RGB = [190, 32, 32]
const BLUE: RGB = [28, 84, 186]
const INFO_BG: RGB = [230, 239, 253]
const INFO_LINE: RGB = [196, 214, 243]
const CARDS = {
  receitas: { bg: [218, 243, 225] as RGB, fg: GREEN },
  despesas: { bg: [253, 226, 226] as RGB, fg: RED },
  resultado: { bg: [222, 234, 252] as RGB, fg: BLUE },
  saldo: { bg: [235, 238, 243] as RGB, fg: INK },
}
/** Selo de situação (fundo, texto) */
const SELO: Record<string, [RGB, RGB]> = {
  Recebido: [[206, 239, 214], GREEN],
  Pago: [[206, 239, 214], GREEN],
  'A pagar': [[253, 236, 178], [138, 88, 0]],
  'A receber': [[217, 231, 252], BLUE],
  Vencido: [[252, 220, 220], RED],
}

const PW = 210
const PH = 297
const M = 12 // margem lateral
const CW = PW - 2 * M
const TOP = 25 // início do conteúdo (abaixo do cabeçalho)
const BOTTOM = 281 // fim do conteúdo (acima do rodapé)
const BAR_H = 6.2

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const num2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sp = (s: string) => s.replace(/[  ]/g, ' ').replace(/−/g, '-')
const money = (n: number) => sp(brl.format(Number(n) || 0))
const plain = (n: number) => sp(num2.format(Number(n) || 0))
const dataBr = (d: string) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—')
const ORIGEM_LABEL: Record<Origem, string> = { avulso: 'Avulso', pagamento: 'Pagamento', cobranca: 'Cobrança' }
const pad3 = (n: number) => String(n).padStart(3, '0')

/* ---------- Comprovantes ---------- */
type AnexoRow = { id: string; entidade_id: string; nome: string; mime: string | null; tamanho: number | null; storage_path: string; created_at: string }
type Imagem = { data: string; w: number; h: number }
type Arquivo = {
  ref: string // C001 ou C001.2
  mov: FpRelMovimento
  nome: string
  partes: Imagem[] // imagem única ou páginas do PDF
  erro: string | null
}

function ensurePdfWorker() {
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  }
}

async function listarAnexos(ids: string[]): Promise<AnexoRow[]> {
  const out: AnexoRow[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from('fp_anexos')
      .select('id,entidade_id,nome,mime,tamanho,storage_path,created_at')
      .eq('entidade', 'lancamento')
      .in('entidade_id', ids.slice(i, i + 150))
      .order('created_at')
    if (error) throw new Error(`Falha ao consultar os comprovantes: ${error.message}`)
    out.push(...((data || []) as AnexoRow[]))
  }
  return out
}

function canvasBranco(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível neste navegador.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  return { c, ctx }
}

/** Imagem → JPEG de boa qualidade, proporção preservada (lado maior até 2600 px). */
async function prepararImagem(blob: Blob): Promise<Imagem> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(blob)
  } catch {
    throw new Error('formato de imagem não suportado para incorporação (use JPG, PNG ou PDF)')
  }
  try {
    const k = Math.min(1, 2600 / Math.max(bmp.width, bmp.height))
    const { c, ctx } = canvasBranco(bmp.width * k, bmp.height * k)
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    const data = c.toDataURL('image/jpeg', 0.9)
    c.width = 0
    c.height = 0
    return { data, w: bmp.width * k, h: bmp.height * k }
  } finally {
    bmp.close()
  }
}

/** Todas as páginas de um PDF, renderizadas a ~200 dpi. */
async function prepararPdf(blob: Blob): Promise<Imagem[]> {
  ensurePdfWorker()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let pdf
  try {
    pdf = await getDocument({ data: bytes, isEvalSupported: false } as never).promise
  } catch {
    throw new Error('o PDF está danificado ou protegido e não pôde ser lido')
  }
  const out: Imagem[] = []
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const v1 = page.getViewport({ scale: 1 })
      const scale = Math.min(200 / 72, Math.sqrt(4_800_000 / (v1.width * v1.height)))
      const vp = page.getViewport({ scale })
      const { c, ctx } = canvasBranco(vp.width, vp.height)
      await page.render({ canvasContext: ctx, viewport: vp, canvas: c } as never).promise
      out.push({ data: c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height })
      c.width = 0
      c.height = 0
      page.cleanup()
    }
  } finally {
    await pdf.destroy()
  }
  return out
}

async function prepararArquivo(a: AnexoRow): Promise<{ partes: Imagem[]; erro: string | null }> {
  const dl = await supabase.storage.from(BUCKET).download(a.storage_path)
  if (dl.error || !dl.data) return { partes: [], erro: 'o arquivo não foi encontrado no armazenamento' }
  const mime = (a.mime || dl.data.type || '').toLowerCase()
  const nome = (a.nome || '').toLowerCase()
  try {
    if (mime.includes('pdf') || nome.endsWith('.pdf')) return { partes: await prepararPdf(dl.data), erro: null }
    if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/.test(nome)) {
      return { partes: [await prepararImagem(dl.data)], erro: null }
    }
    return { partes: [], erro: `formato não suportado para incorporação (${mime || 'desconhecido'})` }
  } catch (e) {
    return { partes: [], erro: e instanceof Error ? e.message : 'falha ao processar o arquivo' }
  }
}

async function emParalelo<T, R>(itens: T[], limite: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(itens.length)
  let prox = 0
  const worker = async () => {
    while (prox < itens.length) {
      const i = prox++
      out[i] = await fn(itens[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, worker))
  return out
}

/* ---------- Plano das páginas de anexos ---------- */
const CARD_HEAD = 14 // faixa de identificação do comprovante
const CARD_PAD = 3
const HALF = (CW - 6) / 2
const AREA_TOP = TOP + BAR_H + 7 // abaixo da faixa "Anexos e Comprovantes" e do subtítulo
const AREA_BOTTOM = BOTTOM - 12 // espaço da nota "Comp. = referência…" no fim
const MAX_IMG_H = AREA_BOTTOM - AREA_TOP - CARD_HEAD - 2 * CARD_PAD

type Bloco = {
  arq: Arquivo
  parte: number // índice da parte (página do PDF); -1 = indisponível
  x: number; y: number; w: number // cartão
  imgW: number; imgH: number
  h: number // altura total do cartão
}

function planejarAnexos(arquivos: Arquivo[]): Bloco[][] {
  const paginas: Bloco[][] = []
  let atual: Bloco[] = []
  let cursor = AREA_TOP
  let linha: { top: number; h: number } | null = null // linha com um cartão na metade esquerda
  let fechada = false // página dedicada (PDF): o próximo começa em folha nova

  const novaPagina = () => {
    if (atual.length) paginas.push(atual)
    atual = []
    cursor = AREA_TOP
    linha = null
    fechada = false
  }
  const fecharLinha = () => {
    if (linha) cursor = linha.top + linha.h + 5
    linha = null
  }
  const caber = (h: number) => {
    if (fechada || cursor + h > AREA_BOTTOM) novaPagina()
  }
  const medir = (w: number, a: number, maxW: number) => {
    let iw = Math.min(w, maxW - 2 * CARD_PAD)
    let ih = iw * a
    if (ih > MAX_IMG_H) { ih = MAX_IMG_H; iw = ih / a }
    return { iw, ih, total: CARD_HEAD + 2 * CARD_PAD + ih }
  }

  for (const arq of arquivos) {
    if (arq.erro || !arq.partes.length) {
      const h = CARD_HEAD + 18
      // Indisponível também ocupa meia largura, como um cartão comum.
      if (linha && !fechada && linha.top + h <= AREA_BOTTOM) {
        atual.push({ arq, parte: -1, x: M + HALF + 6, y: linha.top, w: HALF, imgW: 0, imgH: 0, h })
        linha.h = Math.max(linha.h, h)
        fecharLinha()
        continue
      }
      fecharLinha()
      caber(h)
      atual.push({ arq, parte: -1, x: M, y: cursor, w: HALF, imgW: 0, imgH: 0, h })
      linha = { top: cursor, h }
      continue
    }
    const ehPdf = arq.partes.length > 1 || /\.pdf$/i.test(arq.nome)
    arq.partes.forEach((img, parte) => {
      const a = img.h / img.w
      if (ehPdf) {
        // Página de PDF: folha própria, ajustada à área útil, sem cortar nada.
        fecharLinha()
        if (atual.length) novaPagina()
        const { iw, ih, total } = medir(CW, a, CW)
        atual.push({ arq, parte, x: M, y: cursor, w: CW, imgW: iw, imgH: ih, h: total })
        fechada = true
        return
      }
      if (a >= 1.15) {
        // Comprovante em pé (print de celular, recibo): dois cartões por linha.
        const { iw, ih, total } = medir(HALF, a, HALF)
        if (linha && !fechada && linha.top + total <= AREA_BOTTOM) {
          atual.push({ arq, parte, x: M + HALF + 6, y: linha.top, w: HALF, imgW: iw, imgH: ih, h: total })
          linha.h = Math.max(linha.h, total)
          fecharLinha()
          return
        }
        fecharLinha()
        caber(total)
        atual.push({ arq, parte, x: M, y: cursor, w: HALF, imgW: iw, imgH: ih, h: total })
        linha = { top: cursor, h: total }
        return
      }
      // Comprovante deitado: largura total (sem ampliar demais imagens pequenas).
      fecharLinha()
      const { iw, ih, total } = medir(Math.max(110, (img.w * 25.4) / 130), a, CW)
      caber(total)
      atual.push({ arq, parte, x: M, y: cursor, w: CW, imgW: iw, imgH: ih, h: total })
      cursor += total + 5
    })
  }
  if (atual.length) paginas.push(atual)
  return paginas
}

/* ---------- Desenho ---------- */
type Doc = jsPDF & { lastAutoTable?: { finalY: number } }
const finalY = (doc: Doc) => doc.lastAutoTable?.finalY ?? TOP

function cor(doc: jsPDF, c: RGB) { doc.setTextColor(c[0], c[1], c[2]) }
function preencher(doc: jsPDF, c: RGB) { doc.setFillColor(c[0], c[1], c[2]) }
function traco(doc: jsPDF, c: RGB, w = 0.2) { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(w) }

function cortar(doc: jsPDF, texto: string, largura: number) {
  if (doc.getTextWidth(texto) <= largura) return texto
  let t = texto
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > largura) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

function garantir(doc: Doc, y: number, altura: number) {
  if (y + altura > BOTTOM) {
    doc.addPage()
    return TOP
  }
  return y
}

/** Faixa azul-marinho com o título da seção (como na tela). */
function faixa(doc: Doc, y: number, titulo: string, x = M, w = CW) {
  preencher(doc, NAVY)
  doc.roundedRect(x, y, w, BAR_H, 1.1, 1.1, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.3)
  doc.setTextColor(255, 255, 255)
  doc.text(titulo, x + 3, y + 4.25)
  return y + BAR_H + 1.2
}

function secao(doc: Doc, y: number, titulo: string, espaco = 28) {
  y = garantir(doc, y, espaco)
  return faixa(doc, y, titulo)
}

function nota(doc: Doc, y: number, texto: string) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.6)
  const linhas = doc.splitTextToSize(texto, CW) as string[]
  y = garantir(doc, y, linhas.length * 3 + 1)
  cor(doc, GREY)
  doc.text(linhas, M, y + 2.4)
  return y + linhas.length * 2.9 + 1.5
}

/** Caixa azul-clara com ícone de informação. */
function caixaInfo(doc: Doc, y: number, html: { negrito?: string; texto: string }) {
  y = garantir(doc, y, 10)
  preencher(doc, INFO_BG)
  traco(doc, INFO_LINE, 0.2)
  doc.roundedRect(M, y, CW, 7, 1.2, 1.2, 'FD')
  traco(doc, BLUE, 0.3)
  doc.circle(M + 4.2, y + 3.5, 1.6)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  cor(doc, BLUE)
  doc.text('i', M + 4.2, y + 4.4, { align: 'center' })
  doc.setFontSize(7.2)
  let x = M + 8
  if (html.negrito) {
    doc.text(html.negrito, x, y + 4.6)
    x += doc.getTextWidth(html.negrito) + 1
  }
  doc.setFont('helvetica', 'normal')
  cor(doc, INK)
  doc.text(cortar(doc, html.texto, CW - (x - M) - 3), x, y + 4.6)
  return y + 10
}

const ESTILO_TABELA: Partial<Styles> = {
  font: 'helvetica', fontSize: 7, cellPadding: { top: 1.1, bottom: 1.1, left: 1.6, right: 1.6 },
  lineColor: LINE, lineWidth: 0.12, textColor: INK, overflow: 'linebreak', valign: 'middle',
}

function tabela(doc: Doc, opts: UserOptions) {
  autoTable(doc, {
    theme: 'grid',
    margin: { left: M, right: M, top: TOP, bottom: PH - BOTTOM },
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    styles: ESTILO_TABELA,
    headStyles: { fillColor: HEAD, textColor: INK, fontStyle: 'bold', fontSize: 6.8 },
    footStyles: { fillColor: FOOT, textColor: INK, fontStyle: 'bold' },
    bodyStyles: { fillColor: [255, 255, 255] },
    ...opts,
  })
  return finalY(doc) + 4
}

/** Desenha o selo colorido de situação no lugar do texto da célula. */
function selos(doc: Doc, coluna: number) {
  return {
    willDrawCell: (d: CellHookData) => {
      if (d.section === 'body' && d.column.index === coluna && SELO[String(d.cell.raw && (d.cell.raw as CellDef).content)]) d.cell.text = []
    },
    didDrawCell: (d: CellHookData) => {
      if (d.section !== 'body' || d.column.index !== coluna) return
      const txt = String(d.cell.raw && (d.cell.raw as CellDef).content)
      const s = SELO[txt]
      if (!s) return
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      const w = Math.min(d.cell.width - 2, doc.getTextWidth(txt) + 4)
      const x = d.cell.x + (d.cell.width - w) / 2
      const y = d.cell.y + d.cell.height / 2 - 1.8
      preencher(doc, s[0])
      doc.roundedRect(x, y, w, 3.6, 1.6, 1.6, 'F')
      cor(doc, s[1])
      doc.text(txt, x + w / 2, y + 2.55, { align: 'center' })
    },
  }
}

const R = (content: string, extra: Partial<Styles> = {}): CellDef => ({ content, styles: { halign: 'right', ...extra } })
const B = (content: string, extra: Partial<Styles> = {}): CellDef => ({ content, styles: { fontStyle: 'bold', ...extra } })
const C = (content: string, extra: Partial<Styles> = {}): CellDef => ({ content, styles: { halign: 'center', ...extra } })
const sinal = (n: number) => (n > 0.004 ? GREEN : n < -0.004 ? RED : INK)

type Ctx = {
  m: FpRelModelo
  refsMov: Map<string, string[]> // id do lançamento → referências (C001 / C001.1, C001.2…)
  arquivos: Arquivo[]
  incluiComprovantes: boolean
}

function cartoesResumo(doc: Doc, y: number, m: FpRelModelo) {
  const sd = m.saldo
  const res = m.receitas - m.despesas
  const itens = [
    { rot: 'Receitas', val: money(m.receitas), ...CARDS.receitas, sub: 'efetivamente recebido' },
    { rot: 'Despesas', val: money(m.despesas), ...CARDS.despesas, sub: 'efetivamente pago' },
    { rot: 'Resultado do Período', val: money(res), ...CARDS.resultado, sub: 'receitas menos despesas' },
    {
      rot: 'Saldo Final',
      val: sd.disponivel ? money(sd.final) : '—',
      ...CARDS.saldo,
      sub: sd.disponivel ? `saldo anterior ${money(sd.anterior)}` : 'indisponível com filtros',
    },
  ]
  const gap = 2.5
  const w = (CW - gap * 3) / 4
  const h = 15.5
  itens.forEach((c, i) => {
    const x = M + i * (w + gap)
    preencher(doc, c.bg)
    doc.roundedRect(x, y, w, h, 1.3, 1.3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    cor(doc, c.fg)
    doc.text(c.rot, x + w / 2, y + 4.2, { align: 'center' })
    doc.setFontSize(10.5)
    doc.text(cortar(doc, c.val, w - 3), x + w / 2, y + 9.4, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.9)
    cor(doc, GREY)
    doc.text(cortar(doc, c.sub, w - 3), x + w / 2, y + 13.2, { align: 'center' })
  })
  return y + h + 2.5
}

/** Caixas "Pagamentos (programados)" e "Cobranças (a receber)" lado a lado. */
function caixasProgramacao(doc: Doc, y: number, m: FpRelModelo) {
  const caixas: { titulo: string; linhas: [string, string, RGB?][] }[] = []
  if (m.secoes.pagamentos) {
    const p = m.pagamentos
    caixas.push({
      titulo: 'Pagamentos (programados)',
      linhas: [
        [`Total previsto (${p.programados})`, money(p.previsto)],
        [`Total pago (${p.realizados})`, money(p.realizado)],
        [`Total pendente (${p.pendentes})`, money(p.pendente)],
        [`Vencido (${p.vencidos})`, money(p.vencido), p.vencidos ? RED : undefined],
      ],
    })
  }
  if (m.secoes.cobrancas) {
    const p = m.cobrancas
    caixas.push({
      titulo: 'Cobranças (a receber)',
      linhas: [
        [`Total previsto (${p.programados})`, money(p.previsto)],
        [`Total recebido (${p.realizados})`, money(p.realizado), p.realizado ? GREEN : undefined],
        [`A receber (${p.pendentes})`, money(p.pendente)],
        [`Vencido (${p.vencidos})`, money(p.vencido), p.vencidos ? RED : undefined],
      ],
    })
  }
  if (!caixas.length) return y
  y = garantir(doc, y, 34)
  const gap = 4
  const w = caixas.length === 2 ? (CW - gap) / 2 : CW
  let maxY = y
  caixas.forEach((c, i) => {
    const x = M + i * (w + gap)
    const y0 = faixa(doc, y, c.titulo, x, w)
    autoTable(doc, {
      theme: 'plain',
      startY: y0 - 0.4,
      margin: { left: x, right: PW - x - w, top: TOP, bottom: PH - BOTTOM },
      tableWidth: w,
      tableLineColor: CARD_LINE,
      tableLineWidth: 0.2,
      styles: { font: 'helvetica', fontSize: 7.2, fontStyle: 'bold', textColor: INK, cellPadding: { top: 0.9, bottom: 0.9, left: 3, right: 3 } },
      body: c.linhas.map(([rot, val, cc]) => [rot, R(val, cc ? { textColor: cc } : {})]),
    })
    maxY = Math.max(maxY, finalY(doc))
  })
  y = maxY + 1.5
  const extras: string[] = ['Previsto = valor atualmente cadastrado em cada programação (sem histórico do previsto original); pendentes não entram no resultado realizado.']
  const variaveis = (m.secoes.pagamentos ? m.pagamentos.semValor : 0) + (m.secoes.cobrancas ? m.cobrancas.semValor : 0)
  const dispensados = (m.secoes.pagamentos ? m.pagamentos.dispensados : 0) + (m.secoes.cobrancas ? m.cobrancas.dispensados : 0)
  if (variaveis) extras.push(`${variaveis} de valor variável fora do previsto.`)
  if (dispensados) extras.push(`${dispensados} ${dispensados === 1 ? 'dispensado não entra' : 'dispensados não entram'} nos totais.`)
  return nota(doc, y, extras.join(' ')) + 1.5
}

/** Conteúdo financeiro + controle/índice dos comprovantes. `paginaDe` = página de cada referência. */
function desenharConteudo(doc: Doc, ctx: Ctx, paginaDe: Map<string, string> | null) {
  const { m } = ctx
  const s = m.secoes
  let y = TOP

  const filtros = [
    m.filtros.origem !== 'todas' ? `Origem: ${m.filtros.origemLabel}` : '',
    m.filtros.categoria ? `Categoria: ${m.filtros.categoria}` : '',
    m.filtros.conta ? `Conta: ${m.filtros.conta}` : '',
    m.filtros.situacao !== 'todas' ? `Situação: ${m.filtros.situacaoLabel}` : '',
  ].filter(Boolean)
  if (filtros.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    cor(doc, GREY)
    doc.text(cortar(doc, `Filtros aplicados: ${filtros.join(' · ')}`, CW), M, y + 2.4)
    y += 5
  }

  /* Resumo do período */
  if (s.resumo) {
    y = secao(doc, y, 'Resumo do Período', 40)
    y = cartoesResumo(doc, y, m)
    const sd = m.saldo
    if (!sd.disponivel) y = nota(doc, y - 1, sd.motivo) + 1
    else {
      const ajustes: string[] = []
      if (Math.abs(sd.ajuste) > 0.004) ajustes.push(`ajustes de conferência de saldo: ${money(sd.ajuste)}${sd.conferencias ? ` (${sd.conferencias} no período)` : ''}`)
      if (Math.abs(sd.foraDasContas) > 0.004) ajustes.push(`lançamentos em contas inativas fora do saldo: ${money(sd.foraDasContas)}`)
      if (ajustes.length) y = nota(doc, y - 1, `Saldo final = saldo anterior + resultado; ${ajustes.join('; ')}.`) + 1
    }
  }

  /* Pagamentos e cobranças */
  y = caixasProgramacao(doc, y, m)

  /* Por categoria */
  if (s.categorias) {
    y = secao(doc, y, 'Resumo por Categoria (realizado)')
    const tr = m.categorias.reduce((a, c) => a + c.receitas, 0)
    const td = m.categorias.reduce((a, c) => a + c.despesas, 0)
    y = tabela(doc, {
      startY: y,
      head: [['Categoria', R('Receitas (R$)'), R('Despesas (R$)'), R('Resultado (R$)')]],
      body: m.categorias.length
        ? m.categorias.map((c) => [c.nome, R(plain(c.receitas)), R(plain(c.despesas)), R(plain(c.receitas - c.despesas))])
        : [[{ content: 'Nenhuma movimentação realizada no período.', colSpan: 4, styles: { textColor: GREY } }]],
      foot: [['Total Geral', R(plain(tr)), R(plain(td)), R(plain(tr - td))]],
      columnStyles: { 1: { cellWidth: 38 }, 2: { cellWidth: 38 }, 3: { cellWidth: 38 } },
    })
  }

  /* Por conta */
  if (s.contas) {
    y = secao(doc, y, 'Resumo por Conta Bancária (realizado)')
    const te = m.contas.reduce((a, c) => a + c.entradas, 0)
    const ts = m.contas.reduce((a, c) => a + c.saidas, 0)
    y = tabela(doc, {
      startY: y,
      head: [['Conta', R('Entradas (R$)'), R('Saídas (R$)'), R('Resultado (R$)')]],
      body: m.contas.length
        ? m.contas.map((c) => [c.nome, R(plain(c.entradas)), R(plain(c.saidas)), R(plain(c.entradas - c.saidas))])
        : [[{ content: 'Nenhuma movimentação realizada no período.', colSpan: 4, styles: { textColor: GREY } }]],
      foot: [['Total Geral', R(plain(te)), R(plain(ts)), R(plain(te - ts))]],
      columnStyles: { 1: { cellWidth: 38 }, 2: { cellWidth: 38 }, 3: { cellWidth: 38 } },
    })
    if (!m.temTransferencia) y = nota(doc, y - 2.5, 'O sistema não possui lançamento de transferência entre contas próprias: cada lançamento é receita ou despesa da conta utilizada.') + 1.5
  }

  // Como no modelo: a página 1 é o resumo; as listas começam na folha seguinte.
  if ((s.movimentos || s.pendPag || s.pendCob || ctx.incluiComprovantes) && y > TOP + 10) {
    doc.addPage()
    y = TOP
  }

  /* Movimentações */
  if (s.movimentos) {
    y = secao(doc, y, 'Movimentações Realizadas (Lançamentos)')
    const comComp = ctx.incluiComprovantes
    const SIT = 8
    const body: RowInput[] = m.movimentos.map((x) => {
      const refs = ctx.refsMov.get(x.id) || []
      const comp = !refs.length ? '—' : refs.length === 1 ? refs[0] : `${refs[0].split('.')[0]} (${refs.length})`
      const quem = x.pessoa ? ` – ${x.pessoa}` : ''
      const row: CellDef[] = [
        C(String(x.n)),
        { content: dataBr(x.data) },
        { content: `${x.descricao}${quem}` },
        { content: ORIGEM_LABEL[x.origem] },
        { content: x.categoria },
        { content: x.conta || '—' },
        R(x.previsto != null ? plain(x.previsto) : '—'),
        R(`${x.tipo === 'saida' ? '-' : ''}${plain(x.realizado)}`),
        C(x.situacao),
      ]
      if (comComp) row.push(C(comp, { textColor: refs.length ? BLUE : GREY, fontStyle: refs.length ? 'bold' : 'normal' }))
      return row
    })
    const head: CellDef[] = [
      C('#'), { content: 'Data' }, { content: 'Descrição' }, { content: 'Origem' }, { content: 'Categoria' },
      { content: 'Conta' }, R('Previsto'), R('Realizado'), C('Situação'),
    ]
    if (comComp) head.push(C('Comp.'))
    const ent = m.movimentos.filter((x) => x.tipo === 'entrada').reduce((a, x) => a + x.realizado, 0)
    const sai = m.movimentos.filter((x) => x.tipo === 'saida').reduce((a, x) => a + x.realizado, 0)
    const resto = head.length - 7
    const linhaTotal = (rot: string, v: string, c?: RGB): CellDef[] => [
      { content: rot, colSpan: 7 },
      R(v, c ? { textColor: c } : {}),
      { content: '', colSpan: resto - 1 },
    ]
    const sl = selos(doc, SIT)
    y = tabela(doc, {
      startY: y,
      head: [head],
      body: body.length ? body : [[{ content: 'Nenhuma movimentação realizada no período.', colSpan: head.length, styles: { textColor: GREY } }]],
      foot: body.length
        ? [
          linhaTotal('Total de entradas (recebido)', plain(ent), GREEN),
          linhaTotal('Total de saídas (pago)', `-${plain(sai)}`),
          linhaTotal('Total das movimentações realizadas (resultado líquido)', plain(ent - sai), sinal(ent - sai)),
        ]
        : undefined,
      styles: { ...ESTILO_TABELA, fontSize: 6.7 },
      headStyles: { fillColor: HEAD, textColor: INK, fontStyle: 'bold', fontSize: 6.5 },
      columnStyles: {
        0: { cellWidth: 6 }, 1: { cellWidth: 15 }, 3: { cellWidth: 16 }, 4: { cellWidth: 19 }, 5: { cellWidth: 22 },
        6: { cellWidth: 17 }, 7: { cellWidth: 17 }, 8: { cellWidth: 16 }, ...(comComp ? { 9: { cellWidth: 13 } } : {}),
      },
      ...(body.length ? sl : {}),
    })
    if (m.movimentos.some((x) => x.previsto != null)) {
      y = nota(doc, y - 2.5, 'Previsto = valor atualmente cadastrado na programação vinculada; não é um histórico confirmado do previsto original. Avulso = lançamento sem programação.') + 1.5
    }
  }

  /* Pendentes */
  if (s.pendPag || s.pendCob) {
    y = secao(doc, y, 'Pendentes do Período')
    const lista = [
      ...(s.pendPag ? m.pendPag.map((p) => ({ ...p, tipo: 'Pagamento' })) : []),
      ...(s.pendCob ? m.pendCob.map((p) => ({ ...p, tipo: 'Cobrança' })) : []),
    ].sort((a, b) => a.prazo.localeCompare(b.prazo) || a.descricao.localeCompare(b.descricao, 'pt-BR'))
    const soma = (l: typeof lista) => l.reduce((a, p) => a + (p.previsto ?? 0), 0)
    const pagar = lista.filter((p) => p.tipo === 'Pagamento')
    const receber = lista.filter((p) => p.tipo === 'Cobrança')
    const vencido = lista.filter((p) => p.vencido)
    const variaveis = lista.filter((p) => p.previsto == null).length
    const tot = (rot: string, v: string, c?: RGB): CellDef[] => [{ content: rot, colSpan: 5 }, R(v, c ? { textColor: c } : {}), { content: '' }]
    const foot: CellDef[][] = []
    if (lista.length) {
      if (s.pendPag) foot.push(tot(`Total a pagar (${pagar.length})`, plain(soma(pagar))))
      if (s.pendCob) foot.push(tot(`Total a receber (${receber.length})`, plain(soma(receber)), BLUE))
      if (vencido.length) foot.push(tot(`Total vencido (${vencido.length})`, plain(soma(vencido)), RED))
      foot.push(tot(`Total de pendentes${variaveis ? ` (${variaveis} de valor variável fora da soma)` : ''}:`, plain(soma(lista))))
    }
    y = tabela(doc, {
      startY: y,
      head: [[C('#'), 'Vencimento', 'Descrição', 'Tipo', 'Categoria', R('Valor (R$)'), C('Situação')]],
      body: lista.length
        ? lista.map((p, i) => [
          C(String(i + 1)),
          p.inicio ? `${dataBr(p.prazo)} (de ${dataBr(p.inicio).slice(0, 5)})` : dataBr(p.prazo),
          `${p.descricao}${p.pessoa ? ` – ${p.pessoa}` : ''}${p.conta ? ` · ${p.conta}` : ''}`,
          p.tipo,
          p.categoria,
          R(p.previsto != null ? plain(p.previsto) : 'Variável'),
          C(p.situacao),
        ])
        : [[{ content: 'Nenhum compromisso pendente no período.', colSpan: 7, styles: { textColor: GREY } }]],
      foot: foot.length ? foot : undefined,
      columnStyles: { 0: { cellWidth: 6 }, 1: { cellWidth: 26 }, 3: { cellWidth: 19 }, 4: { cellWidth: 24 }, 5: { cellWidth: 22 }, 6: { cellWidth: 18 } },
      ...(lista.length ? selos(doc, 6) : {}),
    })
  }

  /* Controle e índice dos comprovantes */
  if (ctx.incluiComprovantes) {
    const total = m.movimentos.length
    const com = m.movimentos.filter((x) => (ctx.refsMov.get(x.id) || []).length).length
    const arquivos = ctx.arquivos.length
    const indisponiveis = ctx.arquivos.filter((a) => a.erro || !a.partes.length).length
    const pct = total ? `${((com / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'
    y = secao(doc, y, 'Controle dos Comprovantes', 40)
    y = tabela(doc, {
      startY: y,
      head: [['Movimentações', R('Com comprovante'), R('Sem comprovante'), R('Arquivos anexados'), R('Incorporados'), R('Indisponíveis'), R('% com comprovante')]],
      body: [[
        String(total), R(String(com)), R(String(total - com), { textColor: total - com ? RED : INK }), R(String(arquivos)),
        R(String(arquivos - indisponiveis)), R(String(indisponiveis), { textColor: indisponiveis ? RED : INK }), R(pct, { fontStyle: 'bold' }),
      ]],
    })
    if (arquivos) {
      y = secao(doc, y, 'Índice dos Comprovantes')
      y = tabela(doc, {
        startY: y,
        head: [['Referência', 'Movimentação', 'Data', R('Valor'), R('Página')]],
        body: ctx.arquivos.map((a) => {
          const ind = a.erro || !a.partes.length
          return [
            B(a.ref, { textColor: BLUE }),
            `Nº ${a.mov.n} – ${a.mov.tipo === 'saida' ? 'Pagamento' : 'Recebimento'} – ${a.mov.descricao}`,
            dataBr(a.mov.data),
            R(money(a.mov.realizado)),
            R(ind ? 'Indisponível' : paginaDe?.get(a.ref) ?? '000', ind ? { textColor: RED, fontStyle: 'bold' } : {}),
          ]
        }),
        columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 20 }, 3: { cellWidth: 28 }, 4: { cellWidth: 22 } },
      })
      y = caixaInfo(doc, y - 1, { texto: 'Os comprovantes completos estão nas últimas páginas do relatório.' })
    }
  }
  return y
}

function desenharAnexos(doc: Doc, paginas: Bloco[][]) {
  paginas.forEach((blocos, i) => {
    doc.addPage()
    const y = faixa(doc, TOP, i === 0 ? 'Anexos e Comprovantes' : 'Anexos e Comprovantes (continuação)')
    if (i === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      cor(doc, INK)
      doc.text('Últimas páginas reservadas aos comprovantes anexados.', M, y + 3)
    }
    for (const b of blocos) desenharBloco(doc, b)
    if (i === paginas.length - 1) caixaInfo(doc, AREA_BOTTOM + 1, { negrito: 'Comp.', texto: '= referência do comprovante exibido nas páginas finais.' })
  })
}

function desenharBloco(doc: Doc, b: Bloco) {
  const { arq } = b
  const mov = arq.mov
  // Cartão
  preencher(doc, [255, 255, 255])
  traco(doc, CARD_LINE, 0.25)
  doc.roundedRect(b.x, b.y, b.w, b.h, 1.4, 1.4, 'FD')
  preencher(doc, [236, 240, 246])
  doc.roundedRect(b.x + 0.15, b.y + 0.15, b.w - 0.3, CARD_HEAD, 1.3, 1.3, 'F')
  doc.rect(b.x + 0.15, b.y + CARD_HEAD - 2, b.w - 0.3, 2.15, 'F')
  traco(doc, CARD_LINE, 0.2)
  doc.line(b.x, b.y + CARD_HEAD + 0.15, b.x + b.w, b.y + CARD_HEAD + 0.15)

  const tipo = mov.tipo === 'saida' ? 'Pagamento' : 'Recebimento'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.2)
  cor(doc, INK)
  doc.text(cortar(doc, `${arq.ref} – ${tipo}`, b.w - 6), b.x + 3, b.y + 4.3)
  doc.setFontSize(7)
  doc.text(cortar(doc, `Data: ${dataBr(mov.data)}   |   Valor: ${money(mov.realizado)}`, b.w - 6), b.x + 3, b.y + 8.2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  cor(doc, GREY)
  const parte = b.parte >= 0 && arq.partes.length > 1 ? ` (página ${b.parte + 1} de ${arq.partes.length})` : ''
  doc.text(cortar(doc, `Mov. nº ${mov.n} · Conta: ${mov.conta || '—'} · ${mov.descricao} · ${arq.nome}${parte}`, b.w - 6), b.x + 3, b.y + 11.8)

  const y0 = b.y + CARD_HEAD + CARD_PAD
  if (b.parte < 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.6)
    cor(doc, RED)
    doc.text('ARQUIVO INDISPONÍVEL', b.x + 3, y0 + 3.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.6)
    const linhas = doc.splitTextToSize(`Não incorporado a este relatório. Motivo: ${arq.erro || 'arquivo sem conteúdo'}. Consulte o original no sistema.`, b.w - 6) as string[]
    doc.text(linhas.slice(0, 3), b.x + 3, y0 + 7.5)
    return
  }
  const img = arq.partes[b.parte]
  const x = b.x + (b.w - b.imgW) / 2
  doc.addImage(img.data, 'JPEG', x, y0, b.imgW, b.imgH, undefined, 'FAST')
  traco(doc, [226, 231, 239], 0.15)
  doc.rect(x, y0, b.imgW, b.imgH)
}

function cabecalhosERodapes(doc: Doc, m: FpRelModelo, emissor: string) {
  const total = doc.getNumberOfPages()
  const quando = m.geradoEm && m.geradoEm.length >= 16
    ? `${dataBr(m.geradoEm.slice(0, 10))} às ${m.geradoEm.slice(11, 16)}`
    : new Date().toLocaleString('pt-BR')
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    cor(doc, NAVY)
    doc.text('MATHEUS DO BEIJU', M, 13)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.6)
    cor(doc, INK)
    doc.text('Controle Financeiro', M, 17)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    cor(doc, NAVY)
    doc.text('Relatório Financeiro Integrado', PW - M, 13, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.6)
    cor(doc, INK)
    doc.text(`Período: ${dataBr(m.periodo.ini)} a ${dataBr(m.periodo.fim)}`, PW - M, 17, { align: 'right' })
    traco(doc, NAVY, 0.6)
    doc.line(M, 19.6, PW - M, 19.6)

    doc.setFontSize(6.8)
    cor(doc, INK)
    doc.text(`Relatório gerado em: ${quando} · Emitido por: ${emissor}`, M, 289)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.2)
    doc.text(`Página ${p} de ${total}`, PW - M, 289, { align: 'right' })
  }
}

function nomeArquivo(m: FpRelModelo) {
  const { ini, fim } = m.periodo
  const ultimo = new Date(Number(ini.slice(0, 4)), Number(ini.slice(5, 7)), 0).getDate()
  const mesInteiro = ini.endsWith('-01') && ini.slice(0, 7) === fim.slice(0, 7) && Number(fim.slice(8, 10)) === ultimo
  return mesInteiro
    ? `Relatorio_Financeiro_Integrado_${ini.slice(0, 7)}.pdf`
    : `Relatorio_Financeiro_Integrado_${ini}_a_${fim}.pdf`
}

function novoDoc(): Doc {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true }) as Doc
  doc.setProperties({ title: 'Relatório Financeiro Integrado', subject: 'Prestação de contas', creator: 'Controle Financeiro' })
  return doc
}

function validarModelo(m: FpRelModelo) {
  const ok = m && m.periodo && /^\d{4}-\d{2}-\d{2}$/.test(m.periodo.ini) && /^\d{4}-\d{2}-\d{2}$/.test(m.periodo.fim)
    && Array.isArray(m.movimentos) && Array.isArray(m.pendPag) && Array.isArray(m.pendCob) && m.secoes
  if (!ok) throw new Error('Dados do relatório inválidos. Recarregue a página e tente de novo.')
}

/* ---------- Ponto de entrada ---------- */
export async function gerarRelatorioIntegrado(
  m: FpRelModelo,
  opts: { emissor: string; progresso?: (texto: string) => void },
): Promise<FpRelResultado> {
  validarModelo(m)
  const avisar = opts.progresso || (() => {})
  const emissor = opts.emissor || m.emissor || 'Usuário'
  const incluiComprovantes = !!m.secoes.comprovantes

  // 1) Comprovantes originais dos lançamentos do período
  const refsMov = new Map<string, string[]>()
  const arquivos: Arquivo[] = []
  if (incluiComprovantes && m.movimentos.length) {
    avisar('Consultando os comprovantes anexados…')
    const anexos = await listarAnexos(m.movimentos.map((x) => x.id))
    const porMov = new Map<string, AnexoRow[]>()
    for (const a of anexos) {
      const l = porMov.get(String(a.entidade_id)) || []
      l.push(a)
      porMov.set(String(a.entidade_id), l)
    }
    let seq = 0
    const fila: { arq: Arquivo; row: AnexoRow }[] = []
    for (const mov of m.movimentos) {
      const lista = porMov.get(mov.id)
      if (!lista?.length) continue
      const base = `C${pad3(++seq)}`
      const refs = lista.map((_, i) => (lista.length > 1 ? `${base}.${i + 1}` : base))
      refsMov.set(mov.id, refs)
      lista.forEach((row, i) => {
        const arq: Arquivo = { ref: refs[i], mov, nome: row.nome || 'comprovante', partes: [], erro: null }
        arquivos.push(arq)
        fila.push({ arq, row })
      })
    }
    let feitos = 0
    await emParalelo(fila, 3, async ({ arq, row }) => {
      const r = await prepararArquivo(row)
      arq.partes = r.partes
      arq.erro = r.erro
      feitos++
      avisar(`Incorporando os comprovantes originais (${feitos} de ${fila.length})…`)
    })
  }

  // 2) Paginação em passadas: o índice precisa saber em que folha cada comprovante ficou.
  avisar('Montando as páginas A4…')
  const ctx: Ctx = { m, refsMov, arquivos, incluiComprovantes }
  const plano = planejarAnexos(arquivos)
  let doc = novoDoc()
  desenharConteudo(doc, ctx, null)
  for (let tent = 0; tent < 3; tent++) {
    const inicio = doc.getNumberOfPages() + 1
    const mapa = new Map<string, string>()
    plano.forEach((blocos, i) => {
      for (const b of blocos) {
        const pg = inicio + i
        const atual = mapa.get(b.arq.ref)
        if (!atual) mapa.set(b.arq.ref, String(pg))
        else if (!atual.endsWith(`${pg}`)) mapa.set(b.arq.ref, `${atual.split('–')[0]}–${pg}`)
      }
    })
    const anterior = doc.getNumberOfPages()
    doc = novoDoc()
    desenharConteudo(doc, ctx, mapa)
    if (doc.getNumberOfPages() === anterior) break
  }
  desenharAnexos(doc, plano)
  cabecalhosERodapes(doc, m, emissor)

  const buf = doc.output('arraybuffer')
  const pdf = new Blob([buf], { type: 'application/pdf' })

  // 3) Pré-visualização: as páginas do próprio PDF gerado.
  const pages = await renderizarPaginas(buf, (i, n) => avisar(`Gerando a pré-visualização (página ${i} de ${n})…`))

  const avisos = arquivos
    .filter((a) => a.erro || !a.partes.length)
    .map((a) => `${a.ref} — ${a.nome}: ${a.erro || 'arquivo sem conteúdo'}`)
  return {
    pdf,
    pages,
    fileName: nomeArquivo(m),
    avisos,
    resumo: {
      paginas: pages.length,
      movimentos: m.movimentos.length,
      pendentes: (m.secoes.pendPag ? m.pendPag.length : 0) + (m.secoes.pendCob ? m.pendCob.length : 0),
      comprovantes: incluiComprovantes ? arquivos.length : null,
      incorporados: arquivos.filter((a) => !a.erro && a.partes.length).length,
    },
  }
}

async function renderizarPaginas(buf: ArrayBuffer, progresso: (i: number, n: number) => void): Promise<Blob[]> {
  ensurePdfWorker()
  const pdf = await getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false } as never).promise
  const out: Blob[] = []
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      progresso(p, pdf.numPages)
      const page = await pdf.getPage(p)
      const vp = page.getViewport({ scale: 2 })
      const { c, ctx } = canvasBranco(vp.width, vp.height)
      await page.render({ canvasContext: ctx, viewport: vp, canvas: c } as never).promise
      const blob = await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao gerar a pré-visualização.'))), 'image/jpeg', 0.9))
      out.push(blob)
      c.width = 0
      c.height = 0
      page.cleanup()
    }
  } finally {
    await pdf.destroy()
  }
  return out
}
