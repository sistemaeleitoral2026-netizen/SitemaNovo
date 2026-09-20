import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Network,
  TrendingUp,
  Share2,
  Map as MapIcon,
  Award,
  FileText,
  Clock,
  MapPin,
  Users,
  RefreshCw,
} from 'lucide-react'
import { format, parseISO, startOfDay, subDays } from 'date-fns'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
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
import { fetchDemandaCounts } from '../lib/demandas'
import { cadastrosLinkForLider, liderFichaKey, liderNameKey } from '../lib/liderFichas'
import { supabase } from '../lib/supabase'
import type { Cadastro, Coordenador, DemandaUrgencia, Lider, Profile } from '../types'

type DirFilter = 'all' | string
type ViewMode = 'geral' | 'zona' | 'equipe'

type MobilizacaoSource = Pick<Cadastro,
  'operator_id' | 'diretoria_id' | 'carros_adesivados' | 'adesivos_casa' | 'postagens' | 'contato_whatsapp'
>

interface MobilizacaoTotals {
  carros: number
  casa: number
  postagens: number
  whatsapp: number
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
    const whatsapp = row.contato_whatsapp ? 1 : 0
    acc.carros += carros
    acc.casa += casa
    acc.postagens += postagens
    acc.whatsapp += whatsapp
    if (carros === 0 && casa === 0 && postagens === 0 && !row.contato_whatsapp) acc.pendentes += 1
    return acc
  }, { carros: 0, casa: 0, postagens: 0, whatsapp: 0, pendentes: 0, fichas: cadastros.length, equipe: coordenadores.length + lideres.length })
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

const URGENCIA_ROWS: { key: DemandaUrgencia; label: string; cor: string }[] = [
  { key: 'urgente', label: 'Urgente', cor: '#f43f5e' },
  { key: 'alta', label: 'Alta prioridade', cor: '#f59e0b' },
  { key: 'normal', label: 'Normal', cor: '#3b82f6' },
  { key: 'baixa', label: 'Baixa', cor: '#94a3b8' },
]

const RANK_AVATAR_COLORS = [
  { bg: '#dbeafe', fg: '#1d4ed8', bar: '#2563eb' },
  { bg: '#d1fae5', fg: '#047857', bar: '#10b981' },
  { bg: '#fef3c7', fg: '#b45309', bar: '#f59e0b' },
  { bg: '#e0e7ff', fg: '#4338ca', bar: '#6366f1' },
  { bg: '#f3e8ff', fg: '#7e22ce', bar: '#a855f7' },
]

const ZONA_DOT_COLORS = ['#2563eb', '#0ea5e9', '#f59e0b', '#94a3b8']

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

function periodDays(preset: PeriodPreset): number {
  if (preset === '7d') return 7
  if (preset === '30d') return 30
  if (preset === '90d') return 90
  return 30
}

export function DashboardPage() {
  const { profile } = useAuth()
  if (profile?.role === 'diretoria') return <DiretoriaDashboard />
  return <AdminDashboard />
}

/* ═══════════════════════════════════════════════════════════════
   AdminDashboard — New design (nd-*)
   ═══════════════════════════════════════════════════════════════ */

