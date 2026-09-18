import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardList,
  MapPin,
  Users,
  UserCog,
  Crown,
  UserPlus,
  CalendarDays,
  Car,
} from 'lucide-react'
import { format, parseISO, startOfDay } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { Spinner } from '../components/ui/Spinner'
import { MetaGoalPopup } from '../components/ui/MetaGoalPopup'
import { EvolutionChart } from '../components/charts/EvolutionChart'
import { ZonaDonutChart } from '../components/charts/ZonaDonutChart'
import { CadastrosMap } from '../components/map/CadastrosMap'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { buildEvolutionData, buildMapMarkers, buildZonaData, fetchCadastros } from '../lib/cadastros'
import {
  getMetaFichas,
  markMetaPopupSeen,
  metaProgress,
  shouldShowMetaPopup,
} from '../lib/meta'
import { supabase } from '../lib/supabase'
import type { Cadastro, Coordenador, Lider, Profile } from '../types'

type DirFilter = 'all' | string

interface DiretoriaStats {
  id: string
  nome: string
  tone: 'blue' | 'emerald'
  fichadas: number
  coordenadores: number
  lideres: number
  nerites: number
}

export function DashboardPage() {
  const { profile } = useAuth()
  if (profile?.role === 'diretoria') return <DiretoriaDashboard />
  return <AdminDashboard />
}

