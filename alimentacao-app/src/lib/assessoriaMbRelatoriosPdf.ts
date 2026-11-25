/**
 * Leitura de PDF para Relatórios da Assessoria MB.
 * 1) Extrai texto com PDF.js
 * 2) Se o PDF for “foto” (sem texto), faz OCR com Tesseract (pt-BR)
 */
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import type { RelLinha } from './assessoriaMbRelatorios'

export type ExtracaoPdf = {
  group: string
  method: string
  warnings: string[]
  rows: Omit<RelLinha, 'id'>[]
  manual: boolean
}

function norm(v: unknown) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function centavos(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null
  let s = String(v).replace(/r\$|\s/gi, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d+$/.test(s) && s.length <= 4) return Math.round(Number(s) * 100)
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function categoriaArquivo(nome: string) {
  if (/plant/i.test(nome)) return 'Plantonistas'
  if (/especial/i.test(nome)) return 'Especialistas'
  return 'PSF / referência'
}

const CPF_RE = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})/
const MONEY_RE = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})/g
const SKIP_RE =
  /^(nome|cpf|cnpj|valor|total|banco|conta|pagina|page|relatorio|competencia|subtotal|mais\s|soma|#|\d+\s*\/\s*\d+)/i

/** Monta linhas a partir do texto (OCR ou PDF com texto). */
export function parseTextoPdf(
  texto: string,
  nome: string,
  kind: 'general' | 'medical',
): Omit<RelLinha, 'id'>[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const rows: Omit<RelLinha, 'id'>[] = []
  const cat = kind === 'medical' ? categoriaArquivo(nome) : undefined

  for (const linha of linhas) {
    if (SKIP_RE.test(linha) && !CPF_RE.test(linha)) continue
    if (linha.length < 6) continue

    const cpfM = linha.match(CPF_RE)
    const moneys = [...linha.matchAll(MONEY_RE)]
    const valorBruto = moneys.length ? moneys[moneys.length - 1][1] : ''
    const valor = centavos(valorBruto)

    let name = ''
    let doc = ''
    let rest = linha

    if (cpfM) {
      doc = cpfM[1].replace(/\D/g, '')
      if (doc.length === 11)
        doc = doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      const parts = linha.split(cpfM[0])
      name = parts[0]
        .replace(/^[\d.)\-\s]+/, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
      rest = parts.slice(1).join(cpfM[0])
    } else if (valor !== null) {
      name = linha
        .replace(MONEY_RE, '')
        .replace(/^[\d.)\-\s]+/, '')
        .trim()
    } else {
      continue
    }

    if (!name || name.length < 3) continue
    if (/^(sub)?total|geral|folha/i.test(norm(name))) continue

    // Banco / conta: heurística simples no restante da linha
    let bank = ''
    let account = ''
    const bankM = rest.match(
      /\b(banco\s+do\s+brasil|bb|itau|itaú|bradesco|caixa|nubank|inter|santander|sicoob|sicredi|banrisul)\b/i,
    )
    if (bankM) bank = bankM[1]
    const accM = rest.match(
      /\b(\d{3,6}-?\d|\d{5,12})\b(?!.*\d{3}\.?\d{3}\.?\d{3})/,
    )
    if (accM && accM[1] !== doc.replace(/\D/g, '')) account = accM[1]

    const row: Omit<RelLinha, 'id'> = {
      name,
      doc,
      ref: '',
      bank,
      account,
      value: valor,
      profession: '',
      location: '',
      address: '',
      notes: '',
      sheet: 'PDF',
    }
    if (kind === 'medical') {
      row.category = cat
      if (cat === 'PSF / referência') {
        row.referenceValue = valor
        row.value = null
      }
    }
    rows.push(row)
  }
  return rows
}

async function textoDoPdf(pdf: PDFDocumentProxy): Promise<string> {
  const partes: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    const chunks: { str: string; x: number; y: number }[] = []
    for (const it of tc.items) {
      if (!('str' in it) || !it.str) continue
      const tr = 'transform' in it ? (it.transform as number[]) : [1, 0, 0, 1, 0, 0]
      chunks.push({ str: it.str, x: tr[4] || 0, y: tr[5] || 0 })
    }
    // Agrupa por linha (Y) para montar texto tabular
    chunks.sort((a, b) => b.y - a.y || a.x - b.x)
    const lines: { y: number; parts: { x: number; str: string }[] }[] = []
    for (const c of chunks) {
      const last = lines[lines.length - 1]
      if (!last || Math.abs(last.y - c.y) > 3) lines.push({ y: c.y, parts: [{ x: c.x, str: c.str }] })
      else last.parts.push({ x: c.x, str: c.str })
    }
    for (const ln of lines) {
      ln.parts.sort((a, b) => a.x - b.x)
      partes.push(ln.parts.map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim())
    }
    partes.push('')
  }
  return partes.join('\n')
}

async function ocrDoPdf(pdf: PDFDocumentProxy): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('OCR de PDF só funciona no navegador.')
  }
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker(['por', 'eng'])
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    const partes: string[] = []
    const maxPages = Math.min(pdf.numPages, 20)
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 2.2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas indisponível para OCR.')
      await page.render({ canvasContext: ctx, viewport }).promise
      const { data } = await worker.recognize(canvas)
      partes.push(data.text || '')
      canvas.width = 0
      canvas.height = 0
    }
    return partes.join('\n')
  } finally {
    await worker.terminate()
  }
}

export async function extrairPdf(
  nome: string,
  dataBase64: string,
  kind: 'general' | 'medical',
): Promise<ExtracaoPdf> {
  const bin = atob(dataBase64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

  const loading = getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    // Sem worker: evita dor de cabeça com Vite/CSP no iframe host.
    disableWorker: true,
  } as never)
  const pdf = await loading.promise

  let method = 'PDF'
  const warnings: string[] = []
  let texto = await textoDoPdf(pdf)

  if (texto.replace(/\s/g, '').length < 40) {
    method = 'PDF (OCR)'
    warnings.push(
      'Este PDF parece ser imagem (scan). Estamos lendo com OCR — pode demorar alguns segundos por página.',
    )
    try {
      texto = await ocrDoPdf(pdf)
    } catch (e) {
      return {
        group: kind === 'medical' ? categoriaArquivo(nome) : 'Outros',
        method: 'Anexo',
        warnings: [
          'Não consegui ler o PDF automaticamente (OCR falhou). O arquivo fica como anexo — preencha manualmente ou envie em Excel.',
          e instanceof Error ? e.message : String(e),
        ],
        rows: [],
        manual: true,
      }
    }
  }

  const rows = parseTextoPdf(texto, nome, kind)
  if (!rows.length) {
    warnings.push(
      'Li o PDF, mas não encontrei linhas com nome/CPF/valor. Confira o arquivo ou preencha manualmente.',
    )
  } else {
    const semDoc = rows.filter((r) => !r.doc).length
    if (semDoc) warnings.push(`${semDoc} linha(s) sem CPF/CNPJ detectado — revise a conferência.`)
  }

  const categorias = [...new Set(rows.map((r) => r.category).filter(Boolean))]
  return {
    group: kind === 'medical' ? categorias.join(', ') || categoriaArquivo(nome) : 'Outros',
    method,
    warnings,
    rows,
    manual: !rows.length,
  }
}
