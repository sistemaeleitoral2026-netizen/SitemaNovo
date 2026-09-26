import { digitsOnly } from './normalize'
import { supabase } from './supabase'

export type ChamadaFicha = {
  id: string
  nome_completo: string
  titulo: string
  coordenador: string
  lider: string
}

export function formatTituloChamada(value: string | null | undefined): string {
  const d = digitsOnly(value)
  return d || '—'
}

export async function fetchChamadaFichas(coordenador: string, lider?: string): Promise<ChamadaFicha[]> {
  const coord = coordenador.trim()
  if (!coord) return []

  const pageSize = 1000
  const all: ChamadaFicha[] = []
  let from = 0

  for (;;) {
    let query = supabase
      .from('cadastros')
      .select('id, nome_completo, titulo, coordenador, lider')
      .ilike('coordenador', coord)
      .order('lider', { ascending: true })
      .order('nome_completo', { ascending: true })
      .range(from, from + pageSize - 1)

    if (lider?.trim()) query = query.ilike('lider', lider.trim())

    const { data, error } = await query
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as ChamadaFicha[]
    all.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return all
}
