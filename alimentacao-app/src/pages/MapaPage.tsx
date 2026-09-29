import { useEffect, useMemo, useState } from 'react'
import { Building2, Hash, MapPin, RotateCcw, Vote, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { CadastrosMap } from '../components/map/CadastrosMap'
import { buildMapMarkers, cadastroMapGroupId, type MapGroupBy, fetchCadastros } from '../lib/cadastros'
import {
  countParesForaDoTse,
  enrichCadastrosComLocalTse,
  loadLocaisVotacaoMa,
  type LocalVotacaoRef,
} from '../lib/locaisVotacao'
import { normalizeSecao, normalizeZona } from '../lib/normalize'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { supabase } from '../lib/supabase'
import type { Cadastro, MapMarkerData, Profile } from '../types'

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

function markerKey(m: MapMarkerData, groupBy: MapGroupBy) {
  if (m.id) return m.id
  if (groupBy === 'bairro') return `b:${(m.bairro || '').toLowerCase()}`
  if (groupBy === 'secao') return `s:${m.zona}-${m.local_votacao || m.secao}`
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
    const secoes = m.secoes?.length ? m.secoes : (m.secao ? [m.secao] : [])
    const secaoLabel =
      secoes.length === 0 ? null
      : secoes.length === 1 ? `Seção ${secoes[0]}`
      : secoes.length <= 4 ? `Seções ${secoes.join(', ')}`
      : `${secoes.length} seções (${secoes.slice(0, 3).join(', ')}…)`
    return [
      m.zona ? `Zona ${m.zona}` : null,
      secaoLabel,
      m.bairro || null,
      m.id?.startsWith('fora:') ? 'par fora da planilha TSE' : null,
    ].filter(Boolean).join(' · ')
  }
  return m.bairro || m.local_votacao || null
}

