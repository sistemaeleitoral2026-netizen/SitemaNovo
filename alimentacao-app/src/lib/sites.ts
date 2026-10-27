export type SiteId = 'nerites' | 'mr-terceiriza'

export type SiteDef = {
  id: SiteId
  nome: string
  home: string
}

export const SITES: SiteDef[] = [
  { id: 'nerites', nome: 'Sistema Nerites', home: '/' },
  { id: 'mr-terceiriza', nome: 'MR TERCERRIZA', home: '/mr-terceiriza' },
]

const STORAGE_KEY = 'alimentacao_site'

export function isSiteId(value: string | null | undefined): value is SiteId {
  return value === 'nerites' || value === 'mr-terceiriza'
}

export function readSite(): SiteId | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isSiteId(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeSite(id: SiteId) {
  localStorage.setItem(STORAGE_KEY, id)
}

export function clearSite() {
  localStorage.removeItem(STORAGE_KEY)
}

export function siteById(id: SiteId | null | undefined): SiteDef | null {
  return SITES.find((s) => s.id === id) ?? null
}
