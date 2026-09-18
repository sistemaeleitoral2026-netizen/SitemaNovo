import { format, parseISO } from 'date-fns'
import { supabase } from './supabase'
import { coordsFromZona } from './geocode'
import type { Cadastro, MapMarkerData, PeriodFilter } from '../types'

export async function fetchCadastros(options?: {
  operatorId?: string
  period?: PeriodFilter
  search?: string
}): Promise<Cadastro[]> {
  let query = supabase
    .from('cadastros')
    .select('*')
    .order('created_at', { ascending: false })

  if (options?.operatorId) {
    query = query.eq('operator_id', options.operatorId)
  }

  if (options?.period?.start) {
    query = query.gte('created_at', options.period.start.toISOString())
  }
  if (options?.period?.end) {
    query = query.lte('created_at', options.period.end.toISOString())
  }

  const { data, error } = await query
  if (error) throw error

  let results = (data ?? []) as Cadastro[]

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

export async function fetchExistingCpfs(): Promise<Set<string>> {
  const { data, error } = await supabase.from('cadastros').select('cpf')
  if (error) throw error
  return new Set(
    (data ?? [])
      .map((r: { cpf: string | null }) => r.cpf)
      .filter((cpf): cpf is string => Boolean(cpf)),
  )
}

export async function fetchExistingTitulos(): Promise<Set<string>> {
  const { data, error } = await supabase.from('cadastros').select('titulo')
  if (error) throw error
  return new Set(
    (data ?? [])
      .map((r: { titulo: string }) => r.titulo.trim().toLowerCase())
      .filter(Boolean),
  )
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
    counts.set(c.zona, (counts.get(c.zona) ?? 0) + 1)
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

