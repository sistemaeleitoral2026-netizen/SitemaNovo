import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  ClipboardList,
  MapPin,
  Layers,
  TrendingUp,
  Map as MapIcon,
} from 'lucide-react'
import { KpiCard } from '../components/ui/KpiCard'
import { Card } from '../components/ui/Card'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { Spinner } from '../components/ui/Spinner'
import { BarChartOperadores } from '../components/charts/BarChartOperadores'
import { EvolutionChart } from '../components/charts/EvolutionChart'
import { ZonaDonutChart } from '../components/charts/ZonaDonutChart'
import { CadastrosMap } from '../components/map/CadastrosMap'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { buildEvolutionData, buildMapMarkers, buildZonaData, fetchCadastros } from '../lib/cadastros'
import { supabase } from '../lib/supabase'
import type { Cadastro, Profile } from '../types'

export function DashboardPage() {
  return <AdminDashboard />
}

function AdminDashboard() {
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
          supabase.from('profiles').select('*').eq('role', 'operador').eq('ativo', true),
        ])
        setCadastros(cData)
        setNerites((oData.data ?? []) as Profile[])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [period])

  const kpis = useMemo(() => {
    const zonas = new Set(cadastros.map((c) => c.zona))
    const secoes = new Set(cadastros.map((c) => c.secao))
    const ceps = new Set(cadastros.map((c) => c.cep).filter(Boolean))
    const neritesAtivas = new Set(cadastros.map((c) => c.operator_id))
    const comGeo = cadastros.filter((c) => c.lat != null && c.lng != null).length
    return {
      total: cadastros.length,
      nerites: neritesAtivas.size,
      zonas: zonas.size,
      secoes: secoes.size,
      ceps: ceps.size,
      coberturaGeo: cadastros.length ? Math.round((comGeo / cadastros.length) * 100) : 0,
    }
  }, [cadastros])

  const porNerite = useMemo(() => {
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
  }, [cadastros, nerites])

  const evolution = useMemo(() => buildEvolutionData(cadastros), [cadastros])
  const zonaData = useMemo(() => buildZonaData(cadastros), [cadastros])
  const mapMarkers = useMemo(() => buildMapMarkers(cadastros), [cadastros])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div>
      <div
        className="dashboard-hero"
        style={{
          background: 'linear-gradient(135deg, var(--color-navy) 0%, #1e3a8a 55%, var(--color-primary) 100%)',
          borderRadius: '14px',
          padding: '1.5rem 1.75rem',
          color: '#fff',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div>
          <p style={{ fontSize: '0.8125rem', opacity: 0.8, marginBottom: '0.35rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Painel administrativo
          </p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.35rem' }}>Dashboard</h1>
          <p style={{ opacity: 0.85, maxWidth: 520, fontSize: '0.9375rem' }}>
            Visão consolidada dos cadastros feitos pelas nerites, zonas eleitorais e localização por CEP.
          </p>
        </div>
        <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} />
      </div>

      <style>{`
        .dashboard-hero span { color: rgba(255,255,255,0.75) !important; }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <KpiCard label="Total de cadastros" value={kpis.total} icon={ClipboardList} accent="blue" />
        <KpiCard label="Nerites com atividade" value={kpis.nerites} icon={Users} accent="green" />
        <KpiCard label="Zonas eleitorais" value={kpis.zonas} icon={MapPin} accent="purple" />
        <KpiCard label="Seções eleitorais" value={kpis.secoes} icon={Layers} accent="orange" />
        <KpiCard label="CEPs distintos" value={kpis.ceps} icon={MapIcon} accent="blue" />
        <KpiCard label="Cobertura no mapa" value={`${kpis.coberturaGeo}%`} icon={TrendingUp} accent="green" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <Card title="Cadastros por nerite" className="chart-card">
          <BarChartOperadores data={porNerite} />
        </Card>
        <Card title="Evolução temporal" className="chart-card">
          <EvolutionChart data={evolution} />
        </Card>
        <Card title="Distribuição por zona eleitoral" className="chart-card">
          <ZonaDonutChart data={zonaData} />
        </Card>
      </div>

      <Card
        title="Mapa por CEP"
        className="chart-card"
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Cada marcador representa um CEP onde as nerites cadastraram pessoas.{' '}
          <Link to="/mapa" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Abrir mapa completo</Link>
        </p>
        <CadastrosMap markers={mapMarkers} height={360} />
      </Card>
    </div>
  )
}
