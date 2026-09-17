import { Menu, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../ui/Button'

interface HeaderProps {
  onMenuClick: () => void
  title?: string
}

export function Header({ onMenuClick, title }: HeaderProps) {
  const { profile, signOut } = useAuth()

  return (
    <header className="app-header">
      <div className="app-header-left">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="menu-btn header-icon-btn"
        >
          <Menu size={22} />
        </button>
        {title && <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{title}</span>}
        <div className="header-security-status">
          <ShieldCheck size={16} />
          <span>Ambiente seguro</span>
        </div>
      </div>

      <div className="app-header-user">
        <div aria-hidden className="header-avatar">
          {(profile?.nome ?? 'U')
            .split(' ')
            .slice(0, 2)
            .map((p) => p[0])
            .join('')
            .toUpperCase()}
        </div>
        <div className="header-user-copy">
          <div>{profile?.nome}</div>
          <span>
            {profile?.role === 'admin' ? 'Administrador' : 'Nerite'}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => signOut()} aria-label="Sair">
          <LogOut size={18} />
        </Button>
      </div>

    </header>
  )
}
