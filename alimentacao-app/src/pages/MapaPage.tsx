import { useEffect, useMemo, useState } from 'react'
import { Building2, Hash, MapPin, RotateCcw, Vote } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { CadastrosMap } from '../components/map/CadastrosMap'
import { buildMapMarkers, type MapGroupBy, fetchCadastros } from '../lib/cadastros'
import { enrichCadastrosComLocalTse, loadLocaisVotacaoMa } from '../lib/locaisVotacao'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { supabase } from '../lib/supabase'
import type { Cadastro, MapMarkerData, Profile } from '../types'

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

function markerKey(m: MapMarkerData, groupBy: MapGroupBy) {
  if (groupBy === 'bairro') return `b:${(m.bairro || '').toLowerCase()}`
  if (groupBy === 'secao') return `s:${m.zona}-${m.secao}`
  return `z:${m.zona}`
}

function markerTitle(m: MapMarkerData, groupBy: MapGroupBy) {
  if (groupBy === 'bairro') return m.bairro || 'Bairro'
  if (groupBy === 'secao') return m.local_votacao || `Seção ${m.secao}`
  return `Zona ${m.zona}`
}

function markerSub(m: MapMarkerData, groupBy: MapGroupBy) {
  if (groupBy === 'bairro') {
    return [m.zona ? `Zona ${m.zona}` : null, m.secao ? `Seção ${m.secao}` : null].filter(Boolean).join(' · ')
  }
  if (groupBy === 'secao') {
    return [
      m.zona ? `Zona ${m.zona}` : null,
      m.secao ? `Seção ${m.secao}` : null,
      m.bairro || null,
    ].filter(Boolean).join(' · ')
  }
  return m.bairro || m.local_votacao || null
}

