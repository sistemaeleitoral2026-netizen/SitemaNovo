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
  type?: 'link'
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles: UserRole[]
  end?: boolean
}

interface NavSection {
  type: 'section'
  label: string
  roles: UserRole[]
}

type NavEntry = NavItem | NavSection

const navEntries: NavEntry[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'diretoria'], end: true },
  { to: '/equipe', label: 'Equipe', icon: Network, roles: ['admin'] },
  { to: '/equipe?tab=nerites', label: 'Minhas Nerites', icon: Users, roles: ['diretoria'] },
  { to: '/equipe?tab=coordenadores', label: 'Coordenadores', icon: UserCog, roles: ['diretoria'] },
  { to: '/equipe?tab=lideres', label: 'Lideranças', icon: Crown, roles: ['diretoria'] },
  { to: '/nerites', label: 'Nerites', icon: Users, roles: ['admin'] },
  { to: '/cadastros', label: 'Todos os Cadastros', icon: ClipboardList, roles: ['admin', 'diretoria'] },
  { type: 'section', label: 'Gestão', roles: ['admin', 'diretoria'] },
  { to: '/mobilizacao', label: 'Mobilização', icon: Flag, roles: ['admin', 'diretoria'] },
  { to: '/lideranca', label: 'Liderança', icon: ListChecks, roles: ['admin', 'diretoria'] },
  { to: '/mapa', label: 'Mapa por Zona', icon: Map, roles: ['admin', 'diretoria'] },
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

function isSection(entry: NavEntry): entry is NavSection {
  return entry.type === 'section'
}

export function Sidebar({ role, open, onClose }: SidebarProps) {
  const entries = navEntries.filter((entry) => entry.roles.includes(role))
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
            {role === 'diretoria' ? 'Sua diretoria' : 'Menu'}
          </div>
          {entries.map((entry) => {
            if (isSection(entry)) {
              return (
                <div key={`section-${entry.label}`} className="app-sidebar-section-label app-sidebar-section-spacer">
                  {entry.label}
                </div>
              )
            }

            const { to, label, icon: Icon, end } = entry
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
