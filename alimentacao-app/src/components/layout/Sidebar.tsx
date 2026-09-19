import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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
  ListChecks,
  Megaphone,
  Inbox,
  ClipboardPen,
} from 'lucide-react'
import type { UserRole } from '../../types'
import { fetchDemandaCounts } from '../../lib/demandas'

interface SidebarProps {
  roles: UserRole[]
  open: boolean
  onClose: () => void
}

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles: UserRole[]
  end?: boolean
  badgeKey?: 'demandas-abertas'
}

interface NavGroup {
  label: string
  roles: UserRole[]
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Operação de Campo',
    roles: ['mobilizador'],
    items: [
      { to: '/ativacao/lancar', label: 'Lançar', icon: Megaphone, roles: ['mobilizador'] },
      { to: '/ativacao/painel', label: 'Painel', icon: ClipboardList, roles: ['mobilizador'] },
    ],
  },
  {
    label: 'Demandas',
    roles: ['administrativo'],
    items: [
      { to: '/demandas/lancar', label: 'Lançar', icon: ClipboardPen, roles: ['administrativo'] },
      { to: '/demandas/painel', label: 'Visualizar', icon: Inbox, roles: ['administrativo'], badgeKey: 'demandas-abertas' },
    ],
  },
  {
    label: 'Menu',
    roles: ['admin', 'diretoria', 'operador'],
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'diretoria'], end: true },
      { to: '/equipe', label: 'Equipe', icon: Network, roles: ['admin'] },
      { to: '/equipe?tab=nerites', label: 'Minhas Nerites', icon: Users, roles: ['diretoria'] },
      { to: '/equipe?tab=coordenadores', label: 'Coordenadores', icon: UserCog, roles: ['diretoria'] },
      { to: '/equipe?tab=lideres', label: 'Lideranças', icon: Crown, roles: ['diretoria'] },
      { to: '/equipe?tab=mobilizadores', label: 'Formigas', icon: Megaphone, roles: ['diretoria'] },
      { to: '/nerites', label: 'Nerites', icon: Users, roles: ['admin'] },
      { to: '/cadastros', label: 'Todos os cadastros', icon: ClipboardList, roles: ['admin', 'diretoria', 'operador'] },
      { to: '/meus-cadastros', label: 'Meus Cadastros', icon: ClipboardList, roles: ['operador'] },
      { to: '/cadastros/novo', label: 'Novo Cadastro', icon: UserPlus, roles: ['operador'] },
      { to: '/importar', label: 'Importar Planilha', icon: Upload, roles: ['operador'] },
    ],
  },
  {
    label: 'Formigas',
    roles: ['admin', 'diretoria'],
    items: [
      { to: '/ativacao/lancar', label: 'Lançar', icon: Megaphone, roles: ['admin', 'diretoria'] },
      { to: '/ativacao/painel', label: 'Painel', icon: ClipboardList, roles: ['admin', 'diretoria'] },
    ],
  },
  {
    label: 'Demandas',
    roles: ['admin', 'diretoria'],
    items: [
      { to: '/demandas/lancar', label: 'Lançar', icon: ClipboardPen, roles: ['admin', 'diretoria'] },
      { to: '/demandas/painel', label: 'Visualizar', icon: Inbox, roles: ['admin', 'diretoria'], badgeKey: 'demandas-abertas' },
    ],
  },
  {
    label: 'Gestão',
    roles: ['admin', 'diretoria'],
    items: [
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
    const current = search.replace(/^\?/, '')
    return pathname === path && current === query
  }

  if (pathname === to) return true

  if (to === '/cadastros') {
    return /^\/cadastros\/[^/]+\/editar\/?$/.test(pathname)
  }

  return pathname.startsWith(`${to}/`)
}

function intersects(a: UserRole[] | undefined, b: UserRole[] | undefined) {
  if (!a?.length || !b?.length) return false
  return a.some((r) => b.includes(r))
}

export function Sidebar({ roles = [], open, onClose }: SidebarProps) {
  const location = useLocation()
  const [abertas, setAbertas] = useState(0)
  const safeRoles = roles ?? []

  const canSeeDemandas = intersects(safeRoles, ['admin', 'diretoria', 'administrativo'])

  useEffect(() => {
    if (!canSeeDemandas) return
    let cancelled = false

    async function load() {
      try {
        const counts = await fetchDemandaCounts()
        if (!cancelled) setAbertas(counts.abertas)
      } catch {
        /* badge informativo */
      }
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 30_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [canSeeDemandas, location.pathname])

  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => intersects(item.roles, safeRoles)),
    }))
    .filter((group) => intersects(group.roles, safeRoles) && group.items.length > 0)

  const primaryHint = safeRoles.includes('administrativo') && !safeRoles.includes('admin') && !safeRoles.includes('diretoria')
    ? 'Registro e acompanhamento de demandas'
    : safeRoles.includes('diretoria')
      ? 'Cadastre coordenadores e lideranças'
      : 'Painel administrativo'

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
            <div key={`${group.label}-${groupIndex}`} className={`app-sidebar-group${groupIndex > 0 ? ' spaced' : ''}`}>
              <div className="app-sidebar-section-label">{group.label}</div>
              {group.items.map(({ to, label, icon: Icon, badgeKey }) => {
                const active = linkActive(to, location.pathname, location.search)
                const badge = badgeKey === 'demandas-abertas' && abertas > 0 ? abertas : 0
                return (
                  <Link
                    key={`${group.label}-${to}`}
                    to={to}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    className={`app-sidebar-link${active ? ' is-active' : ''}${badge ? ' has-badge' : ''}`}
                  >
                    <Icon size={16} strokeWidth={1.6} aria-hidden />
                    <span className="app-sidebar-link-label">{label}</span>
                    {badge > 0 && (
                      <em className="app-sidebar-badge" title={`${badge} demanda${badge === 1 ? '' : 's'} em aberto`}>
                        {badge > 99 ? '99+' : badge}
                      </em>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="app-sidebar-footer-stack">
          <div className="app-sidebar-footer">
            <div>
              <strong>Sistema de gestão</strong>
              <span>{primaryHint}</span>
            </div>
          </div>
          <div className="app-sidebar-version">v 1.0.0</div>
        </div>
      </aside>
    </>
  )
}
