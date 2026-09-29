import { format, parseISO } from 'date-fns'
import { supabase } from './supabase'
import { coordsFromZona } from './geocode'
import type { Cadastro, ImportExistingKeys, MapMarkerData, PeriodFilter } from '../types'
import { digitsOnly, normalizeName, normalizeSecao, normalizeZona } from './normalize'
import { sanitizeSearchTerm } from './search'
import { lookupLocalVotacao, type LocalVotacaoRef } from './locaisVotacao'

/** Garante strings vazias em vez de null (evita crash em .trim() na UI). */
function sanitizeCadastro(row: Cadastro): Cadastro {
  return {
    ...row,
    nome_completo: row.nome_completo ?? '',
    telefone: row.telefone ?? '',
    titulo: row.titulo ?? '',
    zona: row.zona ?? '',
    secao: row.secao ?? '',
    nome_mae: row.nome_mae ?? '',
    coordenador: row.coordenador ?? '',
    lider: row.lider ?? '',
    cpf: row.cpf || null,
    cep: row.cep || null,
    endereco: row.endereco ?? '',
    numero: row.numero ?? '',
    complemento: row.complemento ?? '',
    bairro: row.bairro ?? '',
    cidade: row.cidade ?? '',
    uf: row.uf ?? '',
    data_nascimento: row.data_nascimento || null,
  }
}

/** Colunas da listagem — sem arrays pesados de Formigas (fotos/links). */
export const CADASTRO_LIST_SELECT =
  'id,operator_id,diretoria_id,nome_completo,cpf,telefone,titulo,zona,secao,nome_mae,coordenador,lider,data_nascimento,cep,endereco,numero,complemento,bairro,cidade,uf,lat,lng,created_at,updated_at'

