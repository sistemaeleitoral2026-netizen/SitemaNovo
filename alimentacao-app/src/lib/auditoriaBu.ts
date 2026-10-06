import { normalizeSecao, normalizeZona } from './normalize'
import { supabase } from './supabase'

export const BU_URL = '/data/bu-sao-luis.json'

type RawCargo = [number, number, number, Array<[number, number]>]

type RawBu = {
  cargos: string[]
  /** por cargo: [numero, nome, partido][] */
  cand: Array<Array<[string, string, string]>>
  /** "zzz|ssss" -> { cargoIdx: [branco, nulo, legenda, [[candIdx, votos]]] } */
  secoes: Record<string, Record<string, RawCargo>>
}

export type BuSecaoCargo = {
  branco: number
  nulo: number
  legenda: number
  /** nominais + brancos + nulos + legenda = comparecimento no cargo */
  total: number
  votos: Map<number, number>
}

export type BuData = {
  cargos: string[]
  secoes: Map<string, Map<number, BuSecaoCargo>>
  alvos: Alvo[]
}

/** Candidatos acompanhados na auditoria. */
export type AlvoDef = { id: string; nome: string; cargo: 'Deputado Federal' | 'Deputado Estadual'; numero: string }

export const ALVOS_DEF: AlvoDef[] = [
  { id: 'fabiana', nome: 'Fabiana Vilar', cargo: 'Deputado Federal', numero: '2222' },
  { id: 'josimar', nome: 'Josimar', cargo: 'Deputado Estadual', numero: '22222' },
]

export type Alvo = AlvoDef & { cargoIdx: number; candIdx: number }

let buCache: BuData | null = null
let buPromise: Promise<BuData> | null = null

export function loadBu(): Promise<BuData> {
  if (buCache) return Promise.resolve(buCache)
  if (buPromise) return buPromise
  buPromise = (async () => {
    const res = await fetch(BU_URL)
    if (!res.ok) throw new Error('Não foi possível carregar a planilha do BU.')
    const raw = (await res.json()) as RawBu

    const alvos: Alvo[] = ALVOS_DEF.map((a) => {
      const cargoIdx = raw.cargos.indexOf(a.cargo)
      const candIdx = raw.cand[cargoIdx]?.findIndex((c) => c[0] === a.numero) ?? -1
      if (cargoIdx < 0 || candIdx < 0) throw new Error(`${a.nome} (${a.numero}) não está na planilha do BU.`)
      return { ...a, cargoIdx, candIdx }
    })

    const secoes = new Map<string, Map<number, BuSecaoCargo>>()
    for (const [key, porCargo] of Object.entries(raw.secoes)) {
      const m = new Map<number, BuSecaoCargo>()
      for (const [ci, v] of Object.entries(porCargo)) {
        const votos = new Map<number, number>(v[3])
        let nominais = 0
        for (const n of votos.values()) nominais += n
        m.set(Number(ci), {
          branco: v[0],
          nulo: v[1],
          legenda: v[2],
          total: nominais + v[0] + v[1] + v[2],
          votos,
        })
      }
      secoes.set(key, m)
    }
    buCache = { cargos: raw.cargos, secoes, alvos }
    return buCache
  })().catch((e) => {
    buPromise = null
    throw e
  })
  return buPromise
}

export type AuditoriaFicha = {
  id: string
  nome_completo: string
  titulo: string
  zona: string
  secao: string
  /** zona/seção como estão gravadas na ficha (sem normalizar) */
  zonaRaw: string
  secaoRaw: string
  lider: string
  coordenador: string
  voto_foto_path: string | null
}

const PAGE = 1000

/** Só quem votou (votou = true). */
export async function fetchFichasQueVotaram(): Promise<AuditoriaFicha[]> {
  const out: AuditoriaFicha[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('cadastros')
      .select('id,nome_completo,titulo,zona,secao,lider,coordenador,voto_foto_path')
      .eq('votou', true)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = data ?? []
    for (const r of chunk) {
      out.push({
        id: r.id,
        nome_completo: (r.nome_completo ?? '').trim() || '—',
        titulo: (r.titulo ?? '').trim(),
        zona: normalizeZona(r.zona),
        secao: normalizeSecao(r.secao),
        zonaRaw: (r.zona ?? '').trim(),
        secaoRaw: (r.secao ?? '').trim(),
        lider: (r.lider ?? '').trim(),
        coordenador: (r.coordenador ?? '').trim(),
        voto_foto_path: r.voto_foto_path || null,
      })
    }
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return out
}

export function buKey(zona: string, secao: string) {
  return `${zona}|${secao}`
}

export async function corrigirZonaSecao(id: string, zona: string, secao: string): Promise<void> {
  const z = normalizeZona(zona)
  const s = normalizeSecao(secao)
  if (!z || !s) throw new Error('Informe zona e seção.')
  const { error } = await supabase.from('cadastros').update({ zona: z, secao: s }).eq('id', id)
  if (error) throw new Error(error.message)
}
