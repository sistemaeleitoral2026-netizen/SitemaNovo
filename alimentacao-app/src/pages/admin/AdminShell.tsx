import { useMemo, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity, Building2, LayoutDashboard, LogOut, Menu, RefreshCw,
  Search, ShieldCheck, Users, Wallet, X,
} from './adminIcons'
import { useAdminState } from './adminContext'
import { useAuth } from '../../contexts/AuthContext'
import { clearSite } from '../../lib/sites'

const ITEMS = [
  { to: '/admin', end: true, label: 'Visão geral', icon: LayoutDashboard },
  { to: '/admin/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/admin/sistemas', label: 'Sistemas', icon: Building2 },
  { to: '/admin/atividades', label: 'Atividades', icon: Activity },
  { to: '/admin/usuarios', label: 'Usuários', icon: Users },
]

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/admin': { title: 'Visão geral', subtitle: 'Valores do mês e movimento de todos os sistemas.' },
  '/admin/financeiro': { title: 'Financeiro', subtitle: 'Valores detalhados de cada sistema no período escolhido.' },
  '/admin/atividades': { title: 'Atividades', subtitle: 'Lançamentos e alterações feitos nos sistemas.' },
  '/admin/sistemas': { title: 'Sistemas', subtitle: 'Valores do mês e movimento recente de cada sistema.' },
  '/admin/usuarios': { title: 'Usuários', subtitle: 'Contas e permissões de acesso.' },
}

export function AdminShell() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const adminState = useAdminState()
  const [search, setSearch] = useState('')
  const heading = useMemo(() => TITLES[location.pathname] || TITLES['/admin'], [location.pathname])

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const query = search.trim()
    navigate(query ? `/admin/atividades?q=${encodeURIComponent(query)}` : '/admin/atividades')
    setMobileOpen(false)
  }

  async function sair() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="admin-app">
      <aside className={`admin-sidebar${mobileOpen ? ' is-open' : ''}`} aria-label="Administração">
        <div className="admin-brand">
          <span className="admin-brand-mark"><ShieldCheck size={22} /></span>
          <span><strong>Administração</strong><small>Acessos e auditoria</small></span>
          <button className="admin-sidebar-close" type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <nav className="admin-nav">
          <span className="admin-nav-label">Menu</span>
          {ITEMS.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? 'is-active' : ''}>
              <Icon size={19} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button type="button" onClick={() => { clearSite(); navigate('/login') }}><Building2 size={18} /> Trocar sistema</button>
          <button type="button" onClick={() => void sair()}><LogOut size={18} /> Sair</button>
          <small className="admin-credit">Ícones: <a href="https://www.flaticon.com/uicons" target="_blank" rel="noreferrer">Uicons by Flaticon</a></small>
        </div>
      </aside>
      {mobileOpen && <button className="admin-sidebar-backdrop" type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}

      <main className="admin-main">
        <header className="admin-topbar">
          <button className="admin-menu-button" type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={22} /></button>
          <form className="admin-global-search" onSubmit={submitSearch}>
            <Search size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar atividades" aria-label="Pesquisar atividades" />
          </form>
          <button className="admin-icon-button" type="button" onClick={() => window.dispatchEvent(new Event('admin:refresh'))} aria-label="Atualizar dados" title="Atualizar dados">
            <RefreshCw size={19} />
          </button>
          <div className="admin-profile">
            <span className="admin-profile-avatar">{profile?.nome?.trim().charAt(0).toUpperCase() || 'A'}</span>
            <span><strong>{profile?.nome || 'Administrador'}</strong><small>Administrador</small></span>
          </div>
        </header>

        <section className="admin-page-heading">
          <div><p>Administração</p><h1>{heading.title}</h1><span>{heading.subtitle}</span></div>
        </section>

        <div className="admin-content"><Outlet context={adminState} /></div>
      </main>

      <nav className="admin-mobile-nav" aria-label="Navegação do administrador">
        {ITEMS.map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'is-active' : ''}>
            <Icon size={20} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
