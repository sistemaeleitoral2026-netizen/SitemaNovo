import { jsPDF } from 'jspdf'
import autoTable, { type CellDef, type RowInput } from 'jspdf-autotable'
import type { Alvo, AuditoriaFicha } from './auditoriaBu'
import type { LocalVotacaoRef } from './locaisVotacao'

export type RelSecao = {
  key: string
  zona: string
  secao: string
  local: string
  bairro: string
  fichas: AuditoriaFicha[]
  comparecimento: number
  votos: number[]
  branco: number
  nulo: number
  statusLabel: string
}

export type RelatorioInput = {
  alvos: Alvo[]
  secoes: RelSecao[]
  invalidas: AuditoriaFicha[]
  foraSl: number
  locais: Map<string, LocalVotacaoRef>
}

type Linha = {
  ficha: AuditoriaFicha
  sec: RelSecao
  coord: string
  lider: string
  fit: number
  fitAlvo: number[]
}

type Agg = {
  nome: string
  fichas: number
  conf: number
  confAlvo: number[]
  secoes: Set<string>
  bairros: Set<string>
  liderancas: Set<string>
  zonas: Set<string>
}

// Paleta institucional
const TINTA: [number, number, number] = [18, 22, 30]
const GRAFITE: [number, number, number] = [62, 70, 84]
const CINZA: [number, number, number] = [120, 128, 140]
const CINZA_CL: [number, number, number] = [196, 202, 212]
const LINHA: [number, number, number] = [218, 222, 230]
const PAPEL: [number, number, number] = [252, 252, 250]
const CREME: [number, number, number] = [246, 243, 234]
const BORDO: [number, number, number] = [124, 42, 48]
const AZUL: [number, number, number] = [38, 61, 108]
const VERDE: [number, number, number] = [26, 110, 66]
const AMBAR: [number, number, number] = [168, 108, 10]
const VERM: [number, number, number] = [163, 36, 36]

const M = 20

