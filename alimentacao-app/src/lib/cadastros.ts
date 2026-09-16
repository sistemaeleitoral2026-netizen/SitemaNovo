import { format, parseISO } from 'date-fns'
import { supabase } from './supabase'
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

/** Agrupa marcadores por CEP (geolocalização das pessoas cadastradas). */
export function buildMapMarkers(cadastros: Cadastro[]): MapMarkerData[] {
  const groups = new Map<string, MapMarkerData>()

  cadastros.forEach((c) => {
    if (c.lat == null || c.lng == null || !c.cep) return
    const key = c.cep
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
    } else {
      groups.set(key, {
        lat: c.lat,
        lng: c.lng,
        cep: c.cep,
        zona: c.zona,
        secao: c.secao,
        count: 1,
      })
    }
  })

  return Array.from(groups.values())
}
