import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, Building2, CalendarDays, Radio, UsersRound } from './adminIcons'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import { fetchAdminEventos, fetchAdminResumo, formatAdminDate, subscribeAdminEventos } from '../../lib/adminEventos'
import type { AdminDashboardResumo, AdminEvento } from '../../lib/adminTypes'
import type { AdminPresenca } from '../../lib/adminTypes'
import { fetchAdminPresencas, presenceSystemLabel, subscribeAdminPresencas } from '../../lib/adminPresenca'
import { AdminActivityTable } from './AdminActivityTable'
import { useAdmin } from './adminContext'
import { FinSkeleton, PeriodBar, SystemFinCard } from './AdminFinWidgets'
import { monthLabel } from '../../lib/adminFinanceiro'

const EMPTY: AdminDashboardResumo = { movimentacoesHoje: 0, usuariosAtivos: 0, sistemasAtivos: 0, totalPeriodo: 0 }

export function AdminDashboardPage() {
  const [eventos, setEventos] = useState<AdminEvento[]>([])
  const [resumo, setResumo] = useState<AdminDashboardResumo>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [centralizado, setCentralizado] = useState(true)
  const [presencas, setPresencas] = useState<AdminPresenca[]>([])
  const { fin, finLoading, finError, month } = useAdmin()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setError(null)
    try {
      const [result, presencaRows] = await Promise.all([
        fetchAdminEventos({ pageSize: 500 }),
        fetchAdminPresencas(),
      ])
      setEventos(result.eventos)
      setPresencas(presencaRows)
      setCentralizado(result.centralizado)
      setResumo(await fetchAdminResumo(result.eventos))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o painel.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    const unsubEvents = subscribeAdminEventos(() => void load())
    const unsubPresence = subscribeAdminPresencas(() => void load())
    return () => { unsubEvents(); unsubPresence() }
  }, [load])
  useEffect(() => {
    const refresh = () => void load()
    window.addEventListener('admin:refresh', refresh)
    return () => window.removeEventListener('admin:refresh', refresh)
  }, [load])

  const onlineAgora = presencas.filter((p) => p.online)

  return (
    <>
      <PeriodBar />
      {finError && <div className="admin-alert error">{finError}</div>}

      <section className="admin-section-heading"><div><h2>Sistemas em números</h2><p>Principais valores de {monthLabel(month)} · variação em relação ao mês anterior</p></div><Link to="/admin/financeiro">Ver financeiro completo</Link></section>
      {!fin && finLoading ? <FinSkeleton count={5} /> : (
        <section className="admin-fin-grid">
          {(fin?.sistemas || []).map((s) => <SystemFinCard key={s.sistema} sistema={s} onDetails={() => navigate(`/admin/financeiro?sistema=${s.sistema}`)} />)}
        </section>
      )}

      <section className="admin-section-heading"><div><h2>Uso dos sistemas</h2><p>Quem está usando e o que foi lançado</p></div><Link to="/admin/atividades">Ver atividades</Link></section>
      {loading ? <div className="admin-loading compact"><Spinner size={30} /><span>Carregando atividade…</span></div> : <>
      {error && <div className="admin-alert error">{error}<button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
      {!centralizado && <div className="admin-alert info">Exibindo as auditorias existentes. Aplique a migration <strong>20261125_admin_eventos.sql</strong> para ativar histórico central, paginação e tempo real.</div>}

      <section className="admin-kpi-grid" aria-label="Indicadores administrativos">
        <article><span className="admin-kpi-icon cyan"><Radio size={21} /></span><div><small>Online agora</small><strong>{onlineAgora.length.toLocaleString('pt-BR')}</strong><p>Ativos nos últimos 2 minutos</p></div></article>
        <article><span className="admin-kpi-icon blue"><Activity size={21} /></span><div><small>Movimentações hoje</small><strong>{resumo.movimentacoesHoje.toLocaleString('pt-BR')}</strong><p>Eventos registrados desde 00h</p></div></article>
        <article><span className="admin-kpi-icon violet"><UsersRound size={21} /></span><div><small>Usuários ativos</small><strong>{resumo.usuariosAtivos.toLocaleString('pt-BR')}</strong><p>Com atividade em 7 dias</p></div></article>
        <article><span className="admin-kpi-icon amber"><Building2 size={21} /></span><div><small>Sistemas ativos</small><strong>{resumo.sistemasAtivos.toLocaleString('pt-BR')}</strong><p>Com movimentação em 24h</p></div></article>
        <article><span className="admin-kpi-icon green"><CalendarDays size={21} /></span><div><small>Atividades no período</small><strong>{resumo.totalPeriodo.toLocaleString('pt-BR')}</strong><p>Últimos 7 dias</p></div></article>
      </section>

      <section className="admin-dashboard-grid is-single">
        <article className="admin-panel admin-users-panel admin-presence-panel">
          <header><div><h2>Usuários e últimas visitas</h2><p>Quem está usando agora e a última visita</p></div><span className="admin-live-label"><i />{onlineAgora.length} online</span></header>
          {presencas.length ? <ol>{presencas.slice(0, 8).map((user) => <li key={user.userId}>
            <span className={user.online ? 'is-online' : ''}>{user.nome.charAt(0).toUpperCase()}</span>
            <div><strong>{user.nome}</strong><small>{user.online ? presenceSystemLabel(user.currentPath) : `Última visita: ${formatAdminDate(user.lastSeenAt)}`}</small></div>
            <b className={user.online ? 'online' : ''}>{user.online ? 'Online' : presenceSystemLabel(user.currentPath)}</b>
          </li>)}</ol> : <p className="admin-panel-empty">A presença começará a aparecer após aplicar a migration de presença e os usuários acessarem o sistema.</p>}
        </article>
      </section>

      <section className="admin-section-heading"><div><h2>Últimas atividades</h2><p>Movimentações mais recentes em todos os sistemas</p></div><Link to="/admin/atividades">Ver todas</Link></section>
      <section className="admin-panel admin-events-panel">
        {eventos.length ? <AdminActivityTable eventos={eventos.slice(0, 10)} /> : <EmptyState title="Nenhuma atividade registrada" description="Não há lançamentos de auditoria disponíveis." />}
      </section>
      </>}
    </>
  )
}
