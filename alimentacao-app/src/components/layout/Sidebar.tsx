import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Map,
  Upload,
  BarChart3,
  Settings,
  UserPlus,
  X,
} from 'lucide-react'
import type { UserRole } from '../../types'

interface SidebarProps {
  role: UserRole
  open: boolean
  onClose: () => void
}

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles: UserRole[]
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
  { to: '/nerites', label: 'Nerites', icon: Users, roles: ['admin'] },
  { to: '/cadastros', label: 'Todos os Cadastros', icon: ClipboardList, roles: ['admin'] },
  { to: '/mapa', label: 'Mapa por CEP', icon: Map, roles: ['admin'] },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin'] },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, roles: ['admin'] },
  { to: '/meus-cadastros', label: 'Meus Cadastros', icon: ClipboardList, roles: ['operador'] },
  { to: '/cadastros/novo', label: 'Novo Cadastro', icon: UserPlus, roles: ['operador'] },
  { to: '/importar', label: 'Importar Planilha', icon: Upload, roles: ['operador'] },
]

export function Sidebar({ role, open, onClose }: SidebarProps) {
  const items = navItems.filter((item) => item.roles.includes(role))

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} aria-hidden />}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 'var(--sidebar-width)',
          background: 'var(--color-navy)',
          color: '#fff',
          zIndex: 50,
          transform: open ? 'translateX(0)' : undefined,
          transition: 'transform 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
        }}
        className={open ? 'sidebar-open' : 'sidebar-closed'}
      >
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>AlimentaAção</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.125rem' }}>
              Cadastro e Geolocalização
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sidebar-close-btn"
            aria-label="Fechar menu"
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              display: 'none',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <nav style={{ flex: 1, padding: '1rem 0.75rem', overflowY: 'auto' }}>
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.625rem 0.875rem',
                borderRadius: '8px',
                marginBottom: '0.25rem',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                background: isActive ? 'var(--color-primary)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
                transition: 'background 0.15s',
              })}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <style>{`
        @media (max-width: 1023px) {
          aside.sidebar-closed { transform: translateX(-100%); }
          aside.sidebar-open { transform: translateX(0); }
          .sidebar-close-btn { display: block !important; }
        }
        @media (min-width: 1024px) {
          aside { transform: translateX(0) !important; }
        }
      `}</style>
    </>
  )
}