/** Supabase/PostgREST limita ~1000 linhas por request — pagina até esgotar. */
async function fetchAllPaged<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await run(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as T[]
    all.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function fetchCadastros(options?: {
  operatorId?: string
  period?: PeriodFilter
  search?: string
}): Promise<Cadastro[]> {
  const rows = await fetchAllPaged<Cadastro>((from, to) => {
    let query = supabase
      .from('cadastros')
      .select(CADASTRO_LIST_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (options?.operatorId) {
      query = query.eq('operator_id', options.operatorId)
    }
    if (options?.period?.start) {
      query = query.gte('created_at', options.period.start.toISOString())
    }
    if (options?.period?.end) {
      query = query.lte('created_at', options.period.end.toISOString())
    }
    return query.range(from, to)
  })

  let results = rows.map(sanitizeCadastro)

  if (options?.search) {
    const term = options.search.toLowerCase().replace(/\D/g, '')
    const textTerm = options.search.toLowerCase()
    results = results.filter((c) => {
      const cpfDigits = (c.cpf ?? '').replace(/\D/g, '')
      return (
        c.nome_completo.toLowerCase().includes(textTerm)
        || (cpfDigits && cpfDigits.includes(term))
        || c.telefone.includes(term)
        || c.titulo.toLowerCase().includes(textTerm)
      )
    })
  }

  return results
}

export type CadastrosListSortKey =
  | 'nome' | 'coordenador' | 'lider' | 'nascimento' | 'nome_mae'
  | 'cpf' | 'telefone' | 'titulo' | 'zona' | 'secao' | 'cep' | 'endereco'
  | 'localizacao' | 'data' | 'nerite'

export type CadastrosListQuery = {
  page: number
  pageSize: number
  operatorId?: string
  diretoriaId?: string
  /** IDs de nerites da diretoria (para filtrar por diretoria_id OU operator_id). */
  diretoriaOperatorIds?: string[]
  coordenador?: string
  lider?: string
  zona?: string
  secao?: string
  search?: string
  period?: PeriodFilter
  dateFrom?: string
  dateTo?: string
  cep?: string
  titulo?: string
  geo?: 'mapped' | 'unmapped' | ''
  /** Títulos duplicados (lowercase) — quando só duplicados / ocultar. */
  dupTitulos?: string[]
  dupMode?: 'only' | 'hide' | ''
  sortKey?: CadastrosListSortKey
  sortDir?: 'asc' | 'desc'
}

const SORT_COLUMN: Record<CadastrosListSortKey, string> = {
  nome: 'nome_completo',
  coordenador: 'coordenador',
  lider: 'lider',
  nascimento: 'data_nascimento',
  nome_mae: 'nome_mae',
  cpf: 'cpf',
  telefone: 'telefone',
  titulo: 'titulo',
  zona: 'zona',
  secao: 'secao',
  cep: 'cep',
  endereco: 'endereco',
  localizacao: 'lat',
  data: 'created_at',
  nerite: 'operator_id',
}

function applyCadastrosListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  options: CadastrosListQuery,
) {
  let q = query
  if (options.operatorId) q = q.eq('operator_id', options.operatorId)

  if (options.diretoriaId) {
    const ops = (options.diretoriaOperatorIds ?? []).filter(Boolean)
    if (ops.length) {
      q = q.or(`diretoria_id.eq.${options.diretoriaId},operator_id.in.(${ops.join(',')})`)
    } else {
      q = q.eq('diretoria_id', options.diretoriaId)
    }
  }

  const coord = (options.coordenador ?? '').trim()
  if (coord) q = q.ilike('coordenador', coord)
  const lider = (options.lider ?? '').trim()
  if (lider) q = q.ilike('lider', lider)
  if (options.zona) q = q.eq('zona', options.zona)
  if (options.secao) q = q.eq('secao', options.secao)

  if (options.period?.start) q = q.gte('created_at', options.period.start.toISOString())
  if (options.period?.end) q = q.lte('created_at', options.period.end.toISOString())
  if (options.dateFrom) q = q.gte('created_at', `${options.dateFrom}T00:00:00`)
  if (options.dateTo) q = q.lte('created_at', `${options.dateTo}T23:59:59.999`)

  const cep = (options.cep ?? '').replace(/\D/g, '')
  if (cep) q = q.ilike('cep', `%${cep}%`)
  const titulo = sanitizeSearchTerm(options.titulo ?? '')
  if (titulo) q = q.ilike('titulo', `%${titulo}%`)

  if (options.geo === 'mapped') q = q.not('lat', 'is', null).not('lng', 'is', null)
  if (options.geo === 'unmapped') q = q.or('lat.is.null,lng.is.null')

  const search = sanitizeSearchTerm(options.search ?? '')
  if (search) {
    const digits = search.replace(/\D/g, '')
    const parts = [
      `nome_completo.ilike.%${search}%`,
      `titulo.ilike.%${search}%`,
      `coordenador.ilike.%${search}%`,
      `lider.ilike.%${search}%`,
      `telefone.ilike.%${search}%`,
      `cpf.ilike.%${search}%`,
      `cep.ilike.%${search}%`,
    ]
    if (digits) {
      parts.push(`telefone.ilike.%${digits}%`)
      parts.push(`cpf.ilike.%${digits}%`)
      parts.push(`titulo.ilike.%${digits}%`)
    }
    q = q.or(parts.join(','))
  }

  const dups = (options.dupTitulos ?? []).filter(Boolean).slice(0, 200)
  if (options.dupMode === 'only') {
    if (!dups.length) return q.eq('id', '00000000-0000-0000-0000-000000000000')
    q = q.in('titulo', dups)
  }
  if (options.dupMode === 'hide' && dups.length) {
    q = q.not('titulo', 'in', `(${dups.map((t) => `"${t.replace(/"/g, '')}"`).join(',')})`)
  }

  return q
}

