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
  Sparkles,
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
      <aside className={`app-sidebar ${open ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="app-sidebar-brand">
          <div className="app-sidebar-brand-lockup">
            <div className="app-sidebar-title">Nerites</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sidebar-close-btn"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="app-sidebar-nav" aria-label="Navegação principal">
          <div className="app-sidebar-section-label">Visão geral</div>
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) => `app-sidebar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <Sparkles size={15} />
          <div>
            <strong>Central de dados</strong>
            <span>Informações seguras e atualizadas</span>
          </div>
        </div>
      </aside>
    </>
  )
}
