import { useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Spinner } from '../ui/Spinner'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { hasRole, profileRoles } from '../../lib/roles'
import { readSite } from '../../lib/sites'
import { usePresence } from '../../hooks/usePresence'

export function AppShell({ children }: { children?: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const online = usePresence(profile)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={40} />
      </div>
    )
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />
  }

  if (!profile.ativo) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <p>Sua conta está inativa. Entre em contato com o administrador.</p>
      </div>
    )
  }

  if (
    readSite() === 'mr-terceiriza'
    && !hasRole(profile, 'admin')
    && !location.pathname.startsWith('/mr-terceiriza')
  ) {
    return <Navigate to="/mr-terceiriza" replace />
  }

  return (
    <div className="app-shell">
      <Sidebar
        roles={profileRoles(profile)}
        email={profile.email}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main-content">
        <Header onMenuClick={() => setSidebarOpen(true)} online={online} />
        <main className="main-content-body">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