/** Uma página de fichas + total — listagem Cadastros sem baixar a tabela inteira. */
export async function fetchCadastrosPage(
  options: CadastrosListQuery,
): Promise<{ rows: Cadastro[]; total: number }> {
  const page = Math.max(0, options.page)
  const pageSize = Math.min(200, Math.max(1, options.pageSize))
  const from = page * pageSize
  const to = from + pageSize - 1
  const sortKey = options.sortKey && SORT_COLUMN[options.sortKey] ? options.sortKey : 'data'
  const ascending = options.sortDir === 'asc'
  const column = SORT_COLUMN[sortKey]

  let query = supabase
    .from('cadastros')
    .select(CADASTRO_LIST_SELECT, { count: 'exact' })
    .order(column, { ascending, nullsFirst: false })
    .order('id', { ascending: false })

  query = applyCadastrosListFilters(query, options)

  const { data, error, count } = await query.range(from, to)
  if (error) throw new Error(error.message)
  return {
    rows: ((data ?? []) as Cadastro[]).map(sanitizeCadastro),
    total: count ?? 0,
  }
}

export type CadastroListFacets = {
  totalAll: number
  zonas: string[]
  secoes: string[]
  /** Seções por zona — para filtrar o dropdown ao escolher zona. */
  secoesPorZona: Record<string, string[]>
  coordenadores: string[]
  lideres: { lider: string; coordenador: string; value: string; label: string }[]
  /** Títulos com mais de uma ficha (amostra original) — filtro de duplicados. */
  dupTitulos: string[]
}

/** Facetas leves — NÃO baixa a tabela de fichas. Equipe + count + RPC (se existir). */
export async function fetchCadastroListFacets(options?: {
  operatorId?: string
}): Promise<CadastroListFacets> {
  const operatorId = options?.operatorId

  let countQuery = supabase
    .from('cadastros')
    .select('id', { count: 'exact', head: true })
  if (operatorId) countQuery = countQuery.eq('operator_id', operatorId)

  const [countRes, coordsRes, lidsRes, rpcRes] = await Promise.all([
    countQuery,
    supabase.from('coordenadores').select('id,nome').eq('ativo', true).order('nome'),
    supabase.from('lideres').select('id,nome,coordenador_id').eq('ativo', true).order('nome'),
    supabase.rpc('cadastros_list_facets', { p_operator_id: operatorId ?? null }),
  ])

  const coordById = new Map<string, string>()
  const coordenadores: string[] = []
  for (const row of (coordsRes.data ?? []) as { id: string; nome: string | null }[]) {
    const nome = (row.nome ?? '').trim()
    if (!nome) continue
    coordById.set(row.id, nome)
    coordenadores.push(nome)
  }

  const liderSeen = new Set<string>()
  const lideres: CadastroListFacets['lideres'] = []
  for (const row of (lidsRes.data ?? []) as {
    id: string
    nome: string | null
    coordenador_id: string | null
  }[]) {
    const lider = (row.nome ?? '').trim()
    if (!lider) continue
    const coordenador = (row.coordenador_id && coordById.get(row.coordenador_id)) || ''
    const value = `${lider}\u001f${coordenador}`
    if (liderSeen.has(value)) continue
    liderSeen.add(value)
    lideres.push({
      value,
      lider,
      coordenador,
      label: coordenador ? `${lider} · ${coordenador}` : lider,
    })
  }

  const sortPt = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true })
  let totalAll = countRes.count ?? 0
  let zonas: string[] = []
  let secoes: string[] = []
  const secoesPorZona: Record<string, string[]> = {}
  let dupTitulos: string[] = []

  const rpc = rpcRes.error ? null : rpcRes.data
  if (rpc && typeof rpc === 'object') {
    const payload = rpc as {
      totalAll?: number
      zonas?: string[]
      secoes?: { zona: string | null; secao: string | null }[]
      dupTitulos?: string[]
    }
    if (typeof payload.totalAll === 'number') totalAll = payload.totalAll
    zonas = (payload.zonas ?? []).filter(Boolean).sort(sortPt)
    dupTitulos = (payload.dupTitulos ?? []).filter(Boolean)
    const secaoSet = new Set<string>()
    for (const pair of payload.secoes ?? []) {
      const zona = (pair.zona ?? '').trim()
      const secao = (pair.secao ?? '').trim()
      if (!secao) continue
      secaoSet.add(secao)
      if (zona) {
        if (!secoesPorZona[zona]) secoesPorZona[zona] = []
        if (!secoesPorZona[zona].includes(secao)) secoesPorZona[zona].push(secao)
      }
    }
    secoes = [...secaoSet].sort(sortPt)
    for (const zona of Object.keys(secoesPorZona)) {
      secoesPorZona[zona].sort(sortPt)
    }
  }

  return {
    totalAll,
    zonas,
    secoes,
    secoesPorZona,
    coordenadores: [...new Set(coordenadores)].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    lideres: lideres.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    dupTitulos,
  }
}

