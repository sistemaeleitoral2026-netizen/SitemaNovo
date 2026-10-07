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
  /** fração da ficha que cabe nos votos de TODOS os candidatos acompanhados (interseção) */
  fit: number
  /** fração por candidato: min(1, Vi/N) */
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

// Paleta sóbria em tons de cinza e azul-escuro. Alertas só em vermelho/âmbar/verde fechado.
const PRETO: [number, number, number] = [25, 28, 35]
const GRAFITE: [number, number, number] = [55, 62, 76]
const CINZA: [number, number, number] = [120, 128, 140]
const CINZA_CL: [number, number, number] = [196, 202, 212]
const LINHA: [number, number, number] = [220, 224, 232]
const SUAVE: [number, number, number] = [248, 249, 251]
const AZUL: [number, number, number] = [36, 59, 108]
const VERDE: [number, number, number] = [26, 110, 66]
const AMBAR: [number, number, number] = [168, 108, 10]
const VERM: [number, number, number] = [163, 36, 36]

const M = 16 // margem lateral (mm) — mais generosa, respira melhor

const fmt = (n: number) => n.toLocaleString('pt-BR')
const fmt2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct2 = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—')
const pct1 = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—')
const cmpNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR')
const primeiroNome = (n: string) => n.split(' ')[0]

