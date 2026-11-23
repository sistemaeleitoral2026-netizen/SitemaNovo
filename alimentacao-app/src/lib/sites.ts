import { hasRole } from './roles'
import type { Profile } from '../types'

export type SiteId = 'nerites' | 'mr-terceiriza' | 'assessoria-mb' | 'painel-do-mandato' | 'financeiro-pessoal'

export type SiteDef = {
  id: SiteId
  nome: string
  home: string
}

export const SITES: SiteDef[] = [
  { id: 'nerites', nome: 'Sistema Nerites', home: '/' },
  { id: 'mr-terceiriza', nome: 'Empresas', home: '/mr-terceiriza' },
  { id: 'assessoria-mb', nome: 'Assessoria MB', home: '/assessoria-mb' },
  { id: 'painel-do-mandato', nome: 'Painel do Mandato', home: '/painel-do-mandato' },
  { id: 'financeiro-pessoal', nome: 'Controle Financeiro Pessoal', home: '/financeiro-pessoal' },
]

export type AcessoExternoNivel = 'admin' | 'editor'
export type SiteExterno = Exclude<SiteId, 'nerites'>

/** Nível de acesso extra (cadastrado em /admin) a um sistema fora do Nerites, ou null se não tem. */
export function acessoExternoNivel(
  profile: Pick<Profile, 'acessos_externos'> | null | undefined,
  site: SiteId,
): AcessoExternoNivel | null {
  const valor = profile?.acessos_externos?.[site]
  return valor === 'admin' || valor === 'editor' ? valor : null
}

/** Tem acesso extra (admin ou editor) a esse sistema, além do que o cargo do Nerites já dá. */
export function canAccessSiteExterno(
  profile: Pick<Profile, 'acessos_externos'> | null | undefined,
  site: SiteId,
): boolean {
  return acessoExternoNivel(profile, site) !== null
}

/** Nível "admin" (não só editor) nesse sistema via acesso extra. */
export function isAdminNoSiteExterno(
  profile: Pick<Profile, 'acessos_externos'> | null | undefined,
  site: SiteId,
): boolean {
  return acessoExternoNivel(profile, site) === 'admin'
}

/** Assessoria MB: admin/diretoria do Nerites (como já era) OU acesso extra cadastrado em /admin. */
export function canAccessAssessoriaMb(
  profile: Pick<Profile, 'role' | 'extra_roles' | 'acessos_externos'> | null | undefined,
): boolean {
  return hasRole(profile, ['admin', 'diretoria']) || canAccessSiteExterno(profile, 'assessoria-mb')
}

/** Controle Financeiro Pessoal: só admin do Nerites ou acesso extra cadastrado em /admin. */
export function canAccessFinanceiroPessoal(
  profile: Pick<Profile, 'role' | 'extra_roles' | 'acessos_externos'> | null | undefined,
): boolean {
  return hasRole(profile, 'admin') || canAccessSiteExterno(profile, 'financeiro-pessoal')
}

const STORAGE_KEY = 'alimentacao_site'

export function isSiteId(value: string | null | undefined): value is SiteId {
  return value === 'nerites' || value === 'mr-terceiriza' || value === 'assessoria-mb' || value === 'painel-do-mandato' ||
    value === 'financeiro-pessoal'
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
