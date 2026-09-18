import * as XLSX from 'xlsx'
import { normalizeCadastroFields } from './normalize'
import { validateImportRow } from './validation'
import type {
  ImportExistingKeys,
  ImportPreview,
  ImportPreviewRow,
  ImportTeamContext,
  ImportTeamMember,
} from '../types'

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

function comparableName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findCanonicalMember(value: string, members: ImportTeamMember[]): ImportTeamMember | null {
  const key = comparableName(value)
  if (!key) return null
  return members.find((member) => comparableName(member.nome) === key) ?? null
}

function assignedMember(id: string | null | undefined, members: ImportTeamMember[]) {
  return id ? members.find((member) => member.id === id) ?? null : null
}

function duplicatePersonKey(nome: string, telefone: string) {
  const name = comparableName(nome)
  const phone = telefone.replace(/\D/g, '')
  return name && phone ? `${name}|${phone}` : ''
}

export function canonicalizeTeam(
  coordenador: string,
  lider: string,
  team?: ImportTeamContext,
): { coordenador: string; lider: string; errors: string[] } {
  if (!team) return { coordenador, lider, errors: [] }

  const errors: string[] = []
  const fixedCoordinator = assignedMember(team.coordenador_id, team.coordenadores)
  const fixedLeader = assignedMember(team.lider_id, team.lideres)

  let coordinator = fixedCoordinator ?? findCanonicalMember(coordenador, team.coordenadores)
  const leader = fixedLeader ?? findCanonicalMember(lider, team.lideres)

  if (leader?.coordenador_id) {
    const leaderCoordinator = assignedMember(leader.coordenador_id, team.coordenadores)
    if (leaderCoordinator) coordinator = leaderCoordinator
  }

  if (!coordinator) {
    errors.push(
      coordenador
        ? `Coordenador "${coordenador}" não existe na equipe desta diretoria.`
        : 'Coordenador não informado e a nerite não possui coordenador vinculado.',
    )
  }
  if (!leader) {
    errors.push(
      lider
        ? `Liderança "${lider}" não existe na equipe desta diretoria.`
        : 'Liderança não informada e a nerite não possui liderança vinculada.',
    )
  }
  if (leader?.coordenador_id && coordinator && leader.coordenador_id !== coordinator.id) {
    errors.push(`A liderança ${leader.nome} não pertence ao coordenador ${coordinator.nome}.`)
  }

  return {
    coordenador: coordinator?.nome ?? coordenador,
    lider: leader?.nome ?? lider,
    errors,
  }
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
    lider: '',
    data_nascimento: '',
    cep: '',
  }

  for (const [key, value] of Object.entries(raw)) {
    const k = normalizeHeader(key)
    const v = String(value ?? '').trim()

    if (k === 'nome completo' || (k.includes('nome completo') && !k.includes('mae') && !k.includes('coordenador') && !k.includes('lider'))) {
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
    } else if (k === 'lider' || k.includes('lider')) {
      mapped.lider = v
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
  return keys.length > 0
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
    throw new Error('Planilha vazia ou sem cabeçalhos.')
  }

  return json.map(mapRow)
}

export async function analyzeImport(
  rows: Record<string, string>[],
  existing: Set<string> | ImportExistingKeys,
  team?: ImportTeamContext,
): Promise<ImportPreview> {
  const existingKeys: ImportExistingKeys = existing instanceof Set
    ? { titulos: existing, cpfs: new Set(), pessoas: new Set() }
    : existing
  const seenTitulos = new Set<string>()
  const seenCpfs = new Set<string>()
  const seenPessoas = new Set<string>()
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
      lider: raw.lider ?? '',
      data_nascimento: raw.data_nascimento ?? '',
      cep: raw.cep ?? '',
    })

    const teamResult = canonicalizeTeam(normalized.coordenador, normalized.lider, team)
    normalized.coordenador = teamResult.coordenador
    normalized.lider = teamResult.lider

    const errors = validateImportRow(normalized)
    const errorMessages = [...Object.values(errors), ...teamResult.errors]

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
    const cpfKey = normalized.cpf
    const pessoaKey = duplicatePersonKey(normalized.nome_completo, normalized.telefone)
    const duplicateReasons: string[] = []
    if (tituloKey && (existingKeys.titulos.has(tituloKey) || seenTitulos.has(tituloKey))) {
      duplicateReasons.push('título de eleitor')
    }
    if (cpfKey && (existingKeys.cpfs.has(cpfKey) || seenCpfs.has(cpfKey))) {
      duplicateReasons.push('CPF')
    }
    if (pessoaKey && (existingKeys.pessoas.has(pessoaKey) || seenPessoas.has(pessoaKey))) {
      duplicateReasons.push('mesmo nome e telefone')
    }

    if (duplicateReasons.length) {
      linhas.push({
        linha,
        ...normalized,
        status: 'duplicado',
        mensagem: `Possível cadastro duplicado: ${duplicateReasons.join(', ')}.`,
      })
      if (tituloKey) seenTitulos.add(tituloKey)
      if (cpfKey) seenCpfs.add(cpfKey)
      if (pessoaKey) seenPessoas.add(pessoaKey)
      return
    }

    if (tituloKey) seenTitulos.add(tituloKey)
    if (cpfKey) seenCpfs.add(cpfKey)
    if (pessoaKey) seenPessoas.add(pessoaKey)
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
