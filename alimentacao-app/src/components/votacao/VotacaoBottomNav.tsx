import { NavLink } from 'react-router-dom'
import { ClipboardCheck, History, ListChecks } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { hasRole } from '../../lib/roles'

/** Barra inferior mobile. Auxiliar: Lançar + Histórico. Staff: + Progresso. */
export function VotacaoBottomNav() {
  const { profile } = useAuth()
  const isAuxiliarOnly =
    hasRole(profile, 'auxiliar') && !hasRole(profile, ['admin', 'diretoria', 'coordenador'])
  const canSeeStaffTabs = hasRole(profile, ['admin', 'diretoria', 'coordenador'])

  if (!isAuxiliarOnly && !canSeeStaffTabs) return null

  return (
    <nav className="vot-bottom-nav" aria-label="Navegação votação">
      <NavLink to="/votacao/lancar" className={({ isActive }) => `vot-tab${isActive ? ' is-on' : ''}`}>
        <ClipboardCheck size={20} strokeWidth={2.2} />
        <span>Lançar</span>
      </NavLink>
      {canSeeStaffTabs && (
        <NavLink to="/votacao/progresso" className={({ isActive }) => `vot-tab${isActive ? ' is-on' : ''}`}>
          <ListChecks size={20} strokeWidth={2.2} />
          <span>Progresso</span>
        </NavLink>
      )}
      <NavLink to="/votacao/historico" className={({ isActive }) => `vot-tab${isActive ? ' is-on' : ''}`}>
        <History size={20} strokeWidth={2.2} />
        <span>Histórico</span>
      </NavLink>
    </nav>
  )
}
