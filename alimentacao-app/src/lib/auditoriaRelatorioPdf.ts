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
  /** fração da ficha que cabe nos votos da seção, considerando todos os candidatos */
  fit: number
  /** idem, por candidato */
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

const NAVY: [number, number, number] = [20, 38, 75]
const BLUE: [number, number, number] = [33, 73, 144]
const GREY: [number, number, number] = [90, 100, 118]
const LIGHT: [number, number, number] = [240, 244, 251]
const GREEN: [number, number, number] = [30, 130, 76]
const RED: [number, number, number] = [185, 40, 40]
const AMBER: [number, number, number] = [196, 120, 10]

const M = 14 // margem lateral (mm)

const fmt = (n: number) => n.toLocaleString('pt-BR')
const fmt1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pct = (a: number, b: number) => (b > 0 ? `${fmt1((a / b) * 100)}%` : '—')
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
    if (!a) {
      a = novoAgg(k, nAlvos)
      m.set(k, a)
    }
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

/** Mais fichas confirmadas primeiro; empate pelo aproveitamento. */
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
        ficha: f,
        sec,
        coord: f.coordenador || 'Sem coordenação',
        lider: f.lider || 'Sem liderança',
        fit,
        fitAlvo,
      })
    }
  }
  const totalFichas = linhas.length
  const totalConf = linhas.reduce((s, l) => s + l.fit, 0)
  const totalVotosAlvo = alvos.map((_, i) => secoes.reduce((s, x) => s + (x.votos[i] ?? 0), 0))
  const totalComparecimento = secoes.reduce((s, x) => s + x.comparecimento, 0)
  const bairrosTodos = new Set(secoes.map((s) => s.bairro))
  const zonasTodas = new Set(secoes.map((s) => s.zona))

  const coords = agrupar(linhas, nA, (l) => l.coord).sort(porConf)
  const liders = agrupar(linhas, nA, (l) => `${l.coord}\u0000${l.lider}`)
    .map((a) => ({ ...a, coord: a.nome.split('\u0000')[0], nome: a.nome.split('\u0000')[1] }))
    .sort(porConf)
  const zonasAgg = agrupar(linhas, nA, (l) => l.sec.zona).sort((a, b) => cmpNome(a.nome, b.nome))
  const bairrosAgg = agrupar(linhas, nA, (l) => l.sec.bairro).sort(porConf)

  // ── Utilidades de desenho ──────────────────────────────────────────────
  let y = 0
  const ultimoY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  function novaPagina() {
    doc.addPage()
    y = 24
  }
  function garantir(espaco: number) {
    if (y + espaco > H - 18) novaPagina()
  }
  function titulo(txt: string, nivel: 1 | 2 = 1) {
    garantir(nivel === 1 ? 30 : 22)
    if (nivel === 1) {
      doc.setFillColor(...NAVY)
      doc.rect(M, y, W - 2 * M, 8, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(255, 255, 255)
      doc.text(txt.toUpperCase(), M + 3, y + 5.5)
      y += 13
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...BLUE)
      doc.text(txt, M, y + 3)
      doc.setDrawColor(...BLUE)
      doc.setLineWidth(0.3)
      doc.line(M, y + 5, W - M, y + 5)
      y += 9
    }
  }
  function paragrafo(txt: string, opts?: { size?: number; cor?: [number, number, number]; bold?: boolean; gap?: number }) {
    const size = opts?.size ?? 9
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...(opts?.cor ?? [40, 46, 60]))
    const linhasTxt = doc.splitTextToSize(txt, W - 2 * M) as string[]
    const alt = linhasTxt.length * size * 0.42
    garantir(alt + 2)
    doc.text(linhasTxt, M, y + 3)
    y += alt + (opts?.gap ?? 3)
  }
  function caixa(titulo_: string, txt: string, cor: [number, number, number] = BLUE) {
    doc.setFontSize(8.5)
    const linhasTxt = doc.splitTextToSize(txt, W - 2 * M - 8) as string[]
    const alt = 9 + linhasTxt.length * 3.7
    garantir(alt + 3)
    doc.setFillColor(...LIGHT)
    doc.rect(M, y, W - 2 * M, alt, 'F')
    doc.setFillColor(...cor)
    doc.rect(M, y, 1.4, alt, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...cor)
    doc.text(titulo_, M + 5, y + 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(40, 46, 60)
    doc.text(linhasTxt, M + 5, y + 9.5)
    y += alt + 4
  }
  function kpis(itens: Array<{ rotulo: string; valor: string; nota?: string; cor?: [number, number, number] }>, porLinha = 4) {
    const gap = 3
    const w = (W - 2 * M - gap * (porLinha - 1)) / porLinha
    const h = 19
    for (let i = 0; i < itens.length; i += porLinha) {
      garantir(h + 3)
      itens.slice(i, i + porLinha).forEach((k, j) => {
        const x = M + j * (w + gap)
        doc.setFillColor(...LIGHT)
        doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...GREY)
        doc.text(k.rotulo.toUpperCase(), x + 3, y + 5)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(15)
        doc.setTextColor(...(k.cor ?? NAVY))
        doc.text(k.valor, x + 3, y + 12.5)
        if (k.nota) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6.5)
          doc.setTextColor(...GREY)
          doc.text(doc.splitTextToSize(k.nota, w - 6)[0] as string, x + 3, y + 16.5)
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
      theme: 'grid',
      margin: { left: M, right: M, top: 20, bottom: 16 },
      styles: {
        font: 'helvetica',
        fontSize: opts.fonte ?? 7.5,
        cellPadding: 1.4,
        textColor: [30, 35, 45],
        lineColor: [215, 222, 233],
        lineWidth: 0.12,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: (opts.fonte ?? 7.5) - 0.3 },
      footStyles: { fillColor: [226, 233, 246], textColor: NAVY, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 249, 253] },
      columnStyles: colStyles,
      didParseCell: (d) => {
        if (d.section === 'head' && opts.numericas?.includes(d.column.index)) d.cell.styles.halign = 'right'
        if (d.section === 'foot' && opts.numericas?.includes(d.column.index)) d.cell.styles.halign = 'right'
        if (d.section === 'body' && opts.corCelula) {
          const raw = Array.isArray(d.row.raw) ? d.row.raw[d.column.index] : undefined
          const v = typeof raw === 'object' && raw ? String((raw as CellDef).content ?? '') : String(raw ?? '')
          const c = opts.corCelula(d.column.index, v, d.row.index)
          if (c) {
            d.cell.styles.textColor = c
            d.cell.styles.fontStyle = 'bold'
          }
        }
      },
    })
    y = ultimoY() + 6
  }
  /** Barras horizontais: total de fichas (cinza) e confirmadas (azul) por item. */
  function barras(itens: Agg[], max?: number) {
    const lista = max ? itens.slice(0, max) : itens
    const maior = Math.max(1, ...lista.map((a) => a.fichas))
    const labelW = 52
    const barW = W - 2 * M - labelW - 30
    const h = 5.2
    garantir(lista.length * h + 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...GREY)
    doc.setFillColor(205, 213, 226)
    doc.rect(M + labelW, y, 3, 2.4, 'F')
    doc.text('Fichas que votaram', M + labelW + 4.5, y + 2)
    doc.setFillColor(...BLUE)
    doc.rect(M + labelW + 34, y, 3, 2.4, 'F')
    doc.text('Fichas confirmadas pelo BU', M + labelW + 38.5, y + 2)
    y += 5
    for (const a of lista) {
      doc.setFontSize(7)
      doc.setTextColor(40, 46, 60)
      const nome = doc.splitTextToSize(a.nome, labelW - 2)[0] as string
      doc.text(nome, M, y + 3.4)
      doc.setFillColor(205, 213, 226)
      doc.rect(M + labelW, y, (a.fichas / maior) * barW, h - 1.6, 'F')
      doc.setFillColor(...BLUE)
      doc.rect(M + labelW, y + 0.9, (a.conf / maior) * barW, h - 3.4, 'F')
      doc.setTextColor(...GREY)
      doc.text(`${fmt1(a.conf)} / ${fmt(a.fichas)}  (${pct(a.conf, a.fichas)})`, M + labelW + (a.fichas / maior) * barW + 1.5, y + 3.4)
      y += h
    }
    y += 4
  }

  const colAlvoHead = (prefixo: string) => alvos.map((a) => `${prefixo} ${primeiroNome(a.nome)}`)
  const confAlvoCells = (a: Agg) => a.confAlvo.map((v) => fmt1(v))
  const corAprov = (col: number, v: string, idxCol: number) => {
    if (col !== idxCol) return undefined
    const n = Number(v.replace('%', '').replace(',', '.'))
    if (!Number.isFinite(n)) return undefined
    return n >= 90 ? GREEN : n >= 75 ? AMBER : RED
  }

  const parecer = (a: Agg) => (aprov(a) >= 0.9 ? 'Bom' : aprov(a) >= 0.75 ? 'Atenção' : 'Reavaliar')
  const corParecer = (v: string) => (v === 'Bom' ? GREEN : v === 'Atenção' ? AMBER : RED)

  // ── Capa ───────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 105, 'F')
  doc.setFillColor(...BLUE)
  doc.rect(0, 105, W, 3, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(190, 205, 235)
  doc.text('RELATÓRIO DE AUDITORIA ELEITORAL', M, 40)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(27)
  doc.setTextColor(255, 255, 255)
  doc.text('Auditoria de Votos', M, 56)
  doc.text('por Coordenação', M, 67)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(210, 222, 245)
  doc.text('Fichas “Votou” × Boletins de Urna de São Luís (MA)', M, 80)
  doc.setFontSize(9)
  doc.text(`Candidatos acompanhados: ${alvos.map((a) => `${a.nome} (${a.cargo === 'Deputado Federal' ? 'Fed.' : 'Est.'} ${a.numero})`).join('  ·  ')}`, M, 90)

  let cy = 122
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text('Conteúdo do relatório', M, cy)
  cy += 3
  doc.setDrawColor(...BLUE)
  doc.setLineWidth(0.4)
  doc.line(M, cy, W - M, cy)
  cy += 6
  const indice = [
    '1. Sumário executivo e balanço matemático dos votos válidos',
    '2. Coordenações: quem foi bem e quem precisa ser reavaliada',
    '3. Análise detalhada por coordenação',
    '4. Lideranças: quem foi bem e quem não deu certo',
    '5. Desempenho por zona eleitoral',
    '6. Desempenho por bairro',
    '7. Seções críticas',
    '8. Pendências cadastrais',
    'Anexo. Metodologia e limitações',
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(40, 46, 60)
  for (const it of indice) {
    doc.text(it, M + 2, cy)
    cy += 6.2
  }
  doc.setFontSize(8.5)
  doc.setTextColor(...GREY)
  doc.text(`Emitido em ${dataStr}, às ${horaStr}`, M, H - 30)
  doc.text('Documento de uso interno · dados extraídos do sistema de cadastro e da planilha de BU do TSE', M, H - 25)

  // ── 1. Sumário executivo ───────────────────────────────────────────────
  novaPagina()
  titulo('1. Sumário executivo')
  kpis([
    { rotulo: 'Fichas que votaram', valor: fmt(totalFichas), nota: 'marcadas como “Votou”' },
    { rotulo: 'Fichas confirmadas', valor: fmt(Math.round(totalConf)), nota: `${pct(totalConf, totalFichas)} de aproveitamento`, cor: GREEN },
    { rotulo: 'Coordenações', valor: fmt(coords.length), nota: `${fmt(liders.length)} lideranças` },
    { rotulo: 'Seções auditadas', valor: fmt(secoes.length), nota: `${fmt(zonasTodas.size)} zonas · ${fmt(bairrosTodos.size)} bairros` },
    ...alvos.map((a, i) => ({
      rotulo: `Votos ${a.nome}`,
      valor: fmt(totalVotosAlvo[i]),
      nota: `${a.cargo === 'Deputado Federal' ? 'Federal' : 'Estadual'} ${a.numero} nas seções`,
    })),
    { rotulo: 'Comparecimento (BU)', valor: fmt(totalComparecimento), nota: 'nas seções auditadas' },
    {
      rotulo: 'Fichas a regularizar',
      valor: fmt(invalidas.length),
      nota: `${fmt(foraSl)} fora de São Luís`,
      cor: invalidas.length ? RED : GREEN,
    },
  ])

  const melhor = coords[0]
  const comFichasMin = coords.filter((c) => c.fichas >= 5)
  const baseRank = comFichasMin.length >= 2 ? comFichasMin : coords
  const porAprov = [...baseRank].sort((a, b) => aprov(b) - aprov(a) || b.fichas - a.fichas)
  const melhorAprov = porAprov[0]
  const piorAprov = porAprov[porAprov.length - 1]
  const piorConf = coords[coords.length - 1]

  titulo('Balanço matemático dos votos válidos', 2)
  const confA = alvos.map((_, i) => linhas.reduce((x, l) => x + l.fitAlvo[i], 0))
  tabela({
    head: ['Indicador', 'Valor', 'Como se calcula'],
    body: [
      ['Fichas que votaram', fmt(totalFichas), 'eleitores da equipe marcados como “Votou”'],
      ...alvos.map((a, i) => [
        `Votos de ${a.nome} nas seções`, fmt(totalVotosAlvo[i]), 'soma dos votos do BU nas seções onde há fichas',
      ]),
      ...alvos.map((a, i) => [
        `Votos válidos da equipe: ${a.nome}`, fmt1(confA[i]), 'por seção, fichas limitadas aos votos do candidato',
      ]),
      ['VOTOS VÁLIDOS DA EQUIPE', fmt1(totalConf), 'fichas que cabem nos votos de todos os candidatos'],
      ['Fichas não confirmadas', fmt1(totalFichas - totalConf), 'fichas - votos válidos'],
      ['Aproveitamento geral', pct(totalConf, totalFichas), 'votos válidos ÷ fichas'],
    ],
    larguras: [62, 28, undefined],
    numericas: [1],
    fonte: 8,
  })

  titulo('Destaques', 2)
  if (melhor) {
    caixa(
      'Coordenação com mais votos válidos',
      `${melhor.nome}: ${fmt1(melhor.conf)} fichas confirmadas pelo BU de ${fmt(melhor.fichas)} que votaram (${pct(melhor.conf, melhor.fichas)}), `
      + `em ${fmt(melhor.secoes.size)} seções, ${fmt(melhor.bairros.size)} bairros e ${fmt(melhor.liderancas.size)} lideranças.`,
      GREEN,
    )
  }
  if (piorConf && coords.length > 1) {
    caixa(
      'Coordenação com menos votos válidos',
      `${piorConf.nome}: ${fmt1(piorConf.conf)} fichas confirmadas de ${fmt(piorConf.fichas)} que votaram (${pct(piorConf.conf, piorConf.fichas)}), `
      + `em ${fmt(piorConf.secoes.size)} seções e ${fmt(piorConf.bairros.size)} bairros.`,
      RED,
    )
  }
  if (melhorAprov && piorAprov && melhorAprov !== piorAprov) {
    caixa(
      `Aproveitamento (coordenações com ${baseRank === comFichasMin ? '5 ou mais fichas' : 'fichas'})`,
      `Melhor: ${melhorAprov.nome} com ${pct(melhorAprov.conf, melhorAprov.fichas)} (${fmt(melhorAprov.fichas)} fichas). `
      + `Pior: ${piorAprov.nome} com ${pct(piorAprov.conf, piorAprov.fichas)} (${fmt(piorAprov.fichas)} fichas).`,
      AMBER,
    )
  }
  const melhorLider = liders.filter((l) => l.fichas >= 3).sort((a, b) => aprov(b) - aprov(a) || b.fichas - a.fichas)[0]
  const piorLider = liders.filter((l) => l.fichas >= 3).sort((a, b) => aprov(a) - aprov(b) || b.fichas - a.fichas)[0]
  if (melhorLider && piorLider && melhorLider !== piorLider) {
    caixa(
      'Lideranças (3 ou mais fichas)',
      `Maior aproveitamento: ${melhorLider.nome} (${melhorLider.coord}) com ${pct(melhorLider.conf, melhorLider.fichas)} de ${fmt(melhorLider.fichas)} fichas. `
      + `Menor aproveitamento: ${piorLider.nome} (${piorLider.coord}) com ${pct(piorLider.conf, piorLider.fichas)} de ${fmt(piorLider.fichas)} fichas.`,
      BLUE,
    )
  }
  const topBairro = bairrosAgg[0]
  const topZona = [...zonasAgg].sort(porConf)[0]
  if (topBairro && topZona) {
    caixa(
      'Concentração territorial',
      `Bairro com mais fichas confirmadas: ${topBairro.nome} (${fmt1(topBairro.conf)} de ${fmt(topBairro.fichas)}). `
      + `Zona com mais fichas confirmadas: ${topZona.nome} (${fmt1(topZona.conf)} de ${fmt(topZona.fichas)}).`,
      BLUE,
    )
  }
  const secProblema = secoes.filter((s) => s.statusLabel !== 'Confere')
  paragrafo(
    `Das ${fmt(secoes.length)} seções auditadas, ${fmt(secoes.length - secProblema.length)} conferem integralmente com o BU `
    + `e ${fmt(secProblema.length)} apresentam diferença entre fichas e votos (detalhe na seção 7).`,
    { gap: 2 },
  )

  // ── 2. Ranking de coordenações ─────────────────────────────────────────
  novaPagina()
  titulo('2. Ranking de coordenações')
  paragrafo(
    'Parecer: Bom = aproveitamento >= 90%; Atenção = entre 75% e 90%; Reavaliar = abaixo de 75% (candidata a ser cancelada ou refeita). Ordenado por fichas confirmadas pelo BU (votos válidos). “Confirmadas” é a parcela das fichas que cabe nos votos '
    + 'que o candidato recebeu na seção; o aproveitamento é confirmadas ÷ fichas que votaram.',
    { size: 8.5, cor: GREY },
  )
  barras(coords, 18)
  tabela({
    head: ['#', 'Coordenação', 'Lid.', 'Seç.', 'Bairros', 'Fichas', ...colAlvoHead('Conf.'), 'Confirm.', 'Aprov.', 'Parecer'],
    body: coords.map((c, i) => [
      String(i + 1), c.nome, fmt(c.liderancas.size), fmt(c.secoes.size), fmt(c.bairros.size), fmt(c.fichas),
      ...confAlvoCells(c), fmt1(c.conf), pct(c.conf, c.fichas), parecer(c),
    ]),
    larguras: [8, undefined, 10, 10, 13, 13],
    numericas: [0, 2, 3, 4, 5, ...alvos.map((_, i) => 6 + i), 6 + nA, 7 + nA],
    foot: [
      '', 'TOTAL', fmt(liders.length), fmt(secoes.length), fmt(bairrosTodos.size), fmt(totalFichas),
      ...alvos.map((_, i) => fmt1(linhas.reduce((s, l) => s + l.fitAlvo[i], 0))), fmt1(totalConf), pct(totalConf, totalFichas), '',
    ],
    corCelula: (col, v) => (col === 8 + nA ? corParecer(v) : corAprov(col, v, 7 + nA)),
  })

  // ── 3. Detalhe por coordenação ─────────────────────────────────────────
  novaPagina()
  titulo('3. Análise detalhada por coordenação')
  coords.forEach((c, idx) => {
    const doCoord = linhas.filter((l) => l.coord === c.nome)
    if (idx > 0) novaPagina()
    garantir(60)
    doc.setFillColor(...BLUE)
    doc.rect(M, y, W - 2 * M, 10, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text(`${idx + 1}º · ${c.nome}`, M + 3, y + 6.6)
    const sel = idx === 0 ? 'MAIS VOTOS VÁLIDOS' : idx === coords.length - 1 && coords.length > 1 ? 'MENOS VOTOS VÁLIDOS' : ''
    if (sel) {
      doc.setFontSize(7.5)
      doc.text(sel, W - M - 3, y + 6.4, { align: 'right' })
    }
    y += 14
    kpis([
      { rotulo: 'Fichas', valor: fmt(c.fichas) },
      { rotulo: 'Confirmadas', valor: fmt1(c.conf), cor: GREEN },
      { rotulo: 'Aproveitamento', valor: pct(c.conf, c.fichas), cor: aprov(c) >= 0.9 ? GREEN : aprov(c) >= 0.75 ? AMBER : RED },
      { rotulo: 'Lideranças', valor: fmt(c.liderancas.size), nota: `${fmt(c.secoes.size)} seções · ${fmt(c.bairros.size)} bairros` },
    ])

    titulo('Lideranças', 2)
    const deste = liders.filter((l) => l.coord === c.nome)
    tabela({
      head: ['Liderança', 'Bairros', 'Seç.', 'Fichas', 'Confirm.', 'Aprov.'],
      body: deste.map((l) => [l.nome, fmt(l.bairros.size), fmt(l.secoes.size), fmt(l.fichas), fmt1(l.conf), pct(l.conf, l.fichas)]),
      larguras: [undefined, 16, 13, 16, 18, 18],
      numericas: [1, 2, 3, 4, 5],
      corCelula: (col, v) => corAprov(col, v, 5),
    })

    titulo('Bairros de atuação', 2)
    const bairrosC = agrupar(doCoord, nA, (l) => l.sec.bairro).sort(porConf)
    tabela({
      head: ['Bairro', 'Zona(s)', 'Seç.', 'Fichas', 'Confirm.', 'Aprov.'],
      body: bairrosC.map((b) => [b.nome, [...b.zonas].sort().join(', '), fmt(b.secoes.size), fmt(b.fichas), fmt1(b.conf), pct(b.conf, b.fichas)]),
      larguras: [undefined, 22, 13, 16, 18, 18],
      numericas: [2, 3, 4, 5],
      corCelula: (col, v) => corAprov(col, v, 5),
    })

    titulo('Seções com maior diferença (fichas que não cabem nos votos)', 2)
    const secC = agrupar(doCoord, nA, (l) => l.sec.key)
      .map((a) => ({ a, sec: secoes.find((s) => s.key === a.nome) as RelSecao }))
      .filter((x) => x.a.fichas - x.a.conf >= 0.5)
      .sort((p, q) => (q.a.fichas - q.a.conf) - (p.a.fichas - p.a.conf))
      .slice(0, 10)
    if (!secC.length) {
      paragrafo('Nenhuma seção com diferença relevante: todas as fichas desta coordenação cabem nos votos do BU.', { size: 8.5, cor: GREEN })
    } else {
      tabela({
        head: ['Zona/Seção', 'Bairro', 'Local de votação', 'Fichas', 'Confirm.', 'Aprov.'],
        body: secC.map(({ a, sec }) => [`${sec.zona}/${sec.secao}`, sec.bairro, sec.local, fmt(a.fichas), fmt1(a.conf), pct(a.conf, a.fichas)]),
        larguras: [20, 30, undefined, 14, 17, 17],
        numericas: [3, 4, 5],
        fonte: 7,
        corCelula: (col, v) => corAprov(col, v, 5),
      })
    }
  })

  // ── 4. Lideranças ──────────────────────────────────────────────────────
  novaPagina()
  titulo('4. Lideranças: quem foi bem e quem não deu certo')
  paragrafo(
    'Classificação pelo aproveitamento (votos válidos ÷ fichas): Bom >= 90%, Atenção entre 75% e 90%, Reavaliar < 75%. '
    + 'Lideranças com menos de 3 fichas ficam fora da classificação por amostra pequena.',
    { size: 8.5, cor: GREY },
  )
  const grandes = liders.filter((l) => l.fichas >= 3)
  const pequenas = liders.filter((l) => l.fichas < 3)
  const gBom = grandes.filter((l) => aprov(l) >= 0.9).sort(porConf)
  const gAt = grandes.filter((l) => aprov(l) >= 0.75 && aprov(l) < 0.9).sort(porConf)
  const gRuim = grandes.filter((l) => aprov(l) < 0.75).sort((a, b) => aprov(a) - aprov(b) || b.fichas - a.fichas)
  kpis([
    { rotulo: 'Foram bem', valor: fmt(gBom.length), nota: 'aproveitamento >= 90%', cor: GREEN },
    { rotulo: 'Em atenção', valor: fmt(gAt.length), nota: '75% a 90%', cor: AMBER },
    { rotulo: 'Não deram certo', valor: fmt(gRuim.length), nota: 'abaixo de 75%', cor: RED },
    { rotulo: 'Amostra pequena', valor: fmt(pequenas.length), nota: `${fmt(pequenas.reduce((x, l) => x + l.fichas, 0))} fichas` },
  ])
  const tabLider = (lista: typeof liders) => tabela({
    head: ['#', 'Liderança', 'Coordenação', 'Bairros', 'Fichas', 'Confirm.', 'Não cab.', 'Aprov.'],
    body: lista.map((l, i) => [String(i + 1), l.nome, l.coord, fmt(l.bairros.size), fmt(l.fichas), fmt1(l.conf), fmt1(l.fichas - l.conf), pct(l.conf, l.fichas)]),
    larguras: [9, undefined, 48, 14, 14, 16, 16, 16],
    numericas: [0, 3, 4, 5, 6, 7],
    fonte: 7.3,
    corCelula: (col, v) => corAprov(col, v, 7),
  })
  titulo('Lideranças que não deram certo (reavaliar ou cancelar)', 2)
  if (gRuim.length) tabLider(gRuim)
  else paragrafo('Nenhuma liderança abaixo de 75%.', { size: 8.5, cor: GREEN })
  titulo('Lideranças em atenção', 2)
  if (gAt.length) tabLider(gAt)
  else paragrafo('Nenhuma liderança nesta faixa.', { size: 8.5 })
  titulo('Lideranças que foram bem', 2)
  if (gBom.length) tabLider(gBom)
  else paragrafo('Nenhuma liderança nesta faixa.', { size: 8.5 })

  // ── 5. Zonas ───────────────────────────────────────────────────────────
  garantir(70)
  titulo('5. Desempenho por zona eleitoral')
  tabela({
    head: ['Zona', 'Seções', 'Bairros', 'Fichas', ...colAlvoHead('Votos'), 'Comparec.', 'Confirm.', 'Aprov.'],
    body: zonasAgg.map((z) => {
      const secZ = secoes.filter((s) => s.zona === z.nome)
      return [
        `Zona ${z.nome}`, fmt(z.secoes.size), fmt(z.bairros.size), fmt(z.fichas),
        ...alvos.map((_, i) => fmt(secZ.reduce((s, x) => s + x.votos[i], 0))),
        fmt(secZ.reduce((s, x) => s + x.comparecimento, 0)), fmt1(z.conf), pct(z.conf, z.fichas),
      ]
    }),
    numericas: [1, 2, 3, ...alvos.map((_, i) => 4 + i), 4 + nA, 5 + nA, 6 + nA],
    corCelula: (col, v) => corAprov(col, v, 6 + nA),
  })

  // ── 6. Bairros ─────────────────────────────────────────────────────────
  novaPagina()
  titulo('6. Desempenho por bairro')
  paragrafo('Bairro do local de votação de cada seção (base de locais do TSE).', { size: 8.5, cor: GREY })
  tabela({
    head: ['#', 'Bairro', 'Zona(s)', 'Seç.', 'Coord.', 'Fichas', 'Confirm.', 'Aprov.'],
    body: bairrosAgg.map((b, i) => {
      const nCoords = new Set(linhas.filter((l) => l.sec.bairro === b.nome).map((l) => l.coord)).size
      return [String(i + 1), b.nome, [...b.zonas].sort().join(', '), fmt(b.secoes.size), fmt(nCoords), fmt(b.fichas), fmt1(b.conf), pct(b.conf, b.fichas)]
    }),
    larguras: [9, undefined, 22, 13, 15, 16, 18, 18],
    numericas: [0, 3, 4, 5, 6, 7],
    corCelula: (col, v) => corAprov(col, v, 7),
  })

  // ── 7. Seções críticas ─────────────────────────────────────────────────
  novaPagina()
  titulo('7. Seções críticas')
  const criticas = secoes
    .map((x) => {
      const conf = x.fichas.length ? Math.min(...x.votos.map((v) => Math.min(x.fichas.length, v))) : 0
      return { x, dif: x.fichas.length - conf }
    })
    .filter((c) => c.dif >= 1 || c.x.statusLabel === 'Acima do comparecimento')
    .sort((a, b) => b.dif - a.dif)
  paragrafo(
    `${fmt(criticas.length)} seções têm fichas que não cabem nos votos do BU. São listadas as 40 com maior diferença `
    + '(fichas - votos válidos).',
    { size: 8.5, cor: GREY },
  )
  tabela({
    head: ['Zona/Seç.', 'Bairro / local', 'Fichas', ...colAlvoHead('Votos'), 'Não cab.', 'Situação'],
    body: criticas.slice(0, 40).map(({ x, dif }) => [
      `${x.zona}/${x.secao}`, `${x.bairro} — ${x.local}`, fmt(x.fichas.length), ...x.votos.map(fmt), fmt(dif), x.statusLabel,
    ]),
    larguras: [17, undefined, 13, ...alvos.map(() => 17), 15, 30],
    numericas: [2, ...alvos.map((_, i) => 3 + i), 3 + nA],
    fonte: 7,
    corCelula: (col, v) => (col === 4 + nA ? (v === 'Parcial' ? AMBER : RED) : undefined),
  })

  // ── 8. Pendências ──────────────────────────────────────────────────────
  garantir(40)
  titulo('8. Pendências cadastrais')
  paragrafo(
    `${fmt(invalidas.length)} fichas marcadas como “Votou” estão com zona/seção vazia ou inexistente na base do TSE e `
    + `não entram nos cálculos. Outras ${fmt(foraSl)} fichas pertencem a seções fora de São Luís. `
    + 'Regularize-as na aba “Corrigir zona/seção” da Auditoria para que sejam contabilizadas.',
    { size: 9 },
  )

  // ── Anexo B ────────────────────────────────────────────────────────────
  garantir(70)
  titulo('Anexo. Metodologia e limitações')
  const metodo = [
    'Fonte das fichas: cadastro do sistema, apenas registros marcados como “Votou”. Fichas sem zona/seção válida na base de locais do TSE ficam fora dos cálculos (seção 8).',
    'Fonte dos votos: boletins de urna (BU) de São Luís, por zona e seção, para os candidatos acompanhados. O bairro vem do local de votação cadastrado no TSE para cada seção.',
    'Fichas confirmadas: em cada seção, se há N fichas e o candidato recebeu V votos, no máximo V fichas podem ter votado nele; cada ficha vale min(1, V ÷ N). Com mais de um candidato acompanhado, usa-se o menor valor entre eles. A confirmação de uma coordenação é a soma desse valor nas suas fichas.',
    'Aproveitamento: fichas confirmadas ÷ fichas que votaram. Parecer: Bom >= 90%, Atenção entre 75% e 90%, Reavaliar abaixo de 75%. Os cortes são critério de gestão e podem ser ajustados.',
    'Limitação: o voto é secreto. O BU informa quantos votos o candidato teve na seção, nunca quem votou em quem; a confirmação é, portanto, um limite máximo plausível e não uma prova individual. Seções com muitas fichas distribuem a diferença proporcionalmente entre as coordenações.',
  ]
  for (const t of metodo) paragrafo(`•  ${t}`, { size: 8.5 })

  // ── Cabeçalho e rodapé em todas as páginas ─────────────────────────────
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    if (p > 1) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...NAVY)
      doc.text('Auditoria de Votos por Coordenação', M, 10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...GREY)
      doc.text(dataStr, W - M, 10, { align: 'right' })
      doc.setDrawColor(...BLUE)
      doc.setLineWidth(0.4)
      doc.line(M, 12, W - M, 12)
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GREY)
    doc.setDrawColor(210, 218, 230)
    doc.setLineWidth(0.2)
    doc.line(M, H - 11, W - M, H - 11)
    doc.text('Documento de uso interno', M, H - 6.5)
    doc.text(`Página ${p} de ${total}`, W - M, H - 6.5, { align: 'right' })
  }

  doc.save(`relatorio-auditoria-${agora.toISOString().slice(0, 10)}.pdf`)
}
