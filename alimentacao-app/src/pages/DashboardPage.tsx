import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MapPin,
  FileText,
  Sun,
  Network,
  TrendingUp,
  Share2,
  Map as MapIcon,
  BarChart3,
  Award,
  Clock,
  Mountain,
} from 'lucide-react'
import { format, parseISO, startOfDay, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { Spinner } from '../components/ui/Spinner'
import { MetaGoalPopup } from '../components/ui/MetaGoalPopup'
import { EvolutionChart } from '../components/charts/EvolutionChart'
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

type MobilizacaoSource = Pick<Cadastro,
  'operator_id' | 'diretoria_id' | 'carros_adesivados' | 'adesivos_casa' | 'postagens'
>

interface MobilizacaoTotals {
  carros: number
  casa: number
  postagens: number
  pendentes: number
  fichas: number
  equipe: number
}

function sumMobilizacao(
  cadastros: MobilizacaoSource[],
  coordenadores: Coordenador[],
  lideres: Lider[],
): MobilizacaoTotals {
  const rows = [...cadastros, ...coordenadores, ...lideres]
  const totals = rows.reduce<MobilizacaoTotals>((acc, row) => {
    const carros = Number(row.carros_adesivados) || 0
    const casa = Number(row.adesivos_casa) || 0
    const postagens = Number(row.postagens) || 0
    acc.carros += carros
    acc.casa += casa
    acc.postagens += postagens
    if (carros === 0 && casa === 0 && postagens === 0) acc.pendentes += 1
    return acc
  }, { carros: 0, casa: 0, postagens: 0, pendentes: 0, fichas: cadastros.length, equipe: coordenadores.length + lideres.length })
  return totals
}

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
  const [mobilizacaoCadastros, setMobilizacaoCadastros] = useState<MobilizacaoSource[]>([])
  const [totalFichas, setTotalFichas] = useState(0)
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
        const [cData, totalRes, mobCadastros, dirs, ops, coords, lids] = await Promise.all([
          fetchCadastros({ period }),
          supabase.from('cadastros').select('*', { count: 'exact', head: true }),
          fetchCadastros(),
          supabase.from('profiles').select('*').eq('role', 'diretoria').order('nome'),
          supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
          supabase.from('coordenadores').select('*'),
          supabase.from('lideres').select('*'),
        ])
        setCadastros(cData)
        setMobilizacaoCadastros(mobCadastros)
        setTotalFichas(totalRes.count ?? 0)
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

  const mobilizacaoTotals = useMemo(() => {
    if (dirFilter === 'all') return sumMobilizacao(mobilizacaoCadastros, coordenadores, lideres)
    const teamIds = new Set(nerites.filter((n) => n.diretoria_id === dirFilter).map((n) => n.id))
    return sumMobilizacao(
      mobilizacaoCadastros.filter((c) => c.diretoria_id === dirFilter || teamIds.has(c.operator_id)),
      coordenadores.filter((c) => c.diretoria_id === dirFilter),
      lideres.filter((l) => l.diretoria_id === dirFilter),
    )
  }, [mobilizacaoCadastros, coordenadores, lideres, nerites, dirFilter])

  const fichasSemDiretoria = useMemo(() => {
    const teamIds = new Set(nerites.map((n) => n.id))
    return cadastros.filter((c) => !c.diretoria_id && !teamIds.has(c.operator_id)).length
  }, [cadastros, nerites])

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
      const nome = (c.lider ?? '').trim()
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
          lider: (c.lider ?? '').trim() || '—',
          data: formatShortDateTime(c.created_at),
          dir: diretorias.find((d) => d.id === (c.diretoria_id || neriteById.get(c.operator_id)?.diretoria_id))?.nome,
        })),
    [scopedCadastros, neriteById, diretorias],
  )

  const evolution = useMemo(() => buildEvolutionData(scopedCadastros), [scopedCadastros])
  const zonaData = useMemo(() => buildZonaData(scopedCadastros), [scopedCadastros])
  const mapMarkers = useMemo(() => buildMapMarkers(scopedCadastros), [scopedCadastros])
  const maxRank = ranking[0]?.total || 1

  const periodLabel = useMemo(() => {
    const map: Record<PeriodPreset, string> = {
      '7d': 'últimos 7 dias',
      '30d': 'últimos 30 dias',
      '90d': 'últimos 90 dias',
      all: 'todo o período',
    }
    return map[periodPreset]
  }, [periodPreset])

  const escopoNome = useMemo(() => {
    if (dirFilter === 'all') return 'Geral'
    return dirStats.find((d) => d.id === dirFilter)?.nome ?? 'Diretoria'
  }, [dirFilter, dirStats])

  const escopoCurto = dirFilter === 'all' ? 'todas as diretorias' : escopoNome

  const atualizadoEm = useMemo(() => {
    const latest = [...scopedCadastros].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (!latest) return 'sem lançamentos'
    try {
      return `atualizado ${format(parseISO(latest.created_at), "dd/MM 'às' HH:mm")}`
    } catch {
      return '—'
    }
  }, [scopedCadastros])

  const ultimoLancamento = useMemo(() => {
    const latest = [...scopedCadastros].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (!latest) return 'sem lançamentos'
    try {
      return `último lançamento ${format(parseISO(latest.created_at), "dd/MM, HH:mm")}`
    } catch {
      return '—'
    }
  }, [scopedCadastros])

  const topSecoes = useMemo(() => {
    const map = new Map<string, number>()
    scopedCadastros.forEach((c) => {
      const s = (c.secao ?? '').trim()
      if (!s) return
      map.set(s, (map.get(s) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .map(([n, v]) => ({ n, v }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 5)
  }, [scopedCadastros])

  const diasAtivos = useMemo(() => {
    const days = new Set(evolution.filter((e) => e.total > 0).map((e) => e.date))
    const totalDays = periodPreset === '7d' ? 7 : periodPreset === '30d' ? 30 : periodPreset === '90d' ? 90 : Math.max(days.size, 1)
    return `${days.size}/${periodPreset === 'all' ? Math.max(days.size, 1) : totalDays}`
  }, [evolution, periodPreset])

  const melhorDia = useMemo(() => {
    if (!evolution.length) return '—'
    const best = [...evolution].sort((a, b) => b.total - a.total)[0]
    if (!best || best.total <= 0) return '—'
    try {
      return format(parseISO(best.date), 'dd/MM')
    } catch {
      return best.date
    }
  }, [evolution])

  const evoVisual = useMemo(() => {
    const dayCount = periodPreset === '7d' ? 7 : 14
    const byDay = new Map(evolution.map((e) => [e.date, e.total]))
    const bars = Array.from({ length: dayCount }, (_, i) => {
      const date = format(subDays(new Date(), dayCount - 1 - i), 'dd/MM')
      return { date, total: byDay.get(date) ?? 0 }
    })
    const maxVal = Math.max(...bars.map((b) => b.total), 1)
    const yMax = Math.max(10, Math.ceil(maxVal / 10) * 10)
    const eixoY = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0]
    const peak = bars.reduce((m, b) => (b.total > m.total ? b : m), { date: '', total: -1 })
    return {
      eixoY,
      bars: bars.map((b) => ({
        label: b.date.slice(0, 2),
        valor: b.total,
        h: `${Math.max(3, Math.round((b.total / yMax) * 100))}%`,
        active: b.total > 0 && b.date === peak.date,
      })),
      nota: bars.some((b) => b.total > 0)
        ? `Coleta no período: pico de ${peak.total.toLocaleString('pt-BR')} em ${peak.date}.`
        : 'Nenhuma ficha lançada neste período.',
    }
  }, [evolution, periodPreset])

  const mobBase = mobilizacaoTotals.fichas + mobilizacaoTotals.equipe
  const mobComLancamento = Math.max(0, mobBase - mobilizacaoTotals.pendentes)
  const coberturaPct = mobBase > 0 ? Math.round((mobComLancamento / mobBase) * 100) : 0
  const filtroAtivo = dirFilter !== 'all'
  const dirQuery = filtroAtivo ? `?diretoria=${dirFilter}` : ''
  const dirQueryAmp = filtroAtivo ? `&diretoria=${dirFilter}` : ''
  const totalSistemaFichas = Math.max(totalFichas, 1)
  const pctLabel = `${goal.pct.toFixed(1).replace('.', ',')}%`

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div className="nv-dash">
      <MetaGoalPopup
        open={metaPopupOpen}
        atual={totalFichas}
        meta={meta}
        onClose={closeMetaPopup}
      />

      <div className="nv-heading">
        <div>
          <p className="nv-eyebrow">Painel administrativo</p>
          <h1>Visão geral</h1>
          <p className="nv-sub">
            Exibindo <strong>{escopoNome}</strong> · {periodLabel} · {atualizadoEm}
          </p>
        </div>
        <div className="nv-heading-actions">
          <div className="nv-tabs" role="group" aria-label="Filtro de diretoria">
            <button
              type="button"
              className={`nv-tab${dirFilter === 'all' ? ' active' : ''}`}
              onClick={() => setDirFilter('all')}
            >
              Geral
            </button>
            {dirStats.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`nv-tab${dirFilter === d.id ? ' active' : ''}`}
                onClick={() => setDirFilter(d.id)}
              >
                {d.nome.replace(/^Diretora\s+/i, '')}
              </button>
            ))}
          </div>
          <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} showRange={false} />
        </div>
      </div>

      {filtroAtivo && (
        <div className="nv-filter-banner">
          <span>
            Painel filtrado pela <strong>{escopoNome}</strong> — fichas, mobilização, mapa e rankings
            consideram só essa equipe. A meta segue global.
          </span>
          <button type="button" onClick={() => setDirFilter('all')}>Limpar filtro</button>
        </div>
      )}

      <section className="nv-summary" aria-label="Resumo geral">
        <div className="nv-summary-meta">
          <div className="nv-summary-meta-head">
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
              Meta de fichas · global
            </span>
            <Link to="/configuracoes">Configurar</Link>
          </div>
          <div className="nv-summary-meta-value">
            <strong className="tabular-nums">{goal.atual.toLocaleString('pt-BR')}</strong>
            <span>de {goal.meta.toLocaleString('pt-BR')}</span>
            <em>{pctLabel}</em>
          </div>
          <div className="nv-bar" role="progressbar" aria-valuenow={goal.pct} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${Math.max(goal.pct, goal.batida ? 100 : 0.6)}%` }} />
          </div>
          <div className="nv-summary-meta-foot">
            <span>
              {goal.batida ? 'Meta alcançada' : `${goal.restante.toLocaleString('pt-BR')} fichas restantes`}
            </span>
            <span>total de fichas no sistema</span>
          </div>
        </div>
        <div className="nv-summary-metric">
          <span><FileText size={14} strokeWidth={1.6} aria-hidden />Fichas no período</span>
          <strong className="tabular-nums">{scopedCadastros.length.toLocaleString('pt-BR')}</strong>
          <em>{escopoCurto} · {periodLabel}</em>
        </div>
        <div className="nv-summary-metric">
          <span><Sun size={14} strokeWidth={1.6} aria-hidden />Cadastradas hoje</span>
          <strong className="tabular-nums">{todayCount.toLocaleString('pt-BR')}</strong>
          <em>{ultimoLancamento}</em>
        </div>
        <div className="nv-summary-metric">
          <span><MapPin size={14} strokeWidth={1.6} aria-hidden />Zonas alcançadas</span>
          <strong className="tabular-nums">{zonas}</strong>
          <em>
            {zonas
              ? `${zonas} ${zonas === 1 ? 'zona' : 'zonas'} no filtro`
              : 'nenhuma zona no filtro'}
          </em>
        </div>
      </section>

      <section>
        <div className="nv-section-head">
          <div>
            <h2 className="nv-section-title">
              <Network size={16} strokeWidth={1.6} aria-hidden />
              Diretorias
            </h2>
            <p>Clique no card para filtrar o painel inteiro · clique de novo para voltar a Geral</p>
          </div>
          {fichasSemDiretoria > 0 && (
            <span className="nv-section-hint">
              {fichasSemDiretoria} {fichasSemDiretoria === 1 ? 'ficha' : 'fichas'} sem diretoria
            </span>
          )}
        </div>
        <div className="nv-dir-grid">
          {dirStats.map((d) => {
            const ativo = dirFilter === d.id
            const share = Math.round((d.fichadas / totalSistemaFichas) * 100)
            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                className={`nv-dir-card${ativo ? ' active' : ''}`}
                onClick={() => setDirFilter(ativo ? 'all' : d.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setDirFilter(ativo ? 'all' : d.id)
                  }
                }}
              >
                <div className="nv-dir-card-top">
                  <span className={`nv-dir-avatar tone-${d.tone}${ativo ? ' on' : ''}`}>
                    {initials(d.nome)}
                  </span>
                  <div className="nv-dir-card-copy">
                    <div className="nv-dir-card-name">
                      <span>{d.nome}</span>
                      {ativo && <em>filtrando</em>}
                    </div>
                    <p>
                      {d.fichadas > 0
                        ? `${share}% das fichas do sistema`
                        : 'sem fichas lançadas'}
                    </p>
                  </div>
                  <div className="nv-dir-card-count">
                    <strong className={`tabular-nums${d.fichadas === 0 ? ' is-zero' : ''}`}>
                      {d.fichadas.toLocaleString('pt-BR')}
                    </strong>
                    <span>fichas</span>
                  </div>
                </div>
                <div className="nv-bar thin">
                  <i style={{ width: `${Math.min(100, share)}%` }} />
                </div>
                <div className="nv-dir-minis">
                  <Link to={`/equipe?tab=coordenadores&diretoria=${d.id}`} onClick={(e) => e.stopPropagation()}>
                    <span>Coord.</span>
                    <strong className="tabular-nums">{d.coordenadores}</strong>
                  </Link>
                  <Link to={`/equipe?tab=lideres&diretoria=${d.id}`} onClick={(e) => e.stopPropagation()}>
                    <span>Lideranças</span>
                    <strong className="tabular-nums">{d.lideres}</strong>
                  </Link>
                  <Link to={`/equipe?tab=nerites&diretoria=${d.id}`} onClick={(e) => e.stopPropagation()}>
                    <span>Nerites</span>
                    <strong className="tabular-nums">{d.nerites}</strong>
                  </Link>
                </div>
                <div className="nv-dir-foot">
                  <span>{ativo ? 'filtro ativo — clique para remover' : 'clique para filtrar o painel'}</span>
                  <Link to={`/cadastros?diretoria=${d.id}`} onClick={(e) => e.stopPropagation()}>
                    Abrir fichas →
                  </Link>
                </div>
              </div>
            )
          })}
          {!dirStats.length && (
            <div className="nv-empty">Nenhuma diretoria cadastrada.</div>
          )}
        </div>
      </section>

      <section className="nv-split">
        <div className="nv-panel">
          <div className="nv-panel-head">
            <div>
              <h2><TrendingUp size={16} strokeWidth={1.6} aria-hidden />Evolução de cadastros</h2>
              <p>{escopoCurto} · {periodLabel}</p>
            </div>
            <div className="nv-panel-stats">
              <div>
                <span>Total</span>
                <strong className="tabular-nums">{scopedCadastros.length.toLocaleString('pt-BR')}</strong>
              </div>
              <div>
                <span>Dias ativos</span>
                <strong className="tabular-nums">{diasAtivos}</strong>
              </div>
              <div>
                <span>Melhor dia</span>
                <strong className="tabular-nums">{melhorDia}</strong>
              </div>
            </div>
          </div>
          <div className="nv-panel-body" style={{ padding: 0 }}>
            {evoVisual.bars.length ? (
              <>
                <div className="nv-evo">
                  <div className="nv-evo-y">
                    {evoVisual.eixoY.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                  <div className="nv-evo-chart">
                    <div className="nv-evo-bars">
                      {evoVisual.bars.map((b, i) => (
                        <div className="nv-evo-col" key={`${b.label}-${i}`}>
                          <div
                            className={`nv-evo-bar${b.active ? ' active' : ''}`}
                            style={{ height: b.active || b.valor > 0 ? b.h : '3px' }}
                          >
                            {b.active && <div className="nv-evo-tip">{b.valor}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="nv-evo-labels">
                      {evoVisual.bars.map((b, i) => (
                        <span key={`${b.label}-l-${i}`} className={b.active ? 'on' : undefined}>
                          {b.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="nv-evo-note">{evoVisual.nota}</div>
              </>
            ) : (
              <div className="nv-empty">Nenhuma ficha lançada neste período.</div>
            )}
          </div>
        </div>

        <div className="nv-panel">
          <div className="nv-panel-head">
            <div>
              <h2><Share2 size={16} strokeWidth={1.6} aria-hidden />Mobilização</h2>
              <p>
                {(mobilizacaoTotals.fichas + mobilizacaoTotals.equipe).toLocaleString('pt-BR')} pessoas no escopo · sem corte de período
              </p>
            </div>
            <Link to={`/mobilizacao${dirQuery}`}>Gerenciar →</Link>
          </div>
          <div className="nv-mob-list">
            {([
              ['Carros adesivados', mobilizacaoTotals.carros, 'carros', false],
              ['Adesivos para casa', mobilizacaoTotals.casa, 'casa', false],
              ['Postagens', mobilizacaoTotals.postagens, 'postagens', false],
              ['Sem lançamento', mobilizacaoTotals.pendentes, 'pendente', true],
            ] as const).map(([label, value, status, pendente]) => (
              <Link
                key={status}
                to={`/mobilizacao?status=${status}${dirQueryAmp}`}
                className="nv-mob-row"
              >
                <span>{label}</span>
                <span className="nv-mob-row-right">
                  {pendente && <em className="nv-pill-warn">pendente</em>}
                  <strong className="tabular-nums">{value.toLocaleString('pt-BR')}</strong>
                </span>
              </Link>
            ))}
          </div>
          <div className="nv-cover">
            <div className="nv-cover-labels">
              <span>Cobertura de mobilização</span>
              <span>
                {mobComLancamento.toLocaleString('pt-BR')} de {mobBase.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="nv-bar amber">
              <i style={{ width: `${Math.max(coberturaPct, mobComLancamento > 0 ? 2 : 0)}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="nv-split">
        <div className="nv-panel">
          <div className="nv-panel-head">
            <div>
              <h2><MapIcon size={16} strokeWidth={1.6} aria-hidden />Mapa por zona eleitoral</h2>
              <p>Intensidade pelas fichas do filtro atual</p>
            </div>
            <Link to={`/mapa${dirQuery}`}>Mapa completo →</Link>
          </div>
          <div className="nv-map-wrap">
            <CadastrosMap markers={mapMarkers} height={320} showLegend={false} />
            <div className="nv-map-legend" aria-hidden>
              <div className="nv-map-legend-title">Intensidade</div>
              <div className="nv-map-legend-row">
                <span className="nv-map-legend-swatch" style={{ background: '#7fd8c4' }} /> Baixa
              </div>
              <div className="nv-map-legend-row">
                <span className="nv-map-legend-swatch" style={{ background: '#f2d264' }} /> Média
              </div>
              <div className="nv-map-legend-row">
                <span className="nv-map-legend-swatch" style={{ background: '#f0a355' }} /> Alta
              </div>
              <div className="nv-map-legend-row">
                <span className="nv-map-legend-swatch" style={{ background: '#e2614f' }} /> Muito alta
              </div>
            </div>
          </div>
        </div>

        <div className="nv-panel">
          <div className="nv-panel-head">
            <div>
              <h2><BarChart3 size={16} strokeWidth={1.6} aria-hidden />Distribuição por zona</h2>
              <p>
                {scopedCadastros.length
                  ? `${scopedCadastros.length.toLocaleString('pt-BR')} fichas em ${zonas} ${zonas === 1 ? 'zona' : 'zonas'}`
                  : 'nenhuma ficha no filtro'}
              </p>
            </div>
          </div>
          {zonaData.length ? (
            <div className="nv-panel-body nv-zona-list">
              {zonaData.slice(0, 4).map((z) => {
                const pct = scopedCadastros.length
                  ? Math.round((z.value / scopedCadastros.length) * 100)
                  : 0
                const zonaLabel = z.name.replace(/^Zona eleitoral\s+/i, '')
                return (
                  <div key={z.name} className="nv-zona-row">
                    <div className="nv-zona-row-top">
                      <span>Zona eleitoral {zonaLabel}</span>
                      <span className="tabular-nums">{z.value} · {pct}%</span>
                    </div>
                    <div className="nv-bar thin"><i style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
              {topSecoes.length > 0 && (
                <div className="nv-secoes">
                  <div className="nv-secoes-label">Seções mais ativas</div>
                  {topSecoes.map((s) => (
                    <Link
                      key={s.n}
                      to={`/cadastros?secao=${encodeURIComponent(s.n)}${dirQueryAmp}`}
                      className="nv-secao-row"
                    >
                      <span>Seção {s.n}</span>
                      <span className="tabular-nums">{s.v}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="nv-empty">Nenhuma ficha neste filtro — sem zonas para exibir.</div>
          )}
        </div>
      </section>

      <section>
        <div className="nv-section-head">
          <div>
            <h2 className="nv-section-title">Desempenho</h2>
            <p>Ranking de nerites e lideranças · últimas fichas do filtro</p>
          </div>
        </div>
        <div className="nv-desempenho-grid">
          <div className="nv-panel">
            <div className="nv-panel-head">
              <div>
                <h3><Award size={16} strokeWidth={1.6} aria-hidden />Top nerites</h3>
                <p>Com fichas no filtro atual</p>
              </div>
              <Link to="/nerites">Ver tudo →</Link>
            </div>
            {ranking.length ? (
              <div className="nv-rank-list">
                {ranking.map((nerite, index) => (
                  <Link to={`/nerites/${nerite.id}`} className="nv-rank-row" key={nerite.id}>
                    <span className={`nv-rank-pos${index === 0 ? ' top' : ''}`}>{index + 1}</span>
                    <div className="nv-rank-body">
                      <div className="nv-rank-meta">
                        <span>{nerite.nome}</span>
                        <strong className="tabular-nums">{nerite.total}</strong>
                      </div>
                      <div className="nv-bar thin">
                        <i style={{ width: `${Math.max((nerite.total / maxRank) * 100, 4)}%` }} />
                      </div>
                    </div>
                  </Link>
                ))}
                <div className="nv-panel-note">
                  {ranking.length} {ranking.length === 1 ? 'nerite' : 'nerites'} no ranking ·{' '}
                  {scopedCadastros.length.toLocaleString('pt-BR')} fichas no filtro
                </div>
              </div>
            ) : (
              <div className="nv-empty">Nenhuma nerite com lançamentos neste filtro.</div>
            )}
          </div>

          <div className="nv-panel">
            <div className="nv-panel-head">
              <div>
                <h3><Clock size={16} strokeWidth={1.6} aria-hidden />Atividade recente</h3>
                <p>Últimas 6 fichas do filtro</p>
              </div>
            </div>
            {ultimos.length ? (
              <div className="nv-activity-list">
                {ultimos.map((item) => (
                  <div className="nv-activity-row" key={item.id}>
                    <div>
                      <strong>{item.nome}</strong>
                      <span>
                        Zona {item.zona} · Seção {item.secao}
                        {item.lider !== '—' ? ` · ${item.lider}` : ''}
                      </span>
                    </div>
                    <time className="nv-activity-time">{item.data}</time>
                  </div>
                ))}
              </div>
            ) : (
              <div className="nv-empty">Sem fichas registradas neste filtro.</div>
            )}
          </div>

          <div className="nv-panel">
            <div className="nv-panel-head">
              <div>
                <h3><Mountain size={16} strokeWidth={1.6} aria-hidden />Top lideranças</h3>
                <p>
                  {scopedCadastros.length
                    ? `Top 5 nas ${scopedCadastros.length.toLocaleString('pt-BR')} fichas`
                    : 'sem fichas no filtro'}
                </p>
              </div>
              <Link to="/lideranca">Ver tudo →</Link>
            </div>
            {topLideres.length ? (
              <div className="nv-rank-list">
                {topLideres.map((lider, index) => (
                  <Link
                    to={`/cadastros?lider=${encodeURIComponent(lider.nome)}${dirQueryAmp}`}
                    className="nv-rank-row"
                    key={lider.nome}
                  >
                    <span className={`nv-rank-pos${index === 0 ? ' top' : ''}`}>{index + 1}</span>
                    <div className="nv-rank-body">
                      <div className="nv-rank-meta">
                        <span>{lider.nome}</span>
                        <strong className="tabular-nums">
                          {lider.total} <em>{lider.share}%</em>
                        </strong>
                      </div>
                      <div className="nv-bar thin">
                        <i style={{ width: `${Math.max((lider.total / maxLider) * 100, 4)}%` }} />
                      </div>
                    </div>
                  </Link>
                ))}
                <div className="nv-panel-note">
                  Concentração nas {topLideres.length} maiores lideranças do filtro
                </div>
              </div>
            ) : (
              <div className="nv-empty">Sem lideranças com fichas neste filtro.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function DiretoriaDashboard() {
  const { profile } = useAuth()
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d')
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [mobilizacaoCadastros, setMobilizacaoCadastros] = useState<MobilizacaoSource[]>([])
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
        const [cData, allCadastros, ops, coords, lids] = await Promise.all([
          fetchCadastros({ period }),
          fetchCadastros(),
          supabase.from('profiles').select('*').eq('role', 'operador').eq('diretoria_id', dirId).order('nome'),
          supabase.from('coordenadores').select('*').eq('diretoria_id', dirId),
          supabase.from('lideres').select('*').eq('diretoria_id', dirId),
        ])
        const teamIds = new Set((ops.data ?? []).map((n: Profile) => n.id))
        setCadastros(
          cData.filter((c) => c.diretoria_id === dirId || teamIds.has(c.operator_id)),
        )
        setMobilizacaoCadastros(
          allCadastros.filter(
            (c) => c.diretoria_id === dirId || teamIds.has(c.operator_id),
          ),
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
  const mobilizacaoTotals = useMemo(
    () => sumMobilizacao(mobilizacaoCadastros, coordenadores, lideres),
    [mobilizacaoCadastros, coordenadores, lideres],
  )

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

  const periodLabel =
    periodPreset === '7d' ? 'últimos 7 dias'
      : periodPreset === '30d' ? 'últimos 30 dias'
        : periodPreset === '90d' ? 'últimos 90 dias'
          : 'todo o período'

  const mobBase = mobilizacaoTotals.fichas + mobilizacaoTotals.equipe
  const mobComLancamento = Math.max(0, mobBase - mobilizacaoTotals.pendentes)
  const coberturaPct = mobBase > 0 ? Math.round((mobComLancamento / mobBase) * 100) : 0
  const dirNome = profile?.nome?.replace(/^Diretora\s+/i, '') ?? 'Diretoria'
  const setupMissing = !coordenadores.length || !lideres.length

  return (
    <div className="nv-dash">
      <div className="nv-heading">
        <div>
          <p className="nv-eyebrow">Painel da diretoria</p>
          <h1>{dirNome}</h1>
          <p className="nv-sub">
            Resultados da sua equipe · <strong>{periodLabel}</strong>
          </p>
        </div>
        <div className="nv-heading-actions">
          <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} showRange={false} />
        </div>
      </div>

      {setupMissing && (
        <div className="nv-filter-banner">
          <span>
            <strong>Atenção</strong> —{' '}
            {!coordenadores.length && !lideres.length
              ? 'cadastre coordenadores e lideranças para as nerites preencherem a ficha.'
              : !coordenadores.length
                ? 'ainda falta cadastrar coordenadores.'
                : 'ainda falta cadastrar lideranças.'}
          </span>
        </div>
      )}

      <section className="nv-summary" aria-label="Resumo da diretoria">
        <div className="nv-summary-meta">
          <div className="nv-summary-meta-head">
            <span>Fichas no período</span>
            <Link to="/cadastros">Ver fichas</Link>
          </div>
          <div className="nv-summary-meta-value">
            <strong className="tabular-nums">{cadastros.length.toLocaleString('pt-BR')}</strong>
            <span>confirmadas</span>
          </div>
          <div className="nv-summary-meta-foot">
            <span>{todayCount.toLocaleString('pt-BR')} hoje</span>
            <span>{periodLabel}</span>
          </div>
        </div>
        <div className="nv-summary-metric">
          <span>Cadastros hoje</span>
          <strong className="tabular-nums">{todayCount.toLocaleString('pt-BR')}</strong>
          <em>lançamentos do dia</em>
        </div>
        <div className="nv-summary-metric">
          <span>Zonas</span>
          <strong className="tabular-nums">{zonas}</strong>
          <em>com fichas no período</em>
        </div>
        <div className="nv-summary-metric">
          <span>Nerites ativas</span>
          <strong className="tabular-nums">{nerites.filter((n) => n.ativo).length}</strong>
          <em>{nerites.length} na diretoria</em>
        </div>
      </section>

      <section>
        <div className="nv-section-head">
          <div>
            <h2 className="nv-section-title">
              <Network size={16} strokeWidth={1.6} aria-hidden />
              Sua equipe
            </h2>
            <p>Nomes que as nerites selecionam na ficha · gerencie em Equipe</p>
          </div>
          <Link to="/equipe" className="nv-section-hint" style={{ color: '#1f4fd8', fontWeight: 600 }}>
            Gerenciar equipe →
          </Link>
        </div>
        <div className="nv-dir-grid">
          <div className="nv-dir-card active" style={{ cursor: 'default' }}>
            <div className="nv-dir-card-top">
              <span className="nv-dir-avatar on">
                {initials(
                  /^diretora/i.test(profile?.nome ?? '')
                    ? (profile?.nome ?? 'D')
                    : `Diretora ${profile?.nome ?? 'D'}`,
                )}
              </span>
              <div className="nv-dir-card-copy">
                <div className="nv-dir-card-name">
                  <span>{profile?.nome}</span>
                  <em>sua diretoria</em>
                </div>
                <p>Painel da equipe</p>
              </div>
              <div className="nv-dir-card-count">
                <strong className="tabular-nums">{cadastros.length.toLocaleString('pt-BR')}</strong>
                <span>fichas</span>
              </div>
            </div>
            <div className="nv-dir-minis">
              <Link to="/equipe?tab=coordenadores">
                <span>Coord.</span>
                <strong className="tabular-nums">{coordenadores.length}</strong>
              </Link>
              <Link to="/equipe?tab=lideres">
                <span>Lideranças</span>
                <strong className="tabular-nums">{lideres.length}</strong>
              </Link>
              <Link to="/equipe?tab=nerites">
                <span>Nerites</span>
                <strong className="tabular-nums">{nerites.length}</strong>
              </Link>
            </div>
            <div className="nv-dir-foot">
              <span>Clique nos números para cadastrar ou editar</span>
              <Link to="/cadastros">Abrir fichas →</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="nv-split">
        <div className="nv-panel">
          <div className="nv-panel-head">
            <div>
              <h2><TrendingUp size={16} strokeWidth={1.6} aria-hidden />Evolução de cadastros</h2>
              <p>Sua diretoria · {periodLabel}</p>
            </div>
            <div className="nv-panel-stats">
              <div>
                <span>Total</span>
                <strong className="tabular-nums">{cadastros.length.toLocaleString('pt-BR')}</strong>
              </div>
            </div>
          </div>
          <div className="nv-panel-body">
            {evolution.length ? (
              <EvolutionChart data={evolution} />
            ) : (
              <div className="nv-empty">Nenhuma ficha lançada neste período.</div>
            )}
          </div>
        </div>

        <div className="nv-panel">
          <div className="nv-panel-head">
            <div>
              <h2><Share2 size={16} strokeWidth={1.6} aria-hidden />Mobilização</h2>
              <p>
                {mobBase.toLocaleString('pt-BR')} pessoas no escopo · sem corte de período
              </p>
            </div>
            <Link to="/mobilizacao">Gerenciar →</Link>
          </div>
          <div className="nv-mob-list">
            {([
              ['Carros adesivados', mobilizacaoTotals.carros, 'carros', false],
              ['Adesivos para casa', mobilizacaoTotals.casa, 'casa', false],
              ['Postagens', mobilizacaoTotals.postagens, 'postagens', false],
              ['Sem lançamento', mobilizacaoTotals.pendentes, 'pendente', true],
            ] as const).map(([label, value, status, pendente]) => (
              <Link key={status} to={`/mobilizacao?status=${status}`} className="nv-mob-row">
                <span>{label}</span>
                <span className="nv-mob-row-right">
                  {pendente && <em className="nv-pill-warn">pendente</em>}
                  <strong className="tabular-nums">{value.toLocaleString('pt-BR')}</strong>
                </span>
              </Link>
            ))}
          </div>
          <div className="nv-cover">
            <div className="nv-cover-labels">
              <span>Cobertura de mobilização</span>
              <span>
                {mobComLancamento.toLocaleString('pt-BR')} de {mobBase.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="nv-bar amber">
              <i style={{ width: `${Math.max(coberturaPct, mobComLancamento > 0 ? 2 : 0)}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="nv-split">
        <div className="nv-panel">
          <div className="nv-panel-head">
            <div>
              <h2><MapIcon size={16} strokeWidth={1.6} aria-hidden />Mapa por zona eleitoral</h2>
              <p>Intensidade pelas fichas do período</p>
            </div>
            <Link to="/mapa">Mapa completo →</Link>
          </div>
          <div className="nv-map-wrap">
            <CadastrosMap markers={mapMarkers} height={320} showLegend={false} />
            <div className="nv-map-legend" aria-hidden>
              <div className="nv-map-legend-title">Intensidade</div>
              <div className="nv-map-legend-row">
                <span className="nv-map-legend-swatch" style={{ background: '#7fd8c4' }} /> Baixa
              </div>
              <div className="nv-map-legend-row">
                <span className="nv-map-legend-swatch" style={{ background: '#f2d264' }} /> Média
              </div>
              <div className="nv-map-legend-row">
                <span className="nv-map-legend-swatch" style={{ background: '#f0a355' }} /> Alta
              </div>
              <div className="nv-map-legend-row">
                <span className="nv-map-legend-swatch" style={{ background: '#e2614f' }} /> Muito alta
              </div>
            </div>
          </div>
        </div>

        <div className="nv-panel">
          <div className="nv-panel-head">
            <div>
              <h2><Award size={16} strokeWidth={1.6} aria-hidden />Top nerites</h2>
              <p>Com fichas no período</p>
            </div>
            <Link to="/equipe?tab=nerites">Ver tudo →</Link>
          </div>
          {ranking.length ? (
            <div className="nv-rank-list">
              {ranking.map((n, i) => (
                <Link to={`/nerites/${n.id}`} className="nv-rank-row" key={n.id}>
                  <span className={`nv-rank-pos${i === 0 ? ' top' : ''}`}>{i + 1}</span>
                  <div className="nv-rank-body">
                    <div className="nv-rank-meta">
                      <span>{n.nome}</span>
                      <strong className="tabular-nums">{n.total}</strong>
                    </div>
                    <div className="nv-bar thin">
                      <i style={{ width: `${Math.max((n.total / maxRank) * 100, 4)}%` }} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="nv-empty">Nenhuma nerite com lançamentos neste período.</div>
          )}
          {zonaData.length > 0 && (
            <div className="nv-panel-body nv-zona-list" style={{ borderTop: '1px solid #eef0f3' }}>
              <div className="nv-secoes-label">Distribuição por zona</div>
              {zonaData.slice(0, 4).map((z) => {
                const pct = cadastros.length ? Math.round((z.value / cadastros.length) * 100) : 0
                const zonaLabel = z.name.replace(/^Zona eleitoral\s+/i, '')
                return (
                  <div key={z.name} className="nv-zona-row">
                    <div className="nv-zona-row-top">
                      <span>Zona eleitoral {zonaLabel}</span>
                      <span className="tabular-nums">{z.value} · {pct}%</span>
                    </div>
                    <div className="nv-bar thin"><i style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
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
