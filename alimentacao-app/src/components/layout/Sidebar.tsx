import { NavLink, useLocation } from 'react-router-dom'
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
  Network,
  UserCog,
  Crown,
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
  end?: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'diretoria'], end: true },
  { to: '/equipe', label: 'Equipe', icon: Network, roles: ['admin'] },
  { to: '/equipe?tab=nerites', label: 'Minhas Nerites', icon: Users, roles: ['diretoria'] },
  { to: '/equipe?tab=coordenadores', label: 'Coordenadores', icon: UserCog, roles: ['diretoria'] },
  { to: '/equipe?tab=lideres', label: 'Lideranças', icon: Crown, roles: ['diretoria'] },
  { to: '/nerites', label: 'Nerites', icon: Users, roles: ['admin'] },
  { to: '/cadastros', label: 'Todos os Cadastros', icon: ClipboardList, roles: ['admin', 'diretoria'] },
  { to: '/mapa', label: 'Mapa por CEP', icon: Map, roles: ['admin', 'diretoria'] },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'diretoria'] },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, roles: ['admin', 'diretoria'] },
  { to: '/meus-cadastros', label: 'Meus Cadastros', icon: ClipboardList, roles: ['operador'] },
  { to: '/cadastros/novo', label: 'Novo Cadastro', icon: UserPlus, roles: ['operador'] },
  { to: '/importar', label: 'Importar Planilha', icon: Upload, roles: ['operador'] },
]

function linkActive(to: string, pathname: string, search: string) {
  if (to === '/') return pathname === '/'
  if (to.includes('?')) {
    const [path, query] = to.split('?')
    return pathname === path && search.replace(/^\?/, '') === query
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function Sidebar({ role, open, onClose }: SidebarProps) {
  const items = navItems.filter((item) => item.roles.includes(role))
  const location = useLocation()

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} aria-hidden />}
      <aside className={`app-sidebar ${open ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="app-sidebar-brand">
          <div className="app-sidebar-brand-lockup">
            <div className="app-sidebar-title">Nerites</div>
          </div>
          <button type="button" onClick={onClose} className="sidebar-close-btn" aria-label="Fechar menu">
            <X size={20} />
          </button>
        </div>

        <nav className="app-sidebar-nav" aria-label="Navegação principal">
          <div className="app-sidebar-section-label">
            {role === 'diretoria' ? 'Sua diretoria' : 'Visão geral'}
          </div>
          {items.map(({ to, label, icon: Icon, end }) => {
            const active = linkActive(to, location.pathname, location.search)
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onClose}
                className={`app-sidebar-link${active ? ' active' : ''}`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="app-sidebar-footer">
          <Sparkles size={15} />
          <div>
            <strong>Sistema de gestão</strong>
            <span>
              {role === 'diretoria'
                ? 'Cadastre coordenadores e lideranças'
                : 'Painel administrativo'}
            </span>
          </div>
        </div>
        <div className="app-sidebar-version">V 1.0.0</div>
      </aside>
    </>
  )
}
