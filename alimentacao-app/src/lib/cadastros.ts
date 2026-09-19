import { format, parseISO } from 'date-fns'
import { supabase } from './supabase'
import { coordsFromZona } from './geocode'
import type { Cadastro, ImportExistingKeys, MapMarkerData, PeriodFilter } from '../types'
import { digitsOnly, normalizeName } from './normalize'

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
      .select('*')
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

/**
 * Totais de fichas por nerite via COUNT exact do Postgres (não depende do limite de 1000 linhas).
 * Esta é a fonte da verdade para a lista de Nerites / Equipe.
 */
export async function fetchOperatorCadastroStats(operatorIds?: string[]): Promise<{
  counts: Record<string, number>
  ultima: Record<string, string>
}> {
  let ids = operatorIds
  if (!ids?.length) {
    const { data, error } = await supabase.from('profiles').select('id').eq('role', 'operador')
    if (error) throw new Error(error.message)
    ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
  }

  const counts: Record<string, number> = {}
  const ultima: Record<string, string> = {}
  const chunkSize = 25

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    await Promise.all(
      chunk.map(async (id) => {
        const [countRes, lastRes] = await Promise.all([
          supabase
            .from('cadastros')
            .select('id', { count: 'exact', head: true })
            .eq('operator_id', id),
          supabase
            .from('cadastros')
            .select('created_at')
            .eq('operator_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        if (countRes.error) throw new Error(countRes.error.message)
        counts[id] = countRes.count ?? 0
        const createdAt = (lastRes.data as { created_at?: string } | null)?.created_at
        if (createdAt) ultima[id] = createdAt
      }),
    )
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

/** Metadados leves para totais da Equipe (paginado). */
export async function fetchCadastroFichaStats(): Promise<
  { operator_id: string | null; coordenador: string | null; lider: string | null; diretoria_id: string | null }[]
> {
  return fetchAllPaged((from, to) =>
    supabase
      .from('cadastros')
      .select('operator_id, coordenador, lider, diretoria_id')
      .order('id', { ascending: true })
      .range(from, to),
  )
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

/** Agrupa marcadores por zona eleitoral. */
export function buildMapMarkers(cadastros: Cadastro[]): MapMarkerData[] {
  const groups = new Map<string, {
    zona: string
    secao: string
    count: number
    lats: number[]
    lngs: number[]
  }>()

  cadastros.forEach((c) => {
    const zona = (c.zona ?? '').trim()
    if (!zona) return
    const existing = groups.get(zona)
    if (existing) {
      existing.count += 1
      if (c.lat != null && c.lng != null) {
        existing.lats.push(c.lat)
        existing.lngs.push(c.lng)
      }
      if (!existing.secao && c.secao) existing.secao = c.secao
    } else {
      groups.set(zona, {
        zona,
        secao: c.secao || '',
        count: 1,
        lats: c.lat != null ? [c.lat] : [],
        lngs: c.lng != null ? [c.lng] : [],
      })
    }
  })

  return Array.from(groups.values())
    .map((g) => {
      const fromZona = coordsFromZona(g.zona)
      const avgLat = g.lats.length
        ? g.lats.reduce((a, b) => a + b, 0) / g.lats.length
        : fromZona?.lat
      const avgLng = g.lngs.length
        ? g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length
        : fromZona?.lng

      // Preferência: coordenada da zona eleitoral; senão média dos pontos existentes
      const lat = fromZona?.lat ?? avgLat
      const lng = fromZona?.lng ?? avgLng
      if (lat == null || lng == null) return null

      return {
        lat,
        lng,
        zona: g.zona,
        secao: g.secao,
        count: g.count,
      } satisfies MapMarkerData
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

