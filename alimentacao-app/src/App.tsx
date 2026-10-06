import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AppShell } from './components/layout/AppShell'
import { Spinner } from './components/ui/Spinner'
// Caminho crítico (login + votação do auxiliar): carregamento imediato, sem
// baixar as bibliotecas pesadas das telas de gestão.
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { VotacaoLancarPage } from './pages/VotacaoLancarPage'
import { VotacaoProgressoPage } from './pages/VotacaoProgressoPage'
import { VotacaoHistoricoPage } from './pages/VotacaoHistoricoPage'
import { canSeeFormigasWhatsapp } from './lib/formigasWhatsapp'
import { hasRole } from './lib/roles'
import type { Profile } from './types'

// Telas de gestão (mapa/Leaflet, gráficos/Recharts, PDF/Excel) em chunks
// separados — cada perfil só baixa o que abrir. Alivia muito o celular.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const OperadoresPage = lazy(() => import('./pages/OperadoresPage').then((m) => ({ default: m.OperadoresPage })))
const OperadorDetailPage = lazy(() => import('./pages/OperadorDetailPage').then((m) => ({ default: m.OperadorDetailPage })))
const CadastrosPage = lazy(() => import('./pages/CadastrosPage').then((m) => ({ default: m.CadastrosPage })))
const CadastroFormPage = lazy(() => import('./pages/CadastroFormPage').then((m) => ({ default: m.CadastroFormPage })))
const MapaPage = lazy(() => import('./pages/MapaPage').then((m) => ({ default: m.MapaPage })))
const ImportarPage = lazy(() => import('./pages/ImportarPage').then((m) => ({ default: m.ImportarPage })))
const RelatoriosPage = lazy(() => import('./pages/RelatoriosPage').then((m) => ({ default: m.RelatoriosPage })))
const RelatorioFichasTxtPage = lazy(() => import('./pages/RelatorioFichasTxtPage').then((m) => ({ default: m.RelatorioFichasTxtPage })))
const RelatorioBackupPage = lazy(() => import('./pages/RelatorioBackupPage').then((m) => ({ default: m.RelatorioBackupPage })))
const ChamadaPage = lazy(() => import('./pages/ChamadaPage').then((m) => ({ default: m.ChamadaPage })))
const FerramentasTituloPage = lazy(() => import('./pages/FerramentasTituloPage').then((m) => ({ default: m.FerramentasTituloPage })))
const ConfiguracoesPage = lazy(() => import('./pages/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })))
const EquipePage = lazy(() => import('./pages/EquipePage').then((m) => ({ default: m.EquipePage })))
const AtivacaoLancarPage = lazy(() => import('./pages/AtivacaoLancarPage').then((m) => ({ default: m.AtivacaoLancarPage })))
const AtivacaoPainelPage = lazy(() => import('./pages/AtivacaoPainelPage').then((m) => ({ default: m.AtivacaoPainelPage })))
const AtivacaoHistoricoPage = lazy(() => import('./pages/AtivacaoHistoricoPage').then((m) => ({ default: m.AtivacaoHistoricoPage })))
const DemandasLancarPage = lazy(() => import('./pages/DemandasLancarPage').then((m) => ({ default: m.DemandasLancarPage })))
const DemandasPainelPage = lazy(() => import('./pages/DemandasPainelPage').then((m) => ({ default: m.DemandasPainelPage })))
const LiderancaPage = lazy(() => import('./pages/LiderancaPage').then((m) => ({ default: m.LiderancaPage })))
const GaragemLancarPage = lazy(() => import('./pages/GaragemLancarPage').then((m) => ({ default: m.GaragemLancarPage })))
const GaragemHistoricoPage = lazy(() => import('./pages/GaragemHistoricoPage').then((m) => ({ default: m.GaragemHistoricoPage })))
const FinanceiroPage = lazy(() => import('./pages/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })))
const TvDashboardPage = lazy(() => import('./pages/TvDashboardPage').then((m) => ({ default: m.TvDashboardPage })))
const AuditoriaPage = lazy(() => import('./pages/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })))
const FormigasWhatsappPage = lazy(() => import('./pages/FormigasWhatsappPage').then((m) => ({ default: m.FormigasWhatsappPage })))

function homeForProfile(profile: Profile | null | undefined) {
  if (!profile) return '/login'
  if (hasRole(profile, 'admin') || hasRole(profile, 'diretoria')) return '/'
  if (hasRole(profile, 'coordenador')) return '/equipe?tab=auxiliares'
  if (hasRole(profile, 'auxiliar')) return '/votacao/lancar'
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

function EquipeRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!hasRole(profile, ['admin', 'diretoria', 'coordenador'])) {
    return <Navigate to={homeForProfile(profile)} replace />
  }
  return children
}

function VotacaoRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!hasRole(profile, ['admin', 'diretoria', 'coordenador', 'auxiliar'])) {
    return <Navigate to={homeForProfile(profile)} replace />
  }
  return children
}

function VotacaoProgressoRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!hasRole(profile, ['admin', 'diretoria', 'coordenador', 'auxiliar'])) {
    return <Navigate to={homeForProfile(profile)} replace />
  }
  return children
}

function AtivacaoRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  // Formiga (role/extra) ou chefe WhatsApp (Aianka) — Demandas + Formigas juntos
  if (
    !hasRole(profile, ['admin', 'diretoria', 'mobilizador'])
    && !canSeeFormigasWhatsapp(profile)
  ) {
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
  if (hasRole(profile, 'operador') || hasRole(profile, ['admin', 'diretoria', 'coordenador'])) return children
  if (hasRole(profile, 'auxiliar')) return <Navigate to="/votacao/lancar" replace />
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

function FerramentasTituloRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!hasRole(profile, ['admin', 'diretoria', 'operador'])) {
    return <Navigate to={homeForProfile(profile)} replace />
  }
  return children
}

function FormigasWhatsappRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!canSeeFormigasWhatsapp(profile)) {
    return <Navigate to={homeForProfile(profile)} replace />
  }
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

function RouteFallback() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size={36} />
    </div>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/esqueci-senha" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
      <Route path="/tv" element={<TvDashboardPage />} />

      <Route element={<AppShell />}>
        <Route index element={<HomeRedirect />} />
        <Route path="equipe" element={<EquipeRoute><EquipePage /></EquipeRoute>} />
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
        <Route path="relatorios/fichas-txt" element={<StaffRoute><RelatorioFichasTxtPage /></StaffRoute>} />
        <Route path="relatorios/backup" element={<StaffRoute><RelatorioBackupPage /></StaffRoute>} />
        <Route path="chamada" element={<StaffRoute><ChamadaPage /></StaffRoute>} />
        <Route path="ferramentas/titulo" element={<FerramentasTituloRoute><FerramentasTituloPage /></FerramentasTituloRoute>} />
        <Route path="ferramentas/titulo/historico" element={<FerramentasTituloRoute><FerramentasTituloPage /></FerramentasTituloRoute>} />
        <Route path="mobilizacao" element={<Navigate to="/ativacao/lancar" replace />} />
        <Route path="ativacao/lancar" element={<AtivacaoRoute><AtivacaoLancarPage /></AtivacaoRoute>} />
        <Route path="ativacao/painel" element={<AtivacaoRoute><AtivacaoPainelPage /></AtivacaoRoute>} />
        <Route path="ativacao/historico" element={<AtivacaoRoute><AtivacaoHistoricoPage /></AtivacaoRoute>} />
        <Route path="formigas/whatsapp" element={<FormigasWhatsappRoute><FormigasWhatsappPage /></FormigasWhatsappRoute>} />
        <Route path="demandas/lancar" element={<DemandasRoute><DemandasLancarPage /></DemandasRoute>} />
        <Route path="demandas/painel" element={<DemandasRoute><DemandasPainelPage /></DemandasRoute>} />
        <Route path="lideranca" element={<StaffRoute><LiderancaPage /></StaffRoute>} />
        <Route path="garagem" element={<Navigate to="/garagem/lancar" replace />} />
        <Route path="garagem/lancar" element={<StaffRoute><GaragemLancarPage /></StaffRoute>} />
        <Route path="garagem/historico" element={<StaffRoute><GaragemHistoricoPage /></StaffRoute>} />
        <Route path="financeiro" element={<StaffRoute><FinanceiroPage /></StaffRoute>} />
        <Route path="votacao/lancar" element={<VotacaoRoute><VotacaoLancarPage /></VotacaoRoute>} />
        <Route path="votacao/progresso" element={<VotacaoProgressoRoute><VotacaoProgressoPage /></VotacaoProgressoRoute>} />
        <Route path="votacao/historico" element={<VotacaoRoute><VotacaoHistoricoPage /></VotacaoRoute>} />
        <Route path="auditoria" element={<StaffRoute><AuditoriaPage /></StaffRoute>} />
        <Route path="configuracoes" element={<StaffRoute><ConfiguracoesPage /></StaffRoute>} />
        <Route path="admin-only" element={<AdminOnlyRoute><DashboardPage /></AdminOnlyRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
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
