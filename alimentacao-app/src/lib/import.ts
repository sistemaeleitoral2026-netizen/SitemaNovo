import * as XLSX from 'xlsx'
import { normalizeCadastroFields } from './normalize'
import { validateCadastroForm } from './validation'
import type { ImportPreview, ImportPreviewRow } from '../types'

const EXPECTED_HEADERS = [
  'nome completo',
  'cpf',
  'telefone',
  'titulo',
  'título',
  'zona',
  'secao',
  'seção',
  'nome da mae completo',
  'nome da mãe completo',
  'cep',
]

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

function mapRow(raw: Record<string, unknown>): Record<string, string> {
  const mapped: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const k = normalizeHeader(key)
    const v = String(value ?? '').trim()
    if (k.includes('nome completo') && !k.includes('mae') && !k.includes('mãe')) mapped.nome_completo = v
    else if (k === 'cpf') mapped.cpf = v
    else if (k === 'telefone') mapped.telefone = v
    else if (k === 'titulo' || k === 'título') mapped.titulo = v
    else if (k === 'zona') mapped.zona = v
    else if (k === 'secao' || k === 'seção') mapped.secao = v
    else if (k.includes('mae') || k.includes('mãe')) mapped.nome_mae = v
    else if (k === 'cep') mapped.cep = v
  }
  return mapped
}

export async function parseSpreadsheet(file: File): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  if (!json.length) return []

  const firstKeys = Object.keys(json[0]).map(normalizeHeader)
  const hasValidHeader = firstKeys.some((h) => EXPECTED_HEADERS.includes(h))
  if (!hasValidHeader) {
    throw new Error('Cabeçalhos inválidos. Verifique o modelo da planilha.')
  }

  return json.map(mapRow)
}

export async function analyzeImport(
  rows: Record<string, string>[],
  existingCpfs: Set<string>,
): Promise<ImportPreview> {
  const seenCpfs = new Set<string>()
  const linhas: ImportPreviewRow[] = []

  rows.forEach((raw, index) => {
    const linha = index + 2
    const normalized = normalizeCadastroFields({
      nome_completo: raw.nome_completo ?? '',
      cpf: raw.cpf ?? '',
      telefone: raw.telefone ?? '',
      titulo: raw.titulo ?? '',
      zona: raw.zona ?? '',
      secao: raw.secao ?? '',
      nome_mae: raw.nome_mae ?? '',
      cep: raw.cep ?? '',
    })

    const errors = validateCadastroForm(normalized)
    const errorMessages = Object.values(errors)

    if (errorMessages.length) {
      linhas.push({
        linha,
        ...normalized,
        status: 'erro',
        mensagem: errorMessages.join(' '),
      })
      return
    }

    if (existingCpfs.has(normalized.cpf) || seenCpfs.has(normalized.cpf)) {
      linhas.push({
        linha,
        ...normalized,
        status: 'duplicado',
        mensagem: 'Este CPF já está cadastrado.',
      })
      seenCpfs.add(normalized.cpf)
      return
    }

    seenCpfs.add(normalized.cpf)
    linhas.push({ linha, ...normalized, status: 'valido' })
  })

  return {
    total: linhas.length,
    validos: linhas.filter((l) => l.status === 'valido').length,
    duplicados: linhas.filter((l) => l.status === 'duplicado').length,
    erros: linhas.filter((l) => l.status === 'erro').length,
    linhas,
  }
}
