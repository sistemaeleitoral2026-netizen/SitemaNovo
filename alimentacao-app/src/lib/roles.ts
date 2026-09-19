import type { Profile, UserRole } from '../types'

/** Cargos de campo que podem ser atribuídos além do papel principal. */
export const ATRIBUICAO_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  { value: 'operador', label: 'Nerite', hint: 'Cadastros e fichas' },
  { value: 'mobilizador', label: 'Formiga', hint: 'Lançar / Painel Formigas' },
  { value: 'administrativo', label: 'Administrativo', hint: 'Gestão de demandas' },
]

export function profileRoles(profile: Pick<Profile, 'role' | 'extra_roles'> | null | undefined): UserRole[] {
  if (!profile?.role) return []
  const extras = (profile.extra_roles ?? []).filter(
    (r): r is UserRole => Boolean(r) && r !== profile.role,
  )
  return [...new Set<UserRole>([profile.role, ...extras])]
}

export function hasRole(
  profile: Pick<Profile, 'role' | 'extra_roles'> | null | undefined,
  role: UserRole | UserRole[],
): boolean {
  const roles = profileRoles(profile)
  const needed = Array.isArray(role) ? role : [role]
  return needed.some((r) => roles.includes(r))
}

export function normalizeExtraRoles(
  primary: UserRole,
  selected: UserRole[] | null | undefined,
): UserRole[] {
  const allowed = new Set<UserRole>(['operador', 'mobilizador', 'administrativo'])
  return [...new Set((selected ?? []).filter((r) => allowed.has(r) && r !== primary))]
}

export function labelRole(role: UserRole): string {
  switch (role) {
    case 'operador':
      return 'Nerite'
    case 'mobilizador':
      return 'Formiga'
    case 'administrativo':
      return 'Administrativo'
    case 'diretoria':
      return 'Diretoria'
    case 'admin':
      return 'Admin'
    default:
      return role
  }
}
