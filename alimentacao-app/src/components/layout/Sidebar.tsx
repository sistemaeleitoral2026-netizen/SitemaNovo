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
  Network,
  UserCog,
  Crown,
  Flag,
  ListChecks,
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

interface NavGroup {
  label: string
  roles: UserRole[]
  items: NavItem[]
}

/** Menu fiel ao standalone + todos os itens do sistema. */
const navGroups: NavGroup[] = [
  {
    label: 'Menu',
    roles: ['admin', 'diretoria', 'operador'],
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'diretoria'], end: true },
      { to: '/equipe', label: 'Equipe', icon: Network, roles: ['admin'] },
      { to: '/equipe?tab=nerites', label: 'Minhas Nerites', icon: Users, roles: ['diretoria'] },
      { to: '/equipe?tab=coordenadores', label: 'Coordenadores', icon: UserCog, roles: ['diretoria'] },
      { to: '/equipe?tab=lideres', label: 'Lideranças', icon: Crown, roles: ['diretoria'] },
      { to: '/nerites', label: 'Nerites', icon: Users, roles: ['admin'] },
      { to: '/cadastros', label: 'Todos os cadastros', icon: ClipboardList, roles: ['admin', 'diretoria'] },
      { to: '/meus-cadastros', label: 'Meus Cadastros', icon: ClipboardList, roles: ['operador'] },
      { to: '/cadastros/novo', label: 'Novo Cadastro', icon: UserPlus, roles: ['operador'] },
      { to: '/importar', label: 'Importar Planilha', icon: Upload, roles: ['operador'] },
    ],
  },
  {
    label: 'Gestão',
    roles: ['admin', 'diretoria'],
    items: [
      { to: '/mobilizacao', label: 'Mobilização', icon: Flag, roles: ['admin', 'diretoria'] },
      { to: '/lideranca', label: 'Liderança', icon: ListChecks, roles: ['admin', 'diretoria'] },
      { to: '/mapa', label: 'Mapa por zona', icon: Map, roles: ['admin', 'diretoria'] },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'diretoria'] },
      { to: '/configuracoes', label: 'Configurações', icon: Settings, roles: ['admin', 'diretoria'] },
    ],
  },
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
  const location = useLocation()
  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((group) => group.roles.includes(role) && group.items.length > 0)

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} aria-hidden />}
      <aside className={`app-sidebar ${open ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="app-sidebar-brand">
          <div className="app-sidebar-brand-lockup">
            <div className="app-sidebar-logo" aria-hidden>N</div>
            <div>
              <div className="app-sidebar-title">Nerites</div>
              <div className="app-sidebar-subtitle">Gestão de cadastros</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="sidebar-close-btn" aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

        <nav className="app-sidebar-nav" aria-label="Navegação principal">
          {groups.map((group, groupIndex) => (
            <div key={group.label} className={`app-sidebar-group${groupIndex > 0 ? ' spaced' : ''}`}>
              <div className="app-sidebar-section-label">{group.label}</div>
              {group.items.map(({ to, label, icon: Icon, end }) => {
                const active = linkActive(to, location.pathname, location.search)
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onClose}
                    className={`app-sidebar-link${active ? ' active' : ''}`}
                  >
                    <Icon size={16} strokeWidth={1.6} />
                    <span>{label}</span>
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="app-sidebar-footer-stack">
          <div className="app-sidebar-footer">
            <div>
              <strong>Sistema de gestão</strong>
              <span>
                {role === 'diretoria'
                  ? 'Cadastre coordenadores e lideranças'
                  : 'Painel administrativo'}
              </span>
            </div>
          </div>
          <div className="app-sidebar-version">v 1.0.0</div>
        </div>
      </aside>
    </>
  )
}
