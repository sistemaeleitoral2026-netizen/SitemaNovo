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
  History,
  FileText,
  Archive,
  Car,
  ClipboardCheck,
  CreditCard,
  MessageCircle,
} from 'lucide-react'
import type { UserRole } from '../../types'
import { fetchDemandaCounts } from '../../lib/demandas'
import { FORMIGAS_WHATSAPP_EMAILS } from '../../lib/formigasWhatsapp'

interface SidebarProps {
  roles: UserRole[]
  email?: string | null
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
  emails?: string[]
}

interface NavGroup {
  label: string
  roles: UserRole[]
  items: NavItem[]
  emails?: string[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Operação de Campo',
    roles: ['mobilizador'],
    items: [
      { to: '/ativacao/lancar', label: 'Lançar', icon: Megaphone, roles: ['mobilizador'] },
      { to: '/ativacao/painel', label: 'Painel', icon: ClipboardList, roles: ['mobilizador'] },
      { to: '/ativacao/historico', label: 'Histórico', icon: History, roles: ['mobilizador'] },
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
      { to: '/mapa', label: 'Mapa Eleitoral', icon: Map, roles: ['admin', 'diretoria'] },
      { to: '/meus-cadastros', label: 'Meus Cadastros', icon: ClipboardList, roles: ['operador'] },
      { to: '/cadastros/novo', label: 'Novo Cadastro', icon: UserPlus, roles: ['operador'] },
      { to: '/importar', label: 'Importar Planilha', icon: Upload, roles: ['operador'] },
    ],
  },
  {
    label: 'Ferramentas',
    roles: ['admin', 'diretoria', 'operador'],
    items: [
      { to: '/ferramentas/titulo', label: 'Título', icon: CreditCard, roles: ['admin', 'diretoria', 'operador'] },
      { to: '/ferramentas/titulo/historico', label: 'Histórico', icon: History, roles: ['admin', 'diretoria', 'operador'] },
    ],
  },
  {
    label: 'Formigas',
    roles: ['admin', 'diretoria'],
    items: [
      { to: '/ativacao/lancar', label: 'Lançar', icon: Megaphone, roles: ['admin', 'diretoria'] },
      { to: '/ativacao/painel', label: 'Painel', icon: ClipboardList, roles: ['admin', 'diretoria'] },
      { to: '/ativacao/historico', label: 'Histórico', icon: History, roles: ['admin', 'diretoria'] },
    ],
  },
  {
    label: 'WhatsApp',
    roles: ['administrativo'],
    emails: FORMIGAS_WHATSAPP_EMAILS,
    items: [
      {
        to: '/formigas/whatsapp',
        label: 'Dashboard',
        icon: MessageCircle,
        roles: ['administrativo'],
        emails: FORMIGAS_WHATSAPP_EMAILS,
      },
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
    label: 'Garagem',
    roles: ['admin', 'diretoria'],
    items: [
      { to: '/garagem/lancar', label: 'Lançar', icon: Car, roles: ['admin', 'diretoria'] },
      { to: '/garagem/historico', label: 'Histórico', icon: History, roles: ['admin', 'diretoria'] },
    ],
  },
  {
    label: 'Gestão',
    roles: ['admin', 'diretoria'],
    items: [
      { to: '/lideranca', label: 'Liderança', icon: ListChecks, roles: ['admin', 'diretoria'] },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'diretoria'] },
      { to: '/relatorios/fichas-txt', label: 'Relatório/Correção', icon: FileText, roles: ['admin', 'diretoria'] },
      { to: '/relatorios/backup', label: 'Backup', icon: Archive, roles: ['admin', 'diretoria'] },
      { to: '/chamada', label: 'Chamada', icon: ClipboardCheck, roles: ['admin', 'diretoria'] },
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

  if (to === '/ferramentas/titulo') return pathname === '/ferramentas/titulo'

  // Evita marcar "Relatórios" quando está em /relatorios/fichas-txt
  if (to === '/relatorios') return false

  return pathname.startsWith(`${to}/`)
}

function intersects(a: UserRole[] | undefined, b: UserRole[] | undefined) {
  if (!a?.length || !b?.length) return false
  return a.some((r) => b.includes(r))
}

function canSeeByEmail(emails: string[] | undefined, email: string) {
  if (!emails?.length) return true
  return emails.includes(email)
}

/** Item/grupo com lista de e-mails: só esses e-mails veem (qualquer cargo). Sem lista: só por role. */
function canSeeNav(
  entry: { roles: UserRole[]; emails?: string[] },
  roles: UserRole[],
  email: string,
) {
  if (entry.emails?.length) return canSeeByEmail(entry.emails, email)
  return intersects(entry.roles, roles)
}

export function Sidebar({ roles = [], email, open, onClose }: SidebarProps) {
  const location = useLocation()
  const [abertas, setAbertas] = useState(0)
  const safeRoles = roles ?? []
  const safeEmail = (email ?? '').trim().toLowerCase()

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
    // Não amarrar em location.pathname — cada troca de rota reiniciava a busca.
    const timer = window.setInterval(() => {
      void load()
    }, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [canSeeDemandas])

  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSeeNav(item, safeRoles, safeEmail)),
    }))
    .filter((group) => canSeeNav(group, safeRoles, safeEmail) && group.items.length > 0)

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