/** Todas as fichas que batem nos filtros (exportação) — slim select, paginado. */
export async function fetchCadastrosMatching(
  options: Omit<CadastrosListQuery, 'page' | 'pageSize'>,
  maxRows = 20000,
): Promise<Cadastro[]> {
  const pageSize = 500
  const all: Cadastro[] = []
  let page = 0
  for (;;) {
    const { rows, total } = await fetchCadastrosPage({ ...options, page, pageSize })
    all.push(...rows)
    if (all.length >= total || rows.length < pageSize || all.length >= maxRows) break
    page += 1
  }
  return all
}

/**
 * Totais de fichas por nerite via RPC agregada (1 query GROUP BY).
 * Esta é a fonte da verdade para a lista de Nerites / Equipe.
 */
export async function fetchOperatorCadastroStats(operatorIds?: string[]): Promise<{
  counts: Record<string, number>
  ultima: Record<string, string>
}> {
  const ids = operatorIds?.length ? operatorIds : null
  const { data, error } = await supabase.rpc('operator_cadastro_stats', {
    p_ids: ids,
  })
  if (error) throw new Error(error.message)

  const counts: Record<string, number> = {}
  const ultima: Record<string, string> = {}
  if (ids) {
    for (const id of ids) counts[id] = 0
  }
  for (const row of (data ?? []) as { operator_id: string; total: number; ultima: string | null }[]) {
    if (!row.operator_id) continue
    counts[row.operator_id] = row.total ?? 0
    if (row.ultima) ultima[row.operator_id] = row.ultima
  }
  return { counts, ultima }
}

/** Contagem total de fichas por nerite (COUNT exact). */
export async function countCadastrosByOperator(operatorIds?: string[]): Promise<Record<string, number>> {
  const { counts } = await fetchOperatorCadastroStats(operatorIds)
  return counts
}

/**
 * Confere se a contagem paginada bate com o COUNT exact (diagnóstico).
 * Retorna divergências; lista vazia = tudo ok.
 */
export async function verifyNeriteFichaCounts(operatorIds: string[]): Promise<
  { id: string; exact: number; paged: number }[]
> {
  const [exactMap, pagedRows] = await Promise.all([
    countCadastrosByOperator(operatorIds),
    fetchAllPaged<{ operator_id: string | null }>((from, to) =>
      supabase
        .from('cadastros')
        .select('operator_id')
        .not('operator_id', 'is', null)
        .range(from, to),
    ),
  ])
  const paged: Record<string, number> = {}
  for (const row of pagedRows) {
    if (!row.operator_id) continue
    paged[row.operator_id] = (paged[row.operator_id] ?? 0) + 1
  }
  const mismatches: { id: string; exact: number; paged: number }[] = []
  for (const id of operatorIds) {
    const exact = exactMap[id] ?? 0
    const p = paged[id] ?? 0
    if (exact !== p) mismatches.push({ id, exact, paged: p })
  }
  return mismatches
}

/** Contagens agrupadas para Equipe / Liderança (RPC — sem dump linha a linha). */
export async function fetchCadastroFichaStats(): Promise<
  {
    operator_id: string | null
    coordenador: string | null
    lider: string | null
    diretoria_id: string | null
    total: number
  }[]
