import { Menu, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../ui/Button'

interface HeaderProps {
  onMenuClick: () => void
  title?: string
}

export function Header({ onMenuClick, title }: HeaderProps) {
  const { profile, signOut } = useAuth()

  return (
    <header
      style={{
        height: 'var(--header-height)',
        background: 'var(--color-white)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.25rem',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menu"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text)',
            display: 'flex',
            padding: '0.25rem',
          }}
          className="menu-btn"
        >
          <Menu size={22} />
        </button>
        {title && <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{title}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--color-navy)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8125rem',
            fontWeight: 700,
          }}
        >
          {(profile?.nome ?? 'U')
            .split(' ')
            .slice(0, 2)
            .map((p) => p[0])
            .join('')
            .toUpperCase()}
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{profile?.nome}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {profile?.role === 'admin' ? 'Administrador' : 'Nerite'}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => signOut()} aria-label="Sair">
          <LogOut size={18} />
        </Button>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .menu-btn { display: none; }
        }
      `}</style>
    </header>
  )
}