function novoAgg(nome: string, nAlvos: number): Agg {
  return {
    nome,
    fichas: 0,
    conf: 0,
    confAlvo: Array.from({ length: nAlvos }, () => 0),
    secoes: new Set(),
    bairros: new Set(),
    liderancas: new Set(),
    zonas: new Set(),
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

const porConf = (a: Agg, b: Agg) => b.conf - a.conf || b.conf / b.fichas - a.conf / a.fichas || cmpNome(a.nome, b.nome)
const aprov = (a: Agg) => (a.fichas ? a.conf / a.fichas : 0)

export function gerarRelatorioAuditoriaPdf(input: RelatorioInput) {
  const { alvos, secoes, invalidas, foraSl } = input
  const nA = alvos.length
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const agora = new Date()
  const dataStr = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const horaStr = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

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
  const totalComparecimento = secoes.reduce((s, x) => s + x.comparecimento, 0)
  const bairrosTodos = new Set(secoes.map((s) => s.bairro))
  const zonasTodas = new Set(secoes.map((s) => s.zona))

  // Teto de votos atribuíveis à equipe por candidato = Soma min(N, V) por seção.
  const tetoAlvo = alvos.map((_, i) => secoes.reduce((s, x) => s + Math.min(x.fichas.length, x.votos[i] ?? 0), 0))
  // Interseção: Soma min(N, V1, V2, ...) por seção — fichas que cabem para TODOS os candidatos juntos.
  const intersecao = secoes.reduce((s, x) => s + Math.min(x.fichas.length, ...x.votos), 0)

  const coords = agrupar(linhas, nA, (l) => l.coord).sort(porConf)
  const liders = agrupar(linhas, nA, (l) => `${l.coord}\u0000${l.lider}`)
    .map((a) => ({ ...a, coord: a.nome.split('\u0000')[0], nome: a.nome.split('\u0000')[1] }))
    .sort(porConf)
  const zonasAgg = agrupar(linhas, nA, (l) => l.sec.zona).sort((a, b) => cmpNome(a.nome, b.nome))
  const bairrosAgg = agrupar(linhas, nA, (l) => l.sec.bairro).sort(porConf)

  // ── Utilidades de desenho ──────────────────────────────────────────────
  let y = 0
  const ultimoY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  function novaPagina() { doc.addPage(); y = 26 }
  function garantir(espaco: number) { if (y + espaco > H - 20) novaPagina() }

  function titulo(txt: string, nivel: 1 | 2 = 1) {
    garantir(nivel === 1 ? 20 : 14)
    if (nivel === 1) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(...PRETO)
      doc.text(txt, M, y + 4)
      doc.setDrawColor(...PRETO)
      doc.setLineWidth(0.5)
      doc.line(M, y + 6.5, W - M, y + 6.5)
      y += 11
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...GRAFITE)
      doc.text(txt, M, y + 3)
      y += 6.5
    }
  }

  function paragrafo(txt: string, opts?: { size?: number; cor?: [number, number, number]; bold?: boolean; gap?: number }) {
    const size = opts?.size ?? 9
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...(opts?.cor ?? GRAFITE))
    const txts = doc.splitTextToSize(txt, W - 2 * M) as string[]
    const alt = txts.length * size * 0.42
    garantir(alt + 2)
    doc.text(txts, M, y + 3)
    y += alt + (opts?.gap ?? 3)
  }

  function caixa(titulo_: string, txt: string, cor: [number, number, number] = GRAFITE) {
    doc.setFontSize(8.5)
    const txts = doc.splitTextToSize(txt, W - 2 * M - 10) as string[]
    const alt = 10 + txts.length * 3.9
    garantir(alt + 3)
    doc.setDrawColor(...LINHA)
    doc.setLineWidth(0.2)
    doc.rect(M, y, W - 2 * M, alt)
    doc.setFillColor(...cor)
    doc.rect(M, y, 1.2, alt, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...cor)
    doc.text(titulo_, M + 5, y + 5.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...PRETO)
    doc.text(txts, M + 5, y + 10)
    y += alt + 4
  }

  function kpis(itens: Array<{ rotulo: string; valor: string; nota?: string; cor?: [number, number, number] }>, porLinha = 4) {
    const gap = 2
    const w = (W - 2 * M - gap * (porLinha - 1)) / porLinha
    const h = 20
    for (let i = 0; i < itens.length; i += porLinha) {
      garantir(h + 2)
      itens.slice(i, i + porLinha).forEach((k, j) => {
        const x = M + j * (w + gap)
        doc.setDrawColor(...LINHA)
        doc.setLineWidth(0.2)
        doc.line(x, y, x + w, y)
        doc.line(x, y + h, x + w, y + h)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.8)
        doc.setTextColor(...CINZA)
        doc.text(k.rotulo.toUpperCase(), x + 1, y + 4.5)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(15)
        doc.setTextColor(...(k.cor ?? PRETO))
        doc.text(k.valor, x + 1, y + 12.5)
        if (k.nota) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6.8)
          doc.setTextColor(...CINZA)
          doc.text(doc.splitTextToSize(k.nota, w - 2)[0] as string, x + 1, y + 17)
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
      margin: { left: M, right: M, top: 22, bottom: 18 },
      styles: {
        font: 'helvetica',
        fontSize: opts.fonte ?? 7.6,
        cellPadding: { top: 1.6, right: 2, bottom: 1.6, left: 2 },
        textColor: PRETO,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: GRAFITE,
        fontStyle: 'bold',
        fontSize: (opts.fonte ?? 7.6) - 0.3,
        lineColor: PRETO,
        lineWidth: { top: 0.3, right: 0, bottom: 0.4, left: 0 },
      },
      footStyles: { fillColor: [242, 244, 248], textColor: PRETO, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: SUAVE },
      bodyStyles: { lineColor: LINHA, lineWidth: { top: 0, right: 0, bottom: 0.1, left: 0 } },
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
    y = ultimoY() + 6
  }

  /** Barras horizontais: fichas (contorno) + confirmadas (preenchidas). */
  function barras(itens: Agg[], max?: number) {
    const lista = max ? itens.slice(0, max) : itens
    const maior = Math.max(1, ...lista.map((a) => a.fichas))
    const labelW = 58
    const valorW = 44
    const barW = W - 2 * M - labelW - valorW
    const h = 5.0
    garantir(lista.length * h + 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...CINZA)
    doc.setDrawColor(...CINZA_CL); doc.setLineWidth(0.3)
    doc.rect(M + labelW, y, 3, 2.4)
    doc.text('fichas que votaram', M + labelW + 4.5, y + 2)
    doc.setFillColor(...AZUL)
    doc.rect(M + labelW + 36, y, 3, 2.4, 'F')
    doc.text('fichas confirmadas', M + labelW + 40.5, y + 2)
    y += 5
    for (const a of lista) {
      doc.setFontSize(7.2)
      doc.setTextColor(...PRETO)
      const nome = doc.splitTextToSize(a.nome, labelW - 2)[0] as string
      doc.text(nome, M, y + 3.4)
      doc.setDrawColor(...CINZA_CL); doc.setLineWidth(0.25)
      doc.rect(M + labelW, y + 0.6, (a.fichas / maior) * barW, h - 1.4)
      doc.setFillColor(...AZUL)
      doc.rect(M + labelW, y + 0.6, (a.conf / maior) * barW, h - 1.4, 'F')
      doc.setTextColor(...GRAFITE)
      doc.text(`${fmt2(a.conf)} / ${fmt(a.fichas)}   ${pct1(a.conf, a.fichas)}`, W - M, y + 3.4, { align: 'right' })
      y += h
    }
    y += 4
  }

  const colAlvoHead = (prefixo: string) => alvos.map((a) => `${prefixo} ${primeiroNome(a.nome)}`)
  const confAlvoCells = (a: Agg) => a.confAlvo.map((v) => fmt2(v))
  const corAprov = (col: number, v: string, idxCol: number) => {
    if (col !== idxCol) return undefined
    const n = Number(v.replace('%', '').replace('.', '').replace(',', '.'))
    if (!Number.isFinite(n)) return undefined
    return n >= 90 ? VERDE : n >= 75 ? AMBAR : VERM
  }
  const parecer = (a: Agg) => (aprov(a) >= 0.9 ? 'Bom' : aprov(a) >= 0.75 ? 'Atenção' : 'Reavaliar')
  const corParecer = (v: string) => (v === 'Bom' ? VERDE : v === 'Atenção' ? AMBAR : VERM)

  // ── Capa ───────────────────────────────────────────────────────────────
  // Faixa superior fina preta, nome do documento em preto grande em fundo branco.
  doc.setFillColor(...PRETO)
  doc.rect(0, 0, W, 2.2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...CINZA)
  doc.text(`Documento interno · emitido em ${dataStr}, ${horaStr}`, M, 14)
  doc.text(`São Luís — MA`, W - M, 14, { align: 'right' })
  doc.setDrawColor(...LINHA); doc.setLineWidth(0.3)
  doc.line(M, 18, W - M, 18)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GRAFITE)
  doc.text('RELATÓRIO DE AUDITORIA ELEITORAL', M, 46)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...PRETO)
  doc.text('Auditoria dos votos', M, 62)
  doc.text('da equipe de campanha', M, 74)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...GRAFITE)
  doc.text('Conferência das fichas marcadas como “Votou” contra os', M, 88)
  doc.text('Boletins de Urna oficiais, por coordenação, liderança e bairro.', M, 94)

  // Bloco “candidatos acompanhados”
  const by = 110
  doc.setDrawColor(...LINHA); doc.setLineWidth(0.3)
  doc.rect(M, by, W - 2 * M, 8 + nA * 7)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...CINZA)
  doc.text('CANDIDATOS ACOMPANHADOS', M + 3, by + 5)
  alvos.forEach((a, i) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...PRETO)
    doc.text(a.nome, M + 3, by + 11 + i * 7)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAFITE)
    doc.text(`${a.cargo} · ${a.numero}`, W - M - 3, by + 11 + i * 7, { align: 'right' })
  })

  // Índice
  let cy = by + 8 + nA * 7 + 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...PRETO)
  doc.text('ÍNDICE', M, cy)
  doc.setDrawColor(...PRETO); doc.setLineWidth(0.3)
  doc.line(M, cy + 2, W - M, cy + 2)
  cy += 8
  const indice = [
    ['1', 'Sumário executivo'],
    ['2', 'Metodologia e balanço matemático dos votos'],
    ['3', 'Ranking de coordenações'],
    ['4', 'Análise detalhada por coordenação'],
    ['5', 'Lideranças: resultado por faixa'],
    ['6', 'Desempenho por zona eleitoral'],
    ['7', 'Desempenho por bairro'],
    ['8', 'Seções com maior divergência'],
    ['9', 'Pendências cadastrais'],
  ]
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
  for (const [n, t] of indice) {
    doc.setTextColor(...CINZA); doc.text(n, M + 1, cy)
    doc.setTextColor(...PRETO); doc.text(t, M + 8, cy)
    cy += 6
  }
  doc.setFontSize(7.5); doc.setTextColor(...CINZA)
  doc.text('Fontes: cadastros internos marcados como “Votou” e Boletins de Urna oficiais do TSE para São Luís (MA).', M, H - 14)

  // ── 1. Sumário executivo ───────────────────────────────────────────────
  novaPagina()
  titulo('1. Sumário executivo')
  kpis([
    { rotulo: 'Fichas que votaram', valor: fmt(totalFichas), nota: 'marcadas como “Votou” no sistema' },
    { rotulo: 'Votos confirmados', valor: fmt2(totalConf), nota: `${pct2(totalConf, totalFichas)} de aproveitamento` },
    { rotulo: 'Seções auditadas', valor: fmt(secoes.length), nota: `${fmt(zonasTodas.size)} zonas · ${fmt(bairrosTodos.size)} bairros` },
    { rotulo: 'Equipe (coord./lid.)', valor: `${fmt(coords.length)} · ${fmt(liders.length)}` },
    ...alvos.map((a, i) => ({
      rotulo: `${a.nome}`,
      valor: fmt(totalVotosAlvo[i]),
      nota: `${a.cargo === 'Deputado Federal' ? 'Dep. Federal' : 'Dep. Estadual'} ${a.numero}`,
    })),
    { rotulo: 'Comparecimento BU', valor: fmt(totalComparecimento), nota: 'nas seções auditadas' },
    { rotulo: 'Fichas a regularizar', valor: fmt(invalidas.length), nota: `${fmt(foraSl)} são de outro município`, cor: invalidas.length ? VERM : PRETO },
  ])

  const melhor = coords[0]
  const comFichasMin = coords.filter((c) => c.fichas >= 5)
  const baseRank = comFichasMin.length >= 2 ? comFichasMin : coords
  const porAprov = [...baseRank].sort((a, b) => aprov(b) - aprov(a) || b.fichas - a.fichas)
  const melhorAprov = porAprov[0]
  const piorAprov = porAprov[porAprov.length - 1]
  const piorConf = coords[coords.length - 1]

  titulo('Síntese dos resultados', 2)
  if (melhor) {
    caixa(
      'Coordenação com mais votos confirmados',
      `${melhor.nome} — ${fmt2(melhor.conf)} de ${fmt(melhor.fichas)} fichas conferem com o BU (${pct2(melhor.conf, melhor.fichas)}). `
      + `Atua em ${fmt(melhor.secoes.size)} seções, ${fmt(melhor.bairros.size)} bairros, com ${fmt(melhor.liderancas.size)} lideranças.`,
      VERDE,
    )
  }
  if (piorConf && coords.length > 1) {
    caixa(
      'Coordenação com menos votos confirmados',
      `${piorConf.nome} — ${fmt2(piorConf.conf)} de ${fmt(piorConf.fichas)} fichas conferem com o BU (${pct2(piorConf.conf, piorConf.fichas)}). `
      + `Atua em ${fmt(piorConf.secoes.size)} seções e ${fmt(piorConf.bairros.size)} bairros.`,
      VERM,
    )
  }
  if (melhorAprov && piorAprov && melhorAprov !== piorAprov) {
    caixa(
      `Taxa de aproveitamento${baseRank === comFichasMin ? ' (apenas coordenações com >= 5 fichas)' : ''}`,
      `Melhor: ${melhorAprov.nome}, ${pct2(melhorAprov.conf, melhorAprov.fichas)} sobre ${fmt(melhorAprov.fichas)} fichas. `
      + `Pior: ${piorAprov.nome}, ${pct2(piorAprov.conf, piorAprov.fichas)} sobre ${fmt(piorAprov.fichas)} fichas.`,
      AMBAR,
    )
  }
  const melhorLider = liders.filter((l) => l.fichas >= 3).sort((a, b) => aprov(b) - aprov(a) || b.fichas - a.fichas)[0]
  const piorLider = liders.filter((l) => l.fichas >= 3).sort((a, b) => aprov(a) - aprov(b) || b.fichas - a.fichas)[0]
  if (melhorLider && piorLider && melhorLider !== piorLider) {
    caixa(
      'Lideranças de referência (>= 3 fichas)',
      `Melhor desempenho: ${melhorLider.nome} (${melhorLider.coord}) — ${pct2(melhorLider.conf, melhorLider.fichas)} de ${fmt(melhorLider.fichas)} fichas. `
      + `Pior desempenho: ${piorLider.nome} (${piorLider.coord}) — ${pct2(piorLider.conf, piorLider.fichas)} de ${fmt(piorLider.fichas)} fichas.`,
      AZUL,
    )
  }
  const topBairro = bairrosAgg[0]
  const topZona = [...zonasAgg].sort(porConf)[0]
  if (topBairro && topZona) {
    caixa(
      'Concentração territorial',
      `Bairro com mais votos confirmados: ${topBairro.nome} — ${fmt2(topBairro.conf)} de ${fmt(topBairro.fichas)} fichas. `
      + `Zona com mais votos confirmados: zona ${topZona.nome} — ${fmt2(topZona.conf)} de ${fmt(topZona.fichas)} fichas.`,
      GRAFITE,
    )
  }
  const secProblema = secoes.filter((s) => s.statusLabel !== 'Confere')
  paragrafo(
    `Das ${fmt(secoes.length)} seções auditadas, ${fmt(secoes.length - secProblema.length)} conferem com o BU `
    + `e ${fmt(secProblema.length)} apresentam divergência entre fichas e votos (ver seção 8).`,
    { gap: 2 },
  )

  // ── 2. Metodologia + balanço matemático ────────────────────────────────
  novaPagina()
  titulo('2. Metodologia e balanço matemático dos votos')
  paragrafo(
    'O voto é secreto: o Boletim de Urna informa quantos votos cada candidato recebeu em uma seção, mas não quem votou em quem. '
    + 'Para medir quantas fichas da equipe efetivamente se traduziram em votos, a conferência é feita seção a seção, sob duas regras '
    + 'matemáticas:',
    { size: 9 },
  )
  paragrafo(
    '(1) Para cada candidato i, em uma seção com N fichas marcadas como “Votou” e V_i votos no BU, no máximo min(N, V_i) fichas '
    + 'podem ter votado nele. Cada ficha vale, por candidato, f_i = min(1, V_i/N).',
    { size: 9 },
  )
  paragrafo(
    '(2) Uma ficha só é totalmente confirmada quando cabe nos votos de TODOS os candidatos acompanhados ao mesmo tempo: '
    + 'f = min(f_1, f_2, ..., f_k). A soma desses f sobre todas as fichas é o número de votos confirmados da equipe. '
    + 'Esse valor é um limite superior rigoroso — não há como a equipe ter entregue mais votos do que o BU registra.',
    { size: 9 },
  )

  titulo('Balanço matemático', 2)
  tabela({
    head: ['Indicador', 'Valor', 'Como se obtém'],
    body: [
      ['Fichas que votaram (N)', fmt(totalFichas), 'contagem de fichas marcadas como “Votou” em seções válidas'],
      ...alvos.map((a, i) => [`Votos no BU — ${a.nome}`, fmt(totalVotosAlvo[i]), 'Soma V_i nas seções em que a equipe tem fichas']),
      ...alvos.map((a, i) => [`Teto de votos atribuíveis — ${a.nome}`, fmt(tetoAlvo[i]), 'Soma min(N, V_i) por seção']),
      ...alvos.map((a, i) => [`Votos confirmados — ${a.nome}`, fmt2(linhas.reduce((s, l) => s + l.fitAlvo[i], 0)), 'Soma min(1, V_i/N) sobre as fichas']),
      ['Votos confirmados da equipe (interseção)', fmt2(totalConf), 'Soma min(1, f_1, ..., f_k) sobre as fichas'],
      ['Teto da interseção', fmt(intersecao), 'Soma min(N, V_1, ..., V_k) por seção'],
      ['Aproveitamento geral', pct2(totalConf, totalFichas), 'votos confirmados ÷ fichas'],
      ['Fichas não confirmadas', fmt2(totalFichas - totalConf), 'fichas - votos confirmados'],
    ],
    larguras: [78, 28, undefined],
    numericas: [1],
    fonte: 8.2,
  })
  paragrafo(
    'Leitura: “votos confirmados” é o quanto podemos atribuir à equipe sem contradição com o BU. '
    + 'Diferenças entre fichas e votos aparecem como “fichas não confirmadas” — podem ser erro de marcação, voto em outro candidato ou abstenção não registrada.',
    { size: 8.5, cor: CINZA },
  )

  // ── 3. Ranking de coordenações ─────────────────────────────────────────
  novaPagina()
  titulo('3. Ranking de coordenações')
  paragrafo(
    'Ordenado pelo número de votos confirmados (interseção). O parecer segue o aproveitamento '
    + '(>= 90 % Bom · 75 % a 90 % Atenção · < 75 % Reavaliar).',
    { size: 8.5, cor: CINZA },
  )
  barras(coords, 18)
  tabela({
    head: ['#', 'Coordenação', 'Lid.', 'Seç.', 'Bairros', 'Fichas', ...colAlvoHead('Conf.'), 'Confirm.', 'Aprov.', 'Parecer'],
    body: coords.map((c, i) => [
      String(i + 1), c.nome, fmt(c.liderancas.size), fmt(c.secoes.size), fmt(c.bairros.size), fmt(c.fichas),
      ...confAlvoCells(c), fmt2(c.conf), pct2(c.conf, c.fichas), parecer(c),
    ]),
    larguras: [8, undefined, 10, 10, 13, 13],
    numericas: [0, 2, 3, 4, 5, ...alvos.map((_, i) => 6 + i), 6 + nA, 7 + nA],
    foot: [
      '', 'TOTAL', fmt(liders.length), fmt(secoes.length), fmt(bairrosTodos.size), fmt(totalFichas),
      ...alvos.map((_, i) => fmt2(linhas.reduce((s, l) => s + l.fitAlvo[i], 0))), fmt2(totalConf), pct2(totalConf, totalFichas), '',
    ],
    corCelula: (col, v) => (col === 8 + nA ? corParecer(v) : corAprov(col, v, 7 + nA)),
  })

  // ── 4. Detalhe por coordenação ─────────────────────────────────────────
  novaPagina()
  titulo('4. Análise detalhada por coordenação')
  coords.forEach((c, idx) => {
    const doCoord = linhas.filter((l) => l.coord === c.nome)
    if (idx > 0) novaPagina()
    garantir(55)
    // cabeçalho sóbrio: numeração em cinza grande + nome em preto + etiqueta à direita
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(...CINZA_CL)
    doc.text(`${String(idx + 1).padStart(2, '0')}`, M, y + 6)
    doc.setFontSize(13); doc.setTextColor(...PRETO)
    doc.text(c.nome, M + 13, y + 6)
    const sel = idx === 0 ? 'MAIS VOTOS CONFIRMADOS'
      : idx === coords.length - 1 && coords.length > 1 ? 'MENOS VOTOS CONFIRMADOS' : ''
    if (sel) {
      doc.setFontSize(7.5); doc.setTextColor(...(idx === 0 ? VERDE : VERM))
      doc.text(sel, W - M, y + 6, { align: 'right' })
    }
    doc.setDrawColor(...PRETO); doc.setLineWidth(0.4)
    doc.line(M, y + 9.5, W - M, y + 9.5)
    y += 14

    kpis([
      { rotulo: 'Fichas', valor: fmt(c.fichas) },
      { rotulo: 'Votos confirmados', valor: fmt2(c.conf) },
      { rotulo: 'Aproveitamento', valor: pct2(c.conf, c.fichas),
        cor: aprov(c) >= 0.9 ? VERDE : aprov(c) >= 0.75 ? AMBAR : VERM },
      { rotulo: 'Lideranças', valor: fmt(c.liderancas.size), nota: `${fmt(c.secoes.size)} seções · ${fmt(c.bairros.size)} bairros` },
    ])

    titulo('Lideranças', 2)
    const deste = liders.filter((l) => l.coord === c.nome)
    tabela({
      head: ['Liderança', 'Bairros', 'Seç.', 'Fichas', 'Confirm.', 'Aprov.'],
      body: deste.map((l) => [l.nome, fmt(l.bairros.size), fmt(l.secoes.size), fmt(l.fichas), fmt2(l.conf), pct2(l.conf, l.fichas)]),
      larguras: [undefined, 16, 13, 16, 20, 20],
      numericas: [1, 2, 3, 4, 5],
      corCelula: (col, v) => corAprov(col, v, 5),
    })

    titulo('Bairros de atuação', 2)
    const bairrosC = agrupar(doCoord, nA, (l) => l.sec.bairro).sort(porConf)
    tabela({
      head: ['Bairro', 'Zona(s)', 'Seç.', 'Fichas', 'Confirm.', 'Aprov.'],
      body: bairrosC.map((b) => [b.nome, [...b.zonas].sort().join(', '), fmt(b.secoes.size), fmt(b.fichas), fmt2(b.conf), pct2(b.conf, b.fichas)]),
      larguras: [undefined, 22, 13, 16, 20, 20],
      numericas: [2, 3, 4, 5],
      corCelula: (col, v) => corAprov(col, v, 5),
    })

    titulo('Seções com maior divergência', 2)
    const secC = agrupar(doCoord, nA, (l) => l.sec.key)
      .map((a) => ({ a, sec: secoes.find((s) => s.key === a.nome) as RelSecao }))
      .filter((x) => x.a.fichas - x.a.conf >= 0.5)
      .sort((p, q) => (q.a.fichas - q.a.conf) - (p.a.fichas - p.a.conf))
      .slice(0, 10)
    if (!secC.length) {
      paragrafo('Todas as fichas desta coordenação cabem nos votos do BU — sem divergência.', { size: 8.5, cor: VERDE })
    } else {
      tabela({
        head: ['Zona/Seção', 'Bairro', 'Local de votação', 'Fichas', 'Confirm.', 'Aprov.'],
        body: secC.map(({ a, sec }) => [`${sec.zona}/${sec.secao}`, sec.bairro, sec.local, fmt(a.fichas), fmt2(a.conf), pct2(a.conf, a.fichas)]),
        larguras: [20, 32, undefined, 14, 18, 18],
        numericas: [3, 4, 5],
        fonte: 7.2,
        corCelula: (col, v) => corAprov(col, v, 5),
      })
    }
  })

  // ── 5. Lideranças ──────────────────────────────────────────────────────
  novaPagina()
  titulo('5. Lideranças: resultado por faixa')
  paragrafo(
    'Lideranças com menos de 3 fichas ficam fora da classificação por amostra insuficiente.',
    { size: 8.5, cor: CINZA },
  )
  const grandes = liders.filter((l) => l.fichas >= 3)
  const pequenas = liders.filter((l) => l.fichas < 3)
  const gBom = grandes.filter((l) => aprov(l) >= 0.9).sort(porConf)
  const gAt = grandes.filter((l) => aprov(l) >= 0.75 && aprov(l) < 0.9).sort(porConf)
  const gRuim = grandes.filter((l) => aprov(l) < 0.75)
    .sort((a, b) => aprov(a) - aprov(b) || b.fichas - a.fichas)
  kpis([
    { rotulo: 'Bom (>= 90 %)', valor: fmt(gBom.length), cor: VERDE },
    { rotulo: 'Atenção (75 % — 90 %)', valor: fmt(gAt.length), cor: AMBAR },
    { rotulo: 'Reavaliar (< 75 %)', valor: fmt(gRuim.length), cor: VERM },
    { rotulo: 'Amostra pequena (< 3)', valor: fmt(pequenas.length), nota: `${fmt(pequenas.reduce((x, l) => x + l.fichas, 0))} fichas` },
  ])
  const tabLider = (lista: typeof liders) => tabela({
    head: ['#', 'Liderança', 'Coordenação', 'Bairros', 'Fichas', 'Confirm.', 'Não conf.', 'Aprov.'],
    body: lista.map((l, i) => [String(i + 1), l.nome, l.coord, fmt(l.bairros.size), fmt(l.fichas), fmt2(l.conf), fmt2(l.fichas - l.conf), pct2(l.conf, l.fichas)]),
    larguras: [9, undefined, 48, 14, 14, 18, 18, 18],
    numericas: [0, 3, 4, 5, 6, 7],
    fonte: 7.4,
    corCelula: (col, v) => corAprov(col, v, 7),
  })
  titulo('Reavaliar ou cancelar (abaixo de 75 %)', 2)
  if (gRuim.length) tabLider(gRuim)
  else paragrafo('Nenhuma liderança nessa faixa.', { size: 8.5, cor: VERDE })
  titulo('Em atenção (entre 75 % e 90 %)', 2)
  if (gAt.length) tabLider(gAt)
  else paragrafo('Nenhuma liderança nessa faixa.', { size: 8.5 })
  titulo('Bom desempenho (>= 90 %)', 2)
  if (gBom.length) tabLider(gBom)
  else paragrafo('Nenhuma liderança nessa faixa.', { size: 8.5 })

  // ── 6. Zonas ───────────────────────────────────────────────────────────
  garantir(70)
  titulo('6. Desempenho por zona eleitoral')
  tabela({
    head: ['Zona', 'Seç.', 'Bairros', 'Fichas', ...colAlvoHead('Votos'), 'Comparec.', 'Confirm.', 'Aprov.'],
    body: zonasAgg.map((z) => {
      const secZ = secoes.filter((s) => s.zona === z.nome)
      return [
        `Zona ${z.nome}`, fmt(z.secoes.size), fmt(z.bairros.size), fmt(z.fichas),
        ...alvos.map((_, i) => fmt(secZ.reduce((s, x) => s + x.votos[i], 0))),
        fmt(secZ.reduce((s, x) => s + x.comparecimento, 0)), fmt2(z.conf), pct2(z.conf, z.fichas),
      ]
    }),
    numericas: [1, 2, 3, ...alvos.map((_, i) => 4 + i), 4 + nA, 5 + nA, 6 + nA],
    corCelula: (col, v) => corAprov(col, v, 6 + nA),
  })

  // ── 7. Bairros ─────────────────────────────────────────────────────────
  novaPagina()
  titulo('7. Desempenho por bairro')
  paragrafo('O bairro vem do local de votação cadastrado no TSE para cada seção.', { size: 8.5, cor: CINZA })
  tabela({
    head: ['#', 'Bairro', 'Zona(s)', 'Seç.', 'Coord.', 'Fichas', 'Confirm.', 'Aprov.'],
    body: bairrosAgg.map((b, i) => {
      const nCoords = new Set(linhas.filter((l) => l.sec.bairro === b.nome).map((l) => l.coord)).size
      return [String(i + 1), b.nome, [...b.zonas].sort().join(', '), fmt(b.secoes.size), fmt(nCoords), fmt(b.fichas), fmt2(b.conf), pct2(b.conf, b.fichas)]
    }),
    larguras: [9, undefined, 22, 13, 15, 16, 20, 20],
    numericas: [0, 3, 4, 5, 6, 7],
    corCelula: (col, v) => corAprov(col, v, 7),
  })

  // ── 8. Seções críticas ─────────────────────────────────────────────────
  novaPagina()
  titulo('8. Seções com maior divergência')
  const criticas = secoes
    .map((x) => {
      const conf = x.fichas.length ? Math.min(...x.votos.map((v) => Math.min(x.fichas.length, v))) : 0
      return { x, dif: x.fichas.length - conf }
    })
    .filter((c) => c.dif >= 1 || c.x.statusLabel === 'Acima do comparecimento')
    .sort((a, b) => b.dif - a.dif)
  paragrafo(
    `${fmt(criticas.length)} seções apresentam fichas que não cabem nos votos do BU. As 40 maiores diferenças abaixo.`,
    { size: 8.5, cor: CINZA },
  )
  tabela({
    head: ['Zona/Seç.', 'Bairro — local', 'Fichas', ...colAlvoHead('Votos'), 'Não conf.', 'Situação'],
    body: criticas.slice(0, 40).map(({ x, dif }) => [
      `${x.zona}/${x.secao}`, `${x.bairro} — ${x.local}`, fmt(x.fichas.length), ...x.votos.map(fmt), fmt(dif), x.statusLabel,
    ]),
    larguras: [17, undefined, 13, ...alvos.map(() => 17), 15, 32],
    numericas: [2, ...alvos.map((_, i) => 3 + i), 3 + nA],
    fonte: 7.2,
    corCelula: (col, v) => (col === 4 + nA ? (v === 'Parcial' ? AMBAR : VERM) : undefined),
  })

  // ── 9. Pendências ──────────────────────────────────────────────────────
  garantir(40)
  titulo('9. Pendências cadastrais')
  paragrafo(
    `${fmt(invalidas.length)} fichas marcadas como “Votou” estão com zona ou seção vazia, ou inexistente na base do TSE, e `
    + `foram excluídas dos cálculos. Outras ${fmt(foraSl)} fichas pertencem a seções fora de São Luís. `
    + 'Para contabilizá-las, use a aba “Corrigir zona/seção” da Auditoria.',
    { size: 9 },
  )

  // ── Cabeçalho e rodapé em todas as páginas ─────────────────────────────
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    if (p > 1) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...PRETO)
      doc.text('Auditoria dos votos da equipe de campanha', M, 11)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...CINZA)
      doc.text(dataStr, W - M, 11, { align: 'right' })
      doc.setDrawColor(...LINHA); doc.setLineWidth(0.2)
      doc.line(M, 13, W - M, 13)
    }
    doc.setDrawColor(...LINHA); doc.setLineWidth(0.2)
    doc.line(M, H - 12, W - M, H - 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.3); doc.setTextColor(...CINZA)
    doc.text('Documento de uso interno', M, H - 7)
    doc.text(`${p} / ${total}`, W - M, H - 7, { align: 'right' })
  }

  doc.save(`relatorio-auditoria-${agora.toISOString().slice(0, 10)}.pdf`)
}