> {
  const { data, error } = await supabase.rpc('cadastro_ficha_stats')
  if (error) throw new Error(error.message)
  return ((data ?? []) as {
    operator_id: string | null
    coordenador: string | null
    lider: string | null
    diretoria_id: string | null
    total: number
  }[]).map((row) => ({
    operator_id: row.operator_id ?? null,
    coordenador: row.coordenador ?? null,
    lider: row.lider ?? null,
    diretoria_id: row.diretoria_id ?? null,
    total: Math.max(0, Math.floor(Number(row.total) || 0)),
  }))
}

/** Colunas mínimas do dashboard (evita SELECT * e 2º fetch completo). */
const DASHBOARD_CADASTRO_SELECT =
  'id,nome_completo,created_at,zona,secao,lider,coordenador,operator_id,diretoria_id,lat,lng,carros_adesivados,adesivos_casa,postagens,contato_whatsapp'

export type DashboardCadastrosOpts = {
  period?: PeriodFilter
  /** Restringe a uma diretoria (diretoria_id OU operator_id da equipe). */
  diretoriaId?: string | null
  operatorIds?: string[] | null
}

function applyDashboardCadastroFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  options?: DashboardCadastrosOpts,
) {
  let q = query
  const startIso = options?.period?.start?.toISOString()
  const endIso = options?.period?.end?.toISOString()
  if (startIso) q = q.gte('created_at', startIso)
  if (endIso) q = q.lte('created_at', endIso)

  const dirId = options?.diretoriaId || null
  if (dirId) {
    const ops = (options?.operatorIds ?? []).filter(Boolean)
    if (ops.length) {
      q = q.or(`diretoria_id.eq.${dirId},operator_id.in.(${ops.join(',')})`)
    } else {
      q = q.eq('diretoria_id', dirId)
    }
  }
  return q
}

