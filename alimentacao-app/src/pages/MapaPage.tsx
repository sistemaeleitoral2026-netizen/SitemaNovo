import { useEffect, useMemo, useState } from 'react'
import { MapPin, RotateCcw } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { CadastrosMap } from '../components/map/CadastrosMap'
import { buildMapMarkers, fetchCadastros } from '../lib/cadastros'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { supabase } from '../lib/supabase'
import type { Cadastro, Profile } from '../types'

export function MapaPage() {
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
  const [operatorId, setOperatorId] = useState('')
  const [zona, setZona] = useState('')
  const [secao, setSecao] = useState('')
  const [minCount, setMinCount] = useState('')
  const [layerMode, setLayerMode] = useState<'markers' | 'density'>('density')
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  const [resetKey, setResetKey] = useState(0)
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
      if (zona && c.zona !== zona) return false
      if (secao && c.secao !== secao) return false
      return Boolean(c.zona?.trim())
    })
  }, [cadastros, operatorId, zona, secao])

  const markers = useMemo(() => {
    const all = buildMapMarkers(filtered)
    const min = minCount === '6' ? 6 : minCount === '21' ? 21 : minCount === '51' ? 51 : 0
    return all.filter((m) => m.count >= min).sort((a, b) => b.count - a.count)
  }, [filtered, minCount])

  const zonas = useMemo(
    () => [...new Set(cadastros.map((c) => c.zona).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    [cadastros],
  )
  const secoes = useMemo(
    () => [...new Set(cadastros.filter((c) => !zona || c.zona === zona).map((c) => c.secao).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    [cadastros, zona],
  )

  const maxZona = markers[0]?.count || 1
  const periodNote =
    periodPreset === 'all' ? 'Período integral' :
    periodPreset === '7d' ? 'Últimos 7 dias' :
    periodPreset === '30d' ? 'Últimos 30 dias' : 'Últimos 90 dias'

  function clearFilters() {
    setPeriodPreset('all')
    setOperatorId('')
    setZona('')
    setSecao('')
    setMinCount('')
    setLayerMode('markers')
    setFocus(null)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Mapa por Zona Eleitoral</h1>
          <p className="page-subtitle">Mancha cobrindo os bairros de cada zona eleitoral cadastrada.</p>
        </div>
      </div>

      <Card style={{ marginBottom: '1rem' }}>
        <div className="map-filters-grid">
          <div>
            <label className="field-label">Período</label>
            <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} showRange={false} />
          </div>
          <Select
            label="Nerite"
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            placeholder="Todas"
            options={nerites.map((o) => ({ value: o.id, label: o.nome }))}
          />
          <Select
            label="Zona eleitoral"
            value={zona}
            onChange={(e) => { setZona(e.target.value); setSecao('') }}
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
          <Select
            label="Mínimo por zona"
            value={minCount}
            onChange={(e) => setMinCount(e.target.value)}
            placeholder="Qualquer quantidade"
            options={[
              { value: '6', label: '6 ou mais' },
              { value: '21', label: '21 ou mais' },
              { value: '51', label: '51 ou mais' },
            ]}
          />
          <Select
            label="Agrupar por"
            value="zona"
            onChange={() => undefined}
            options={[{ value: 'zona', label: 'Zona eleitoral' }]}
          />
          <Select
            label="Camada"
            value={layerMode}
            onChange={(e) => setLayerMode(e.target.value as 'markers' | 'density')}
            options={[
              { value: 'density', label: 'Mancha dos bairros' },
              { value: 'markers', label: 'Mancha + marcador' },
            ]}
          />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button variant="secondary" onClick={clearFilters}>
              <RotateCcw size={15} /> Limpar
            </Button>
          </div>
        </div>
        <div className="map-summary">
          <strong>{markers.length} zonas · {filtered.length} cadastros</strong>
          <span>{periodNote}</span>
        </div>
      </Card>

      <div className="map-layout">
        <Card padding={false}>
          <div className="map-panel-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <MapPin size={16} color="#2f6fed" />
              <strong>Maranhão · mancha por zona (bairros cobertos)</strong>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { setFocus(null); setResetKey((k) => k + 1) }}>
              <RotateCcw size={14} /> Ver todo o Maranhão
            </Button>
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
              <Spinner size={40} />
            </div>
          ) : (
            <CadastrosMap
              markers={markers}
              height={480}
              focus={focus}
              resetKey={resetKey}
              layerMode={layerMode}
            />
          )}
        </Card>

        <div className="map-side">
          <Card title="Zonas com mancha no mapa" subtitle="Clique para aproximar a área da zona">
            {!markers.length ? (
              <div className="empty-card">
                <strong>Nenhuma mancha no mapa</strong>
                <span>As zonas aparecem com cobertura dos bairros quando houver cadastros.</span>
              </div>
            ) : (
              markers.slice(0, 12).map((m, index) => (
                <button
                  key={m.zona}
                  type="button"
                  className="map-rank-btn"
                  onClick={() => setFocus({ lat: m.lat, lng: m.lng })}
                >
                  <span style={{ color: '#8a95a7', fontSize: '.68rem', fontWeight: 700 }}>{index + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', color: '#263248', fontSize: '.76rem' }}>
                      Zona {m.zona}
                    </strong>
                    <span style={{ display: 'block', height: 5, borderRadius: 99, background: '#edf1f6', overflow: 'hidden', marginTop: '.3rem' }}>
                      <i style={{ display: 'block', height: '100%', width: `${Math.max((m.count / maxZona) * 100, 4)}%`, borderRadius: 'inherit', background: 'linear-gradient(90deg,#2f6fed,#78a2fb)' }} />
                    </span>
                  </span>
                  <strong style={{ textAlign: 'right', color: '#263248', fontSize: '.76rem' }}>{m.count}</strong>
                </button>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