export function MapaPage() {
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
  const [operatorId, setOperatorId] = useState('')
  const [zona, setZona] = useState('')
  const [secao, setSecao] = useState('')
  const [bairro, setBairro] = useState('')
  const [minCount, setMinCount] = useState('')
  const [groupBy, setGroupBy] = useState<MapGroupBy>('secao')
  const [layerMode, setLayerMode] = useState<'markers' | 'density'>('density')
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [loading, setLoading] = useState(true)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cads, ops, locais] = await Promise.all([
          fetchCadastros({ period }),
          supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
          loadLocaisVotacaoMa().catch(() => new Map()),
        ])
        // Nome do local vem da planilha TSE (NM_LOCAL_VOTACAO_ORIGINAL) por zona+seção
        setCadastros(enrichCadastrosComLocalTse(cads, locais))
        setNerites((ops.data ?? []) as Profile[])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [period])

  const filtered = useMemo(() => {
    return cadastros.filter((c) => {
      if (operatorId && c.operator_id !== operatorId) return false
      if (zona && c.zona !== zona) return false
      if (secao && c.secao !== secao) return false
      if (bairro && (c.bairro ?? '').trim().toLocaleLowerCase('pt-BR') !== bairro.toLocaleLowerCase('pt-BR')) return false
      if (groupBy === 'secao') return Boolean((c.zona ?? '').trim() && (c.secao ?? '').trim())
      if (groupBy === 'bairro') return Boolean((c.bairro ?? '').trim())
      return Boolean((c.zona ?? '').trim())
    })
  }, [cadastros, operatorId, zona, secao, bairro, groupBy])

  const markers = useMemo(() => {
    const all = buildMapMarkers(filtered, groupBy)
    const min = minCount === '6' ? 6 : minCount === '21' ? 21 : minCount === '51' ? 51 : 0
    return all.filter((m) => m.count >= min).sort((a, b) => b.count - a.count)
  }, [filtered, minCount, groupBy])

  const zonas = useMemo(
    () => [...new Set(cadastros.map((c) => c.zona).filter((z): z is string => Boolean(z)))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    [cadastros],
  )
  const secoes = useMemo(
    () => [...new Set(
      cadastros
        .filter((c) => !zona || c.zona === zona)
        .map((c) => c.secao)
        .filter((s): s is string => Boolean(s)),
    )].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    [cadastros, zona],
  )
  const bairros = useMemo(
    () => [...new Set(
      cadastros
        .filter((c) => (!zona || c.zona === zona) && (!secao || c.secao === secao))
        .map((c) => (c.bairro ?? '').trim())
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [cadastros, zona, secao],
  )

  const stats = useMemo(() => {
    const secaoKeys = new Set<string>()
    const zonaKeys = new Set<string>()
    const bairroKeys = new Set<string>()
    filtered.forEach((c) => {
      const z = (c.zona ?? '').trim()
      const s = (c.secao ?? '').trim()
      const b = (c.bairro ?? '').trim()
      if (z) zonaKeys.add(z)
      if (z && s) secaoKeys.add(`${z}::${s}`)
      if (b) bairroKeys.add(b.toLocaleLowerCase('pt-BR'))
    })
    return {
      fichas: filtered.length,
      secoes: secaoKeys.size,
      zonas: zonaKeys.size,
      bairros: bairroKeys.size,
    }
  }, [filtered])

  const maxCount = markers[0]?.count || 1
  const groupLabel =
    groupBy === 'bairro' ? 'bairros'
    : groupBy === 'secao' ? 'locais'
    : 'zonas'
  const periodNote =
    periodPreset === 'all' ? 'Período integral' :
    periodPreset === '7d' ? 'Últimos 7 dias' :
    periodPreset === '30d' ? 'Últimos 30 dias' : 'Últimos 90 dias'

  function clearFilters() {
    setPeriodPreset('all')
    setOperatorId('')
    setZona('')
    setSecao('')
    setBairro('')
    setMinCount('')
    setGroupBy('secao')
    setLayerMode('density')
    setFocus(null)
  }

  return (
    <div className="me-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mapa Eleitoral</h1>
          <p className="page-subtitle">
            Seção, bairro e zona — com o nome do local de votação da planilha TSE (NM_LOCAL_VOTACAO_ORIGINAL).
          </p>
        </div>
      </div>

      <div className="me-kpi-grid">
        <div className="me-kpi">
          <span className="me-kpi-icon"><Hash size={16} /></span>
          <div>
            <em>Fichas no filtro</em>
            <strong className="tabular-nums">{fmt(stats.fichas)}</strong>
          </div>
        </div>
        <div className="me-kpi">
          <span className="me-kpi-icon tone-vote"><Vote size={16} /></span>
          <div>
            <em>Seções</em>
            <strong className="tabular-nums">{fmt(stats.secoes)}</strong>
          </div>
        </div>
        <div className="me-kpi">
          <span className="me-kpi-icon tone-bairro"><Building2 size={16} /></span>
          <div>
            <em>Bairros</em>
            <strong className="tabular-nums">{fmt(stats.bairros)}</strong>
          </div>
        </div>
        <div className="me-kpi">
          <span className="me-kpi-icon tone-zona"><MapPin size={16} /></span>
          <div>
            <em>Zonas</em>
            <strong className="tabular-nums">{fmt(stats.zonas)}</strong>
          </div>
        </div>
      </div>

      <Card className="me-filters-card" style={{ marginBottom: '1rem' }}>
        <div className="map-filters-grid me-filters">
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
            onChange={(e) => { setZona(e.target.value); setSecao(''); setBairro('') }}
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
            label="Bairro"
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            placeholder="Todos"
            options={bairros.map((b) => ({ value: b, label: b }))}
          />
          <Select
            label="Agrupar no mapa"
            value={groupBy}
            onChange={(e) => {
              setGroupBy(e.target.value as MapGroupBy)
              setFocus(null)
            }}
            options={[
              { value: 'secao', label: 'Local de votação' },
              { value: 'bairro', label: 'Bairro' },
              { value: 'zona', label: 'Zona eleitoral' },
            ]}
          />
          <Select
            label={`Mínimo por ${groupBy === 'bairro' ? 'bairro' : groupBy === 'secao' ? 'seção' : 'zona'}`}
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
            label="Camada"
            value={layerMode}
            onChange={(e) => setLayerMode(e.target.value as 'markers' | 'density')}
            options={
              groupBy === 'zona'
                ? [
                    { value: 'density', label: 'Mancha dos bairros' },
                    { value: 'markers', label: 'Mancha + marcador' },
                  ]
                : [
                    { value: 'density', label: 'Pontos' },
                    { value: 'markers', label: 'Pontos + rótulo' },
                  ]
            }
          />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button variant="secondary" onClick={clearFilters}>
              <RotateCcw size={15} /> Limpar
            </Button>
          </div>
        </div>
        <div className="map-summary">
          <strong>{fmt(markers.length)} {groupLabel} no mapa · {fmt(filtered.length)} fichas</strong>
          <span>{periodNote}</span>
        </div>
      </Card>

      <div className="map-layout me-layout">
        <Card padding={false} className="me-map-card">
          <div className="map-panel-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <MapPin size={16} color="#2f6fed" />
              <strong>
                {groupBy === 'bairro'
                  ? 'Concentração por bairro'
                  : groupBy === 'secao'
                    ? 'Pontos por seção / local de votação'
                    : 'Mancha por zona eleitoral'}
              </strong>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { setFocus(null); setResetKey((k) => k + 1) }}>
              <RotateCcw size={14} /> Ver todo o Maranhão
            </Button>
          </div>
          {loading ? (
            <div className="me-map-loading">
              <Spinner size={40} />
            </div>
          ) : (
            <CadastrosMap
              markers={markers}
              height={520}
              focus={focus}
              resetKey={resetKey}
              layerMode={layerMode}
              groupMode={groupBy}
            />
          )}
        </Card>

        <div className="map-side">
          <Card
            title={
              groupBy === 'bairro' ? 'Bairros no mapa'
              : groupBy === 'secao' ? 'Locais de votação'
              : 'Zonas no mapa'
            }
            subtitle={
              groupBy === 'secao'
                ? `${fmt(markers.reduce((s, m) => s + m.count, 0))} fichas nestes locais — clique para aproximar`
                : 'Clique para aproximar no mapa'
            }
            className="me-rank-card"
          >
            {!markers.length ? (
              <div className="empty-card">
                <strong>Nada no mapa</strong>
                <span>
                  {groupBy === 'bairro'
                    ? 'Preencha o bairro nas fichas para ver a concentração.'
                    : groupBy === 'secao'
                      ? 'As seções aparecem com zona e seção nas fichas; o nome do local vem da planilha TSE.'
                      : 'As zonas aparecem quando houver cadastros com zona.'}
                </span>
              </div>
            ) : (
              <div className="me-rank-list">
                {markers.slice(0, 24).map((m, index) => (
                  <button
                    key={markerKey(m, groupBy)}
                    type="button"
                    className="map-rank-btn me-rank-btn"
                    onClick={() => setFocus({ lat: m.lat, lng: m.lng })}
                  >
                    <span className="me-rank-pos">{index + 1}</span>
                    <span className="me-rank-body">
                      <strong>{markerTitle(m, groupBy)}</strong>
                      {markerSub(m, groupBy) ? <em>{markerSub(m, groupBy)}</em> : null}
                      <span className="me-rank-bar" aria-hidden>
                        <i style={{ width: `${Math.max((m.count / maxCount) * 100, 4)}%` }} />
                      </span>
                    </span>
                    <strong className="me-rank-count tabular-nums">{fmt(m.count)}</strong>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {bairros.length > 0 && groupBy !== 'bairro' ? (
            <Card
              title="Bairros do filtro"
              subtitle={`${fmt(bairros.length)} bairros com fichas`}
              className="me-bairro-card"
            >
              <div className="me-bairro-chips">
                {bairros.slice(0, 18).map((b) => (
                  <button
                    key={b}
                    type="button"
                    className={`me-bairro-chip${bairro === b ? ' is-on' : ''}`}
                    onClick={() => setBairro((cur) => (cur === b ? '' : b))}
                  >
                    {b}
                  </button>
                ))}
                {bairros.length > 18 ? (
                  <span className="me-bairro-more">+{bairros.length - 18}</span>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
