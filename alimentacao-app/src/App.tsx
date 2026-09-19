import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AppShell } from './components/layout/AppShell'
import { Spinner } from './components/ui/Spinner'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { OperadoresPage } from './pages/OperadoresPage'
import { OperadorDetailPage } from './pages/OperadorDetailPage'
import { CadastrosPage } from './pages/CadastrosPage'
import { CadastroFormPage } from './pages/CadastroFormPage'
import { MapaPage } from './pages/MapaPage'
import { ImportarPage } from './pages/ImportarPage'
import { RelatoriosPage } from './pages/RelatoriosPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { EquipePage } from './pages/EquipePage'
import { AtivacaoLancarPage } from './pages/AtivacaoLancarPage'
import { AtivacaoPainelPage } from './pages/AtivacaoPainelPage'
import { DemandasLancarPage } from './pages/DemandasLancarPage'
import { DemandasPainelPage } from './pages/DemandasPainelPage'
import { LiderancaPage } from './pages/LiderancaPage'

function homeForRole(role: string | undefined) {
  if (role === 'operador') return '/meus-cadastros'
  if (role === 'mobilizador') return '/ativacao/lancar'
  if (role === 'administrativo') return '/demandas/lancar'
  return '/'
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (profile?.role !== 'admin' && profile?.role !== 'diretoria') {
    return <Navigate to={homeForRole(profile?.role)} replace />
  }
  return children
}

function AtivacaoRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!profile || !['admin', 'diretoria', 'mobilizador'].includes(profile.role)) {
    return <Navigate to={homeForRole(profile?.role)} replace />
  }
  return children
}

function DemandasRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!profile || !['admin', 'diretoria', 'administrativo'].includes(profile.role)) {
    return <Navigate to={homeForRole(profile?.role)} replace />
  }
  return children
}

function BlockFieldOnly({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (profile?.role === 'mobilizador') return <Navigate to="/ativacao/lancar" replace />
  if (profile?.role === 'administrativo') return <Navigate to="/demandas/lancar" replace />
  return children
}

function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (profile?.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function NeriteRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (profile?.role !== 'operador') return <Navigate to="/" replace />
  return children
}

function OperadoresIdRedirect() {
  const { id } = useParams()
  return <Navigate to={`/nerites/${id}`} replace />
}

function HomeRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (profile?.role === 'operador') return <Navigate to="/meus-cadastros" replace />
  if (profile?.role === 'mobilizador') return <Navigate to="/ativacao/lancar" replace />
  if (profile?.role === 'administrativo') return <Navigate to="/demandas/lancar" replace />
  return <DashboardPage />
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spinner size={40} />
      </div>
    )
  }
  if (session && profile) {
    return <Navigate to={homeForRole(profile.role)} replace />
  }
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/esqueci-senha" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />

      <Route element={<AppShell />}>
        <Route index element={<HomeRedirect />} />
        <Route path="equipe" element={<StaffRoute><EquipePage /></StaffRoute>} />
        <Route path="nerites" element={<StaffRoute><OperadoresPage /></StaffRoute>} />
        <Route path="nerites/:id" element={<StaffRoute><OperadorDetailPage /></StaffRoute>} />
        <Route path="operadores" element={<Navigate to="/nerites" replace />} />
        <Route path="operadores/:id" element={<OperadoresIdRedirect />} />
        <Route path="cadastros" element={<BlockFieldOnly><CadastrosPage /></BlockFieldOnly>} />
        <Route path="meus-cadastros" element={<NeriteRoute><CadastrosPage /></NeriteRoute>} />
        <Route path="cadastros/novo" element={<NeriteRoute><CadastroFormPage /></NeriteRoute>} />
        <Route path="cadastros/:id/editar" element={<BlockFieldOnly><CadastroFormPage /></BlockFieldOnly>} />
        <Route path="mapa" element={<StaffRoute><MapaPage /></StaffRoute>} />
        <Route path="importar" element={<NeriteRoute><ImportarPage /></NeriteRoute>} />
        <Route path="relatorios" element={<StaffRoute><RelatoriosPage /></StaffRoute>} />
        <Route path="mobilizacao" element={<Navigate to="/ativacao/lancar" replace />} />
        <Route path="ativacao/lancar" element={<AtivacaoRoute><AtivacaoLancarPage /></AtivacaoRoute>} />
        <Route path="ativacao/painel" element={<AtivacaoRoute><AtivacaoPainelPage /></AtivacaoRoute>} />
        <Route path="demandas/lancar" element={<DemandasRoute><DemandasLancarPage /></DemandasRoute>} />
        <Route path="demandas/painel" element={<DemandasRoute><DemandasPainelPage /></DemandasRoute>} />
        <Route path="lideranca" element={<StaffRoute><LiderancaPage /></StaffRoute>} />
        <Route path="configuracoes" element={<StaffRoute><ConfiguracoesPage /></StaffRoute>} />
        <Route path="admin-only" element={<AdminOnlyRoute><DashboardPage /></AdminOnlyRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
