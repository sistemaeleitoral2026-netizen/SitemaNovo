const META_KEY = 'alimentacao_meta_fichas'
const DEFAULT_META = 6000

export function getMetaFichas(): number {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return DEFAULT_META
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_META
    return Math.round(n)
  } catch {
    return DEFAULT_META
  }
}

export function setMetaFichas(value: number): number {
  const n = Math.max(1, Math.round(Number(value) || DEFAULT_META))
  localStorage.setItem(META_KEY, String(n))
  return n
}

export function metaProgress(atual: number, meta = getMetaFichas()) {
  const safeMeta = Math.max(1, meta)
  const safeAtual = Math.max(0, atual)
  const restante = Math.max(0, safeMeta - safeAtual)
  const pct = Math.min(100, Math.round((safeAtual / safeMeta) * 100))
  const batida = safeAtual >= safeMeta
  return { meta: safeMeta, atual: safeAtual, restante, pct, batida }
}

/** Chave diária por admin — popup só no primeiro acesso do dia. */
export function metaPopupStorageKey(userId: string, date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `alimentacao_meta_popup_${userId}_${y}-${m}-${d}`
}

export function shouldShowMetaPopup(userId: string): boolean {
  try {
    return localStorage.getItem(metaPopupStorageKey(userId)) !== '1'
  } catch {
    return true
  }
}

export function markMetaPopupSeen(userId: string): void {
  try {
    localStorage.setItem(metaPopupStorageKey(userId), '1')
  } catch {
    /* ignore */
  }
}

export { DEFAULT_META }
