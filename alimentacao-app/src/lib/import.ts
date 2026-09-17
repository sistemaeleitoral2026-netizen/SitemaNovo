import * as XLSX from 'xlsx'
import { normalizeCadastroFields } from './normalize'
import { validateImportRow } from './validation'
import type { ImportPreview, ImportPreviewRow } from '../types'

/** Cabeçalhos oficiais da planilha (após normalização). */
const REQUIRED_HEADERS = [
  'nome completo',
  'telefone',
  'titulo',
  'zona',
  'sessao',
  'nome completo da mae',
] as const

const SPREADSHEET_EXTENSIONS = [
  '.xlsx',
  '.xls',
  '.xlsm',
  '.xlsb',
  '.csv',
  '.ods',
  '.tsv',
  '.txt',
]

export const SPREADSHEET_ACCEPT = SPREADSHEET_EXTENSIONS.join(',')

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

function isAllowedSpreadsheet(file: File): boolean {
  const name = file.name.toLowerCase()
  return SPREADSHEET_EXTENSIONS.some((ext) => name.endsWith(ext))
}

function mapRow(raw: Record<string, unknown>): Record<string, string> {
  const mapped: Record<string, string> = {
    nome_completo: '',
    cpf: '',
    telefone: '',
    titulo: '',
    zona: '',
    secao: '',
    nome_mae: '',
    coordenador: '',
    data_nascimento: '',
    cep: '',
  }

  for (const [key, value] of Object.entries(raw)) {
    const k = normalizeHeader(key)
    const v = String(value ?? '').trim()

    if (k === 'nome completo' || (k.includes('nome completo') && !k.includes('mae') && !k.includes('coordenador'))) {
      mapped.nome_completo = v
    } else if (k === 'telefone') {
      mapped.telefone = v
    } else if (k === 'titulo') {
      mapped.titulo = v
    } else if (k === 'zona') {
      mapped.zona = v
    } else if (k === 'sessao' || k === 'secao') {
      mapped.secao = v
    } else if (k.includes('mae') || k === 'nome completo da mae') {
      mapped.nome_mae = v
    } else if (k === 'coordenador' || k.includes('coordenador')) {
      mapped.coordenador = v
    } else if (k === 'data de nascimento' || k === 'nascimento' || k.includes('nascimento')) {
      mapped.data_nascimento = v
    } else if (k === 'cpf') {
      mapped.cpf = v
    } else if (k === 'cep') {
      mapped.cep = v
    }
  }

  return mapped
}

function hasRequiredHeaders(keys: string[]): boolean {
  const set = new Set(keys)
  const hasNome = [...set].some((k) => k === 'nome completo' || (k.includes('nome completo') && !k.includes('mae')))
  const hasMae = [...set].some((k) => k.includes('mae'))
  const hasSessao = set.has('sessao') || set.has('secao')
  return (
    hasNome
    && set.has('telefone')
    && set.has('titulo')
    && set.has('zona')
    && hasSessao
    && hasMae
  )
}

export async function parseSpreadsheet(file: File): Promise<Record<string, string>[]> {
  if (!isAllowedSpreadsheet(file)) {
    throw new Error(
      `Formato não suportado. Use: ${SPREADSHEET_EXTENSIONS.join(', ')}`,
    )
  }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  if (!json.length) return []

  const firstKeys = Object.keys(json[0]).map(normalizeHeader)
  if (!hasRequiredHeaders(firstKeys)) {
    throw new Error(
      'Cabeçalhos inválidos. Use: NOME COMPLETO, TELEFONE, TITULO, ZONA, SESSAO, NOME COMPLETO DA MÃE.',
    )
  }

  return json.map(mapRow)
}

export async function analyzeImport(
  rows: Record<string, string>[],
  existingTitulos: Set<string>,
): Promise<ImportPreview> {
  const seenTitulos = new Set<string>()
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
      coordenador: raw.coordenador ?? '',
      data_nascimento: raw.data_nascimento ?? '',
      cep: raw.cep ?? '',
    })

    const errors = validateImportRow(normalized)
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

    const tituloKey = normalized.titulo.toLowerCase()
    if (existingTitulos.has(tituloKey) || seenTitulos.has(tituloKey)) {
      linhas.push({
        linha,
        ...normalized,
        status: 'duplicado',
        mensagem: 'Este título de eleitor já está cadastrado.',
      })
      seenTitulos.add(tituloKey)
      return
    }

    seenTitulos.add(tituloKey)
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

export { REQUIRED_HEADERS }
