import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { KpiCard } from '../components/ui/KpiCard'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { EvolutionChart } from '../components/charts/EvolutionChart'
import { ZonaDonutChart } from '../components/charts/ZonaDonutChart'
import { CadastrosMap } from '../components/map/CadastrosMap'
import { formatCpf, formatDate, formatDateTime } from '../lib/format'
import { buildEvolutionData, buildMapMarkers, buildZonaData, fetchCadastros } from '../lib/cadastros'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { supabase } from '../lib/supabase'
import type { Cadastro, Importacao, Profile } from '../types'

export function OperadorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [operador, setOperador] = useState<Profile | null>(null)
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d')
  const [loading, setLoading] = useState(true)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  useEffect(() => {
    if (!id) return
    async function load() {
      setLoading(true)
      const [profileRes, cads, imports] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        fetchCadastros({ operatorId: id, period }),
        supabase.from('importacoes').select('*').eq('operator_id', id).order('created_at', { ascending: false }).limit(5),
      ])
      setOperador(profileRes.data as Profile | null)
      setCadastros(cads)
      setImportacoes((imports.data ?? []) as Importacao[])
      setLoading(false)
    }
    load()
  }, [id, period])

  const evolution = useMemo(() => buildEvolutionData(cadastros), [cadastros])
  const zonaData = useMemo(() => buildZonaData(cadastros), [cadastros])
  const mapMarkers = useMemo(() => buildMapMarkers(cadastros), [cadastros])
  const secoes = useMemo(() => new Set(cadastros.map((c) => c.secao)).size, [cadastros])
  const lastRecords = cadastros.slice(0, 10)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  if (!operador) {
    return <EmptyState title="Nerite não encontrada" action={<Link to="/nerites">Voltar</Link>} />
  }

  return (
    <div>
      <Link to="/nerites" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--color-primary)', fontSize: '0.875rem' }}>
        <ArrowLeft size={16} /> Voltar
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">{operador.nome}</h1>
          <p className="page-subtitle">Análise individual da nerite</p>
        </div>
        <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <KpiCard label="Total no período" value={cadastros.length} icon={ClipboardList} accent="blue" />
        <KpiCard label="Zonas eleitorais" value={zonaData.length} icon={ClipboardList} accent="purple" />
        <KpiCard label="Seções eleitorais" value={secoes} icon={ClipboardList} accent="orange" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <Card title="Evolução diária" className="chart-card">
          <EvolutionChart data={evolution} />
        </Card>
        <Card title="Distribuição por zona eleitoral" className="chart-card">
          <ZonaDonutChart data={zonaData} />
        </Card>
      </div>

      <Card title="Mapa por CEP" style={{ marginBottom: '1.5rem' }}>
        <CadastrosMap markers={mapMarkers} />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <Card title="Últimos cadastros">
          {!lastRecords.length ? (
            <EmptyState title="Sem cadastros" />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {lastRecords.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nome_completo}</td>
                      <td>{formatCpf(c.cpf) || '—'}</td>
                      <td>{formatDate(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Importações recentes">
          {!importacoes.length ? (
            <EmptyState title="Sem importações" />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Válidos</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {importacoes.map((imp) => (
                    <tr key={imp.id}>
                      <td>{imp.nome_arquivo}</td>
                      <td>{imp.validos}</td>
                      <td>{formatDateTime(imp.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