function AdminDashboard() {
  const { profile } = useAuth()
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d')
  const [dirFilter, setDirFilter] = useState<DirFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('geral')
  const [reloadKey, setReloadKey] = useState(0)
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [mobilizacaoCadastros, setMobilizacaoCadastros] = useState<MobilizacaoSource[]>([])
  const [totalFichas, setTotalFichas] = useState(0)
  const [diretorias, setDiretorias] = useState<Profile[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [demandaCounts, setDemandaCounts] = useState({ abertas: 0, feitas: 0 })
  const [urgenciaCounts, setUrgenciaCounts] = useState<Record<DemandaUrgencia, number>>({
    urgente: 0, alta: 0, normal: 0, baixa: 0,
  })
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState(() => getMetaFichas())
  const [metaPopupOpen, setMetaPopupOpen] = useState(false)

  const refMap = useRef<HTMLElement>(null)
  const refEquipe = useRef<HTMLElement>(null)
  const refDesempenho = useRef<HTMLElement>(null)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  useEffect(() => { setMeta(getMetaFichas()) }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cData, totalRes, mobCadastros, dirs, ops, coords, lids, demCounts, urgRes] = await Promise.all([
          fetchCadastros({ period }),
          supabase.from('cadastros').select('*', { count: 'exact', head: true }),
          fetchCadastros(),
          supabase.from('profiles').select('*').eq('role', 'diretoria').order('nome'),
          supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
          supabase.from('coordenadores').select('*'),
          supabase.from('lideres').select('*'),
          fetchDemandaCounts(),
          supabase.from('demandas').select('urgencia').eq('status', 'aberta'),
        ])
        setCadastros(cData)
        setMobilizacaoCadastros(mobCadastros)
        setTotalFichas(totalRes.count ?? 0)
        setDiretorias((dirs.data ?? []) as Profile[])
        setNerites((ops.data ?? []) as Profile[])
        setCoordenadores((coords.data ?? []) as Coordenador[])
        setLideres((lids.data ?? []) as Lider[])
        setDemandaCounts(demCounts)
        const urg: Record<DemandaUrgencia, number> = { urgente: 0, alta: 0, normal: 0, baixa: 0 }
        for (const row of urgRes.data ?? []) {
          const key = ((row as { urgencia?: DemandaUrgencia }).urgencia ?? 'normal') as DemandaUrgencia
          if (key in urg) urg[key] += 1
          else urg.normal += 1
        }
        setUrgenciaCounts(urg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [period, reloadKey])

  useEffect(() => {
    if (loading || !profile?.id) return
    if (shouldShowMetaPopup(profile.id)) setMetaPopupOpen(true)
  }, [loading, profile?.id])

  function closeMetaPopup() {
    if (profile?.id) markMetaPopupSeen(profile.id)
    setMetaPopupOpen(false)
  }

  function handleReload() { setReloadKey((k) => k + 1) }

  function handleViewMode(mode: ViewMode) {
    setViewMode(mode)
    setTimeout(() => {
      if (mode === 'zona') refMap.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (mode === 'equipe') refEquipe.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  /* ── derived data ── */

  const goal = useMemo(() => metaProgress(totalFichas, meta), [totalFichas, meta])
  const pctFine = Math.round((goal.atual / goal.meta) * 1000) / 10
  const pctLabel = `${pctFine.toFixed(1).replace('.', ',')}%`

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
      const teamIds = new Set(nerites.filter((n) => n.diretoria_id === dir.id).map((n) => n.id))
      const fichadas = cadastros.filter(
        (c) => c.diretoria_id === dir.id || Boolean(c.operator_id && teamIds.has(c.operator_id)),
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
    const teamIds = new Set(nerites.filter((n) => n.diretoria_id === dirFilter).map((n) => n.id))
    return cadastros.filter((c) => c.diretoria_id === dirFilter || Boolean(c.operator_id && teamIds.has(c.operator_id)))
  }, [cadastros, dirFilter, nerites])

  const scopedNerites = useMemo(() => {
    if (dirFilter === 'all') return nerites
    return nerites.filter((n) => n.diretoria_id === dirFilter)
  }, [nerites, dirFilter])

  const neriteById = useMemo(() => {
    const map = new Map<string, Profile>()
    nerites.forEach((n) => map.set(n.id, n))
    return map
  }, [nerites])

  const mobilizacaoTotals = useMemo(() => {
    if (dirFilter === 'all') return sumMobilizacao(mobilizacaoCadastros, coordenadores, lideres)
    const teamIds = new Set(nerites.filter((n) => n.diretoria_id === dirFilter).map((n) => n.id))
    return sumMobilizacao(
      mobilizacaoCadastros.filter((c) => c.diretoria_id === dirFilter || Boolean(c.operator_id && teamIds.has(c.operator_id))),
      coordenadores.filter((c) => c.diretoria_id === dirFilter),
      lideres.filter((l) => l.diretoria_id === dirFilter),
    )
  }, [mobilizacaoCadastros, coordenadores, lideres, nerites, dirFilter])

  const todayCount = useMemo(() => {
    const start = startOfDay(new Date()).toISOString()
    return scopedCadastros.filter((c) => c.created_at >= start).length
  }, [scopedCadastros])

  const zonas = useMemo(() => new Set(scopedCadastros.map((c) => c.zona).filter(Boolean)).size, [scopedCadastros])

  const ranking = useMemo(() => {
    const counts = new Map<string, number>()
    scopedCadastros.forEach((c) => {
      if (!c.operator_id) return
      counts.set(c.operator_id, (counts.get(c.operator_id) ?? 0) + 1)
    })
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
    const counts = new Map<string, {
      nome: string
      coordenador: string
      diretoriaId: string
      total: number
    }>()

    scopedCadastros.forEach((c) => {
      const nome = (c.lider ?? '').trim()
      if (!liderNameKey(nome)) return
      const coordenador = (c.coordenador ?? '').trim()
      const diretoriaId = c.diretoria_id
        || (c.operator_id ? neriteById.get(c.operator_id)?.diretoria_id : null)
        || ''
      const key = liderFichaKey(nome, coordenador, diretoriaId)
      const prev = counts.get(key)
      if (prev) {
        prev.total += 1
        return
      }
      counts.set(key, {
        nome,
        coordenador,
        diretoriaId: String(diretoriaId),
        total: 1,
      })
    })

    return Array.from(counts.entries())
      .map(([key, item]) => ({
        key,
        ...item,
        share: scopedCadastros.length ? Math.round((item.total / scopedCadastros.length) * 100) : 0,
      }))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total
        return a.nome.localeCompare(b.nome, 'pt-BR')
      })
      .slice(0, 5)
  }, [scopedCadastros, neriteById])

  const maxLider = topLideres[0]?.total || 1
  const maxRank = ranking[0]?.total || 1

  const ultimos = useMemo(
    () => [...scopedCadastros]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 6)
      .map((c) => ({
        id: c.id,
        nome: c.nome_completo,
        detalhe: [c.zona ? `Zona ${c.zona}` : null, c.secao ? `Seção ${c.secao}` : null, (c.lider ?? '').trim() || null]
          .filter(Boolean).join(' · ') || '—',
        data: formatShortDateTime(c.created_at),
      })),
    [scopedCadastros],
  )

  const evolution = useMemo(() => buildEvolutionData(scopedCadastros), [scopedCadastros])
  const zonaData = useMemo(() => buildZonaData(scopedCadastros), [scopedCadastros])
  const mapMarkers = useMemo(() => buildMapMarkers(scopedCadastros), [scopedCadastros])

  const periodLabel = useMemo(() => {
    const map: Record<PeriodPreset, string> = {
      '7d': 'últimos 7 dias', '30d': 'últimos 30 dias', '90d': 'últimos 90 dias', all: 'todo o período',
    }
    return map[periodPreset]
  }, [periodPreset])

  const diasPeriodo = useMemo(() => {
    if (periodPreset === 'all') {
      const days = new Set(evolution.map((e) => e.date))
      return Math.max(days.size, 14)
    }
    return periodDays(periodPreset)
  }, [periodPreset, evolution])

  const diasAtivosNum = useMemo(() => evolution.filter((e) => e.total > 0).length, [evolution])

  const ritmo = useMemo(() => {
    if (diasAtivosNum <= 0) return 0
    return Math.round(scopedCadastros.length / diasAtivosNum)
  }, [scopedCadastros.length, diasAtivosNum])

  const diasParaMeta = useMemo(() => {
    if (goal.batida) return 0
    if (ritmo <= 0) return null
    return Math.ceil(goal.restante / ritmo)
  }, [goal.batida, goal.restante, ritmo])

  const escopoNome = useMemo(() => {
    if (dirFilter === 'all') return 'Geral'
    return dirStats.find((d) => d.id === dirFilter)?.nome ?? 'Diretoria'
  }, [dirFilter, dirStats])

  const escopoCurto = dirFilter === 'all' ? 'todas as diretorias' : escopoNome

  const atualizadoEm = useMemo(() => {
    const latest = [...scopedCadastros].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (!latest) return 'sem lançamentos'
    try { return `Atualizado ${format(parseISO(latest.created_at), "dd/MM 'às' HH:mm")}` } catch { return '—' }
  }, [scopedCadastros])

  const ultimoLancamento = useMemo(() => {
    const latest = [...scopedCadastros].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (!latest) return 'sem lançamentos'
    try { return `Último: ${format(parseISO(latest.created_at), 'HH:mm (dd/MM)')}` } catch { return '—' }
  }, [scopedCadastros])

  const topSecoes = useMemo(() => {
    const map = new Map<string, number>()
    scopedCadastros.forEach((c) => { const s = (c.secao ?? '').trim(); if (!s) return; map.set(s, (map.get(s) ?? 0) + 1) })
    return Array.from(map.entries()).map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v).slice(0, 4)
  }, [scopedCadastros])

  const mobBase = mobilizacaoTotals.fichas + mobilizacaoTotals.equipe
  const mobComLancamento = Math.max(0, mobBase - mobilizacaoTotals.pendentes)
  const coberturaPct = mobBase > 0 ? Math.round((mobComLancamento / mobBase) * 100) : 0
  const filtroAtivo = dirFilter !== 'all'
  const dirQuery = filtroAtivo ? `?diretoria=${dirFilter}` : ''
  const dirQueryAmp = filtroAtivo ? `&diretoria=${dirFilter}` : ''

  const maiorZona = zonaData[0]
  const zonasFracas = useMemo(() => {
    if (zonaData.length < 2) return []
    return zonaData.filter((z) => z.value > 0 && z.value <= Math.max(15, Math.ceil(scopedCadastros.length * 0.02)))
  }, [zonaData, scopedCadastros.length])

  const equipeAtiva = ranking.length || scopedNerites.filter((n) => n.ativo).length
  const mediaPorNerite = equipeAtiva > 0 ? Math.round(scopedCadastros.length / equipeAtiva) : 0

  const concentracaoNota = useMemo(() => {
    if (!maiorZona || !scopedCadastros.length) return null
    const pct = Math.round((maiorZona.value / scopedCadastros.length) * 100)
    const zonaLabel = maiorZona.name.replace(/^Zona eleitoral\s+/i, '')
    if (zonasFracas.length === 0) {
      return pct >= 50 ? `Alta concentração (${pct}%) na Zona ${zonaLabel}.` : null
    }
    const fracos = zonasFracas.slice(0, 2).map((z) => z.name.replace(/^Zona eleitoral\s+/i, '')).join(' e ')
    const somaFraca = zonasFracas.reduce((a, z) => a + z.value, 0)
    return `Alta concentração (${pct}%) na Zona ${zonaLabel}. As zonas ${fracos} somam ${fmt(somaFraca)} fichas — território praticamente inexplorado.`
  }, [maiorZona, scopedCadastros.length, zonasFracas])

  const somaNerites = ranking.reduce((a, n) => a + n.total, 0)
  const somaLideresTop = topLideres.reduce((a, l) => a + l.total, 0)

  /* ── Recharts: ritmo de coleta ── */

  const chartData = useMemo(() => {
    const numBars = periodPreset === '7d' ? 7 : 30
    const byDay = new Map(evolution.map((e) => [e.date, e.total]))
    const porDia = diasPeriodo > 0 ? goal.meta / diasPeriodo : 0
    const firstDay = Math.max(1, diasPeriodo - numBars + 1)
    let cumulative = 0
    return Array.from({ length: numBars }, (_, i) => {
      const d = subDays(new Date(), numBars - 1 - i)
      const dateKey = format(d, 'dd/MM')
      const daily = byDay.get(dateKey) ?? 0
      cumulative += daily
      return { date: dateKey, label: format(d, 'dd'), daily, cumulative, metaPace: Math.round((firstDay + i) * porDia) }
    })
  }, [evolution, goal.meta, diasPeriodo, periodPreset])

  const chartPeak = useMemo(() => {
    if (!chartData.length) return { label: '—', daily: 0 }
    return chartData.reduce((m, d) => (d.daily > m.daily ? d : m), chartData[0])
  }, [chartData])

  const barSize = chartData.length <= 7 ? 24 : chartData.length <= 14 ? 16 : 10

  /* ── loading state ── */

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  /* ── render ── */

  return (
    <div className="nd-dash">
      <MetaGoalPopup open={metaPopupOpen} atual={totalFichas} meta={meta} onClose={closeMetaPopup} />

      {/* ──── 1. Header ──── */}
      <div className="nd-header">
        <div>
          <span className="nd-badge">Painel Administrativo</span>
          <h2 className="nd-title">Visão geral da operação</h2>
          <p className="nd-subtitle">
            Exibindo: <strong>{escopoNome}</strong> · {periodLabel} · {atualizadoEm}
          </p>
        </div>
        <div className="nd-controls">
          <div className="nd-tabs" role="group" aria-label="Modo de visualização">
            {(['geral', 'zona', 'equipe'] as const).map((m) => (
              <button key={m} type="button" className={`nd-tab${viewMode === m ? ' active' : ''}`} onClick={() => handleViewMode(m)}>
                {m === 'geral' ? 'Geral' : m === 'zona' ? 'Zona' : 'Equipe'}
              </button>
            ))}
          </div>
          <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} showRange={false} />
          <button type="button" className="nd-refresh" onClick={handleReload}>
            <RefreshCw size={14} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* filter banner */}
      {filtroAtivo && (
        <div className="nd-filter-banner">
          <span>
            Painel filtrado pela <strong>{escopoNome}</strong> — fichas, mobilização, mapa e rankings
            consideram só essa equipe. A meta segue global.
          </span>
          <button type="button" onClick={() => setDirFilter('all')}>Limpar filtro</button>
        </div>
      )}

      {/* ──── 2. Meta + KPI grid ──── */}
      <div className="nd-overview">
        {/* Meta card — dark gradient (7 cols) */}
        <div className="nd-meta">
          <div className="nd-meta-glow" />
          <div>
            <div className="nd-meta-head">
              <div className="nd-meta-head-left">
                <span className="nd-meta-dot" />
                <span className="nd-meta-label">Meta da Equipe — {escopoNome}</span>
              </div>
              <Link to="/configuracoes" className="nd-meta-link">Configurar meta</Link>
            </div>
            <div className="nd-meta-numbers">
              <div className="nd-meta-big-wrap">
                <span className="nd-meta-big tabular-nums">{fmt(goal.atual)}</span>
                <span className="nd-meta-of">de {fmt(goal.meta)} fichas</span>
              </div>
              <span className="nd-meta-pct">
                <strong className="tabular-nums">{pctLabel}</strong>
                <span>atingido</span>
              </span>
            </div>
            <div className="nd-meta-bar-wrap">
              <div className="nd-meta-bar-track">
                <div className="nd-meta-bar-fill" style={{ width: `${Math.min(pctFine, 100)}%` }} />
              </div>
              <div className="nd-meta-bar-legend">
                <span>{fmt(goal.atual)} fichas</span>
                <span>Meta: {fmt(goal.meta)} fichas</span>
              </div>
            </div>
          </div>
          <div className="nd-meta-stats">
            <div className="nd-meta-stat">
              <span className="nd-meta-stat-lbl">Faltam</span>
              <strong className="tabular-nums">{goal.batida ? '0' : fmt(goal.restante)}</strong>
              <span className="nd-meta-stat-hint">{goal.batida ? 'meta alcançada' : 'fichas para meta'}</span>
            </div>
            <div className="nd-meta-stat">
              <span className="nd-meta-stat-lbl">Ritmo Atual</span>
              <strong className="nd-meta-stat-green tabular-nums">
                {ritmo > 0 ? fmt(ritmo) : '—'}
                {ritmo > 0 && <span className="nd-meta-stat-unit">/dia</span>}
              </strong>
              <span className="nd-meta-stat-hint">nos últimos {diasAtivosNum} dias ativos</span>
            </div>
            <div className="nd-meta-stat">
              <span className="nd-meta-stat-lbl">Projeção</span>
              <strong className="nd-meta-stat-amber tabular-nums">
                {goal.batida ? '0 dias' : diasParaMeta != null ? `${diasParaMeta} dias` : '—'}
              </strong>
              <span className="nd-meta-stat-hint">de coleta para fechar</span>
            </div>
          </div>
        </div>

        {/* KPI cards — 2×2 (5 cols) */}
        <div className="nd-kpis">
          <div className="nd-kpi">
            <div className="nd-kpi-top">
              <span className="nd-kpi-label">Fichas no Período</span>
              <span className="nd-kpi-icon blue"><FileText size={14} /></span>
            </div>
            <div className="nd-kpi-body">
              <span className="nd-kpi-value tabular-nums">{fmt(scopedCadastros.length)}</span>
              <span className="nd-kpi-tag blue">{Math.round(pctFine)}% da meta</span>
            </div>
            <p className="nd-kpi-hint">{escopoCurto} · {periodLabel}</p>
          </div>
          <div className="nd-kpi">
            <div className="nd-kpi-top">
              <span className="nd-kpi-label">Cadastros 24h</span>
              <span className="nd-kpi-icon green"><Clock size={14} /></span>
            </div>
            <div className="nd-kpi-body">
              <span className="nd-kpi-value tabular-nums">{fmt(todayCount)}</span>
              <span className="nd-kpi-tag green">
                {scopedCadastros.length ? `${Math.round((todayCount / scopedCadastros.length) * 100)}% do total` : '0%'}
              </span>
            </div>
            <p className="nd-kpi-hint">{ultimoLancamento}</p>
          </div>
          <div className="nd-kpi">
            <div className="nd-kpi-top">
              <span className="nd-kpi-label">Zonas Cobertas</span>
              <span className="nd-kpi-icon indigo"><MapPin size={14} /></span>
            </div>
            <div className="nd-kpi-body">
              <span className="nd-kpi-value tabular-nums">{zonas}</span>
              <span className="nd-kpi-tag indigo">
                {maiorZona ? `${maiorZona.name.replace(/^Zona eleitoral\s+/i, '')} lidera` : 'sem dados'}
              </span>
            </div>
            <p className="nd-kpi-hint">
              {maiorZona && scopedCadastros.length
                ? `${Math.round((maiorZona.value / scopedCadastros.length) * 100)}% das fichas em uma zona`
                : 'nenhuma zona no filtro'}
            </p>
          </div>
          <div className="nd-kpi">
            <div className="nd-kpi-top">
              <span className="nd-kpi-label">Equipe Ativa</span>
              <span className="nd-kpi-icon amber"><Users size={14} /></span>
            </div>
            <div className="nd-kpi-body">
              <span className="nd-kpi-value tabular-nums">{fmt(equipeAtiva)}</span>
              <span className="nd-kpi-tag amber">nerites</span>
            </div>
            <p className="nd-kpi-hint">
              {equipeAtiva ? `${fmt(mediaPorNerite)} fichas por nerite em média` : 'sem lançamentos'}
            </p>
          </div>
        </div>
      </div>

      {/* ──── 3. Divisão entre equipes ──── */}
      <section ref={refEquipe}>
        <div className="nd-section-head">
          <div>
            <h3 className="nd-section-title">Divisão entre as equipes</h3>
            <p className="nd-section-subtitle">Distribuição comparativa entre as frentes de trabalho</p>
          </div>
          <span className="nd-section-badge">
            {fmt(scopedCadastros.length)} fichas contabilizadas • {dirStats.length} frente{dirStats.length !== 1 ? 's' : ''} ativa{dirStats.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="nd-team-grid">
          {dirStats.map((d) => {
            const ativo = dirFilter === d.id
            const periodoTotal = Math.max(
              dirStats.reduce((acc, x) => acc + x.fichadas, 0),
              1,
            )
            const share = Math.round((d.fichadas / periodoTotal) * 100)
            const porNerite = d.nerites > 0 ? Math.round(d.fichadas / d.nerites) : 0
            const porLider = d.lideres > 0 ? (d.fichadas / d.lideres).toFixed(1).replace('.', ',') : '0'
            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                className={`nd-team-card${ativo ? ' active' : ''} tone-${d.tone}`}
                onClick={() => setDirFilter(ativo ? 'all' : d.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDirFilter(ativo ? 'all' : d.id) } }}
              >
                <div className="nd-team-top">
                  <div className="nd-team-left">
                    <span className={`nd-team-avatar ${d.tone}`}>{initials(d.nome)}</span>
                    <div className="nd-team-copy">
                      <h4 className="nd-team-name">
                        {d.nome}
                        {ativo && <em className="nd-team-active-tag">filtrando</em>}
                      </h4>
                      <p className="nd-team-detail">
                        {d.fichadas > 0
                          ? `${share}% das fichas · ${fmt(porNerite)} fichas por membro`
                          : 'sem fichas lançadas'}
                      </p>
                    </div>
                  </div>
                  <div className="nd-team-count">
                    <span className="nd-team-count-value tabular-nums">{fmt(d.fichadas)}</span>
                    <span className="nd-team-count-label">fichas</span>
                  </div>
                </div>

                <div className="nd-team-bar">
                  <div className={`nd-team-bar-fill ${d.tone}`} style={{ width: `${Math.min(100, Math.max(share, d.fichadas > 0 ? 2 : 0))}%` }} />
                </div>

                <div className="nd-team-stats">
                  <Link
                    to={`/equipe?tab=coordenadores&diretoria=${d.id}`}
                    className="nd-team-stat"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="nd-team-stat-label">Coord.</span>
                    <strong className="nd-team-stat-value tabular-nums">{d.coordenadores}</strong>
                  </Link>
                  <Link
                    to={`/equipe?tab=lideres&diretoria=${d.id}`}
                    className="nd-team-stat"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="nd-team-stat-label">Lideranças</span>
                    <strong className="nd-team-stat-value tabular-nums">{d.lideres}</strong>
                  </Link>
                  <Link
                    to={`/equipe?tab=nerites&diretoria=${d.id}`}
                    className="nd-team-stat"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="nd-team-stat-label">Membros</span>
                    <strong className="nd-team-stat-value tabular-nums">{d.nerites}</strong>
                  </Link>
                </div>

                <div className="nd-team-foot">
                  <span className="nd-team-foot-text">
                    {ativo
                      ? 'Filtro ativo — clique para voltar a Geral'
                      : `${porLider} coletas por liderança · ritmo estável`}
                  </span>
                  <Link
                    to={`/cadastros?diretoria=${d.id}`}
                    className={`nd-team-foot-link ${d.tone}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Abrir frente <span className="nd-arrow">→</span>
                  </Link>
                </div>
              </div>
            )
          })}
          {!dirStats.length && <div className="nd-empty">Nenhuma diretoria cadastrada.</div>}
        </div>
      </section>

      {/* ──── 4. Ritmo de coleta ──── */}
      <section>
        <div className="nd-card">
          <div className="nd-chart-head">
            <div>
              <div className="nd-chart-title-row">
                <h3 className="nd-chart-title">Ritmo de coleta</h3>
                <span className="nd-chart-tag">Diário vs. Acumulado</span>
              </div>
              <p className="nd-chart-sub">{escopoCurto} • {periodLabel}</p>
            </div>
            <div className="nd-chart-right">
              <div className="nd-chart-legend">
                <span className="nd-chart-lg"><i className="nd-lg-bar" /> Fichas no dia</span>
                <span className="nd-chart-lg"><i className="nd-lg-line" /> Acumulado no período</span>
                <span className="nd-chart-lg"><i className="nd-lg-dash" /> Ritmo necessário p/ meta</span>
              </div>
              {chartPeak.daily > 0 && (
                <div className="nd-chart-peak">
                  <span className="nd-chart-peak-label">Pico registrado</span>
                  <strong className="tabular-nums">{fmt(chartPeak.daily)} fichas (Dia {chartPeak.label})</strong>
                </div>
              )}
            </div>
          </div>
          <div className="nd-chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={40} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={55} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  itemStyle={{ padding: '2px 0' }}
                  labelStyle={{ fontWeight: 600, marginBottom: 4, color: '#0f172a' }}
                  labelFormatter={(l) => `Dia ${l}`}
                />
                <Bar yAxisId="left" dataKey="daily" name="Fichas no dia" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={barSize} />
                <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Acumulado" stroke="#059669" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="metaPace" name="Ritmo p/ meta" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="nd-chart-foot">
            <span>
              Volume acumulado: <strong className="tabular-nums">{fmt(scopedCadastros.length)} fichas</strong>
              {ritmo > 0 && <> (Média: {fmt(ritmo)} fichas/dia)</>}
            </span>
            <span>Meta: <strong className="tabular-nums">{fmt(goal.meta)} fichas</strong></span>
          </div>
        </div>
      </section>

      {/* ──── 5. Mapa + Concentração ──── */}
      <section ref={refMap}>
        <div className="nd-map-grid">
          <div className="nd-card nd-map-col">
            <div className="nd-card-head">
              <div>
                <h3 className="nd-card-title">Mapa por zona eleitoral</h3>
                <p className="nd-card-sub">Intensidade pelas fichas do filtro atual</p>
              </div>
              <Link to={`/mapa${dirQuery}`} className="nd-card-link">Visão completa →</Link>
            </div>
            <div className="nd-map-wrap">
              <CadastrosMap markers={mapMarkers} height={320} showLegend={false} fitToMarkers />
              <div className="nd-map-legend" aria-hidden>
                <div className="nd-map-legend-title">Intensidade</div>
                <div className="nd-map-legend-row"><span className="nd-map-legend-swatch" style={{ background: '#7fd8c4' }} /> Baixa</div>
                <div className="nd-map-legend-row"><span className="nd-map-legend-swatch" style={{ background: '#f2cf6a' }} /> Média</div>
                <div className="nd-map-legend-row"><span className="nd-map-legend-swatch" style={{ background: '#f0a355' }} /> Alta</div>
                <div className="nd-map-legend-row"><span className="nd-map-legend-swatch" style={{ background: '#e2614f' }} /> Muito alta</div>
              </div>
            </div>
            <div className="nd-map-foot">
              <span>Intensidade pelas fichas do filtro atual</span>
              <Link to={`/mapa${dirQuery}`}>Abrir mapa completo →</Link>
            </div>
          </div>

          <div className="nd-card nd-conc-col">
            <div className="nd-card-head">
              <div>
                <h3 className="nd-card-title">Concentração territorial</h3>
                <p className="nd-card-sub">
                  {scopedCadastros.length
                    ? `${fmt(scopedCadastros.length)} fichas distribuídas por zona`
                    : 'nenhuma ficha no filtro'}
                </p>
              </div>
              {zonaData.length > 0 && <span className="nd-conc-badge">Top {Math.min(zonaData.length, 4)} Zonas</span>}
            </div>
            {zonaData.length ? (
              <>
                <div className="nd-zona-list">
                  {zonaData.slice(0, 4).map((z, i) => {
                    const pct = scopedCadastros.length ? Math.round((z.value / scopedCadastros.length) * 100) : 0
                    const zonaLabel = z.name.replace(/^Zona eleitoral\s+/i, '')
                    const color = ZONA_DOT_COLORS[i] ?? '#94a3b8'
                    return (
                      <div key={z.name} className="nd-zona-item">
                        <div className="nd-zona-top">
                          <span className="nd-zona-name">
                            <span className="nd-zona-dot" style={{ background: color }} />
                            Zona {zonaLabel}
                          </span>
                          <span className="nd-zona-value tabular-nums">
                            {fmt(z.value)} <span className="nd-zona-pct">({pct}%)</span>
                          </span>
                        </div>
                        <div className="nd-zona-bar">
                          <div className="nd-zona-bar-fill" style={{ width: `${Math.max(pct, z.value > 0 ? 1.5 : 0)}%`, background: color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                {concentracaoNota && (
                  <div className="nd-zona-callout">
                    <strong>Análise:</strong> {concentracaoNota}
                  </div>
                )}
                {topSecoes.length > 0 && (
                  <div className="nd-secoes">
                    <span className="nd-secoes-label">Seções com Maior Coleta</span>
                    <div className="nd-secoes-grid">
                      {topSecoes.map((s) => (
                        <Link key={s.n} to={`/cadastros?secao=${encodeURIComponent(s.n)}${dirQueryAmp}`} className="nd-secao">
                          <span>Seção {s.n}</span>
                          <strong className="tabular-nums">{s.v} fichas</strong>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {zonaData.length > 4 && (
                  <div className="nd-zona-more">
                    <Link to={`/mapa${dirQuery}`}>Ver todas as {zonaData.length} zonas →</Link>
                  </div>
                )}
              </>
            ) : (
              <div className="nd-empty">Nenhuma ficha neste filtro — sem zonas para exibir.</div>
            )}
          </div>
        </div>
      </section>

      {/* ──── 6. Mobilização + Demandas ──── */}
      <section>
        <div className="nd-mob-grid">
          {/* Ativação */}
          <div className="nd-card">
            <div className="nd-card-head">
              <div>
                <h3 className="nd-card-title">Mobilização de rua — Ativação</h3>
                <p className="nd-card-sub">Adesivagem de carros, casas, postagens e contatos</p>
              </div>
              <Link to={`/ativacao/painel${dirQuery}`} className="nd-card-link">Abrir painel →</Link>
            </div>
            <div className="nd-mob-counters">
              <Link to={`/ativacao/painel?status=com_carro${dirQueryAmp}`} className="nd-mob-counter">
                <span className="nd-mob-counter-lbl">Carros</span>
                <strong className="nd-mob-counter-val tabular-nums">{fmt(mobilizacaoTotals.carros)}</strong>
                <span className="nd-mob-counter-hint">veículos adesiv.</span>
              </Link>
              <Link to={`/ativacao/painel?status=casa_sim${dirQueryAmp}`} className="nd-mob-counter">
                <span className="nd-mob-counter-lbl">Casas</span>
                <strong className="nd-mob-counter-val tabular-nums">{fmt(mobilizacaoTotals.casa)}</strong>
                <span className="nd-mob-counter-hint">casas adesivadas</span>
              </Link>
              <Link to={`/ativacao/painel?status=com_links${dirQueryAmp}`} className="nd-mob-counter">
                <span className="nd-mob-counter-lbl">Postagens</span>
                <strong className="nd-mob-counter-val tabular-nums">{fmt(mobilizacaoTotals.postagens)}</strong>
                <span className="nd-mob-counter-hint">redes / mídias</span>
              </Link>
              <div className="nd-mob-counter">
                <span className="nd-mob-counter-lbl">% Ativado</span>
                <strong className="nd-mob-counter-val tabular-nums">{coberturaPct}%</strong>
                <span className="nd-mob-counter-hint">conversão direta</span>
              </div>
            </div>
            <div className="nd-mob-base">
              <div className="nd-mob-base-copy">
                <div className="nd-mob-base-title">
                  <strong>Base total de eleitores contatados</strong>
                  <span className="nd-mob-base-tag">Fichas + equipe</span>
                </div>
                <p className="nd-mob-base-sub">
                  Cadastros aptos para receberem kits de rua e materiais — inclui a equipe junto com as fichas (não é só a quantidade de cadastros)
                </p>
              </div>
              <span className="nd-mob-base-value tabular-nums">{fmt(mobBase)}</span>
            </div>
          </div>

          {/* Demandas */}
          <div className="nd-card">
            <div className="nd-card-head">
              <div>
                <h3 className="nd-card-title">Demandas da comunidade</h3>
                <p className="nd-card-sub">Pedidos registrados pelos eleitores durante a coleta</p>
              </div>
              <Link to="/demandas/painel" className="nd-card-link">Ver todas →</Link>
            </div>
            <div className="nd-dem-overview">
              <Link to="/demandas/painel" className="nd-dem-box">
                <span className="nd-dem-box-lbl">Em Aberto</span>
                <strong className="nd-dem-box-val tabular-nums">{fmt(demandaCounts.abertas)}</strong>
                <span className="nd-dem-box-hint">aguardando triagem</span>
              </Link>
              <Link to="/demandas/painel" className="nd-dem-box nd-dem-box-green">
                <span className="nd-dem-box-lbl">Concluídas</span>
                <strong className="nd-dem-box-val tabular-nums">{fmt(demandaCounts.feitas)}</strong>
                <span className="nd-dem-box-hint">resolvidas no período</span>
              </Link>
            </div>
            <div className="nd-dem-urg">
              {URGENCIA_ROWS.map((u) => (
                <div key={u.key} className="nd-dem-urg-row">
                  <div className="nd-dem-urg-left">
                    <span className="nd-dem-urg-dot" style={{ background: u.cor }} />
                    <span>{u.label}</span>
                  </div>
                  <strong className="tabular-nums" style={{ color: urgenciaCounts[u.key] > 0 ? '#0f172a' : '#94a3b8' }}>
                    {fmt(urgenciaCounts[u.key])}
                  </strong>
                </div>
              ))}
            </div>
            <div className="nd-dem-foot">
              <span>{demandaCounts.abertas === 0 ? 'Fila zerada no momento' : `${fmt(demandaCounts.abertas)} demandas aguardando`}</span>
              <Link to="/demandas/lancar" className="nd-dem-foot-link">Cadastrar nova demanda</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ──── 7. Desempenho ──── */}
      <section ref={refDesempenho}>
        <div className="nd-section-head nd-section-head-only">
          <div>
            <h3 className="nd-section-title">Desempenho da operação</h3>
            <p className="nd-section-subtitle">Quem produz, quem entrega e as últimas fichas registradas no sistema</p>
          </div>
        </div>

        <div className="nd-perf-grid">
          {/* Produção por membro */}
          <div className="nd-card">
            <div className="nd-perf-head">
              <div>
                <h4 className="nd-perf-title">Produção por membro</h4>
                <span className="nd-perf-sub">Top 5 no ciclo atual</span>
              </div>
              <Link to="/nerites" className="nd-card-link">Ver todos →</Link>
            </div>
            {ranking.length ? (
              <>
                <div className="nd-rank-list">
                  {ranking.map((nerite, index) => {
                    const c = RANK_AVATAR_COLORS[index] ?? RANK_AVATAR_COLORS[0]
                    return (
                      <Link to={`/nerites/${nerite.id}`} className="nd-rank-item" key={nerite.id}>
                        <span className="nd-rank-pos">{index + 1}</span>
                        <span className="nd-rank-avatar" style={{ background: c.bg, color: c.fg }}>{initials(nerite.nome)}</span>
                        <div className="nd-rank-body">
                          <div className="nd-rank-meta">
                            <span className="nd-rank-name">{nerite.nome}</span>
                            <span className="nd-rank-count tabular-nums">{fmt(nerite.total)} <span className="nd-rank-unit">fichas</span></span>
                          </div>
                          <div className="nd-rank-bar">
                            <div className="nd-rank-bar-fill" style={{ width: `${Math.max((nerite.total / maxRank) * 100, 4)}%`, background: c.bar }} />
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
                <div className="nd-note">
                  {ranking.length} {ranking.length === 1 ? 'frente responde' : 'frentes respondem'} por{' '}
                  {scopedCadastros.length ? Math.round((somaNerites / scopedCadastros.length) * 100) : 0}% das coletas
                </div>
              </>
            ) : (
              <div className="nd-empty">Nenhuma nerite com lançamentos neste filtro.</div>
            )}
          </div>

          {/* Lideranças que entregam */}
          <div className="nd-card">
            <div className="nd-perf-head">
              <div>
                <h4 className="nd-perf-title">Lideranças que entregam</h4>
                <span className="nd-perf-sub">Mais ativas no período</span>
              </div>
              <Link to="/lideranca" className="nd-card-link">Ver todas →</Link>
            </div>
            {topLideres.length ? (
              <>
                <div className="nd-rank-list">
                  {topLideres.map((lider, index) => {
                    const c = RANK_AVATAR_COLORS[index] ?? RANK_AVATAR_COLORS[0]
                    return (
                      <Link
                        to={cadastrosLinkForLider({
                          nome: lider.nome,
                          coordenador: lider.coordenador,
                          diretoriaId: lider.diretoriaId || (dirFilter !== 'all' ? dirFilter : null),
                        })}
                        className="nd-rank-item"
                        key={lider.key}
                      >
                        <span className="nd-rank-pos">{index + 1}</span>
                        <span className="nd-rank-avatar" style={{ background: c.bg, color: c.fg }}>{initials(lider.nome)}</span>
                        <div className="nd-rank-body">
                          <div className="nd-rank-meta">
                            <span className="nd-rank-name">
                              {lider.nome}
                              {lider.coordenador ? (
                                <em className="nd-rank-coord"> · {lider.coordenador}</em>
                              ) : null}
                            </span>
                            <span className="nd-rank-count tabular-nums">{fmt(lider.total)} <span className="nd-rank-unit">fichas</span></span>
                          </div>
                          <div className="nd-rank-bar">
                            <div className="nd-rank-bar-fill" style={{ width: `${Math.max((lider.total / maxLider) * 100, 4)}%` }} />
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
                <div className="nd-note">
                  As {topLideres.length} maiores lideranças respondem por{' '}
                  {scopedCadastros.length ? Math.round((somaLideresTop / scopedCadastros.length) * 100) : 0}% das fichas
                </div>
              </>
            ) : (
              <div className="nd-empty">Sem lideranças com fichas neste filtro.</div>
            )}
          </div>

          {/* Últimas fichas */}
          <div className="nd-card">
            <div className="nd-perf-head">
              <div>
                <h4 className="nd-perf-title">Últimas fichas cadastradas</h4>
                <span className="nd-perf-sub">Fluxo em tempo real da equipe</span>
              </div>
              <span className="nd-live-dot" />
            </div>
            {ultimos.length ? (
              <>
                <div className="nd-activity-list">
                  {ultimos.map((item) => (
                    <div className="nd-activity-item" key={item.id}>
                      <div>
                        <p className="nd-activity-name">{item.nome}</p>
                        <span className="nd-activity-detail">{item.detalhe}</span>
                      </div>
                      <span className="nd-activity-time tabular-nums">{item.data}</span>
                    </div>
                  ))}
                </div>
                <div className="nd-activity-foot">
                  <Link to={`/cadastros${dirQuery}`}>Ver todas as {fmt(scopedCadastros.length)} fichas →</Link>
                </div>
              </>
            ) : (
              <div className="nd-empty">Sem fichas registradas neste filtro.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   DiretoriaDashboard (unchanged)
   ═══════════════════════════════════════════════════════════════ */

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
          cData.filter((c) => c.diretoria_id === dirId || Boolean(c.operator_id && teamIds.has(c.operator_id))),
        )
        setMobilizacaoCadastros(
          allCadastros.filter(
            (c) => c.diretoria_id === dirId || Boolean(c.operator_id && teamIds.has(c.operator_id)),
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
    cadastros.forEach((c) => {
      if (!c.operator_id) return
      counts.set(c.operator_id, (counts.get(c.operator_id) ?? 0) + 1)
    })
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
              <h2><Share2 size={16} strokeWidth={1.6} aria-hidden />Formigas</h2>
              <p>
                {mobBase.toLocaleString('pt-BR')} pessoas no escopo · sem corte de período
              </p>
            </div>
            <Link to="/ativacao/painel">Gerenciar →</Link>
          </div>
          <div className="nv-mob-list">
            {([
              ['Carros adesivados', mobilizacaoTotals.carros, 'carros', false],
              ['Adesivos para casa', mobilizacaoTotals.casa, 'casa', false],
              ['Postagens', mobilizacaoTotals.postagens, 'postagens', false],
              ['Sem lançamento', mobilizacaoTotals.pendentes, 'pendente', true],
            ] as const).map(([label, value, status, pendente]) => (
              <Link key={status} to={`/ativacao/painel?status=${status}`} className="nv-mob-row">
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
