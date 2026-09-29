import { LOCAIS_VOTACAO_MA_URL } from './locaisVotacaoMeta'
import { normalizeSecao, normalizeZona } from './normalize'
import type { Cadastro } from '../types'

export type LocalVotacaoRef = {
  local: string
  bairro?: string
  endereco?: string
  municipio?: string
  lat?: number
  lng?: number
}

type CompactRow = {
  l: string
  b?: string
  e?: string
  m?: string
  la?: number
  ln?: number
}

let cache: Map<string, LocalVotacaoRef> | null = null
let loadPromise: Promise<Map<string, LocalVotacaoRef>> | null = null

function fromCompact(row: CompactRow): LocalVotacaoRef {
  return {
    local: row.l,
    bairro: row.b,
    endereco: row.e,
    municipio: row.m,
    lat: row.la,
    lng: row.ln,
  }
}

export function localVotacaoKey(zona: unknown, secao: unknown): string {
  const z = normalizeZona(zona)
  const s = normalizeSecao(secao)
  if (!z || !s) return ''
  return `${z}|${s}`
}

export async function loadLocaisVotacaoMa(): Promise<Map<string, LocalVotacaoRef>> {
  if (cache) return cache
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const res = await fetch(LOCAIS_VOTACAO_MA_URL)
    if (!res.ok) throw new Error('Não foi possível carregar os locais de votação do TSE.')
    const raw = (await res.json()) as Record<string, CompactRow>
    const map = new Map<string, LocalVotacaoRef>()
    for (const [key, row] of Object.entries(raw)) {
      if (!row?.l) continue
      map.set(key, fromCompact(row))
    }
    cache = map
    return map
  })()

  try {
    return await loadPromise
  } catch (err) {
    loadPromise = null
    throw err
  }
}

export function lookupLocalVotacao(
  lookup: Map<string, LocalVotacaoRef>,
  zona: unknown,
  secao: unknown,
): LocalVotacaoRef | null {
  const key = localVotacaoKey(zona, secao)
  if (!key) return null
  return lookup.get(key) ?? null
}

/**
 * Preenche NM_LOCAL_VOTACAO_ORIGINAL (+ coords/bairro do TSE) quando a ficha
 * só tem zona/seção. Não persiste — só enriquece a visão do mapa.
 */
export function enrichCadastrosComLocalTse(
  cadastros: Cadastro[],
  lookup: Map<string, LocalVotacaoRef>,
): Cadastro[] {
  if (!lookup.size) return cadastros
  return cadastros.map((c) => {
    const ref = lookupLocalVotacao(lookup, c.zona, c.secao)
    if (!ref) return c
    const hasLocal = Boolean((c.local_votacao ?? '').trim())
    const hasBairro = Boolean((c.bairro ?? '').trim())
    const hasCoords = c.lat != null && c.lng != null
    if (hasLocal && hasBairro && hasCoords) return c
    return {
      ...c,
      local_votacao: hasLocal ? c.local_votacao : ref.local,
      bairro: hasBairro ? c.bairro : (ref.bairro ?? c.bairro),
      lat: hasCoords ? c.lat : (ref.lat ?? c.lat),
      lng: hasCoords ? c.lng : (ref.lng ?? c.lng),
    }
  })
}