function AdminDashboard() {
  const { profile } = useAuth()
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d')
  const [dirFilter, setDirFilter] = useState<DirFilter>('all')
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [totalFichas, setTotalFichas] = useState(0)
  const [carrosAdesivados, setCarrosAdesivados] = useState(0)
  const [diretorias, setDiretorias] = useState<Profile[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState(() => getMetaFichas())
  const [metaPopupOpen, setMetaPopupOpen] = useState(false)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  useEffect(() => {
    setMeta(getMetaFichas())
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cData, totalRes, adesivoCad, adesivoCoord, adesivoLider, dirs, ops, coords, lids] = await Promise.all([
          fetchCadastros({ period }),
          supabase.from('cadastros').select('*', { count: 'exact', head: true }),
          supabase.from('cadastros').select('*', { count: 'exact', head: true }).eq('adesivou_carro', true),
          supabase.from('coordenadores').select('*', { count: 'exact', head: true }).eq('adesivou_carro', true),
          supabase.from('lideres').select('*', { count: 'exact', head: true }).eq('adesivou_carro', true),
          supabase.from('profiles').select('*').eq('role', 'diretoria').order('nome'),
          supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
          supabase.from('coordenadores').select('*'),
          supabase.from('lideres').select('*'),
        ])
        setCadastros(cData)
        setTotalFichas(totalRes.count ?? 0)
        setCarrosAdesivados(
          (adesivoCad.count ?? 0) + (adesivoCoord.count ?? 0) + (adesivoLider.count ?? 0),
        )
        setDiretorias((dirs.data ?? []) as Profile[])
        setNerites((ops.data ?? []) as Profile[])
        setCoordenadores((coords.data ?? []) as Coordenador[])
        setLideres((lids.data ?? []) as Lider[])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [period])

  useEffect(() => {
    if (loading || !profile?.id) return
    if (shouldShowMetaPopup(profile.id)) {
      setMetaPopupOpen(true)
    }
  }, [loading, profile?.id])

  function closeMetaPopup() {
    if (profile?.id) markMetaPopupSeen(profile.id)
    setMetaPopupOpen(false)
  }

  const goal = useMemo(() => metaProgress(totalFichas, meta), [totalFichas, meta])

  const orderedDirs = useMemo(() => {
    const preferred = ['Carol', 'Nicole']
    return [...diretorias].sort((a, b) => {
      const ai = preferred.findIndex((n) => a.nome.toLowerCase().includes(n.toLowerCase()))
      const bi = preferred.findIndex((n) => b.nome.toLowerCase().includes(n.toLowerCase()))
      if (ai === -1 && bi === -1) return a.nome.localeCompare(b.nome, 'pt-BR')
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }, [diretorias])

  const dirStats: DiretoriaStats[] = useMemo(() => {
    return orderedDirs.map((dir, index) => {
      const teamIds = new Set(
        nerites.filter((n) => n.diretoria_id === dir.id).map((n) => n.id),
      )
      const fichadas = cadastros.filter(
        (c) => c.diretoria_id === dir.id || teamIds.has(c.operator_id),
      ).length
      return {
        id: dir.id,
        nome: dir.nome.startsWith('Diretora') ? dir.nome : `Diretora ${dir.nome}`,
        tone: index === 0 ? 'blue' : 'emerald',
        fichadas,
        coordenadores: coordenadores.filter((c) => c.diretoria_id === dir.id).length,
        lideres: lideres.filter((l) => l.diretoria_id === dir.id).length,
        nerites: teamIds.size,
      }
    })
  }, [orderedDirs, nerites, cadastros, coordenadores, lideres])

  const scopedCadastros = useMemo(() => {
    if (dirFilter === 'all') return cadastros
    const teamIds = new Set(
      nerites.filter((n) => n.diretoria_id === dirFilter).map((n) => n.id),
    )
    return cadastros.filter(
      (c) => c.diretoria_id === dirFilter || teamIds.has(c.operator_id),
    )
  }, [cadastros, dirFilter, nerites])

  const scopedNerites = useMemo(() => {
    if (dirFilter === 'all') return nerites
    return nerites.filter((n) => n.diretoria_id === dirFilter)
  }, [nerites, dirFilter])

  const todayCount = useMemo(() => {
    const start = startOfDay(new Date()).toISOString()
    return scopedCadastros.filter((c) => c.created_at >= start).length
  }, [scopedCadastros])

  const zonas = useMemo(() => {
    const set = new Set(scopedCadastros.map((c) => c.zona).filter(Boolean))
    return set.size
  }, [scopedCadastros])

  const ranking = useMemo(() => {
    const counts = new Map<string, number>()
    scopedCadastros.forEach((c) => counts.set(c.operator_id, (counts.get(c.operator_id) ?? 0) + 1))
    return scopedNerites
      .map((op) => ({ id: op.id, nome: op.nome, total: counts.get(op.id) ?? 0 }))
      .filter((o) => o.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        share: scopedCadastros.length ? Math.round((item.total / scopedCadastros.length) * 100) : 0,
      }))
  }, [scopedCadastros, scopedNerites])

  const topLideres = useMemo(() => {
    const counts = new Map<string, number>()
    scopedCadastros.forEach((c) => {
      const nome = c.lider?.trim()
      if (!nome) return
      counts.set(nome, (counts.get(nome) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([nome, total]) => ({
        nome,
        total,
        share: scopedCadastros.length ? Math.round((total / scopedCadastros.length) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [scopedCadastros])

  const maxLider = topLideres[0]?.total || 1

  const neriteById = useMemo(() => {
    const map = new Map<string, Profile>()
    nerites.forEach((n) => map.set(n.id, n))
    return map
  }, [nerites])

  const ultimos = useMemo(
    () =>
      [...scopedCadastros]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 6)
        .map((c) => ({
          id: c.id,
          nome: c.nome_completo,
          nerite: neriteById.get(c.operator_id)?.nome ?? '—',
          zona: c.zona || '—',
          secao: c.secao || '—',
          coordenador: c.coordenador || '—',
          data: formatShortDateTime(c.created_at),
          dir: diretorias.find((d) => d.id === (c.diretoria_id || neriteById.get(c.operator_id)?.diretoria_id))?.nome,
        })),
    [scopedCadastros, neriteById, diretorias],
  )

  const evolution = useMemo(() => buildEvolutionData(scopedCadastros), [scopedCadastros])
  const zonaData = useMemo(() => buildZonaData(scopedCadastros), [scopedCadastros])
  const mapMarkers = useMemo(() => buildMapMarkers(scopedCadastros), [scopedCadastros])
  const maxRank = ranking[0]?.total || 1

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      <MetaGoalPopup
        open={metaPopupOpen}
        atual={totalFichas}
        meta={meta}
        onClose={closeMetaPopup}
      />

      <div className="dashboard-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral das fichas, diretorias e desempenho da equipe.</p>
        </div>
        <div className="dashboard-heading-actions">
          <div className="dir-filter-group" role="group" aria-label="Filtro de diretoria">
            <button
              type="button"
              className={`dir-filter-btn${dirFilter === 'all' ? ' active' : ''}`}
              onClick={() => setDirFilter('all')}
            >
              Geral
            </button>
            {dirStats.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`dir-filter-btn${dirFilter === d.id ? ' active' : ''}`}
                onClick={() => setDirFilter(d.id)}
              >
                {d.nome.replace(/^Diretora\s+/i, '')}
              </button>
            ))}
          </div>
          <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} />
        </div>
      </div>

      <div className="admin-top-grid">
        <div className={`meta-goal-card${goal.batida ? ' done' : ''}`}>
          <div className="meta-goal-card-head">
            <span>Meta do sistema</span>
            <Link to="/configuracoes">Ajustar</Link>
          </div>
          <div className="meta-goal-card-body">
            <div>
              <strong className="tabular-nums">
                {goal.batida
                  ? goal.atual.toLocaleString('pt-BR')
                  : goal.restante.toLocaleString('pt-BR')}
              </strong>
              <span>{goal.batida ? 'fichas confirmadas' : 'faltam para a meta'}</span>
            </div>
            <em className="tabular-nums">{goal.pct}%</em>
          </div>
          <div className="meta-goal-card-bar" role="progressbar" aria-valuenow={goal.pct} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${Math.max(goal.pct, goal.batida ? 100 : 2)}%` }} />
          </div>
          <p className="meta-goal-card-foot">
            {goal.atual.toLocaleString('pt-BR')} de {goal.meta.toLocaleString('pt-BR')} fichas
          </p>
        </div>

        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon tone-blue"><ClipboardList size={18} /></span>
            <span className="dash-kpi-label" style={{ flex: 1 }}>Fichas no período</span>
          </div>
          <strong className="tabular-nums">{scopedCadastros.length.toLocaleString('pt-BR')}</strong>
          <p className="dash-kpi-hint">Conforme o filtro ativo</p>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon tone-emerald"><CalendarDays size={18} /></span>
            <span className="dash-kpi-label" style={{ flex: 1 }}>Hoje</span>
          </div>
          <strong className="tabular-nums">{todayCount.toLocaleString('pt-BR')}</strong>
          <p className="dash-kpi-hint success">Cadastros do dia</p>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon tone-amber"><MapPin size={18} /></span>
            <span className="dash-kpi-label" style={{ flex: 1 }}>Zonas</span>
          </div>
          <strong className="tabular-nums">{zonas}</strong>
          <p className="dash-kpi-hint">Com registro no período</p>
        </div>
        <Link to="/mobilizacao?status=adesivo" className="dash-kpi-card dash-kpi-link">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon tone-blue"><Car size={18} /></span>
            <span className="dash-kpi-label" style={{ flex: 1 }}>Carros adesivados</span>
          </div>
          <strong className="tabular-nums">{carrosAdesivados.toLocaleString('pt-BR')}</strong>
          <p className="dash-kpi-hint">Ver mobilização →</p>
        </Link>
      </div>

      <div className="section-label-row">
        <h2 className="section-label">Diretorias</h2>
        <span className="section-label-hint">Clique no card para filtrar o painel</span>
      </div>

      <div className="diretoria-cards-grid">
        {dirStats.map((d) => {
          const active = dirFilter === 'all' || dirFilter === d.id
          const dimmed = dirFilter !== 'all' && dirFilter !== d.id
          return (
            <button
              key={d.id}
              type="button"
              className={`diretoria-card tone-${d.tone}${active && dirFilter !== 'all' ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`}
              onClick={() => setDirFilter(dirFilter === d.id ? 'all' : d.id)}
            >
              <div className="diretoria-card-head">
                <div>
                  <div className="diretoria-card-title-row">
                    <span className={`dir-avatar tone-${d.tone}`}>{initials(d.nome)}</span>
                    <h2>{d.nome}</h2>
                    <span className={`role-pill tone-${d.tone}`}>Diretora</span>
                  </div>
                </div>
                <div className="diretoria-card-count">
                  <span>Fichas</span>
                  <strong className={`tabular-nums tone-text-${d.tone}`}>{d.fichadas.toLocaleString('pt-BR')}</strong>
                </div>
              </div>

              <div className="diretoria-card-body">
                <div className="diretoria-mini-grid">
                  <Link
                    to={`/equipe?tab=coordenadores&diretoria=${d.id}`}
                    className="diretoria-mini-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>Coordenadores</span>
                    <strong className="tabular-nums">{d.coordenadores}</strong>
                  </Link>
                  <Link
                    to={`/equipe?tab=lideres&diretoria=${d.id}`}
                    className="diretoria-mini-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>Lideranças</span>
                    <strong className="tabular-nums">{d.lideres}</strong>
                  </Link>
                  <Link
                    to={`/equipe?tab=nerites&diretoria=${d.id}`}
                    className="diretoria-mini-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>Nerites</span>
                    <strong className="tabular-nums">{d.nerites}</strong>
                  </Link>
                </div>
              </div>

              <div className="diretoria-card-foot">
                <span>{dirFilter === d.id ? 'Filtro ativo neste painel' : 'Usar como filtro do painel'}</span>
                <Link
                  to={`/cadastros?diretoria=${d.id}`}
                  className="diretoria-open-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  Abrir fichas
                </Link>
              </div>
            </button>
          )
        })}
        {!dirStats.length && (
          <Card>
            <div className="empty-card">
              <strong>Nenhuma diretoria cadastrada</strong>
              <span>As contas de Carol e Nicole ainda não aparecem no banco.</span>
            </div>
          </Card>
        )}
      </div>

      <div className="section-label-row" style={{ marginTop: '1.25rem' }}>
        <h2 className="section-label">Mapa e evolução</h2>
        <span className="section-label-hint">Cobertura territorial e ritmo de cadastro</span>
      </div>

      <Card
        title="Mapa por zona eleitoral"
        subtitle="Intensidade pelos cadastros do filtro"
        className="chart-card map-preview-card"
        style={{ marginBottom: '1rem' }}
        action={<Link to="/mapa" className="diretoria-open-link">Mapa completo →</Link>}
      >
        <CadastrosMap markers={mapMarkers} height={360} />
      </Card>

      <div className="dashboard-main-grid">
        <Card title="Evolução" subtitle="Cadastros no período" className="chart-card chart-card-wide">
          {evolution.length ? (
            <EvolutionChart data={evolution} />
          ) : (
            <div className="empty-card">
              <strong>Sem dados no período</strong>
              <span>A curva aparece quando houver cadastros.</span>
            </div>
          )}
        </Card>
        <Card title="Por zona" subtitle="Distribuição" className="chart-card">
          {zonaData.length ? (
            <ZonaDonutChart data={zonaData} />
          ) : (
            <div className="empty-card">
              <strong>Nenhuma zona com registros</strong>
              <span>A distribuição sai dos cadastros filtrados.</span>
            </div>
          )}
        </Card>
      </div>

      <div className="section-label-row" style={{ marginTop: '1.15rem' }}>
        <h2 className="section-label">Desempenho</h2>
        <span className="section-label-hint">Ranking e atividade recente</span>
      </div>

      <div className="dashboard-analysis-grid">
        <Card title="Top nerites" subtitle="Com fichas no período" className="analysis-card">
          {ranking.length ? (
            <div className="ranking-list">
              {ranking.map((nerite, index) => (
                <Link to={`/nerites/${nerite.id}`} className="ranking-row" key={nerite.id}>
                  <span className="ranking-position">{index + 1}</span>
                  <span className="ranking-person">
                    <strong>{nerite.nome}</strong>
                    <span className="ranking-progress">
                      <i style={{ width: `${Math.max((nerite.total / maxRank) * 100, 4)}%` }} />
                    </span>
                  </span>
                  <strong className="ranking-count">{nerite.total}</strong>
                  <span className="ranking-pct">{nerite.share}%</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <strong>Sem ranking ainda</strong>
              <span>Aparece quando houver fichas no período.</span>
            </div>
          )}
        </Card>

        <Card title="Atividade recente" subtitle="Últimas fichas" className="analysis-card">
          {ultimos.length ? (
            <div className="recent-list">
              {ultimos.map((item) => (
                <Link to={`/cadastros/${item.id}/editar`} className="recent-row" key={item.id}>
                  <div>
                    <strong>{item.nome}</strong>
                    <span>
                      Zona {item.zona} · Seção {item.secao}
                      {item.coordenador !== '—' ? ` · ${item.coordenador}` : ''}
                      {' · '}
                      {item.nerite}
                    </span>
                  </div>
                  <time>{item.data}</time>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <strong>Nenhum cadastro</strong>
              <span>Os últimos registros aparecem aqui.</span>
            </div>
          )}
        </Card>

        <Card title="Top lideranças" subtitle="Só com fichas" className="analysis-card">
          {topLideres.length ? (
            <div className="ranking-list">
              {topLideres.map((lider, index) => (
                <Link
                  to={`/cadastros?lider=${encodeURIComponent(lider.nome)}`}
                  className="ranking-row"
                  key={lider.nome}
                >
                  <span className="ranking-position">{index + 1}</span>
                  <span className="ranking-person">
                    <strong>{lider.nome}</strong>
                    <span className="ranking-progress">
                      <i style={{ width: `${Math.max((lider.total / maxLider) * 100, 4)}%` }} />
                    </span>
                  </span>
                  <strong className="ranking-count">{lider.total}</strong>
                  <span className="ranking-pct">{lider.share}%</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <strong>Sem lideranças com fichas</strong>
              <span>Só entram nomes que já têm cadastro.</span>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function DiretoriaDashboard() {
  const { profile } = useAuth()
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d')
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [loading, setLoading] = useState(true)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])
  const dirId = profile!.id

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cData, ops, coords, lids] = await Promise.all([
          fetchCadastros({ period }),
          supabase.from('profiles').select('*').eq('role', 'operador').eq('diretoria_id', dirId).order('nome'),
          supabase.from('coordenadores').select('*').eq('diretoria_id', dirId),
          supabase.from('lideres').select('*').eq('diretoria_id', dirId),
        ])
        const teamIds = new Set((ops.data ?? []).map((n: Profile) => n.id))
        setCadastros(
          cData.filter((c) => c.diretoria_id === dirId || teamIds.has(c.operator_id)),
        )
        setNerites((ops.data ?? []) as Profile[])
        setCoordenadores((coords.data ?? []) as Coordenador[])
        setLideres((lids.data ?? []) as Lider[])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [period, dirId])

  const todayCount = useMemo(() => {
    const start = startOfDay(new Date()).toISOString()
    return cadastros.filter((c) => c.created_at >= start).length
  }, [cadastros])

  const zonas = useMemo(() => new Set(cadastros.map((c) => c.zona).filter(Boolean)).size, [cadastros])
  const evolution = useMemo(() => buildEvolutionData(cadastros), [cadastros])
  const zonaData = useMemo(() => buildZonaData(cadastros), [cadastros])
  const mapMarkers = useMemo(() => buildMapMarkers(cadastros), [cadastros])

  const ranking = useMemo(() => {
    const counts = new Map<string, number>()
    cadastros.forEach((c) => counts.set(c.operator_id, (counts.get(c.operator_id) ?? 0) + 1))
    return nerites
      .map((op) => ({ id: op.id, nome: op.nome, total: counts.get(op.id) ?? 0 }))
      .filter((o) => o.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [cadastros, nerites])

  const maxRank = ranking[0]?.total || 1

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <h1>Dashboard · {profile?.nome}</h1>
          <p>Acompanhe apenas os resultados da sua diretoria.</p>
        </div>
        <div className="dashboard-heading-actions">
          <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} />
        </div>
      </div>

      <div className="section-label-row">
        <h2 className="section-label">Cadastro para a ficha</h2>
        <span className="section-label-hint">Nomes que as nerites vão selecionar no cadastro</span>
      </div>

      <div className="dir-action-grid">
        <Link to="/equipe?tab=coordenadores" className="dir-action-card">
          <div className="dir-action-icon"><UserCog size={20} /></div>
          <strong>Coordenadores</strong>
          <span>{coordenadores.length} cadastrado(s)</span>
          <em>Cadastrar coordenador →</em>
        </Link>
        <Link to="/equipe?tab=lideres" className="dir-action-card">
          <div className="dir-action-icon"><Crown size={20} /></div>
          <strong>Lideranças</strong>
          <span>{lideres.length} cadastrada(s)</span>
          <em>Cadastrar liderança →</em>
        </Link>
        <Link to="/equipe?tab=nerites" className="dir-action-card">
          <div className="dir-action-icon"><UserPlus size={20} /></div>
          <strong>Nerites</strong>
          <span>{nerites.length} vinculada(s)</span>
          <em>Cadastrar nerite →</em>
        </Link>
      </div>

      {(!coordenadores.length || !lideres.length) && (
        <div className="ficha-setup-banner" style={{ marginBottom: '1rem' }}>
          <strong>Atenção</strong>
          <span>
            {!coordenadores.length && !lideres.length
              ? 'Cadastre coordenadores e lideranças para as nerites poderem preencher a ficha.'
              : !coordenadores.length
                ? 'Ainda falta cadastrar coordenadores.'
                : 'Ainda falta cadastrar lideranças.'}
          </span>
        </div>
      )}

      <div className="diretoria-cards-grid single">
        <div className="diretoria-card tone-blue selected">
          <div className="diretoria-card-head">
            <div>
              <div className="diretoria-card-title-row">
                <span className="dir-avatar tone-blue">
                  {initials(
                    /^diretora/i.test(profile?.nome ?? '')
                      ? (profile?.nome ?? 'D')
                      : `Diretora ${profile?.nome ?? 'D'}`,
                  )}
                </span>
                <h2>{profile?.nome}</h2>
                <span className="role-pill tone-blue">Diretora</span>
                <span className="status-pill tone-blue">Sua diretoria</span>
              </div>
              <p>Painel da sua equipe</p>
            </div>
            <div className="diretoria-card-count">
              <span>Fichadas Confirmadas</span>
              <strong className="tabular-nums tone-text-blue">{cadastros.length.toLocaleString('pt-BR')}</strong>
            </div>
          </div>
          <div className="diretoria-card-body">
            <div className="diretoria-mini-grid">
              <Link to="/equipe?tab=coordenadores" className="diretoria-mini-link">
                <span>Coordenadores</span>
                <strong className="tabular-nums">{coordenadores.length}</strong>
              </Link>
              <Link to="/equipe?tab=lideres" className="diretoria-mini-link">
                <span className="tone-text-blue">Líderes</span>
                <strong className="tabular-nums tone-text-blue">{lideres.length}</strong>
              </Link>
              <Link to="/equipe?tab=nerites" className="diretoria-mini-link">
                <span>Nerites</span>
                <strong className="tabular-nums">{nerites.length}</strong>
              </Link>
            </div>
          </div>
          <div className="diretoria-card-foot">
            <Link to="/equipe" className="tone-text-blue">Gerenciar equipe →</Link>
            <Link to="/cadastros" className="diretoria-open-link">Abrir cadastros</Link>
          </div>
        </div>
      </div>

      <div className="kpi-grid kpi-grid-3">
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon tone-emerald"><CalendarDays size={18} /></span>
            <span className="dash-kpi-label" style={{ flex: 1 }}>Cadastros hoje</span>
            <i className="dot dot-emerald" />
          </div>
          <strong className="tabular-nums">{todayCount}</strong>
          <p className="dash-kpi-hint success">Registros de hoje</p>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon tone-amber"><MapPin size={18} /></span>
            <span className="dash-kpi-label" style={{ flex: 1 }}>Zonas</span>
            <i className="dot dot-amber" />
          </div>
          <strong className="tabular-nums">{zonas}</strong>
          <p className="dash-kpi-hint">Com fichadas no período</p>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span className="dash-kpi-icon tone-blue"><Users size={18} /></span>
            <span className="dash-kpi-label" style={{ flex: 1 }}>Nerites ativas</span>
            <i className="dot dot-blue" />
          </div>
          <strong className="tabular-nums">{nerites.filter((n) => n.ativo).length}</strong>
          <p className="dash-kpi-hint">Na sua diretoria</p>
        </div>
      </div>

      <Card
        title="Mapa por zona eleitoral"
        subtitle="Manchas coloridas por intensidade de cadastros"
        className="chart-card map-preview-card"
        style={{ marginBottom: '1.25rem' }}
        action={<Link to="/mapa" className="diretoria-open-link">Abrir mapa completo →</Link>}
      >
        <CadastrosMap markers={mapMarkers} height={360} />
      </Card>

      <div className="dashboard-main-grid">
        <Card title="Evolução" subtitle="Cadastros da sua diretoria" className="chart-card chart-card-wide">
          {evolution.length ? <EvolutionChart data={evolution} /> : (
            <div className="empty-card"><strong>Sem dados</strong><span>Cadastros da equipe aparecem aqui.</span></div>
          )}
        </Card>
        <Card title="Zonas" className="chart-card">
          {zonaData.length ? <ZonaDonutChart data={zonaData} /> : (
            <div className="empty-card"><strong>Sem zonas</strong><span>Aguardando registros.</span></div>
          )}
        </Card>
      </div>

      <Card title="Top nerites da diretoria">
        {ranking.length ? (
          <div className="ranking-list">
            {ranking.map((n, i) => (
              <Link to={`/nerites/${n.id}`} className="ranking-row" key={n.id}>
                <span className="ranking-position">{i + 1}</span>
                <span className="ranking-person">
                  <strong>{n.nome}</strong>
                  <span className="ranking-progress">
                    <i style={{ width: `${Math.max((n.total / maxRank) * 100, 4)}%` }} />
                  </span>
                </span>
                <strong className="ranking-count">{n.total}</strong>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-card">
            <strong>Nenhuma nerite com cadastros</strong>
            <span>Crie nerites em Equipe para começar.</span>
          </div>
        )}
      </Card>
    </div>
  )
}

function formatShortDateTime(value: string) {
  try {
    return format(parseISO(value), 'dd/MM HH:mm')
  } catch {
    return '—'
  }
}

function initials(nome: string) {
  if (/^diretora\s+/i.test(nome)) {
    const rest = nome.replace(/^diretora\s+/i, '').trim()
    const first = rest.split(/\s+/).find(Boolean) ?? ''
    return `D${(first[0] ?? '?').toUpperCase()}`
  }
  const parts = nome.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return (parts[0] ?? '?').slice(0, 2).toUpperCase()
}