export function MapaPage() {
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [locais, setLocais] = useState<Map<string, LocalVotacaoRef>>(new Map())
  const [nerites, setNerites] = useState<Profile[]>([])
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
  const [operatorId, setOperatorId] = useState('')
  const [zona, setZona] = useState('')
  const [secao, setSecao] = useState('')
  const [bairro, setBairro] = useState('')
  const [minCount, setMinCount] = useState('')
  const [groupBy, setGroupBy] = useState<MapGroupBy>('secao')
  const [layerMode, setLayerMode] = useState<'markers' | 'density'>('density')
  const [focus, setFocus] = useState<{ lat: number; lng: number; id?: string; nonce: number } | null>(null)
  const [selected, setSelected] = useState<MapMarkerData | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [loading, setLoading] = useState(true)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cads, ops, locaisMap] = await Promise.all([
          fetchCadastros({ period }),
          supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
          loadLocaisVotacaoMa().catch(() => new Map<string, LocalVotacaoRef>()),
        ])
        setLocais(locaisMap)
        setCadastros(enrichCadastrosComLocalTse(cads, locaisMap))
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
      if (zona && normalizeZona(c.zona) !== normalizeZona(zona) && c.zona !== zona) return false
      if (secao && normalizeSecao(c.secao) !== normalizeSecao(secao) && c.secao !== secao) return false
      if (bairro && (c.bairro ?? '').trim().toLocaleLowerCase('pt-BR') !== bairro.toLocaleLowerCase('pt-BR')) return false
      if (groupBy === 'secao') return Boolean((c.zona ?? '').trim() && (c.secao ?? '').trim())
      if (groupBy === 'bairro') return Boolean((c.bairro ?? '').trim())
      return Boolean((c.zona ?? '').trim())
    })
  }, [cadastros, operatorId, zona, secao, bairro, groupBy])

  const foraDoTse = useMemo(
    () => countParesForaDoTse(filtered, locais),
    [filtered, locais],
  )

  const markers = useMemo(() => {
    const all = buildMapMarkers(filtered, groupBy, locais)
    const min = minCount === '6' ? 6 : minCount === '21' ? 21 : minCount === '51' ? 51 : 0
    return all.filter((m) => m.count >= min).sort((a, b) => b.count - a.count)
  }, [filtered, minCount, groupBy, locais])

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

  const selectedFichas = useMemo(() => {
    if (!selected?.id) return []
    return filtered
      .filter((c) => cadastroMapGroupId(c, groupBy, locais) === selected.id)
      .sort((a, b) => (a.nome_completo || '').localeCompare(b.nome_completo || '', 'pt-BR'))
  }, [filtered, selected, groupBy, locais])

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
    setSelected(null)
  }

  function selectMarker(m: MapMarkerData) {
    setSelected(m)
    setFocus({
      lat: m.lat,
      lng: m.lng,
      id: m.id || markerKey(m, groupBy),
      nonce: Date.now(),
    })
  }

  return (
    <div className="me-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mapa Eleitoral</h1>
          <p className="page-subtitle">
            Seção, bairro e zona — com o nome e a coordenada do local na planilha TSE (NM_LOCAL_VOTACAO_ORIGINAL).
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
              setSelected(null)
            }}
            options={[
              { value: 'secao', label: 'Local de votação' },
              { value: 'bairro', label: 'Bairro' },
              { value: 'zona', label: 'Zona eleitoral' },
            ]}
          />
          <Select
            label={`Mínimo por ${groupBy === 'bairro' ? 'bairro' : groupBy === 'secao' ? 'local' : 'zona'}`}
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
          <span>
            {periodNote}
            {foraDoTse > 0 ? ` · ${fmt(foraDoTse)} com zona+seção fora da planilha TSE` : ''}
          </span>
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
                    ? 'Pontos no local de votação (TSE)'
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
              onMarkerSelect={selectMarker}
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
                ? `${fmt(markers.reduce((s, m) => s + m.count, 0))} fichas nestes locais — clique para ver a lista`
                : 'Clique para ver a lista de fichas'
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
                      ? 'As seções aparecem com zona e seção nas fichas; o nome e a posição vêm da planilha TSE.'
                      : 'As zonas aparecem quando houver cadastros com zona.'}
                </span>
              </div>
            ) : (
              <div className="me-rank-list">
                {markers.slice(0, 40).map((m, index) => {
                  const key = markerKey(m, groupBy)
                  const isFocused = selected?.id === key || focus?.id === key
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`map-rank-btn me-rank-btn${isFocused ? ' is-focus' : ''}`}
                      onClick={() => selectMarker(m)}
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
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {selected ? (
        <Card
          className="me-fichas-card cadastros-table-card"
          title={
            groupBy === 'bairro'
              ? selected.bairro || 'Bairro'
              : groupBy === 'zona'
                ? `Zona ${selected.zona}`
                : (selected.local_votacao || `Seção ${selected.secao}`)
          }
          subtitle={`${fmt(selectedFichas.length)} ficha${selectedFichas.length === 1 ? '' : 's'} · ${markerSub(selected, groupBy) || '—'}`}
          action={(
            <Button size="sm" variant="secondary" onClick={() => setSelected(null)}>
              <X size={14} /> Fechar
            </Button>
          )}
        >
          {!selectedFichas.length ? (
            <EmptyState title="Nenhuma ficha" description="Não há fichas neste local com o filtro atual." />
          ) : (
            <div className="table-wrapper me-fichas-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Coordenador</th>
                    <th>Liderança</th>
                    <th>Título</th>
                    <th>Zona</th>
                    <th>Seção</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedFichas.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/cadastros/${c.id}`} className="me-ficha-link">
                          <strong>{(c.nome_completo || '—').toLocaleUpperCase('pt-BR')}</strong>
                        </Link>
                      </td>
                      <td>{c.coordenador || '—'}</td>
                      <td>{c.lider || '—'}</td>
                      <td className="mono-cell">{c.titulo || '—'}</td>
                      <td className="mono-cell">{c.zona || '—'}</td>
                      <td className="mono-cell">{c.secao || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  )
}
