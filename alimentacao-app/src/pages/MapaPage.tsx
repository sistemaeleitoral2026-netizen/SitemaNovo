import { useEffect, useMemo, useState } from 'react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { CadastrosMap } from '../components/map/CadastrosMap'
import { buildMapMarkers, fetchCadastros } from '../lib/cadastros'
import { formatCep } from '../lib/format'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { supabase } from '../lib/supabase'
import type { Cadastro, Profile } from '../types'

export function MapaPage() {
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d')
  const [operatorId, setOperatorId] = useState('')
  const [cep, setCep] = useState('')
  const [zona, setZona] = useState('')
  const [secao, setSecao] = useState('')
  const [loading, setLoading] = useState(true)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [cads, ops] = await Promise.all([
        fetchCadastros({ period }),
        supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
      ])
      setCadastros(cads)
      setNerites((ops.data ?? []) as Profile[])
      setLoading(false)
    }
    load()
  }, [period])

  const filtered = useMemo(() => {
    return cadastros.filter((c) => {
      if (operatorId && c.operator_id !== operatorId) return false
      if (cep && c.cep !== cep) return false
      if (zona && c.zona !== zona) return false
      if (secao && c.secao !== secao) return false
      return true
    })
  }, [cadastros, operatorId, cep, zona, secao])

  const markers = useMemo(() => buildMapMarkers(filtered), [filtered])

  const ceps = useMemo(
    () => [...new Set(cadastros.map((c) => c.cep).filter(Boolean))].sort(),
    [cadastros],
  )
  const zonas = useMemo(() => [...new Set(cadastros.map((c) => c.zona))].sort(), [cadastros])
  const secoes = useMemo(() => [...new Set(cadastros.map((c) => c.secao))].sort(), [cadastros])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Mapa por CEP</h1>
          <p className="page-subtitle">
            Mapa de calor: quanto mais pessoas no mesmo CEP, mais quente o ponto
          </p>
        </div>
      </div>

      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: '0.375rem' }}>Período</label>
            <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} />
          </div>
          <Select
            label="Nerite"
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            placeholder="Todas"
            options={nerites.map((o) => ({ value: o.id, label: o.nome }))}
          />
          <Select
            label="CEP"
            value={cep}
            onChange={(e) => setCep(e.target.value)}
            placeholder="Todos"
            options={ceps.map((c) => ({ value: c, label: formatCep(c) }))}
          />
          <Select
            label="Zona eleitoral"
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            placeholder="Todas"
            options={zonas.map((z) => ({ value: z, label: `Zona ${z}` }))}
          />
          <Select
            label="Seção eleitoral"
            value={secao}
            onChange={(e) => setSecao(e.target.value)}
            placeholder="Todas"
            options={secoes.map((s) => ({ value: s, label: `Seção ${s}` }))}
          />
        </div>
      </Card>

      <Card padding={false}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
            <Spinner size={40} />
          </div>
        ) : (
          <CadastrosMap markers={markers} height={520} />
        )}
      </Card>

      {!loading && (
        <p style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          {markers.length} CEP(s) no mapa · {filtered.length} cadastro(s) filtrados
        </p>
      )}
    </div>
  )
}
