import { META_COORDENADOR_LIDERANCAS, META_LIDERANCA_FICHAS } from './meta'

/** Chave estável para agrupar fichas por liderança sem misturar homônimos. */
export function liderNameKey(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

export function liderFichaKey(
  lider: string | null | undefined,
  coordenador: string | null | undefined,
  diretoriaId: string | null | undefined,
) {
  return JSON.stringify([liderNameKey(lider), liderNameKey(coordenador), diretoriaId ?? ''])
}

export function resolveLimiteFichas(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return META_LIDERANCA_FICHAS
  return Math.min(9999, n)
}

/** Meta de quantas lideranças o coordenador deve ter. */
export function resolveLimiteLiderancas(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return META_COORDENADOR_LIDERANCAS
  return Math.min(9999, n)
}

type FichaStatRow = {
  lider?: string | null
  coordenador?: string | null
  diretoria_id?: string | null
  /** Quando vem de RPC agregada; default 1 (linha individual). */
  total?: number
}

/**
 * Conta fichas de uma liderança sem misturar homônimos:
 * - nome da liderança
 * - mesmo coordenador (obrigatório quando a liderança tem coordenador)
 * - mesma diretoria, se informada
 */
export function countFichasForLider(
  rows: FichaStatRow[],
  opts: {
    nome: string
    coordenadorNome?: string | null
    diretoriaId?: string | null
  },
): number {
  const nome = liderNameKey(opts.nome)
  if (!nome) return 0
  const dirWanted = opts.diretoriaId || null
  const coordWanted = liderNameKey(
    opts.coordenadorNome && opts.coordenadorNome !== '—' ? opts.coordenadorNome : '',
  )

  let total = 0
  for (const row of rows) {
    if (liderNameKey(row.lider) !== nome) continue
    if (dirWanted && row.diretoria_id && row.diretoria_id !== dirWanted) continue
    const rowCoord = liderNameKey(row.coordenador)
    if (coordWanted) {
      if (rowCoord !== coordWanted) continue
    } else if (rowCoord) {
      continue
    }
    const raw = Number(row.total)
    total += Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 1
  }
  return total
}

export function cadastrosLinkForLider(opts: {
  nome: string
  coordenador?: string | null
  diretoriaId?: string | null
}) {
  const params = new URLSearchParams()
  params.set('lider', opts.nome)
  const coord = (opts.coordenador ?? '').trim()
  if (coord && coord !== '—') params.set('coordenador', coord)
  if (opts.diretoriaId) params.set('diretoria', opts.diretoriaId)
  return `/cadastros?${params.toString()}`
}

type LiderNomeRef =
  | { id: string; nome: string }
  | { value: string; label: string }

function buildNomeById(
  refs: LiderNomeRef[] | Map<string, string> | Record<string, string>,
): Map<string, string> {
  if (refs instanceof Map) return refs
  if (Array.isArray(refs)) {
    const map = new Map<string, string>()
    for (const ref of refs) {
      if ('id' in ref) map.set(ref.id, ref.nome)
      else map.set(ref.value, ref.label)
    }
    return map
  }
  return new Map(Object.entries(refs))
}

/**
 * Um auxiliar não pode ter a mesma liderança duas vezes por nome
 * (case/espaços ignorados), mesmo com ids diferentes em `lideres`.
 * Mantém a primeira ocorrência de cada nome.
 */
export function dedupeLiderIdsByNome(
  ids: string[],
  refs: LiderNomeRef[] | Map<string, string> | Record<string, string>,
): string[] {
  const nomeById = buildNomeById(refs)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (!id || out.includes(id)) continue
    const key = liderNameKey(nomeById.get(id) ?? '')
    if (!key) {
      out.push(id)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(id)
  }
  return out
}

/** Nomes únicos por chave estável (trim + lower). Preserva o 1º casing. */
export function uniqueLiderNomes(nomes: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of nomes) {
    const nome = (raw ?? '').trim()
    if (!nome) continue
    const key = liderNameKey(nome)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(nome)
  }
  return out
}

/**
 * Lideranças já vinculadas a outros auxiliares (mesmo id, ou mesmo nome
 * na mesma coordenação). O auxiliar atual pode manter as que já tem.
 */
export function liderancasOcupadasPorOutros(opts: {
  auxiliarLiderMap: Record<string, string[]>
  auxiliares: { id: string; coordenador_id?: string | null; nome?: string }[]
  lideres: { id: string; nome: string; coordenador_id?: string | null }[]
  coordenadorId?: string | null
  excludeAuxiliarId?: string | null
}): { takenIds: Set<string>; takenNames: Set<string>; ocupadaPor: Map<string, string> } {
  const takenIds = new Set<string>()
  const takenNames = new Set<string>()
  const ocupadaPor = new Map<string, string>()
  const coordId = opts.coordenadorId || null
  const nomeById = new Map(opts.lideres.map((l) => [l.id, l.nome]))

  for (const aux of opts.auxiliares) {
    if (opts.excludeAuxiliarId && aux.id === opts.excludeAuxiliarId) continue
    if (coordId && aux.coordenador_id && aux.coordenador_id !== coordId) continue
    const auxLabel = (aux.nome || 'outro auxiliar').trim() || 'outro auxiliar'
    for (const lid of opts.auxiliarLiderMap[aux.id] ?? []) {
      takenIds.add(lid)
      ocupadaPor.set(lid, auxLabel)
      const key = liderNameKey(nomeById.get(lid))
      if (key) {
        takenNames.add(key)
        if (!ocupadaPor.has(`nome:${key}`)) ocupadaPor.set(`nome:${key}`, auxLabel)
      }
    }
  }
  return { takenIds, takenNames, ocupadaPor }
}
