import { LogOut, Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../ui/Button'
import { OnlinePresence } from './OnlinePresence'
import type { PresenceUser } from '../../hooks/usePresence'

interface HeaderProps {
  onMenuClick: () => void
  title?: string
  online?: PresenceUser[]
}

export function Header({ onMenuClick, title, online = [] }: HeaderProps) {
  const { profile, signOut } = useAuth()

  const roleLabel =
    profile?.role === 'admin'
      ? 'Acesso total'
      : profile?.role === 'diretoria'
        ? 'Diretoria'
        : profile?.role === 'mobilizador'
          ? 'Formiga'
          : profile?.role === 'administrativo'
            ? 'Administrativo'
            : 'Nerite'

  const displayName =
    profile?.role === 'admin'
      ? 'Administrador'
      : (profile?.nome ?? 'Usuário')

  const initials = (profile?.nome ?? 'A')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <header className="app-header">
      <div className="app-header-left">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="menu-btn header-icon-btn"
        >
          <Menu size={20} />
        </button>
        {title && <span className="header-page-title">{title}</span>}
        <div className="header-security-status">
          <span className="header-live-dot" aria-hidden />
          <span>Sessão autenticada</span>
        </div>
      </div>

      <div className="app-header-user">
        <OnlinePresence profile={profile} online={online} />
        <div className="header-user-copy">
          <div>{displayName}</div>
          <span>{roleLabel}</span>
        </div>
        <div aria-hidden className="header-avatar">{initials}</div>
        <Button variant="ghost" size="sm" onClick={() => signOut()} aria-label="Encerrar sessão" title="Encerrar sessão">
          <LogOut size={16} />
        </Button>
      </div>
    </header>
  )
}
