import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  MapPin,
  Layers,
  ClipboardList,
  ShieldCheck,
  CircleCheck,
  CircleAlert,
  CircleMinus,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { KpiCard } from '../components/ui/KpiCard'
import { Card } from '../components/ui/Card'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { Spinner } from '../components/ui/Spinner'
import { EvolutionChart } from '../components/charts/EvolutionChart'
import { ZonaDonutChart } from '../components/charts/ZonaDonutChart'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { buildEvolutionData, buildZonaData, fetchCadastros } from '../lib/cadastros'
import { supabase } from '../lib/supabase'
import { formatCep } from '../lib/format'
import type { Cadastro, Profile } from '../types'

export function DashboardPage() {
  return <AdminDashboard />
}

function AdminDashboard() {
  const { profile } = useAuth()
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d')
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cData, oData] = await Promise.all([
          fetchCadastros({ period }),
          supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
        ])
        setCadastros(cData)
        setNerites((oData.data ?? []) as Profile[])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [period])

  const neriteById = useMemo(() => {
    const map = new Map<string, Profile>()
    nerites.forEach((n) => map.set(n.id, n))
    return map
  }, [nerites])

  const kpis = useMemo(() => {
    const zonasSet = new Set(cadastros.map((c) => c.zona).filter(Boolean))
    const secoesSet = new Set(cadastros.map((c) => c.secao).filter(Boolean))
    const neritesAtivas = new Set(cadastros.map((c) => c.operator_id))
    const comGeo = cadastros.filter((c) => c.lat != null && c.lng != null).length
    const cobertura = cadastros.length ? Math.round((comGeo / cadastros.length) * 100) : 0
    return {
      total: cadastros.length,
      nerites: neritesAtivas.size,
      zonas: zonasSet.size,
      secoes: secoesSet.size,
      cobertura,
    }
  }, [cadastros])

  const ranking = useMemo(() => {
    const counts = new Map<string, number>()
    cadastros.forEach((c) => counts.set(c.operator_id, (counts.get(c.operator_id) ?? 0) + 1))
    return nerites
      .map((op) => ({
        id: op.id,
        nome: op.nome,
        total: counts.get(op.id) ?? 0,
      }))
      .filter((o) => o.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        share: cadastros.length ? Math.round((item.total / cadastros.length) * 100) : 0,
      }))
  }, [cadastros, nerites])

  const ultimos = useMemo(
    () =>
      [...cadastros]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          nome: c.nome_completo,
          nerite: neriteById.get(c.operator_id)?.nome ?? '—',
          cep: c.cep ? formatCep(c.cep) : '—',
          data: formatShortDateTime(c.created_at),
        })),
    [cadastros, neriteById],
  )

  const situacao = useMemo(() => {
    const total = nerites.length
    if (!total) return []
    const ativas = nerites.filter((n) => n.ativo).length
    const inativas = total - ativas
    const withActivity = new Set(cadastros.map((c) => c.operator_id))
    const semAtividade = nerites.filter((n) => !withActivity.has(n.id)).length
    return [
      { label: 'Ativas', pct: Math.round((ativas / total) * 100), tone: 'success' as const, icon: CircleCheck },
      { label: 'Inativas', pct: Math.round((inativas / total) * 100), tone: 'warning' as const, icon: CircleAlert },
      { label: 'Sem atividade', pct: Math.round((semAtividade / total) * 100), tone: 'neutral' as const, icon: CircleMinus },
    ]
  }, [nerites, cadastros])

  const evolution = useMemo(() => buildEvolutionData(cadastros), [cadastros])
  const zonaData = useMemo(() => buildZonaData(cadastros), [cadastros])
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
          <h1>Bem-vindo, {profile?.nome ?? 'Administrador'}</h1>
          <p>Acompanhe o desempenho do levantamento em tempo real.</p>
        </div>
        <div className="dashboard-heading-actions">
          <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} />
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Cadastros realizados"
          value={kpis.total.toLocaleString('pt-BR')}
          icon={ClipboardList}
          accent="blue"
          helper="No período selecionado"
          delta={kpis.total ? '↑' : '—'}
          deltaTone={kpis.total ? 'up' : 'neutral'}
        />
        <KpiCard
          label="Nerites ativas"
          value={kpis.nerites}
          icon={Users}
          accent="green"
          helper="Em atividade"
          delta={kpis.nerites ? '↑' : '—'}
          deltaTone={kpis.nerites ? 'up' : 'neutral'}
        />
        <KpiCard
          label="Zonas alcançadas"
          value={kpis.zonas}
          icon={MapPin}
          accent="purple"
          helper="Cobertura de zonas"
          delta={kpis.zonas ? `${kpis.zonas}` : '—'}
          deltaTone="neutral"
        />
        <KpiCard
          label="Seções mapeadas"
          value={kpis.secoes}
          icon={Layers}
          accent="orange"
          helper="Com registros"
          delta={kpis.secoes ? '↑' : '—'}
          deltaTone={kpis.secoes ? 'up' : 'neutral'}
        />
        <KpiCard
          label="Cobertura territorial"
          value={`${kpis.cobertura}%`}
          icon={ShieldCheck}
          accent="blue"
          helper="Áreas com cadastros"
          delta={kpis.cobertura ? '↑' : '—'}
          deltaTone={kpis.cobertura ? 'up' : 'neutral'}
        />
      </div>

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
        <Card title="Distribuição por zona eleitoral" subtitle="Participação de cada zona" className="chart-card">
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
        <Card title="Top 5 nerites" subtitle="Cadastros no período selecionado" className="analysis-card">
          {ranking.length ? (
            <>
              <div className="ranking-head">
                <span>#</span>
                <span>Nerite</span>
                <span>Cadastros</span>
                <span>%</span>
              </div>
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
            </>
          ) : (
            <div className="empty-card">
              <strong>Sem ranking ainda</strong>
              <span>O ranking aparece quando as nerites começarem a cadastrar.</span>
            </div>
          )}
        </Card>

        <Card title="Últimos cadastros" subtitle="Registros mais recentes" className="analysis-card">
          {ultimos.length ? (
            <div className="recent-list">
              {ultimos.map((item) => (
                <div className="recent-row" key={item.id}>
                  <div>
                    <strong>{item.nome}</strong>
                    <span>
                      {item.nerite} · CEP {item.cep}
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

        <Card title="Situação das nerites" subtitle="Distribuição por atividade" className="analysis-card">
          {situacao.length ? (
            <div className="situacao-list">
              {situacao.map((item) => {
                const Icon = item.icon
                return (
                  <div className={`situacao-row situacao-${item.tone}`} key={item.label}>
                    <div className="situacao-icon">
                      <Icon size={17} />
                    </div>
                    <span>{item.label}</span>
                    <strong>{item.pct}%</strong>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty-card">
              <strong>Nenhuma nerite cadastrada</strong>
              <span>Crie a primeira conta em Nerites → Nova nerite.</span>
            </div>
          )}
        </Card>
      </div>
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
