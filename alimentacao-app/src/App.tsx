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
import { RelatorioFichasTxtPage } from './pages/RelatorioFichasTxtPage'
import { ConfiguracoesPage } from './pages/ConfiguracoesPage'
import { EquipePage } from './pages/EquipePage'
import { AtivacaoLancarPage } from './pages/AtivacaoLancarPage'
import { AtivacaoPainelPage } from './pages/AtivacaoPainelPage'
import { AtivacaoHistoricoPage } from './pages/AtivacaoHistoricoPage'
import { DemandasLancarPage } from './pages/DemandasLancarPage'
import { DemandasPainelPage } from './pages/DemandasPainelPage'
import { LiderancaPage } from './pages/LiderancaPage'
import { GaragemLancarPage } from './pages/GaragemLancarPage'
import { GaragemHistoricoPage } from './pages/GaragemHistoricoPage'
import { TvDashboardPage } from './pages/TvDashboardPage'
import { hasRole } from './lib/roles'
import type { Profile } from './types'

function homeForProfile(profile: Profile | null | undefined) {
  if (!profile) return '/login'
  if (hasRole(profile, 'admin') || hasRole(profile, 'diretoria')) return '/'
  if (hasRole(profile, 'operador')) return '/meus-cadastros'
  if (hasRole(profile, 'mobilizador')) return '/ativacao/lancar'
  if (hasRole(profile, 'administrativo')) return '/demandas/lancar'
  return '/'
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!hasRole(profile, ['admin', 'diretoria'])) {
    return <Navigate to={homeForProfile(profile)} replace />
  }
  return children
}

function AtivacaoRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!hasRole(profile, ['admin', 'diretoria', 'mobilizador'])) {
    return <Navigate to={homeForProfile(profile)} replace />
  }
  return children
}

function DemandasRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!hasRole(profile, ['admin', 'diretoria', 'administrativo'])) {
    return <Navigate to={homeForProfile(profile)} replace />
  }
  return children
}

function BlockFieldOnly({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (hasRole(profile, 'operador') || hasRole(profile, ['admin', 'diretoria'])) return children
  if (hasRole(profile, 'mobilizador')) return <Navigate to="/ativacao/lancar" replace />
  if (hasRole(profile, 'administrativo')) return <Navigate to="/demandas/lancar" replace />
  return children
}

function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!hasRole(profile, 'admin')) return <Navigate to="/" replace />
  return children
}

function NeriteRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!hasRole(profile, 'operador')) return <Navigate to={homeForProfile(profile)} replace />
  return children
}

function OperadoresIdRedirect() {
  const { id } = useParams()
  return <Navigate to={`/nerites/${id}`} replace />
}

function HomeRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (hasRole(profile, ['admin', 'diretoria'])) return <DashboardPage />
  return <Navigate to={homeForProfile(profile)} replace />
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
    return <Navigate to={homeForProfile(profile)} replace />
  }
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/esqueci-senha" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
      <Route path="/tv" element={<TvDashboardPage />} />

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
        <Route path="relatorios/fichas-txt" element={<AdminOnlyRoute><RelatorioFichasTxtPage /></AdminOnlyRoute>} />
        <Route path="mobilizacao" element={<Navigate to="/ativacao/lancar" replace />} />
        <Route path="ativacao/lancar" element={<AtivacaoRoute><AtivacaoLancarPage /></AtivacaoRoute>} />
        <Route path="ativacao/painel" element={<AtivacaoRoute><AtivacaoPainelPage /></AtivacaoRoute>} />
        <Route path="ativacao/historico" element={<AtivacaoRoute><AtivacaoHistoricoPage /></AtivacaoRoute>} />
        <Route path="demandas/lancar" element={<DemandasRoute><DemandasLancarPage /></DemandasRoute>} />
        <Route path="demandas/painel" element={<DemandasRoute><DemandasPainelPage /></DemandasRoute>} />
        <Route path="lideranca" element={<StaffRoute><LiderancaPage /></StaffRoute>} />
        <Route path="garagem" element={<Navigate to="/garagem/lancar" replace />} />
        <Route path="garagem/lancar" element={<StaffRoute><GaragemLancarPage /></StaffRoute>} />
        <Route path="garagem/historico" element={<StaffRoute><GaragemHistoricoPage /></StaffRoute>} />
        <Route path="configuracoes" element={<StaffRoute><ConfiguracoesPage /></StaffRoute>} />
        <Route path="admin-only" element={<AdminOnlyRoute><DashboardPage /></AdminOnlyRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
