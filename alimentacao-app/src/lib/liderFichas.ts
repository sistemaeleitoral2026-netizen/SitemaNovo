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
 * Conta fichas de uma liderança de forma tolerante:
 * - exige nome da liderança
 * - restringe à diretoria quando informada (aceita ficha sem diretoria_id)
 * - se houver coordenador, preferimos match; fichas sem coordenador ainda entram
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

  let withCoord = 0
  let anyInDir = 0

  for (const row of rows) {
    if (liderNameKey(row.lider) !== nome) continue
    if (dirWanted && row.diretoria_id && row.diretoria_id !== dirWanted) continue
    const n = (() => {
      const raw = Number(row.total)
      return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 1
    })()
    anyInDir += n
    const rowCoord = liderNameKey(row.coordenador)
    if (!coordWanted || !rowCoord || rowCoord === coordWanted) {
      withCoord += n
    }
  }

  // Se há coordenador definido e encontramos matches, usa withCoord;
  // senão (ou coordenador vazio), conta todas da diretoria/nome.
  if (coordWanted && withCoord > 0) return withCoord
  return anyInDir
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