const fmt = (n: number) => n.toLocaleString('pt-BR')
/** Voto é unitário: a contagem interna é fracionária (reparte o teto da seção entre as fichas), mas na exibição arredondamos para inteiro. */
const fmtI = (n: number) => Math.round(n).toLocaleString('pt-BR')
const pct2 = (a: number, b: number) =>
  b > 0 ? `${((a / b) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '-'
const pct1 = (a: number, b: number) =>
  b > 0 ? `${((a / b) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '-'
const cmpNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR')
const primeiroNome = (n: string) => n.split(' ')[0]
const smallCaps = (s: string) => s.toUpperCase()

function novoAgg(nome: string, nAlvos: number): Agg {
  return {
    nome, fichas: 0, conf: 0,
    confAlvo: Array.from({ length: nAlvos }, () => 0),
    secoes: new Set(), bairros: new Set(), liderancas: new Set(), zonas: new Set(),
  }
}

function agrupar(linhas: Linha[], nAlvos: number, keyFn: (l: Linha) => string): Agg[] {
  const m = new Map<string, Agg>()
  for (const l of linhas) {
    const k = keyFn(l)
    let a = m.get(k)
    if (!a) { a = novoAgg(k, nAlvos); m.set(k, a) }
    a.fichas += 1
    a.conf += l.fit
    l.fitAlvo.forEach((v, i) => { a.confAlvo[i] += v })
    a.secoes.add(l.sec.key)
    a.bairros.add(l.sec.bairro)
    a.liderancas.add(l.lider)
    a.zonas.add(l.sec.zona)
  }
  return [...m.values()]
}

const porConf = (a: Agg, b: Agg) =>
  b.conf - a.conf || b.conf / b.fichas - a.conf / a.fichas || cmpNome(a.nome, b.nome)
const aprov = (a: Agg) => (a.fichas ? a.conf / a.fichas : 0)

const protocolo = (d: Date) => {
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `AE-${yy}${mm}${dd}-${h}${m}`
}

export function gerarRelatorioAuditoriaPdf(input: RelatorioInput) {
  const { alvos, secoes, invalidas, foraSl } = input
  const nA = alvos.length
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const agora = new Date()
  const dataStr = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const horaStr = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const protoStr = protocolo(agora)

  // ── Base de cálculo ────────────────────────────────────────────────────
  const linhas: Linha[] = []
  for (const sec of secoes) {
    const n = sec.fichas.length
    const fitAlvo = sec.votos.map((v) => (n ? Math.min(1, v / n) : 0))
    const fit = fitAlvo.length ? Math.min(...fitAlvo) : 1
    for (const f of sec.fichas) {
      linhas.push({
        ficha: f, sec,
        coord: f.coordenador || 'Sem coordenação',
        lider: f.lider || 'Sem liderança',
        fit, fitAlvo,
      })
    }
  }
  const totalFichas = linhas.length
  const totalConf = linhas.reduce((s, l) => s + l.fit, 0)
  const totalVotosAlvo = alvos.map((_, i) => secoes.reduce((s, x) => s + (x.votos[i] ?? 0), 0))
  const bairrosTodos = new Set(secoes.map((s) => s.bairro))
  const zonasTodas = new Set(secoes.map((s) => s.zona))

  const coords = agrupar(linhas, nA, (l) => l.coord).sort(porConf)
  const liders = agrupar(linhas, nA, (l) => `${l.coord}\u0000${l.lider}`)
    .map((a) => ({ ...a, coord: a.nome.split('\u0000')[0], nome: a.nome.split('\u0000')[1] }))
    .sort(porConf)
  const zonasAgg = agrupar(linhas, nA, (l) => l.sec.zona).sort((a, b) => cmpNome(a.nome, b.nome))
  const bairrosAgg = agrupar(linhas, nA, (l) => l.sec.bairro).sort(porConf)

  // ── Primitivas de desenho ──────────────────────────────────────────────
  let y = 0
  const ultimoY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  function novaPagina() { doc.addPage(); y = 34 }
  function garantir(espaco: number) { if (y + espaco > H - 24) novaPagina() }

  function capitulo(numero: string, txt: string, bajada?: string) {
    novaPagina()
    doc.setFillColor(...CREME)
    doc.rect(0, 20, W, 56, 'F')
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.5)
    doc.line(M, 20, M + 10, 20)
    doc.line(M, 76, W - M, 76)

    doc.setFont('times', 'italic'); doc.setFontSize(10); doc.setTextColor(...BORDO)
    doc.text(`capítulo ${numero}`, M, 32)
    doc.setFont('times', 'bold'); doc.setFontSize(26); doc.setTextColor(...TINTA)
    const titulos = doc.splitTextToSize(txt, W - 2 * M) as string[]
    doc.text(titulos, M, 48)
    if (bajada) {
      doc.setFont('times', 'italic'); doc.setFontSize(10.5); doc.setTextColor(...GRAFITE)
      const sub = doc.splitTextToSize(bajada, W - 2 * M) as string[]
      doc.text(sub, M, 70)
    }
    y = 90
  }

  function secao(numero: string, txt: string) {
    garantir(16)
    doc.setFont('times', 'italic'); doc.setFontSize(9); doc.setTextColor(...BORDO)
    doc.text(`§ ${numero}`, M, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TINTA)
    doc.text(txt, M + 14, y)
    doc.setDrawColor(...LINHA); doc.setLineWidth(0.3)
    doc.line(M, y + 3, W - M, y + 3)
    y += 10
  }

  function subsecao(txt: string) {
    garantir(8)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...TINTA)
    doc.text(txt, M, y + 2)
    y += 6
  }

  function paragrafo(txt: string, opts?: { size?: number; cor?: [number, number, number]; serif?: boolean; gap?: number }) {
    const size = opts?.size ?? 9.5
    doc.setFont(opts?.serif ? 'times' : 'helvetica', 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...(opts?.cor ?? GRAFITE))
    const txts = doc.splitTextToSize(txt, W - 2 * M) as string[]
    const alt = txts.length * size * 0.46
    garantir(alt + 3)
    doc.text(txts, M, y + 3)
    y += alt + (opts?.gap ?? 4)
  }

  /** Nota lateral tipo documento oficial */
  function nota(label: string, txt: string) {
    doc.setFontSize(8.4)
    const txts = doc.splitTextToSize(txt, W - 2 * M - 32) as string[]
    const alt = Math.max(10, txts.length * 3.9 + 4)
    garantir(alt + 3)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); doc.setTextColor(...CINZA)
    doc.text(label.toUpperCase(), M, y + 4)
    doc.setDrawColor(...LINHA); doc.setLineWidth(0.2)
    doc.line(M + 26, y, M + 26, y + alt)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(...TINTA)
    doc.text(txts, M + 30, y + 4)
    y += alt + 4
  }

  /** Pull-quote: um número grande com legenda */
  function destaque(label: string, valor: string, legenda: string, cor: [number, number, number] = TINTA) {
    const alt = 24
    garantir(alt + 3)
    doc.setFillColor(...PAPEL)
    doc.rect(M, y, W - 2 * M, alt, 'F')
    doc.setDrawColor(...LINHA); doc.setLineWidth(0.2)
    doc.rect(M, y, W - 2 * M, alt)
    doc.setDrawColor(...cor); doc.setLineWidth(0.9)
    doc.line(M, y, M + 18, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); doc.setTextColor(...CINZA)
    doc.text(label.toUpperCase(), M + 4, y + 6)
    doc.setFont('times', 'bold'); doc.setFontSize(22); doc.setTextColor(...cor)
    const vw = doc.getTextWidth(valor)
    doc.text(valor, M + 4, y + 18)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4); doc.setTextColor(...GRAFITE)
    const leg = doc.splitTextToSize(legenda, W - 2 * M - 14 - vw) as string[]
    doc.text(leg, M + 10 + vw, y + 15)
    y += alt + 4
  }

  function kpis(itens: Array<{ rotulo: string; valor: string; nota?: string; cor?: [number, number, number] }>, porLinha = 4) {
    const gap = 3
    const w = (W - 2 * M - gap * (porLinha - 1)) / porLinha
    const h = 24
    for (let i = 0; i < itens.length; i += porLinha) {
      garantir(h + 3)
      itens.slice(i, i + porLinha).forEach((k, j) => {
        const x = M + j * (w + gap)
        doc.setFillColor(...PAPEL)
        doc.rect(x, y, w, h, 'F')
        doc.setDrawColor(...LINHA); doc.setLineWidth(0.2)
        doc.rect(x, y, w, h)
        doc.setDrawColor(...TINTA); doc.setLineWidth(0.6)
        doc.line(x, y, x + 12, y)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...CINZA)
        doc.text(k.rotulo.toUpperCase(), x + 3, y + 5.5)
        doc.setFont('times', 'bold'); doc.setFontSize(18); doc.setTextColor(...(k.cor ?? TINTA))
        doc.text(k.valor, x + 3, y + 15)
        if (k.nota) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...CINZA)
          doc.text(doc.splitTextToSize(k.nota, w - 6)[0] as string, x + 3, y + 20)
        }
      })
      y += h + 3
    }
    y += 1
  }

  function tabela(opts: {
    head: string[]
    body: RowInput[]
    larguras?: Array<number | undefined>
    numericas?: number[]
    fonte?: number
    foot?: RowInput
    corCelula?: (col: number, valor: string, linha: number) => [number, number, number] | undefined
  }) {
    const colStyles: Record<number, { cellWidth?: number; halign?: 'right' | 'left' | 'center' }> = {}
    opts.head.forEach((_, i) => {
      colStyles[i] = {}
      const w = opts.larguras?.[i]
      if (w) colStyles[i].cellWidth = w
      if (opts.numericas?.includes(i)) colStyles[i].halign = 'right'
    })
    autoTable(doc, {
      startY: y,
      head: [opts.head],
      body: opts.body,
      foot: opts.foot ? [opts.foot] : undefined,
      showFoot: 'lastPage',
      theme: 'plain',
      margin: { left: M, right: M, top: 32, bottom: 24 },
      styles: {
        font: 'helvetica',
        fontSize: opts.fonte ?? 7.8,
        cellPadding: { top: 2.4, right: 2.6, bottom: 2.4, left: 2.6 },
        textColor: TINTA,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: CINZA,
        fontStyle: 'bold',
        fontSize: (opts.fonte ?? 7.8) - 0.6,
        lineColor: TINTA,
        lineWidth: { top: 0.5, right: 0, bottom: 0.3, left: 0 },
      },
      footStyles: {
        fillColor: PAPEL,
        textColor: TINTA,
        fontStyle: 'bold',
        lineColor: TINTA,
        lineWidth: { top: 0.5, right: 0, bottom: 0.5, left: 0 },
      },
      alternateRowStyles: { fillColor: [250, 250, 249] },
      bodyStyles: { lineColor: LINHA, lineWidth: { top: 0, right: 0, bottom: 0.15, left: 0 } },
      columnStyles: colStyles,
      didParseCell: (d) => {
        if (d.section === 'head' && opts.numericas?.includes(d.column.index)) d.cell.styles.halign = 'right'
        if (d.section === 'foot' && opts.numericas?.includes(d.column.index)) d.cell.styles.halign = 'right'
        if (d.section === 'body' && opts.corCelula) {
          const raw = Array.isArray(d.row.raw) ? d.row.raw[d.column.index] : undefined
          const v = typeof raw === 'object' && raw ? String((raw as CellDef).content ?? '') : String(raw ?? '')
          const c = opts.corCelula(d.column.index, v, d.row.index)
          if (c) { d.cell.styles.textColor = c; d.cell.styles.fontStyle = 'bold' }
        }
      },
    })
    y = ultimoY() + 7
  }

  function barras(itens: Agg[], max?: number) {
    const lista = max ? itens.slice(0, max) : itens
    const maior = Math.max(1, ...lista.map((a) => a.fichas))
    const labelW = 62
    const valorW = 50
    const barW = W - 2 * M - labelW - valorW
    const h = 5.6
    garantir(lista.length * h + 14)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.9); doc.setTextColor(...CINZA)
    doc.setDrawColor(...CINZA_CL); doc.setLineWidth(0.3)
    doc.rect(M + labelW, y, 3, 2.6)
    doc.text('fichas que votaram', M + labelW + 4.5, y + 2.2)
    doc.setFillColor(...AZUL)
    doc.rect(M + labelW + 40, y, 3, 2.6, 'F')
    doc.text('fichas confirmadas', M + labelW + 44.5, y + 2.2)
    y += 6
    for (const a of lista) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...TINTA)
      const nome = doc.splitTextToSize(a.nome, labelW - 2)[0] as string
      doc.text(nome, M, y + 3.7)
      doc.setDrawColor(...CINZA_CL); doc.setLineWidth(0.25)
      doc.rect(M + labelW, y + 0.6, (a.fichas / maior) * barW, h - 1.2)
      doc.setFillColor(...AZUL)
      doc.rect(M + labelW, y + 0.6, (a.conf / maior) * barW, h - 1.2, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.4); doc.setTextColor(...GRAFITE)
      doc.text(`${fmtI(a.conf)} / ${fmt(a.fichas)}   ${pct1(a.conf, a.fichas)}`, W - M, y + 3.7, { align: 'right' })
      y += h
    }
    y += 5
  }

  const colAlvoHead = (prefixo: string) => alvos.map((a) => `${prefixo} ${primeiroNome(a.nome)}`)
  const confAlvoCells = (a: Agg) => a.confAlvo.map((v) => fmtI(v))
  const corAprov = (col: number, v: string, idxCol: number) => {
    if (col !== idxCol) return undefined
    const n = Number(v.replace('%', '').replace('.', '').replace(',', '.'))
    if (!Number.isFinite(n)) return undefined
    return n >= 90 ? VERDE : n >= 75 ? AMBAR : VERM
  }
  const parecer = (a: Agg) => (aprov(a) >= 0.9 ? 'Bom' : aprov(a) >= 0.75 ? 'Atenção' : 'Reavaliar')
  const corParecer = (v: string) =>
    (v === 'Bom' ? VERDE : v === 'Atenção' ? AMBAR : VERM)

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  CAPA                                                                 ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  // Molduras: linha dupla superior e inferior (estilo documento oficial)
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.8); doc.line(M, 16, W - M, 16)
  doc.setLineWidth(0.2); doc.line(M, 18.2, W - M, 18.2)
  doc.setLineWidth(0.8); doc.line(M, H - 16, W - M, H - 16)
  doc.setLineWidth(0.2); doc.line(M, H - 18.2, W - M, H - 18.2)

  // Topo: protocolo e cidade
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...CINZA)
  doc.text(smallCaps(`protocolo ${protoStr}`), M, 24)
  doc.text(smallCaps('são luís · maranhão'), W - M, 24, { align: 'right' })

  // Marca institucional (filete + rótulo)
  const topoMarca = 50
  doc.setDrawColor(...BORDO); doc.setLineWidth(1.2)
  doc.line(M, topoMarca, M + 24, topoMarca)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2); doc.setTextColor(...BORDO)
  doc.text(smallCaps('relatório de auditoria eleitoral'), M, topoMarca + 6)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...CINZA)
  doc.text(smallCaps('documento interno · circulação restrita'), M, topoMarca + 11)

  // Título principal (serifada, documental)
  doc.setFont('times', 'bold'); doc.setFontSize(34); doc.setTextColor(...TINTA)
  doc.text('Auditoria dos votos', M, 95)
  doc.text('da equipe de campanha', M, 108)
  doc.setFont('times', 'italic'); doc.setFontSize(13); doc.setTextColor(...GRAFITE)
  doc.text('Conferência das fichas registradas no sistema contra', M, 122)
  doc.text('os Boletins de Urna oficiais, por coordenação,', M, 130)
  doc.text('liderança, bairro e seção eleitoral.', M, 138)

  // Linha de corte
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.3)
  doc.line(M, 150, W - M, 150)

  // Bloco "Objeto do relatório"
  const by = 158
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); doc.setTextColor(...CINZA)
  doc.text(smallCaps('candidatos acompanhados'), M, by)
  alvos.forEach((a, i) => {
    doc.setFont('times', 'bold'); doc.setFontSize(13); doc.setTextColor(...TINTA)
    doc.text(a.nome, M, by + 10 + i * 11)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAFITE)
    doc.text(`${a.cargo}, nº ${a.numero}`, W - M, by + 10 + i * 11, { align: 'right' })
    doc.setDrawColor(...LINHA); doc.setLineWidth(0.2)
    doc.line(M, by + 13 + i * 11, W - M, by + 13 + i * 11)
  })

  // Rodapé da capa: data, assinatura visual
  const rodapeY = H - 54
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.3)
  doc.line(M, rodapeY, M + 55, rodapeY)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); doc.setTextColor(...CINZA)
  doc.text(smallCaps('emitido em'), M, rodapeY + 6)
  doc.setFont('times', 'bold'); doc.setFontSize(12); doc.setTextColor(...TINTA)
  doc.text(dataStr, M, rodapeY + 14)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAFITE)
  doc.text(`às ${horaStr}`, M, rodapeY + 20)

  doc.setDrawColor(...TINTA); doc.setLineWidth(0.3)
  doc.line(W - M - 55, rodapeY, W - M, rodapeY)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); doc.setTextColor(...CINZA)
  doc.text(smallCaps('fontes'), W - M, rodapeY + 6, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAFITE)
  doc.text('Cadastro interno de fichas', W - M, rodapeY + 12, { align: 'right' })
  doc.text('Boletins de Urna oficiais do TSE', W - M, rodapeY + 18, { align: 'right' })

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.3); doc.setTextColor(...CINZA)
  doc.text(smallCaps('página 1 · capa'), W / 2, H - 11, { align: 'center' })

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  SUMÁRIO                                                              ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  novaPagina()
  secao('I', 'Sumário do documento')
  const indice = [
    ['I', 'Sumário do documento'],
    ['II', 'Visão geral e indicadores principais'],
    ['III', 'Método de conferência dos votos'],
    ['IV', 'Classificação geral das coordenações'],
    ['V', 'Análise por coordenação'],
    ['VI', 'Avaliação das lideranças'],
    ['VII', 'Desempenho por território'],
    ['VIII', 'Seções com maior divergência'],
    ['IX', 'Pendências cadastrais a regularizar'],
  ]
  doc.setFont('times', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...TINTA)
  for (const [n, t] of indice) {
    garantir(8)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BORDO)
    doc.text(n, M + 2, y + 3)
    doc.setFont('times', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...TINTA)
    doc.text(t, M + 16, y + 3)
    // Pontilhado simulando sumário clássico
    doc.setDrawColor(...CINZA_CL); doc.setLineWidth(0.15); doc.setLineDashPattern([0.6, 1.2], 0)
    doc.line(M + 16 + doc.getTextWidth(t) + 3, y + 2.6, W - M - 2, y + 2.6)
    doc.setLineDashPattern([], 0)
    y += 7
  }
  y += 4
  paragrafo(
    'Este documento consolida a conferência entre o cadastro interno de fichas marcadas como “Votou” '
    + 'e os Boletins de Urna oficiais publicados pelo Tribunal Superior Eleitoral. O objetivo é medir, '
    + 'com rigor, quantos dos votos reivindicados pela equipe são efetivamente sustentáveis pela urna '
    + 'e identificar, com base nessa evidência, quais coordenações e lideranças devem ser mantidas, '
    + 'reforçadas ou reavaliadas.',
    { serif: true, size: 10 },
  )

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  CAPÍTULO II — VISÃO GERAL                                            ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  capitulo('II', 'Visão geral e indicadores principais',
    'Totais consolidados da auditoria, com os marcos que resumem o resultado da equipe.')

  destaque(
    'votos confirmados da equipe', fmtI(totalConf),
    `de um universo de ${fmt(totalFichas)} fichas marcadas como “Votou” em ${fmt(secoes.length)} seções `
    + `(${pct2(totalConf, totalFichas)} de aproveitamento).`,
    BORDO,
  )

  kpis([
    { rotulo: 'Fichas que votaram', valor: fmt(totalFichas), nota: 'marcadas como “Votou” no sistema' },
    { rotulo: 'Votos confirmados', valor: fmtI(totalConf), nota: `${pct2(totalConf, totalFichas)} de aproveitamento` },
    { rotulo: 'Seções auditadas', valor: fmt(secoes.length), nota: `em ${fmt(zonasTodas.size)} zonas e ${fmt(bairrosTodos.size)} bairros` },
    { rotulo: 'Equipe', valor: `${fmt(coords.length)}/${fmt(liders.length)}`, nota: 'coordenações e lideranças' },
    ...alvos.map((a, i) => ({
      rotulo: a.nome,
      valor: fmt(totalVotosAlvo[i]),
      nota: `${a.cargo}, nº ${a.numero}`,
    })),
    { rotulo: 'Pendências cadastrais', valor: fmt(invalidas.length), nota: `${fmt(foraSl)} em outro município`, cor: invalidas.length ? VERM : TINTA },
  ])

  const melhor = coords[0]
  const comFichasMin = coords.filter((c) => c.fichas >= 5)
  const baseRank = comFichasMin.length >= 2 ? comFichasMin : coords
  const porAprov = [...baseRank].sort((a, b) => aprov(b) - aprov(a) || b.fichas - a.fichas)
  const melhorAprov = porAprov[0]
  const piorAprov = porAprov[porAprov.length - 1]
  const piorConf = coords[coords.length - 1]

  secao('II.1', 'Pontos de destaque')
  if (melhor) {
    nota('Melhor volume',
      `${melhor.nome} liderou em votos confirmados, somando ${fmtI(melhor.conf)} fichas conferidas de `
      + `${fmt(melhor.fichas)} marcadas (${pct2(melhor.conf, melhor.fichas)} de aproveitamento), em `
      + `${fmt(melhor.secoes.size)} seções e ${fmt(melhor.bairros.size)} bairros.`)
  }
  if (piorConf && coords.length > 1) {
    nota('Menor volume',
      `${piorConf.nome} apresentou o menor número de votos confirmados: ${fmtI(piorConf.conf)} de `
      + `${fmt(piorConf.fichas)} fichas (${pct2(piorConf.conf, piorConf.fichas)}). `
      + 'Convém revisar sua base cadastral e estratégia de mobilização.')
  }
  if (melhorAprov && piorAprov && melhorAprov !== piorAprov) {
    nota('Aproveitamento',
      `Dentre as coordenações com cinco ou mais fichas, a maior taxa de aproveitamento é de `
      + `${melhorAprov.nome} (${pct2(melhorAprov.conf, melhorAprov.fichas)}); a menor, de `
      + `${piorAprov.nome} (${pct2(piorAprov.conf, piorAprov.fichas)}).`)
  }
  const melhorLider = liders.filter((l) => l.fichas >= 3).sort((a, b) => aprov(b) - aprov(a) || b.fichas - a.fichas)[0]
  const piorLider = liders.filter((l) => l.fichas >= 3).sort((a, b) => aprov(a) - aprov(b) || b.fichas - a.fichas)[0]
  if (melhorLider && piorLider && melhorLider !== piorLider) {
    nota('Lideranças',
      `Com três ou mais fichas, a liderança de maior aproveitamento é ${melhorLider.nome} `
      + `(${melhorLider.coord}), com ${pct2(melhorLider.conf, melhorLider.fichas)}. `
      + `A de menor aproveitamento é ${piorLider.nome} (${piorLider.coord}), com `
      + `${pct2(piorLider.conf, piorLider.fichas)}.`)
  }
  const topBairro = bairrosAgg[0]
  const topZona = [...zonasAgg].sort(porConf)[0]
  if (topBairro && topZona) {
    nota('Território',
      `O bairro com mais votos confirmados é ${topBairro.nome}, com ${fmtI(topBairro.conf)} fichas `
      + `conferidas de ${fmt(topBairro.fichas)}. A zona com maior volume é a zona ${topZona.nome}, `
      + `com ${fmtI(topZona.conf)} de ${fmt(topZona.fichas)}.`)
  }

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  CAPÍTULO III — MÉTODO                                                ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  capitulo('III', 'Método de conferência dos votos',
    'Como as fichas da equipe são comparadas aos Boletins de Urna oficiais, e por que o resultado representa um limite máximo seguro.')

  paragrafo(
    'O voto é secreto por natureza: o Boletim de Urna informa quantos votos cada candidato recebeu em cada '
    + 'seção eleitoral, mas não revela a identidade de quem votou em quem. Dessa limitação legítima deriva '
    + 'o método adotado nesta auditoria.',
    { serif: true, size: 10 },
  )
  paragrafo(
    'A conferência é feita seção a seção. Em uma seção onde a equipe tenha, por exemplo, dez fichas marcadas '
    + 'como “Votou” e a candidata tenha recebido apenas seis votos naquela urna, no máximo seis dessas fichas '
    + 'podem efetivamente ter se traduzido em voto — as quatro restantes não cabem no total registrado. Quando '
    + 'são acompanhados dois candidatos simultaneamente, uma ficha só é integralmente confirmada se couber '
    + 'nos votos de ambos.',
    { serif: true, size: 10 },
  )
  paragrafo(
    'Somando-se essas restrições em todas as seções, chega-se ao número de votos confirmados da equipe. '
    + 'Esse valor é, por construção, um limite máximo seguro: é logicamente impossível que a equipe tenha '
    + 'entregue mais votos do que a soma dos registros do Boletim de Urna permite.',
    { serif: true, size: 10 },
  )

  secao('III.1', 'Resumo numérico do método')
  tabela({
    head: ['Indicador', 'Valor', 'Como se obtém'],
    body: [
      ['Fichas que votaram', fmt(totalFichas), 'eleitores da equipe marcados como “Votou” em seções válidas'],
      ...alvos.map((a, i) => [
        `Votos no BU — ${a.nome}`, fmt(totalVotosAlvo[i]),
        'total de votos no Boletim de Urna, nas seções em que a equipe tem fichas',
      ]),
      ...alvos.map((a, i) => [
        `Votos confirmados — ${a.nome}`, fmtI(linhas.reduce((s, l) => s + l.fitAlvo[i], 0)),
        'fichas que cabem nos votos deste candidato',
      ]),
      ['Votos confirmados da equipe', fmtI(totalConf),
        'fichas que cabem simultaneamente nos votos de todos os candidatos'],
      ['Fichas não confirmadas', fmtI(totalFichas - totalConf), 'diferença entre fichas e votos confirmados'],
      ['Aproveitamento geral', pct2(totalConf, totalFichas), 'votos confirmados dividido pelas fichas'],
    ],
    larguras: [80, 32, undefined],
    numericas: [1],
    fonte: 8.6,
  })
  paragrafo(
    'As fichas não confirmadas não indicam, isoladamente, má-fé. Elas podem decorrer de erro de marcação '
    + 'no sistema, de eleitor que compareceu e optou por outro candidato, ou de abstenção não registrada. '
    + 'Os totais são exibidos como voto inteiro (voto não se divide); pequenas diferenças de uma unidade entre '
    + 'as linhas e a soma geral são apenas efeito do arredondamento final.',
    { size: 8.8, cor: CINZA, serif: true, gap: 2 },
  )

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  CAPÍTULO IV — RANKING DE COORDENAÇÕES                                ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  capitulo('IV', 'Classificação geral das coordenações',
    'Ranking consolidado por volume de votos confirmados, com parecer técnico sobre o aproveitamento de cada coordenação.')

  secao('IV.1', 'Volume de votos confirmados')
  paragrafo(
    'A linha mais clara representa o total de fichas marcadas como “Votou”. A barra preenchida mostra, dentro '
    + 'desse total, a parcela efetivamente confirmada pelos Boletins de Urna.',
    { size: 8.8, cor: CINZA },
  )
  barras(coords, 18)

  secao('IV.2', 'Tabela comparativa')
  paragrafo(
    'O parecer segue a taxa de aproveitamento: "Bom" para noventa por cento ou mais; "Atenção" '
    + 'entre setenta e cinco e noventa por cento; "Reavaliar" abaixo de setenta e cinco por cento.',
    { size: 8.8, cor: CINZA },
  )
  tabela({
    head: ['#', 'Coordenação', 'Lid.', 'Seções', 'Bairros', 'Fichas', ...colAlvoHead('Conf.'), 'Confirm.', 'Aprov.', 'Parecer'],
    body: coords.map((c, i) => [
      String(i + 1), c.nome, fmt(c.liderancas.size), fmt(c.secoes.size), fmt(c.bairros.size), fmt(c.fichas),
      ...confAlvoCells(c), fmtI(c.conf), pct2(c.conf, c.fichas), parecer(c),
    ]),
    larguras: [9, undefined, 12, 14, 14, 14, undefined, undefined, 16, 16, 20],
    numericas: [0, 2, 3, 4, 5, ...alvos.map((_, i) => 6 + i), 6 + nA, 7 + nA],
    foot: [
      '', 'TOTAL', fmt(liders.length), fmt(secoes.length), fmt(bairrosTodos.size), fmt(totalFichas),
      ...alvos.map((_, i) => fmtI(linhas.reduce((s, l) => s + l.fitAlvo[i], 0))),
      fmtI(totalConf), pct2(totalConf, totalFichas), '',
    ],
    corCelula: (col, v) => (col === 8 + nA ? corParecer(v) : corAprov(col, v, 7 + nA)),
  })

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  CAPÍTULO V — ANÁLISE POR COORDENAÇÃO                                 ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  capitulo('V', 'Análise por coordenação',
    'Uma página dedicada a cada coordenação, com as lideranças que a compõem, os bairros em que atua e as seções que registraram a maior divergência entre fichas e votos.')
  coords.forEach((c, idx) => {
    const doCoord = linhas.filter((l) => l.coord === c.nome)
    if (idx > 0) novaPagina()
    garantir(60)

    // Cabeçalho elegante da coordenação
    doc.setFont('times', 'bold'); doc.setFontSize(44); doc.setTextColor(...CREME)
    doc.text(String(idx + 1).padStart(2, '0'), M, y + 18)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(...BORDO)
    doc.text(smallCaps('coordenação'), M + 26, y + 4)
    doc.setFont('times', 'bold'); doc.setFontSize(18); doc.setTextColor(...TINTA)
    doc.text(c.nome, M + 26, y + 14)
    const sel = idx === 0 ? 'Maior volume de votos confirmados'
      : idx === coords.length - 1 && coords.length > 1 ? 'Menor volume de votos confirmados' : null
    if (sel) {
      doc.setFont('times', 'italic'); doc.setFontSize(9); doc.setTextColor(...(idx === 0 ? VERDE : VERM))
      doc.text(sel, W - M, y + 14, { align: 'right' })
    }
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.5)
    doc.line(M, y + 20, W - M, y + 20)
    y += 26

    kpis([
      { rotulo: 'Fichas', valor: fmt(c.fichas) },
      { rotulo: 'Votos confirmados', valor: fmtI(c.conf) },
      { rotulo: 'Aproveitamento', valor: pct2(c.conf, c.fichas),
        cor: aprov(c) >= 0.9 ? VERDE : aprov(c) >= 0.75 ? AMBAR : VERM },
      { rotulo: 'Lideranças', valor: fmt(c.liderancas.size), nota: `${fmt(c.secoes.size)} seções · ${fmt(c.bairros.size)} bairros` },
    ])

    subsecao('Lideranças que compõem a coordenação')
    const deste = liders.filter((l) => l.coord === c.nome)
    tabela({
      head: ['Liderança', 'Bairros', 'Seç.', 'Fichas', 'Confirm.', 'Aprov.'],
      body: deste.map((l) => [l.nome, fmt(l.bairros.size), fmt(l.secoes.size), fmt(l.fichas), fmtI(l.conf), pct2(l.conf, l.fichas)]),
      larguras: [undefined, 16, 13, 16, 22, 22],
      numericas: [1, 2, 3, 4, 5],
      corCelula: (col, v) => corAprov(col, v, 5),
    })

    subsecao('Bairros de atuação')
    const bairrosC = agrupar(doCoord, nA, (l) => l.sec.bairro).sort(porConf)
    tabela({
      head: ['Bairro', 'Zona(s)', 'Seç.', 'Fichas', 'Confirm.', 'Aprov.'],
      body: bairrosC.map((b) => [b.nome, [...b.zonas].sort().join(', '), fmt(b.secoes.size), fmt(b.fichas), fmtI(b.conf), pct2(b.conf, b.fichas)]),
      larguras: [undefined, 22, 13, 16, 22, 22],
      numericas: [2, 3, 4, 5],
      corCelula: (col, v) => corAprov(col, v, 5),
    })

    subsecao('Seções com maior divergência')
    const secC = agrupar(doCoord, nA, (l) => l.sec.key)
      .map((a) => ({ a, sec: secoes.find((s) => s.key === a.nome) as RelSecao }))
      .filter((x) => x.a.fichas - x.a.conf >= 0.5)
      .sort((p, q) => (q.a.fichas - q.a.conf) - (p.a.fichas - p.a.conf))
      .slice(0, 10)
    if (!secC.length) {
      paragrafo('Nenhuma divergência relevante nesta coordenação: todas as fichas cabem nos votos do Boletim de Urna.',
        { size: 8.8, cor: VERDE, serif: true })
    } else {
      tabela({
        head: ['Zona/Seção', 'Bairro', 'Local de votação', 'Fichas', 'Confirm.', 'Aprov.'],
        body: secC.map(({ a, sec }) => [`${sec.zona}/${sec.secao}`, sec.bairro, sec.local, fmt(a.fichas), fmtI(a.conf), pct2(a.conf, a.fichas)]),
        larguras: [20, 34, undefined, 14, 20, 20],
        numericas: [3, 4, 5],
        fonte: 7.4,
        corCelula: (col, v) => corAprov(col, v, 5),
      })
    }
  })

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  CAPÍTULO VI — LIDERANÇAS                                             ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  capitulo('VI', 'Avaliação das lideranças',
    'Classificação individual das lideranças por faixa de aproveitamento, com indicação daquelas que merecem reforço ou revisão.')

  paragrafo(
    'A avaliação individual de uma liderança requer amostra mínima de três fichas para ser estatisticamente '
    + 'significativa. Lideranças com uma ou duas fichas são contabilizadas à parte, pois um único caso pode '
    + 'distorcer a leitura.',
    { serif: true, size: 10 },
  )

  const grandes = liders.filter((l) => l.fichas >= 3)
  const pequenas = liders.filter((l) => l.fichas < 3)
  const gBom = grandes.filter((l) => aprov(l) >= 0.9).sort(porConf)
  const gAt = grandes.filter((l) => aprov(l) >= 0.75 && aprov(l) < 0.9).sort(porConf)
  const gRuim = grandes.filter((l) => aprov(l) < 0.75)
    .sort((a, b) => aprov(a) - aprov(b) || b.fichas - a.fichas)
  kpis([
    { rotulo: 'Bom · 90% ou mais', valor: fmt(gBom.length), cor: VERDE },
    { rotulo: 'Atenção · 75 a 90%', valor: fmt(gAt.length), cor: AMBAR },
    { rotulo: 'Reavaliar · abaixo de 75%', valor: fmt(gRuim.length), cor: VERM },
    { rotulo: 'Amostra insuficiente', valor: fmt(pequenas.length), nota: `${fmt(pequenas.reduce((x, l) => x + l.fichas, 0))} fichas no total` },
  ])

  const tabLider = (lista: typeof liders) => tabela({
    head: ['#', 'Liderança', 'Coordenação', 'Bairros', 'Fichas', 'Confirm.', 'Não conf.', 'Aprov.'],
    body: lista.map((l, i) => [String(i + 1), l.nome, l.coord, fmt(l.bairros.size), fmt(l.fichas), fmtI(l.conf), fmtI(l.fichas - l.conf), pct2(l.conf, l.fichas)]),
    larguras: [9, undefined, 48, 14, 14, 20, 20, 20],
    numericas: [0, 3, 4, 5, 6, 7],
    fonte: 7.5,
    corCelula: (col, v) => corAprov(col, v, 7),
  })
  secao('VI.1', 'Lideranças a reavaliar — abaixo de 75%')
  if (gRuim.length) tabLider(gRuim)
  else paragrafo('Não há lideranças nesta faixa.', { size: 8.8, cor: VERDE, serif: true })
  secao('VI.2', 'Lideranças em atenção — 75% a 90%')
  if (gAt.length) tabLider(gAt)
  else paragrafo('Não há lideranças nesta faixa.', { size: 8.8, serif: true })
  secao('VI.3', 'Lideranças com bom desempenho — 90% ou mais')
  if (gBom.length) tabLider(gBom)
  else paragrafo('Não há lideranças nesta faixa.', { size: 8.8, serif: true })

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  CAPÍTULO VII — TERRITÓRIO                                            ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  capitulo('VII', 'Desempenho por território',
    'Resultados por zona eleitoral e bairro, para identificar as regiões em que a equipe tem base real e aquelas em que precisa aprofundar presença.')

  secao('VII.1', 'Por zona eleitoral')
  tabela({
    head: ['Zona', 'Seç.', 'Bairros', 'Fichas', ...colAlvoHead('Votos'), 'Confirm.', 'Aprov.'],
    body: zonasAgg.map((z) => {
      const secZ = secoes.filter((s) => s.zona === z.nome)
      return [
        `Zona ${z.nome}`, fmt(z.secoes.size), fmt(z.bairros.size), fmt(z.fichas),
        ...alvos.map((_, i) => fmt(secZ.reduce((s, x) => s + x.votos[i], 0))),
        fmtI(z.conf), pct2(z.conf, z.fichas),
      ]
    }),
    numericas: [1, 2, 3, ...alvos.map((_, i) => 4 + i), 4 + nA, 5 + nA],
    corCelula: (col, v) => corAprov(col, v, 5 + nA),
  })

  secao('VII.2', 'Por bairro')
  paragrafo('O bairro é obtido do local de votação cadastrado no TSE para cada seção.',
    { size: 8.8, cor: CINZA })
  tabela({
    head: ['#', 'Bairro', 'Zona(s)', 'Seç.', 'Coord.', 'Fichas', 'Confirm.', 'Aprov.'],
    body: bairrosAgg.map((b, i) => {
      const nCoords = new Set(linhas.filter((l) => l.sec.bairro === b.nome).map((l) => l.coord)).size
      return [String(i + 1), b.nome, [...b.zonas].sort().join(', '), fmt(b.secoes.size), fmt(nCoords), fmt(b.fichas), fmtI(b.conf), pct2(b.conf, b.fichas)]
    }),
    larguras: [9, undefined, 22, 13, 15, 16, 20, 20],
    numericas: [0, 3, 4, 5, 6, 7],
    corCelula: (col, v) => corAprov(col, v, 7),
  })

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  CAPÍTULO VIII — SEÇÕES CRÍTICAS                                      ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  capitulo('VIII', 'Seções com maior divergência',
    'Relação das seções em que a soma das fichas marcadas como “Votou” supera os votos do candidato na urna, ordenadas da maior para a menor diferença.')

  const criticas = secoes
    .map((x) => {
      const conf = x.fichas.length ? Math.min(...x.votos.map((v) => Math.min(x.fichas.length, v))) : 0
      return { x, dif: x.fichas.length - conf }
    })
    .filter((c) => c.dif >= 1 || c.x.statusLabel === 'Acima do comparecimento')
    .sort((a, b) => b.dif - a.dif)
  paragrafo(
    `Foram identificadas ${fmt(criticas.length)} seções com divergência entre fichas e votos. `
    + 'A tabela abaixo lista as quarenta seções com maior diferença.',
    { size: 8.8, cor: CINZA },
  )
  tabela({
    head: ['Zona/Seç.', 'Bairro e local', 'Fichas', ...colAlvoHead('Votos'), 'Não conf.', 'Situação'],
    body: criticas.slice(0, 40).map(({ x, dif }) => [
      `${x.zona}/${x.secao}`, `${x.bairro} — ${x.local}`, fmt(x.fichas.length), ...x.votos.map(fmt), fmt(dif), x.statusLabel,
    ]),
    larguras: [17, undefined, 13, ...alvos.map(() => 17), 15, 34],
    numericas: [2, ...alvos.map((_, i) => 3 + i), 3 + nA],
    fonte: 7.4,
    corCelula: (col, v) => (col === 4 + nA ? (v === 'Parcial' ? AMBAR : VERM) : undefined),
  })

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  CAPÍTULO IX — PENDÊNCIAS                                             ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  capitulo('IX', 'Pendências cadastrais a regularizar',
    'Fichas que ficaram de fora dos cálculos por falta ou inconsistência de dados.')

  destaque('fichas a regularizar', fmt(invalidas.length),
    `fichas marcadas como “Votou” estão com zona ou seção vazia, ou inexistente na base oficial do TSE. `
    + `Outras ${fmt(foraSl)} fichas pertencem a seções de outro município.`,
    invalidas.length ? AMBAR : VERDE)

  paragrafo(
    'Essas fichas foram excluídas do cálculo deste relatório porque não há base confiável de comparação para '
    + 'elas. Para que entrem na próxima auditoria, basta corrigir os dados pela aba "Corrigir zona/seção" do '
    + 'sistema; a correção também fica registrada no histórico.',
    { serif: true, size: 10 },
  )

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  Cabeçalho e rodapé em todas as páginas (exceto a capa)              ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  const total = doc.getNumberOfPages()
  for (let p = 2; p <= total; p++) {
    doc.setPage(p)
    // Cabeçalho
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); doc.setTextColor(...TINTA)
    doc.text(smallCaps('auditoria dos votos da equipe de campanha'), M, 13)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...CINZA)
    doc.text(dataStr, W - M, 13, { align: 'right' })
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.4); doc.line(M, 16, W - M, 16)
    doc.setLineWidth(0.15); doc.line(M, 17.2, W - M, 17.2)

    // Rodapé
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.4); doc.line(M, H - 15, W - M, H - 15)
    doc.setLineWidth(0.15); doc.line(M, H - 16.2, W - M, H - 16.2)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...CINZA)
    doc.text(smallCaps(`protocolo ${protoStr}`), M, H - 10)
    doc.text(smallCaps('documento interno · auditoria eleitoral · são luís — ma'), W / 2, H - 10, { align: 'center' })
    doc.text(smallCaps(`página ${p} de ${total}`), W - M, H - 10, { align: 'right' })
  }

  doc.save(`relatorio-auditoria-${agora.toISOString().slice(0, 10)}.pdf`)
}
