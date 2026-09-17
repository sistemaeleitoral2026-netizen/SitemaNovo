import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardList,
  MapPin,
  Users,
  UserCog,
  Crown,
  UserPlus,
} from 'lucide-react'
import { format, parseISO, startOfDay } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { Spinner } from '../components/ui/Spinner'
import { EvolutionChart } from '../components/charts/EvolutionChart'
import { ZonaDonutChart } from '../components/charts/ZonaDonutChart'
import { CadastrosMap } from '../components/map/CadastrosMap'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { buildEvolutionData, buildMapMarkers, buildZonaData, fetchCadastros } from '../lib/cadastros'
import { supabase } from '../lib/supabase'
import { formatCep } from '../lib/format'
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
  const [diretorias, setDiretorias] = useState<Profile[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [loading, setLoading] = useState(true)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cData, dirs, ops, coords, lids] = await Promise.all([
          fetchCadastros({ period }),
          supabase.from('profiles').select('*').eq('role', 'diretoria').order('nome'),
          supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
          supabase.from('coordenadores').select('*'),
          supabase.from('lideres').select('*'),
        ])
        setCadastros(cData)
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
          cep: c.cep ? formatCep(c.cep) : '—',
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
      <div className="dashboard-heading">
        <div>
          <h1>Dashboard Eleitoral · Maranhão</h1>
          <p>Acompanhamento consolidado por diretorias, coordenadores, lideranças e cadastros.</p>
        </div>
        <div className="dashboard-heading-actions">
          <div className="dir-filter-group" role="group" aria-label="Filtro de diretoria">
            <button
              type="button"
              className={`dir-filter-btn${dirFilter === 'all' ? ' active' : ''}`}
              onClick={() => setDirFilter('all')}
            >
              Geral MA
            </button>
            {dirStats.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`dir-filter-btn${dirFilter === d.id ? ' active' : ''}`}
                onClick={() => setDirFilter(d.id)}
              >
                {d.nome}
              </button>
            ))}
          </div>
          <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} />
        </div>
      </div>

      <div className="kpi-grid kpi-grid-3">
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span>Total de Fichadas</span>
            <i className="dot-blue" />
          </div>
          <strong className="tabular-nums">{scopedCadastros.length.toLocaleString('pt-BR')}</strong>
          <p className="dash-kpi-hint">Cadastros no período</p>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span>Cadastros Hoje</span>
            <i className="dot-emerald" />
          </div>
          <strong className="tabular-nums">{todayCount.toLocaleString('pt-BR')}</strong>
          <p className="dash-kpi-hint success">Cadastros registrados hoje</p>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top">
            <span>Zonas Eleitorais</span>
            <i className="dot-amber" />
          </div>
          <strong className="tabular-nums">{zonas} Zonas</strong>
          <p className="dash-kpi-hint">Zonas com registros no período</p>
        </div>
      </div>

      <div className="section-label-row">
        <h2 className="section-label">Diretorias</h2>
        <span className="section-label-hint">Carol e Nicole — visão consolidada só do admin</span>
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
                    <span className={`tone-dot tone-${d.tone}`} />
                    <h2>{d.nome}</h2>
                    <span className={`role-pill tone-${d.tone}`}>Diretora</span>
                    <span className={`status-pill tone-${d.tone}`}>
                      {dirFilter === d.id ? 'Filtro Ativo' : 'Visualizando'}
                    </span>
                  </div>
                </div>
                <div className="diretoria-card-count">
                  <span>Fichadas Confirmadas</span>
                  <strong className={`tabular-nums tone-text-${d.tone}`}>{d.fichadas.toLocaleString('pt-BR')}</strong>
                </div>
              </div>

              <div className="diretoria-card-body">
                <div className="diretoria-mini-grid">
                  <div>
                    <span>Coordenadores</span>
                    <strong className="tabular-nums">{d.coordenadores}</strong>
                  </div>
                  <div>
                    <span className={`tone-text-${d.tone}`}>Líderes</span>
                    <strong className={`tabular-nums tone-text-${d.tone}`}>{d.lideres}</strong>
                  </div>
                  <div>
                    <span>Nerites</span>
                    <strong className="tabular-nums">{d.nerites}</strong>
                  </div>
                </div>
              </div>

              <div className="diretoria-card-foot">
                <span className={`tone-text-${d.tone}`}>Visualizar dados de {d.nome} →</span>
                <Link
                  to="/cadastros"
                  className="diretoria-open-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  Abrir cadastros
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

      <Card
        title="Mapa por zona eleitoral"
        subtitle="Manchas coloridas por intensidade de cadastros"
        className="chart-card"
        style={{ marginBottom: '1.25rem' }}
        action={<Link to="/mapa" className="diretoria-open-link">Abrir mapa completo →</Link>}
      >
        <CadastrosMap markers={mapMarkers} height={380} />
      </Card>

      <div className="dashboard-main-grid">
        <Card title="Evolução dos cadastros" subtitle="Últimos registros do período" className="chart-card chart-card-wide">
          {evolution.length ? (
            <EvolutionChart data={evolution} />
          ) : (
            <div className="empty-card">
              <strong>Sem dados no período</strong>
              <span>A curva aparece quando os primeiros cadastros forem registrados.</span>
            </div>
          )}
        </Card>
        <Card title="Distribuição por zona" subtitle="Participação de cada zona" className="chart-card">
          {zonaData.length ? (
            <ZonaDonutChart data={zonaData} />
          ) : (
            <div className="empty-card">
              <strong>Nenhuma zona com registros</strong>
              <span>A distribuição é calculada a partir dos cadastros.</span>
            </div>
          )}
        </Card>
      </div>

      <div className="dashboard-analysis-grid">
        <Card title="Top nerites" subtitle="Cadastros no período" className="analysis-card">
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
              <span>O ranking aparece quando as nerites começarem a cadastrar.</span>
            </div>
          )}
        </Card>

        <Card title="Atividade recente" subtitle="Últimos cadastros" className="analysis-card">
          {ultimos.length ? (
            <div className="recent-list">
              {ultimos.map((item) => (
                <div className="recent-row" key={item.id}>
                  <div>
                    <strong>{item.nome}</strong>
                    <span>
                      {item.nerite}
                      {item.dir ? ` · ${item.dir}` : ''}
                      {' · CEP '}
                      {item.cep}
                    </span>
                  </div>
                  <time>{item.data}</time>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <strong>Nenhum cadastro registrado</strong>
              <span>Os últimos registros aparecem aqui.</span>
            </div>
          )}
        </Card>

        <Card title="Resumo da equipe" subtitle="Visão rápida" className="analysis-card">
          <div className="situacao-list">
            <div className="situacao-row situacao-success">
              <div className="situacao-icon"><Users size={17} /></div>
              <span>Nerites</span>
              <strong>{scopedNerites.length}</strong>
            </div>
            <div className="situacao-row situacao-neutral">
              <div className="situacao-icon"><ClipboardList size={17} /></div>
              <span>Fichadas</span>
              <strong>{scopedCadastros.length}</strong>
            </div>
            <div className="situacao-row situacao-warning">
              <div className="situacao-icon"><MapPin size={17} /></div>
              <span>Zonas</span>
              <strong>{zonas}</strong>
            </div>
          </div>
          <p style={{ marginTop: '0.85rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
            Olá, {profile?.nome ?? 'Administrador'} — apenas o admin vê o consolidado das duas diretorias.
          </p>
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
                <span className="tone-dot tone-blue" />
                <h2>{profile?.nome}</h2>
                <span className="role-pill tone-blue">Diretora</span>
                <span className="status-pill tone-blue">Sua diretoria</span>
              </div>
              <p>Painel exclusivo da diretoria</p>
            </div>
            <div className="diretoria-card-count">
              <span>Fichadas Confirmadas</span>
              <strong className="tabular-nums tone-text-blue">{cadastros.length.toLocaleString('pt-BR')}</strong>
            </div>
          </div>
          <div className="diretoria-card-body">
            <div className="diretoria-mini-grid">
              <div>
                <span>Coordenadores</span>
                <strong className="tabular-nums">{coordenadores.length}</strong>
              </div>
              <div>
                <span className="tone-text-blue">Líderes</span>
                <strong className="tabular-nums tone-text-blue">{lideres.length}</strong>
              </div>
              <div>
                <span>Nerites</span>
                <strong className="tabular-nums">{nerites.length}</strong>
              </div>
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
          <div className="dash-kpi-top"><span>Cadastros hoje</span><i className="dot-emerald" /></div>
          <strong className="tabular-nums">{todayCount}</strong>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top"><span>Zonas</span><i className="dot-amber" /></div>
          <strong className="tabular-nums">{zonas}</strong>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-top"><span>Nerites ativas</span><i className="dot-blue" /></div>
          <strong className="tabular-nums">{nerites.filter((n) => n.ativo).length}</strong>
        </div>
      </div>

      <Card
        title="Mapa por zona eleitoral"
        subtitle="Manchas coloridas por intensidade de cadastros"
        className="chart-card"
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