/** Fichas do dashboard com filtro de período/diretoria no servidor. */
export async function fetchDashboardCadastros(
  options?: DashboardCadastrosOpts,
): Promise<Cadastro[]> {
  const rows = await fetchAllPaged<Cadastro>((from, to) => {
    const base = supabase
      .from('cadastros')
      .select(DASHBOARD_CADASTRO_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    return applyDashboardCadastroFilters(base, options).range(from, to)
  })
  return rows.map(sanitizeCadastro)
}

/**
 * Só fichas com algum sinal de Formigas (bem menor que a tabela inteira).
 * Usado na mobilização; pendentes = totalFichas − estas linhas.
 */
export async function fetchMobilizacaoCadastroRows(
  options?: Pick<DashboardCadastrosOpts, 'diretoriaId' | 'operatorIds'>,
): Promise<Cadastro[]> {
  const rows = await fetchAllPaged<Cadastro>((from, to) => {
    const base = supabase
      .from('cadastros')
      .select(DASHBOARD_CADASTRO_SELECT)
      .or(
        'carros_adesivados.gt.0,adesivos_casa.gt.0,postagens.gt.0,contato_whatsapp.eq.true',
      )
      .order('id', { ascending: false })
    return applyDashboardCadastroFilters(base, options).range(from, to)
  })
  return rows.map(sanitizeCadastro)
}

export function filterCadastrosByPeriod(rows: Cadastro[], period?: PeriodFilter): Cadastro[] {
  if (!period?.start && !period?.end) return rows
  const startIso = period.start?.toISOString()
  const endIso = period.end?.toISOString()
  return rows.filter((c) => {
    if (startIso && c.created_at < startIso) return false
    if (endIso && c.created_at > endIso) return false
    return true
  })
}

export async function countCadastrosForOperator(operatorId: string): Promise<number> {
  const { count, error } = await supabase
    .from('cadastros')
    .select('id', { count: 'exact', head: true })
    .eq('operator_id', operatorId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function fetchExistingCpfs(): Promise<Set<string>> {
  const rows = await fetchAllPaged<{ cpf: string | null }>((from, to) =>
    supabase.from('cadastros').select('cpf').order('id').range(from, to),
  )
  return new Set(
    rows
      .map((r) => r.cpf)
      .filter((cpf): cpf is string => Boolean(cpf)),
  )
}

export async function fetchExistingTitulos(): Promise<Set<string>> {
  const rows = await fetchAllPaged<{ titulo: string | null }>((from, to) =>
    supabase.from('cadastros').select('titulo').order('id').range(from, to),
  )
  return new Set(
    rows
      .map((r) => (r.titulo ?? '').trim().toLowerCase())
      .filter(Boolean),
  )
}

function duplicatePersonKey(nome: string | null, telefone: string | null): string {
  const normalizedName = normalizeName(nome ?? '')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const phone = digitsOnly(telefone ?? '')
  return normalizedName && phone ? `${normalizedName}|${phone}` : ''
}

/** Chaves usadas pela prévia para impedir duplicidade antes do insert. */
export async function fetchExistingImportKeys(): Promise<ImportExistingKeys> {
  const rows = await fetchAllPaged<{
    titulo: string | null
    cpf: string | null
    nome_completo: string | null
    telefone: string | null
  }>((from, to) =>
    supabase
      .from('cadastros')
      .select('titulo,cpf,nome_completo,telefone')
      .order('id')
      .range(from, to),
  )

  return {
    titulos: new Set(rows.map((r) => String(r.titulo ?? '').trim().toLowerCase()).filter(Boolean)),
    cpfs: new Set(rows.map((r) => digitsOnly(r.cpf ?? '')).filter(Boolean)),
    pessoas: new Set(
      rows
        .map((r) => duplicatePersonKey(r.nome_completo ?? null, r.telefone ?? null))
        .filter(Boolean),
    ),
  }
}

export interface DuplicateCadastroInfo {
  id: string
  nome_completo: string
  coordenador: string
  lider: string
  nerite: string
  motivo: string
}

/** Localiza ficha já existente (CPF, título ou nome+telefone). */
export async function findDuplicateCadastro(options: {
  cpf?: string
  titulo?: string
  nome?: string
  telefone?: string
  excludeId?: string
}): Promise<DuplicateCadastroInfo | null> {
  const cpf = digitsOnly(options.cpf ?? '')
  const titulo = String(options.titulo ?? '').trim()
  const pessoaKey = duplicatePersonKey(options.nome ?? null, options.telefone ?? null)

  let row:
    | {
        id: string
        nome_completo: string | null
        coordenador: string | null
        lider: string | null
        operator_id: string | null
        cpf: string | null
        titulo: string | null
        telefone: string | null
      }
    | null = null
  let motivo = ''

  if (cpf.length === 11) {
    let q = supabase
      .from('cadastros')
      .select('id, nome_completo, coordenador, lider, operator_id, cpf, titulo, telefone')
      .eq('cpf', cpf)
      .limit(1)
    if (options.excludeId) q = q.neq('id', options.excludeId)
    const { data } = await q.maybeSingle()
    if (data) {
      row = data
      motivo = 'CPF'
    }
  }

  if (!row && titulo) {
    let q = supabase
      .from('cadastros')
      .select('id, nome_completo, coordenador, lider, operator_id, cpf, titulo, telefone')
      .eq('titulo', titulo)
      .limit(1)
    if (options.excludeId) q = q.neq('id', options.excludeId)
    const { data } = await q.maybeSingle()
    if (data) {
      row = data
      motivo = 'título de eleitor'
    }
  }

  if (!row && pessoaKey) {
    const phone = digitsOnly(options.telefone ?? '')
    let q = supabase
      .from('cadastros')
      .select('id, nome_completo, coordenador, lider, operator_id, cpf, titulo, telefone')
      .eq('telefone', phone)
      .limit(20)
    if (options.excludeId) q = q.neq('id', options.excludeId)
    const { data } = await q
    const match = (data ?? []).find(
      (r) => duplicatePersonKey(r.nome_completo, r.telefone) === pessoaKey,
    )
    if (match) {
      row = match
      motivo = 'mesmo nome e telefone'
    }
  }

  if (!row) return null

  let nerite = '—'
  if (row.operator_id) {
    const { data: ops } = await supabase.rpc('list_cadastro_operadores')
    const list = (ops ?? []) as Array<{ id: string; nome: string }>
    nerite = list.find((o) => o.id === row.operator_id)?.nome?.trim() || '—'
  }

  return {
    id: row.id,
    nome_completo: row.nome_completo ?? '—',
    coordenador: (row.coordenador ?? '').trim() || '—',
    lider: (row.lider ?? '').trim() || '—',
    nerite,
    motivo,
  }
}

export function buildEvolutionData(cadastros: Cadastro[]): { date: string; total: number }[] {
  const counts = new Map<string, number>()
  cadastros.forEach((c) => {
    const key = format(parseISO(c.created_at), 'dd/MM')
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([date, total]) => ({ date, total }))
}

export function buildZonaData(cadastros: Cadastro[]): { name: string; value: number }[] {
  const counts = new Map<string, number>()
  cadastros.forEach((c) => {
    const zona = (c.zona ?? '').trim()
    if (!zona) return
    counts.set(zona, (counts.get(zona) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name: `Zona eleitoral ${name}`, value }))
    .sort((a, b) => b.value - a.value)
}

/** Espalha pontos ao redor da sede da zona quando não há lat/lng próprio. */
function offsetAroundZona(zonaLat: number, zonaLng: number, seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const n = (hash % 997) + 1
  const angle = (n * 2.399963229728653) % (Math.PI * 2)
  const ring = 0.0035 + (n % 9) * 0.0012
  const latScale = Math.cos((zonaLat * Math.PI) / 180) || 1
  return {
    lat: zonaLat + Math.cos(angle) * ring,
    lng: zonaLng + (Math.sin(angle) * ring) / latScale,
  }
}

export type MapGroupBy = 'zona' | 'secao' | 'bairro'

/** Mesma chave usada em buildMapMarkers — para filtrar fichas do local clicado. */
export function cadastroMapGroupId(
  c: Pick<Cadastro, 'zona' | 'secao' | 'bairro' | 'local_votacao'>,
  groupBy: MapGroupBy,
  locais?: Map<string, LocalVotacaoRef>,
): string {
  const zona = normalizeZona(c.zona) || (c.zona ?? '').trim()
  const secao = normalizeSecao(c.secao) || (c.secao ?? '').trim()
  const ref = locais?.size ? lookupLocalVotacao(locais, zona, secao) : null
  const local = (ref?.local ?? (c.local_votacao ?? '').trim()).trim()
  const bairro = (c.bairro ?? '').trim() || (ref?.bairro ?? '').trim()

  if (groupBy === 'bairro') {
    return bairro ? `bairro:${bairro.toLocaleLowerCase('pt-BR')}` : ''
  }
  if (groupBy === 'zona') {
    return zona ? `zona:${zona}` : ''
  }
  if (!zona || !secao) return ''
  if (ref) {
    return ref.nrLocal
      ? `local:${zona}|n${ref.nrLocal}`
      : `local:${zona}|${local.toLocaleLowerCase('pt-BR')}`
  }
  return `fora:${zona}|${secao}`
}

/**
 * Agrupa marcadores por zona, local de votação (TSE) ou bairro.
 *
 * Na planilha a verdade é o par zona|seção → um local (NR_LOCAL).
 * Várias seções do mesmo colégio (mesmo NR_LOCAL na mesma zona) somam juntas.
 * Par que não existe no TSE fica separado como "fora do TSE".
 */
export function buildMapMarkers(
  cadastros: Cadastro[],
  groupBy: MapGroupBy = 'zona',
  locais?: Map<string, LocalVotacaoRef>,
): MapMarkerData[] {
  const groups = new Map<string, {
    id: string
    zona: string
    secao: string
    secoes: Set<string>
    bairro: string
    local_votacao: string
    count: number
    tseLats: number[]
    tseLngs: number[]
  }>()

  cadastros.forEach((c) => {
    const zona = normalizeZona(c.zona) || (c.zona ?? '').trim()
    const secao = normalizeSecao(c.secao) || (c.secao ?? '').trim()
    const ref = locais?.size ? lookupLocalVotacao(locais, zona, secao) : null
    const local = (ref?.local ?? (c.local_votacao ?? '').trim()).trim()
    const bairro = (c.bairro ?? '').trim() || (ref?.bairro ?? '').trim()
    const id = cadastroMapGroupId(c, groupBy, locais)
    if (!id) return

    const tseLat = ref?.lat
    const tseLng = ref?.lng
    const existing = groups.get(id)
    if (existing) {
      existing.count += 1
      if (secao) existing.secoes.add(secao)
      if (tseLat != null && tseLng != null) {
        existing.tseLats.push(tseLat)
        existing.tseLngs.push(tseLng)
      }
      if (!existing.bairro && bairro) existing.bairro = bairro
      if (!existing.local_votacao && local) existing.local_votacao = local
    } else {
      groups.set(id, {
        id,
        zona,
        secao,
        secoes: new Set(secao ? [secao] : []),
        bairro,
        local_votacao: local || (ref ? '' : `Par fora do TSE · Z${zona} S${secao}`),
        count: 1,
        tseLats: tseLat != null ? [tseLat] : [],
        tseLngs: tseLng != null ? [tseLng] : [],
      })
    }
  })

  return Array.from(groups.values())
    .map((g): MapMarkerData | null => {
      const fromZona = g.zona ? coordsFromZona(g.zona) : null
      const secoes = [...g.secoes].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))

      let lat: number | null = null
      let lng: number | null = null
      if (g.tseLats.length && g.tseLngs.length) {
        const mid = Math.floor(g.tseLats.length / 2)
        lat = [...g.tseLats].sort((a, b) => a - b)[mid]
        lng = [...g.tseLngs].sort((a, b) => a - b)[mid]
      } else if (fromZona) {
        if (groupBy === 'secao' || groupBy === 'bairro') {
          const seed = groupBy === 'secao' ? (g.local_votacao || g.secao) : g.bairro
          if (seed) {
            const off = offsetAroundZona(fromZona.lat, fromZona.lng, seed)
            lat = off.lat
            lng = off.lng
          } else {
            lat = fromZona.lat
            lng = fromZona.lng
          }
        } else {
          lat = fromZona.lat
          lng = fromZona.lng
        }
      }

      if (lat == null || lng == null) return null

      return {
        id: g.id,
        lat,
        lng,
        zona: g.zona,
        secao: secoes[0] || g.secao,
        secoes,
        bairro: g.bairro || undefined,
        local_votacao: g.local_votacao || undefined,
        count: g.count,
      }
    })
    .filter((m): m is MapMarkerData => m != null)
    .sort((a, b) => b.count - a.count)
}

export type MobilizacaoQuantidades = {
  carros_adesivados?: number
  adesivos_casa?: number
  postagens?: number
}

function sanitizeQty(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

export async function updateMobilizacaoFlags(
  id: string,
  flags: MobilizacaoQuantidades,
) {
  const payload: MobilizacaoQuantidades = {}
  if (flags.carros_adesivados !== undefined) payload.carros_adesivados = sanitizeQty(flags.carros_adesivados)
  if (flags.adesivos_casa !== undefined) payload.adesivos_casa = sanitizeQty(flags.adesivos_casa)
  if (flags.postagens !== undefined) payload.postagens = sanitizeQty(flags.postagens)
  const { error } = await supabase.from('cadastros').update(payload).eq('id', id)
  return { error: error?.message ?? null }
}

export async function updateEquipeMobilizacaoFlags(
  table: 'coordenadores' | 'lideres',
  id: string,
  flags: MobilizacaoQuantidades,
) {
  const payload: MobilizacaoQuantidades = {}
  if (flags.carros_adesivados !== undefined) payload.carros_adesivados = sanitizeQty(flags.carros_adesivados)
  if (flags.adesivos_casa !== undefined) payload.adesivos_casa = sanitizeQty(flags.adesivos_casa)
  if (flags.postagens !== undefined) payload.postagens = sanitizeQty(flags.postagens)
  const { error } = await supabase.from(table).update(payload).eq('id', id)
  return { error: error?.message ?? null }
}

