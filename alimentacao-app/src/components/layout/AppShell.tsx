import { useState, type ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Spinner } from '../ui/Spinner'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function AppShell({ children }: { children?: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  return (
    <div className="app-shell">
      <Sidebar role={profile.role} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="main-content-body">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
