import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Network,
  TrendingUp,
  Share2,
  Map as MapIcon,
  Award,
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
import { fetchDemandaCounts } from '../lib/demandas'
import { supabase } from '../lib/supabase'
import type { Cadastro, Coordenador, DemandaUrgencia, Lider, Profile } from '../types'

type DirFilter = 'all' | string

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

interface DashAlert {
  cor: string
  titulo: string
  texto: string
  valor: string
  to: string
}

const URGENCIA_ROWS: { key: DemandaUrgencia; label: string; cor: string }[] = [
  { key: 'urgente', label: 'Urgente', cor: '#f43f5e' },
  { key: 'alta', label: 'Alta', cor: '#f59e0b' },
  { key: 'normal', label: 'Normal', cor: '#60a5fa' },
  { key: 'baixa', label: 'Baixa', cor: '#94a3b8' },
]

const ZONA_BAR_COLORS = ['#1f4fd8', '#5b84e6', '#8aa8ef', '#b9cbf5']

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
  const [demandaCounts, setDemandaCounts] = useState({ abertas: 0, feitas: 0 })
  const [urgenciaCounts, setUrgenciaCounts] = useState<Record<DemandaUrgencia, number>>({
    urgente: 0,
    alta: 0,
    normal: 0,
    baixa: 0,
  })
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
      const teamIds = new Set(
        nerites.filter((n) => n.diretoria_id === dir.id).map((n) => n.id),
      )
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
    const teamIds = new Set(
      nerites.filter((n) => n.diretoria_id === dirFilter).map((n) => n.id),
    )
    return cadastros.filter(
      (c) => c.diretoria_id === dirFilter || Boolean(c.operator_id && teamIds.has(c.operator_id)),
    )
  }, [cadastros, dirFilter, nerites])

  const scopedNerites = useMemo(() => {
    if (dirFilter === 'all') return nerites
    return nerites.filter((n) => n.diretoria_id === dirFilter)
  }, [nerites, dirFilter])

  const scopedLideres = useMemo(() => {
    if (dirFilter === 'all') return lideres
    return lideres.filter((l) => l.diretoria_id === dirFilter)
  }, [lideres, dirFilter])

  const mobilizacaoTotals = useMemo(() => {
    if (dirFilter === 'all') return sumMobilizacao(mobilizacaoCadastros, coordenadores, lideres)
    const teamIds = new Set(nerites.filter((n) => n.diretoria_id === dirFilter).map((n) => n.id))
    return sumMobilizacao(
      mobilizacaoCadastros.filter((c) => c.diretoria_id === dirFilter || Boolean(c.operator_id && teamIds.has(c.operator_id))),
      coordenadores.filter((c) => c.diretoria_id === dirFilter),
      lideres.filter((l) => l.diretoria_id === dirFilter),
    )
  }, [mobilizacaoCadastros, coordenadores, lideres, nerites, dirFilter])

  const fichasSemDiretoria = useMemo(() => {
    const teamIds = new Set(nerites.map((n) => n.id))
    return cadastros.filter((c) => !c.diretoria_id && !Boolean(c.operator_id && teamIds.has(c.operator_id))).length
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
  const maxRank = ranking[0]?.total || 1

  const ultimos = useMemo(
    () =>
      [...scopedCadastros]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 6)
        .map((c) => ({
          id: c.id,
          nome: c.nome_completo,
          detalhe: [
            c.zona ? `Zona ${c.zona}` : null,
            c.secao ? `Seção ${c.secao}` : null,
            (c.lider ?? '').trim() || null,
          ].filter(Boolean).join(' · ') || '—',
          data: formatShortDateTime(c.created_at),
        })),
    [scopedCadastros],
  )

  const evolution = useMemo(() => buildEvolutionData(scopedCadastros), [scopedCadastros])
  const zonaData = useMemo(() => buildZonaData(scopedCadastros), [scopedCadastros])
  const mapMarkers = useMemo(() => buildMapMarkers(scopedCadastros), [scopedCadastros])

  const periodLabel = useMemo(() => {
    const map: Record<PeriodPreset, string> = {
      '7d': 'últimos 7 dias',
      '30d': 'últimos 30 dias',
      '90d': 'últimos 90 dias',
      all: 'todo o período',
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

  const diasAtivosNum = useMemo(
    () => evolution.filter((e) => e.total > 0).length,
    [evolution],
  )

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

  const melhorDia = useMemo(() => {
    if (!evolution.length) return { label: '—', total: 0 }
    const best = [...evolution].sort((a, b) => b.total - a.total)[0]
    if (!best || best.total <= 0) return { label: '—', total: 0 }
    return { label: best.date, total: best.total }
  }, [evolution])

  const ritmoChart = useMemo(() => {
    const dayCount = 14
    const byDay = new Map(evolution.map((e) => [e.date, e.total]))
    const bars = Array.from({ length: dayCount }, (_, i) => {
      const d = subDays(new Date(), dayCount - 1 - i)
      const date = format(d, 'dd/MM')
      return { date, label: format(d, 'dd'), total: byDay.get(date) ?? 0 }
    })
    const maxSerie = Math.max(...bars.map((b) => b.total), 1)
    const yMax = Math.max(10, Math.ceil(maxSerie / 10) * 10)
    const eixoY = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0]
    const eixoAcum = [1, 0.75, 0.5, 0.25, 0].map((k) => fmt(Math.round(goal.meta * k)))

    const pontos = bars.length
    const passo = pontos > 1 ? 100 / (pontos - 1) : 100
    const primeiroDia = Math.max(1, diasPeriodo - pontos + 1)
    const yMeta = (valor: number) => (100 - (Math.min(valor, goal.meta * 1.05) / goal.meta) * 100)

    let acum = 0
    const acumPts = bars.map((b, i) => {
      acum += b.total
      return `${(i * passo).toFixed(2)},${yMeta(acum).toFixed(2)}`
    })
    const acumPoints = acumPts.join(' ')
    const areaPath = `M0,100 L${acumPts.join(' L')} L100,100 Z`
    const porDiaNecessario = goal.meta / diasPeriodo
    const metaPoints = bars
      .map((_, i) => `${(i * passo).toFixed(2)},${yMeta((primeiroDia + i) * porDiaNecessario).toFixed(2)}`)
      .join(' ')

    const gapMeta = Math.round(diasPeriodo * porDiaNecessario - scopedCadastros.length)
    const peak = bars.reduce((m, b) => (b.total > m.total ? b : m), { date: '', label: '', total: -1 })

    return {
      eixoY,
      eixoAcum,
      bars: bars.map((b) => {
        const active = b.total > 0 && b.date === peak.date
        return {
          ...b,
          active,
          h: b.total > 0 ? `${Math.max((b.total / yMax) * 100, 1.5)}%` : '3px',
          cor: active ? '#1f4fd8' : b.total > 0 ? '#c3cfe4' : '#edeff3',
        }
      }),
      acumPoints,
      areaPath,
      metaPoints,
      gapMeta,
      porDiaNecessario: Math.round(porDiaNecessario),
      peak,
      nota: `Barras = fichas lançadas por dia (eixo à esquerda). Linhas = acumulado real contra o ritmo necessário de ${fmt(Math.round(porDiaNecessario))} fichas/dia (eixo à direita). Hoje o acumulado está ${fmt(Math.abs(gapMeta))} fichas ${gapMeta >= 0 ? 'atrás' : 'à frente'} desse ritmo.`,
    }
  }, [evolution, goal.meta, diasPeriodo, scopedCadastros.length])

  const mobBase = mobilizacaoTotals.fichas + mobilizacaoTotals.equipe
  const mobComLancamento = Math.max(0, mobBase - mobilizacaoTotals.pendentes)
  const coberturaPct = mobBase > 0 ? Math.round((mobComLancamento / mobBase) * 100) : 0
  const filtroAtivo = dirFilter !== 'all'
  const dirQuery = filtroAtivo ? `?diretoria=${dirFilter}` : ''
  const dirQueryAmp = filtroAtivo ? `&diretoria=${dirFilter}` : ''
  const totalSistemaFichas = Math.max(totalFichas, 1)

  const maiorZona = zonaData[0]
  const zonasFracas = useMemo(() => {
    if (zonaData.length < 2) return []
    return zonaData.filter((z) => z.value > 0 && z.value <= Math.max(15, Math.ceil(scopedCadastros.length * 0.02)))
  }, [zonaData, scopedCadastros.length])

  const alertas = useMemo((): DashAlert[] => {
    const list: DashAlert[] = []
    if (mobilizacaoTotals.pendentes > 0) {
      list.push({
        cor: '#d97706',
        titulo: 'Formigas sem nenhum lançamento',
        texto: 'Nenhum carro, casa, postagem ou contato registrado desde o início',
        valor: fmt(mobilizacaoTotals.pendentes),
        to: `/ativacao/painel?status=sem_ativacao${dirQueryAmp}`,
      })
    }
    if (zonasFracas.length > 0) {
      const soma = zonasFracas.reduce((a, z) => a + z.value, 0)
      const nomes = zonasFracas
        .slice(0, 2)
        .map((z) => z.name.replace(/^Zona eleitoral\s+/i, ''))
        .join(' e ')
      list.push({
        cor: '#d97706',
        titulo: 'Zonas quase sem cobertura',
        texto: `Zonas ${nomes} somam ${fmt(soma)} fichas — abrir frente de campo`,
        valor: fmt(soma),
        to: `/mapa${dirQuery}`,
      })
    }
    const diasParados = Math.max(0, diasPeriodo - diasAtivosNum)
    if (diasParados > 0 && diasPeriodo > 0) {
      list.push({
        cor: '#1f4fd8',
        titulo: `Coleta parada em ${diasParados} dos ${diasPeriodo} dias`,
        texto: `Todo o volume veio de ${diasAtivosNum} dias; sem ritmo diário a meta não fecha`,
        valor: `${diasAtivosNum}/${diasPeriodo}`,
        to: `/cadastros${dirQuery}`,
      })
    }
    return list.slice(0, 3)
  }, [
    mobilizacaoTotals.pendentes,
    zonasFracas,
    diasPeriodo,
    diasAtivosNum,
    dirQuery,
    dirQueryAmp,
  ])

  const equipeAtiva = ranking.length || scopedNerites.filter((n) => n.ativo).length
  const mediaPorNerite = equipeAtiva > 0 ? Math.round(scopedCadastros.length / equipeAtiva) : 0

  const concentracaoNota = useMemo(() => {
    if (!maiorZona || !scopedCadastros.length) return null
    const pct = Math.round((maiorZona.value / scopedCadastros.length) * 100)
    const zonaLabel = maiorZona.name.replace(/^Zona eleitoral\s+/i, '')
    if (zonasFracas.length === 0) {
      return pct >= 50
        ? `Risco de concentração: ${pct}% das fichas estão na zona ${zonaLabel}.`
        : null
    }
    const fracos = zonasFracas
      .slice(0, 2)
      .map((z) => z.name.replace(/^Zona eleitoral\s+/i, ''))
      .join(' e ')
    const somaFraca = zonasFracas.reduce((a, z) => a + z.value, 0)
    return `Risco de concentração: ${pct}% das fichas estão na zona ${zonaLabel}. As zonas ${fracos} somam ${fmt(somaFraca)} fichas — território praticamente inexplorado.`
  }, [maiorZona, scopedCadastros.length, zonasFracas])

  const somaNerites = ranking.reduce((a, n) => a + n.total, 0)
  const somaLideresTop = topLideres.reduce((a, l) => a + l.total, 0)

  const atividadeNota = useMemo(() => {
    if (!ultimos.length) return 'Sem fichas recentes neste filtro.'
    const todayIso = startOfDay(new Date()).toISOString()
    const deHoje = scopedCadastros.filter((c) => c.created_at >= todayIso)
    if (deHoje.length >= 2) {
      const sorted = [...deHoje].sort((a, b) => a.created_at.localeCompare(b.created_at))
      try {
        const a = format(parseISO(sorted[0].created_at), 'HH:mm')
        const b = format(parseISO(sorted[sorted.length - 1].created_at), 'HH:mm')
        return `Todas as entradas de hoje entre ${a} e ${b}`
      } catch {
        /* fall through */
      }
    }
    return `${ultimos.length} fichas mais recentes do filtro`
  }, [ultimos, scopedCadastros])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div className="nv-dash nv2-dash">
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

      <section className="nv2-meta" aria-label="Meta de fichas e alertas">
        <div className="nv2-meta-card">
          <div className="nv2-meta-head">
            <span>Meta de fichas · global</span>
            <Link to="/configuracoes">Configurar meta</Link>
          </div>
          <div className="nv2-meta-value">
            <strong className="tabular-nums">{fmt(goal.atual)}</strong>
            <span>de {fmt(goal.meta)} fichas</span>
            <span className="nv2-meta-pct">
              <em className="tabular-nums">{pctLabel}</em>
              <span>da meta</span>
            </span>
          </div>
          <div className="nv2-meta-bar" role="progressbar" aria-valuenow={pctFine} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${Math.max(pctFine, goal.batida ? 100 : 0.6)}%` }} />
          </div>
          <div className="nv2-meta-stats">
            <div>
              <span>Faltam</span>
              <strong className="tabular-nums">{goal.batida ? '0' : fmt(goal.restante)}</strong>
              <em>{goal.batida ? 'meta alcançada' : 'fichas para a meta'}</em>
            </div>
            <div>
              <span>Ritmo</span>
              <strong className="tabular-nums">{ritmo > 0 ? `${fmt(ritmo)}/dia` : '—'}</strong>
              <em>média dos {diasAtivosNum} dias com coleta</em>
            </div>
            <div>
              <span>Projeção</span>
              <strong className="tabular-nums">
                {goal.batida ? '0 dias' : diasParaMeta != null ? `${diasParaMeta} dias` : '—'}
              </strong>
              <em>de coleta para fechar a meta</em>
            </div>
          </div>
        </div>

        <div className="nv2-alerts">
          <div className="nv2-alerts-head">
            <span>Precisa da sua atenção</span>
            <em>{alertas.length}</em>
          </div>
          <div className="nv2-alerts-list">
            {alertas.length ? alertas.map((a) => (
              <Link key={a.titulo} to={a.to} className="nv2-alert">
                <span className="nv2-alert-dot" style={{ background: a.cor }} />
                <span className="nv2-alert-body">
                  <strong>{a.titulo}</strong>
                  <span>{a.texto}</span>
                </span>
                <strong className="nv2-alert-valor tabular-nums">{a.valor}</strong>
              </Link>
            )) : (
              <div className="nv-empty">Nenhum alerta no momento.</div>
            )}
          </div>
        </div>
      </section>

      <section className="nv2-kpis" aria-label="Indicadores do período">
        <div className="nv2-kpi">
          <span className="nv2-kpi-label">Fichas no período</span>
          <div className="nv2-kpi-row">
            <strong className="tabular-nums">{fmt(scopedCadastros.length)}</strong>
            <em className="nv2-kpi-tag tone-muted">{Math.round(pctFine)}% da meta</em>
          </div>
          <span className="nv2-kpi-hint">{escopoCurto} · {periodLabel}</span>
        </div>
        <div className="nv2-kpi">
          <span className="nv2-kpi-label">Cadastradas hoje</span>
          <div className="nv2-kpi-row">
            <strong className="tabular-nums">{fmt(todayCount)}</strong>
            <em className="nv2-kpi-tag tone-green">
              {scopedCadastros.length
                ? `${Math.round((todayCount / scopedCadastros.length) * 100)}% do total`
                : '0% do total'}
            </em>
          </div>
          <span className="nv2-kpi-hint">{ultimoLancamento}</span>
        </div>
        <div className="nv2-kpi">
          <span className="nv2-kpi-label">Zonas alcançadas</span>
          <div className="nv2-kpi-row">
            <strong className="tabular-nums">{zonas}</strong>
            {maiorZona && (
              <em className="nv2-kpi-tag tone-muted">
                {maiorZona.name.replace(/^Zona eleitoral\s+/i, '')} lidera
              </em>
            )}
          </div>
          <span className="nv2-kpi-hint">
            {maiorZona && scopedCadastros.length
              ? `${Math.round((maiorZona.value / scopedCadastros.length) * 100)}% das fichas em uma zona só`
              : 'nenhuma zona no filtro'}
          </span>
        </div>
        <div className="nv2-kpi">
          <span className="nv2-kpi-label">Equipe ativa</span>
          <div className="nv2-kpi-row">
            <strong className="tabular-nums">{fmt(equipeAtiva)}</strong>
            <em className="nv2-kpi-tag tone-muted">nerites</em>
          </div>
          <span className="nv2-kpi-hint">
            {equipeAtiva
              ? `${fmt(mediaPorNerite)} fichas por nerite em média`
              : 'nenhuma nerite com lançamentos'}
          </span>
        </div>
      </section>

      <section aria-label="Diretorias e equipes">
        <div className="nv-section-head">
          <div>
            <h2 className="nv-section-title">Diretorias e suas equipes</h2>
            <p>Clique no card para filtrar o painel inteiro</p>
          </div>
          <span className="nv-section-hint">
            {fmt(totalFichas)} fichas no sistema
            {fichasSemDiretoria > 0 ? ` · ${fichasSemDiretoria} sem diretoria` : ' · 0 sem diretoria'}
          </span>
        </div>
        <div className="nv2-dir-grid">
          {dirStats.map((d) => {
            const ativo = dirFilter === d.id
            const share = Math.round((d.fichadas / totalSistemaFichas) * 100)
            const porNerite = d.nerites > 0 ? Math.round(d.fichadas / d.nerites) : 0
            const porLider = d.lideres > 0
              ? (d.fichadas / d.lideres).toFixed(1).replace('.', ',')
              : '0'
            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                className={`nv2-dir-card${ativo ? ' active' : ''}`}
                onClick={() => setDirFilter(ativo ? 'all' : d.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setDirFilter(ativo ? 'all' : d.id)
                  }
                }}
              >
                <div className="nv2-dir-top">
                  <span className={`nv2-dir-avatar tone-${d.tone}${ativo ? ' on' : ''}`}>
                    {initials(d.nome)}
                  </span>
                  <div className="nv2-dir-copy">
                    <div className="nv2-dir-name">
                      {d.nome}
                      {ativo && <em>filtrando</em>}
                    </div>
                    <p>
                      {d.fichadas > 0
                        ? `${share}% das fichas · ${fmt(porNerite)} fichas por nerite`
                        : 'sem fichas lançadas'}
                    </p>
                  </div>
                  <div className="nv2-dir-count">
                    <strong className={`tabular-nums${d.fichadas === 0 ? ' is-zero' : ''}`}>
                      {fmt(d.fichadas)}
                    </strong>
                    <span>fichas</span>
                  </div>
                </div>
                <div className="nv-bar thin">
                  <i style={{ width: `${Math.min(100, share)}%` }} />
                </div>
                <div className="nv2-dir-minis">
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
                <div className="nv2-dir-foot">
                  <span>
                    {ativo
                      ? 'filtro ativo — clique para remover'
                      : `${porLider} fichas por liderança · clique para filtrar`}
                  </span>
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

      <section className="nv2-ritmo" aria-label="Ritmo de coleta">
        <div className="nv2-panel">
          <div className="nv2-panel-head">
            <div>
              <h2>Ritmo de coleta</h2>
              <p>{escopoCurto} · fichas por dia nos últimos 14 dias</p>
            </div>
            <div className="nv2-panel-stats">
              <div>
                <span>Dias ativos</span>
                <strong className="tabular-nums">{diasAtivosNum}/{diasPeriodo}</strong>
              </div>
              <div>
                <span>Melhor dia</span>
                <strong className="tabular-nums">
                  {melhorDia.total > 0 ? `${fmt(melhorDia.total)} · ${melhorDia.label}` : '—'}
                </strong>
              </div>
            </div>
          </div>
          <div className="nv2-ritmo-legend">
            <span><i className="nv2-leg-bar" />Fichas por dia</span>
            <span><i className="nv2-leg-line" />Acumulado (eixo direito)</span>
            <span><i className="nv2-leg-dash" />Ritmo necessário p/ meta</span>
          </div>
          <div className="nv2-ritmo-chart">
            <div className="nv2-ritmo-y">
              {ritmoChart.eixoY.map((t) => (
                <span key={`y-${t}`}>{t}</span>
              ))}
            </div>
            <div className="nv2-ritmo-main">
              <div className="nv2-ritmo-plot">
                <div className="nv2-ritmo-grid" aria-hidden>
                  <div /><div /><div /><div /><div />
                </div>
                <div className="nv2-ritmo-bars">
                  {ritmoChart.bars.map((b, i) => (
                    <div className="nv2-ritmo-col" key={`${b.date}-${i}`}>
                      <div
                        className={`nv2-ritmo-bar${b.active ? ' active' : ''}`}
                        style={{ height: b.h, background: b.cor }}
                        title={`${b.date}: ${b.total}`}
                      />
                    </div>
                  ))}
                </div>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="nv2-ritmo-svg" aria-hidden>
                  <path d={ritmoChart.areaPath} fill="rgba(15,138,95,.08)" stroke="none" />
                  <polyline
                    points={ritmoChart.metaPoints}
                    fill="none"
                    stroke="#c3cbd8"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                  />
                  <polyline
                    points={ritmoChart.acumPoints}
                    fill="none"
                    stroke="#0f8a5f"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <div className="nv2-ritmo-badge">
                  <span>Acumulado</span>
                  <strong className="tabular-nums">{fmt(scopedCadastros.length)}</strong>
                  <em>
                    {pctLabel} da meta · {fmt(Math.abs(ritmoChart.gapMeta))}{' '}
                    {ritmoChart.gapMeta >= 0 ? 'atrás' : 'à frente'} do ritmo
                  </em>
                </div>
              </div>
              <div className="nv2-ritmo-labels">
                {ritmoChart.bars.map((b, i) => (
                  <span key={`${b.label}-l-${i}`} className={b.active ? 'on' : undefined}>
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="nv2-ritmo-y acum">
              {ritmoChart.eixoAcum.map((t) => (
                <span key={`a-${t}`}>{t}</span>
              ))}
            </div>
          </div>
          <div className="nv2-panel-note">{ritmoChart.nota}</div>
        </div>
      </section>

      <section className="nv2-campo" aria-label="Formigas e demandas">
        <div className="nv2-panel">
          <div className="nv2-panel-head">
            <div>
              <h2>Formigas · mobilização de rua</h2>
              <p>
                {fmt(mobBase)} pessoas no escopo · carro, casa, postagem e contato
              </p>
            </div>
            <Link to={`/ativacao/painel${dirQuery}`}>Abrir painel →</Link>
          </div>
          <div className="nv2-tiles">
            {([
              ['Carros', mobilizacaoTotals.carros, 'veículos adesivados', 'com_carro'],
              ['Casas', mobilizacaoTotals.casa, 'adesivo residencial', 'casa_sim'],
              ['Postagens', mobilizacaoTotals.postagens, 'links validados', 'com_links'],
              ['WhatsApp', mobilizacaoTotals.whatsapp, 'contatos confirmados', 'contato_sim'],
            ] as const).map(([label, value, hint, status]) => (
              <Link
                key={status}
                to={`/ativacao/painel?status=${status}${dirQueryAmp}`}
                className="nv2-tile"
              >
                <span>{label}</span>
                <strong className="tabular-nums">{fmt(value)}</strong>
                <em>{hint}</em>
              </Link>
            ))}
          </div>
          <div className="nv2-mob-pend">
            <div className="nv2-mob-pend-row">
              <div>
                <strong>Sem nenhum lançamento</strong>
                <span>pessoas que ainda não tiveram carro, casa, postagem ou contato registrados</span>
              </div>
              <span className="nv2-mob-pend-val">
                <em className="nv-pill-warn">pendente</em>
                <strong className="tabular-nums">{fmt(mobilizacaoTotals.pendentes)}</strong>
              </span>
            </div>
            <div className="nv-bar amber">
              <i style={{ width: `${Math.max(coberturaPct, mobComLancamento > 0 ? 2 : 0)}%` }} />
            </div>
            <div className="nv2-mob-cover">
              <span>Cobertura de mobilização</span>
              <span className="tabular-nums">
                {fmt(mobComLancamento)} de {fmt(mobBase)} · {coberturaPct}%
              </span>
            </div>
          </div>
          <div className="nv2-panel-note">
            {mobilizacaoTotals.pendentes > 0 && scopedLideres.length > 0
              ? `Estrutura montada: comece pelas ${fmt(scopedLideres.length)} lideranças — elas puxam carro e postagem da própria base.`
              : coberturaPct >= 80
                ? 'Cobertura de mobilização em bom nível no escopo atual.'
                : 'Acompanhe o lançamento de carro, casa, postagem e contato WhatsApp no painel Formigas.'}
          </div>
        </div>

        <div className="nv2-panel">
          <div className="nv2-panel-head">
            <div>
              <h2>Demandas</h2>
              <p>Pedidos registrados pelo administrativo</p>
            </div>
            <Link to="/demandas/painel">Visualizar →</Link>
          </div>
          <div className="nv2-tiles two">
            <Link to="/demandas/painel" className="nv2-tile">
              <span>Em aberto</span>
              <strong className="tabular-nums">{fmt(demandaCounts.abertas)}</strong>
              <em>aguardando resposta</em>
            </Link>
            <Link to="/demandas/painel" className="nv2-tile">
              <span>Concluídas</span>
              <strong className="tabular-nums">{fmt(demandaCounts.feitas)}</strong>
              <em>histórico do período</em>
            </Link>
          </div>
          <div className="nv2-urg">
            <span className="nv2-urg-label">Fila por urgência</span>
            {URGENCIA_ROWS.map((u) => {
              const valor = urgenciaCounts[u.key]
              return (
                <div key={u.key} className="nv2-urg-row">
                  <span className="nv2-alert-dot" style={{ background: u.cor }} />
                  <span>{u.label}</span>
                  <strong
                    className="tabular-nums"
                    style={{ color: valor > 0 ? '#111827' : '#9aa1ad' }}
                  >
                    {fmt(valor)}
                  </strong>
                </div>
              )
            })}
          </div>
          <div className="nv2-dem-box">
            {demandaCounts.abertas === 0 ? (
              <>
                <strong>Fila zerada</strong>
                <span>
                  O administrativo registra os pedidos do eleitorado. Enquanto nada entra, não há nada
                  represado — o indicador a observar é o tempo de resposta quando a fila encher.
                </span>
              </>
            ) : (
              <>
                <strong>{fmt(demandaCounts.abertas)} demandas em aberto</strong>
                <span>
                  Priorize urgentes e altas na fila. O painel de demandas mostra o detalhe e o histórico.
                </span>
              </>
            )}
            <Link to="/demandas/painel">Ver histórico de demandas →</Link>
          </div>
        </div>
      </section>

      <section className="nv2-territorio" aria-label="Mapa e concentração territorial">
        <div className="nv2-panel">
          <div className="nv2-panel-head pad">
            <div>
              <h2>Mapa por zona eleitoral</h2>
              <p>Intensidade pelas fichas do filtro atual</p>
            </div>
            <Link to={`/mapa${dirQuery}`}>Mapa completo →</Link>
          </div>
          <div className="nv2-map-wrap">
            <CadastrosMap markers={mapMarkers} height={330} showLegend={false} />
            <div className="nv-map-legend" aria-hidden>
              <div className="nv-map-legend-title">Intensidade</div>
              <div className="nv-map-legend-row">
                <span className="nv-map-legend-swatch" style={{ background: '#7fd8c4' }} /> Baixa
              </div>
              <div className="nv-map-legend-row">
                <span className="nv-map-legend-swatch" style={{ background: '#f2cf6a' }} /> Média
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

        <div className="nv2-panel">
          <div className="nv2-panel-head border">
            <div>
              <h2>Concentração territorial</h2>
              <p>
                {scopedCadastros.length
                  ? `${fmt(scopedCadastros.length)} fichas em ${zonas} ${zonas === 1 ? 'zona' : 'zonas'} eleitorais`
                  : 'nenhuma ficha no filtro'}
              </p>
            </div>
          </div>
          {zonaData.length ? (
            <>
              <div className="nv2-zona-list">
                {zonaData.slice(0, 4).map((z, i) => {
                  const pct = scopedCadastros.length
                    ? Math.round((z.value / scopedCadastros.length) * 100)
                    : 0
                  const zonaLabel = z.name.replace(/^Zona eleitoral\s+/i, '')
                  return (
                    <div key={z.name} className="nv2-zona-row">
                      <div className="nv2-zona-top">
                        <span>Zona {zonaLabel}</span>
                        <span className="tabular-nums">{fmt(z.value)} · {pct}%</span>
                      </div>
                      <div className="nv-bar thin">
                        <i style={{
                          width: `${Math.max(pct, z.value > 0 ? 1.5 : 0)}%`,
                          background: ZONA_BAR_COLORS[Math.min(i, ZONA_BAR_COLORS.length - 1)],
                        }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              {concentracaoNota && (
                <div className="nv2-concentracao-nota">{concentracaoNota}</div>
              )}
              {topSecoes.length > 0 && (
                <div className="nv2-secoes">
                  <div className="nv2-urg-label">Seções mais ativas</div>
                  {topSecoes.map((s) => (
                    <Link
                      key={s.n}
                      to={`/cadastros?secao=${encodeURIComponent(s.n)}${dirQueryAmp}`}
                      className="nv2-secao-row"
                    >
                      <span>Seção {s.n}</span>
                      <span className="tabular-nums">{s.v}</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="nv-empty">Nenhuma ficha neste filtro — sem zonas para exibir.</div>
          )}
        </div>
      </section>

      <section aria-label="Desempenho da operação">
        <div className="nv-section-head">
          <div>
            <h2 className="nv-section-title">Desempenho da operação</h2>
            <p>Quem produz, quem entrega e o que entrou por último</p>
          </div>
        </div>
        <div className="nv2-desempenho">
          <div className="nv2-panel">
            <div className="nv2-panel-head border">
              <div>
                <h3>Produção por nerite</h3>
                <p>Fichas no filtro atual</p>
              </div>
              <Link to="/nerites">Ver tudo →</Link>
            </div>
            {ranking.length ? (
              <>
                <div className="nv2-rank-list">
                  {ranking.map((nerite, index) => (
                    <Link to={`/nerites/${nerite.id}`} className="nv2-rank-row" key={nerite.id}>
                      <span className={`nv2-rank-pos${index === 0 ? ' top' : ''}`}>{index + 1}</span>
                      <div className="nv2-rank-body">
                        <div className="nv2-rank-meta">
                          <span>{nerite.nome}</span>
                          <strong className="tabular-nums">
                            {fmt(nerite.total)} <em>{nerite.share}%</em>
                          </strong>
                        </div>
                        <div className="nv-bar thin">
                          <i style={{ width: `${Math.max((nerite.total / maxRank) * 100, 4)}%` }} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="nv2-panel-note">
                  {ranking.length} {ranking.length === 1 ? 'nerite concentra' : 'nerites concentram'}{' '}
                  {fmt(somaNerites)} das {fmt(scopedCadastros.length)} fichas
                  ({scopedCadastros.length ? Math.round((somaNerites / scopedCadastros.length) * 100) : 0}%).
                </div>
              </>
            ) : (
              <div className="nv-empty">Nenhuma nerite com lançamentos neste filtro.</div>
            )}
          </div>

          <div className="nv2-panel">
            <div className="nv2-panel-head border">
              <div>
                <h3>Lideranças que entregam</h3>
                <p>
                  Top 5 entre {fmt(scopedLideres.length || topLideres.length)} lideranças
                  {scopedLideres.length ? ' cadastradas' : ' no filtro'}
                </p>
              </div>
              <Link to="/lideranca">Ver tudo →</Link>
            </div>
            {topLideres.length ? (
              <>
                <div className="nv2-rank-list">
                  {topLideres.map((lider, index) => (
                    <Link
                      to={`/cadastros?lider=${encodeURIComponent(lider.nome)}${dirQueryAmp}`}
                      className="nv2-rank-row"
                      key={lider.nome}
                    >
                      <span className={`nv2-rank-pos${index === 0 ? ' top' : ''}`}>{index + 1}</span>
                      <div className="nv2-rank-body">
                        <div className="nv2-rank-meta">
                          <span>{lider.nome}</span>
                          <strong className="tabular-nums">
                            {fmt(lider.total)} <em>{lider.share}%</em>
                          </strong>
                        </div>
                        <div className="nv-bar thin">
                          <i style={{ width: `${Math.max((lider.total / maxLider) * 100, 4)}%` }} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="nv2-panel-note">
                  As {topLideres.length} maiores lideranças respondem por{' '}
                  {scopedCadastros.length
                    ? Math.round((somaLideresTop / scopedCadastros.length) * 100)
                    : 0}
                  % das fichas — base pulverizada, sem dependência de um único nome.
                </div>
              </>
            ) : (
              <div className="nv-empty">Sem lideranças com fichas neste filtro.</div>
            )}
          </div>

          <div className="nv2-panel">
            <div className="nv2-panel-head border">
              <div>
                <h3>Últimas fichas</h3>
                <p>Entradas mais recentes do filtro</p>
              </div>
            </div>
            {ultimos.length ? (
              <>
                <div className="nv2-activity-list">
                  {ultimos.map((item) => (
                    <div className="nv2-activity-row" key={item.id}>
                      <div>
                        <strong>{item.nome}</strong>
                        <span>{item.detalhe}</span>
                      </div>
                      <time>{item.data}</time>
                    </div>
                  ))}
                </div>
                <div className="nv2-panel-note">{atividadeNota}</div>
              </>
            ) : (
              <div className="nv-empty">Sem fichas registradas neste filtro.</div>
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
