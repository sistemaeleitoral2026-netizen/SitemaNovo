import { supabase } from './supabase'
import type { Coordenador, Lider } from '../types'

export type ChamadaPessoa = {
  id: string
  nome: string
  cargo: 'coordenador' | 'lideranca'
}

const PAGE = 1000

async function fetchAllRows<T>(
  table: 'coordenadores' | 'lideres',
  diretoriaId?: string | null,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    let query = supabase.from(table).select('*').order('nome')
    if (diretoriaId) query = query.eq('diretoria_id', diretoriaId)
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as T[]
    rows.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return rows
}

/** Todos os coordenadores e lideranças (paginado — PostgREST corta em ~1000). */
export async function fetchEquipeChamada(diretoriaId?: string | null) {
  const [coordenadores, lideres] = await Promise.all([
    fetchAllRows<Coordenador>('coordenadores', diretoriaId),
    fetchAllRows<Lider>('lideres', diretoriaId),
  ])
  return { coordenadores, lideres }
}
