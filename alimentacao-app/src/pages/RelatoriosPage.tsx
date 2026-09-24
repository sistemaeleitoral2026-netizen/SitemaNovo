import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, FileText, Layers, MapPin, Users } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Spinner } from '../components/ui/Spinner'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { fetchCadastros } from '../lib/cadastros'
import { cadastrosLinkForLider, liderFichaKey } from '../lib/liderFichas'
import { supabase } from '../lib/supabase'
import type { Cadastro, Profile } from '../types'

type GroupKey = 'zona' | 'secao' | 'nerite' | 'coordenador' | 'lider'

export function RelatoriosPage() {
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [operadores, setOperadores] = useState<Profile[]>([])
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
  const [groupBy, setGroupBy] = useState<GroupKey>('zona')
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [cads, ops] = await Promise.all([
        fetchCadastros({ period }),
        supabase.from('profiles').select('*').eq('role', 'operador'),
      ])
      setCadastros(cads)
      setOperadores((ops.data ?? []) as Profile[])
      setLoading(false)
    }
    load()
  }, [period, tick])

  const kpis = useMemo(() => {
    const zonas = new Set(cadastros.map((c) => c.zona).filter(Boolean))
    const secoes = new Set(cadastros.map((c) => c.secao).filter(Boolean))
    const neritesAtivas = new Set(cadastros.map((c) => c.operator_id))
    return {
      total: cadastros.length,
      nerites: neritesAtivas.size,
      zonas: zonas.size,
      secoes: secoes.size,
    }
  }, [cadastros])

  const porZona = useMemo(() => {
    const map = new Map<string, number>()
    cadastros.forEach((c) => {
      const zona = (c.zona ?? '').trim()
      if (!zona) return
      map.set(zona, (map.get(zona) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .map(([zona, total]) => ({ zona, total }))
      .sort((a, b) => b.total - a.total)
  }, [cadastros])

  const porSecao = useMemo(() => {
    const map = new Map<string, { secao: string; zona: string; total: number }>()
    cadastros.forEach((c) => {
      const zona = c.zona ?? ''
      const secao = c.secao ?? ''
      if (!zona && !secao) return
      const key = `${zona}::${secao}`
      const existing = map.get(key)
      if (existing) existing.total += 1
      else map.set(key, { secao, zona, total: 1 })
    })
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map((row) => ({
        ...row,
        pct: cadastros.length ? `${Math.round((row.total / cadastros.length) * 100)}%` : '0%',
      }))
  }, [cadastros])

  const porNerite = useMemo(() => {
    return operadores
      .map((op) => ({
        id: op.id,
        nome: op.nome,
        total: cadastros.filter((c) => c.operator_id === op.id).length,
      }))
      .filter((o) => o.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [cadastros, operadores])

  const porCoordenador = useMemo(() => {
    const map = new Map<string, number>()
    cadastros.forEach((c) => {
      const nome = (c.coordenador ?? '').trim()
      if (!nome) return
      map.set(nome, (map.get(nome) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
  }, [cadastros])

  const porLider = useMemo(() => {
    const map = new Map<string, { nome: string; coordenador: string; diretoriaId: string; total: number }>()
    cadastros.forEach((c) => {
      const nome = (c.lider ?? '').trim()
      if (!nome) return
      const coordenador = (c.coordenador ?? '').trim()
      const diretoriaId = c.diretoria_id ?? ''
      const key = liderFichaKey(nome, coordenador, diretoriaId)
      const prev = map.get(key)
      if (prev) {
        prev.total += 1
        return
      }
      map.set(key, { nome, coordenador, diretoriaId, total: 1 })
    })
    return Array.from(map.entries())
      .map(([key, row]) => ({ key, ...row }))
      .sort((a, b) => b.total - a.total)
  }, [cadastros])

  const barRows = useMemo(() => {
    if (groupBy === 'nerite') {
      return porNerite.map((row) => ({
        key: row.id,
        label: row.nome,
        total: row.total,
        to: `/cadastros?operator=${row.id}`,
      }))
    }
    if (groupBy === 'coordenador') {
      return porCoordenador.map((row) => ({
        key: row.nome,
        label: row.nome,
        total: row.total,
        to: `/cadastros?coordenador=${encodeURIComponent(row.nome)}`,
      }))
    }
    if (groupBy === 'lider') {
      return porLider.map((row) => ({
        key: row.key,
        label: row.coordenador ? `${row.nome} · ${row.coordenador}` : row.nome,
        total: row.total,
        to: cadastrosLinkForLider({
          nome: row.nome,
          coordenador: row.coordenador,
          diretoriaId: row.diretoriaId || null,
        }),
      }))
    }
    return porZona.map((row) => ({
      key: row.zona,
      label: `Zona ${row.zona}`,
      total: row.total,
      to: null as string | null,
    }))
  }, [groupBy, porZona, porNerite, porCoordenador, porLider])

  const maxBar = barRows[0]?.total || 1

  const groupTitle =
    groupBy === 'nerite'
      ? 'Cadastros por nerite'
      : groupBy === 'coordenador'
        ? 'Cadastros por coordenador'
        : groupBy === 'lider'
          ? 'Cadastros por liderança'
          : groupBy === 'secao'
            ? 'Cadastros por seção'
            : 'Cadastros por zona eleitoral'

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-subtitle">Analise os dados coletados de forma consolidada.</p>
        </div>
        <div className="page-header-actions">
          <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} showRange={false} />
          <Select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupKey)}
            options={[
              { value: 'zona', label: 'Zona eleitoral' },
              { value: 'secao', label: 'Seção eleitoral' },
              { value: 'nerite', label: 'Nerite' },
              { value: 'coordenador', label: 'Coordenador' },
              { value: 'lider', label: 'Liderança' },
            ]}
            aria-label="Agrupar relatório"
          />
          <Button onClick={() => setTick((t) => t + 1)}>
            <FileText size={16} /> Gerar relatório
          </Button>
        </div>
      </div>

      <div className="rel-kpi-grid">
        <div className="rel-kpi">
          <div className="rel-kpi-icon" style={{ background: '#eaf1fe', color: '#2f6fed' }}><ClipboardList size={20} /></div>
          <div><span>Total de cadastros</span><strong>{kpis.total.toLocaleString('pt-BR')}</strong></div>
        </div>
        <div className="rel-kpi">
          <div className="rel-kpi-icon" style={{ background: '#e6f7f2', color: '#06a77d' }}><Users size={20} /></div>
          <div><span>Nerites ativas</span><strong>{kpis.nerites}</strong></div>
        </div>
        <div className="rel-kpi">
          <div className="rel-kpi-icon" style={{ background: '#f0ecfd', color: '#7656d8' }}><MapPin size={20} /></div>
          <div><span>Zonas alcançadas</span><strong>{kpis.zonas}</strong></div>
        </div>
        <div className="rel-kpi">
          <div className="rel-kpi-icon" style={{ background: '#fef1e5', color: '#ee8b35' }}><Layers size={20} /></div>
          <div><span>Seções mapeadas</span><strong>{kpis.secoes}</strong></div>
        </div>
      </div>

      {!cadastros.length ? (
        <Card>
          <EmptyState title="Sem dados para o relatório" description="Os gráficos são gerados a partir dos cadastros do período." />
        </Card>
      ) : (
        <div className="rel-grid">
          <Card title={groupTitle}>
            {groupBy === 'secao' ? (
              !porSecao.length ? (
                <EmptyState title="Nenhuma seção com registros" />
              ) : (
                <div className="bar-list">
                  {porSecao.map((row) => (
                    <div className="bar-row" key={`${row.zona}-${row.secao}`}>
                      <div className="bar-row-top">
                        <span>Seção {row.secao} · Zona {row.zona}</span>
                        <strong>{row.total}</strong>
                      </div>
                      <div className="bar-track">
                        <i style={{ width: `${Math.max((row.total / maxBar) * 100, 4)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : !barRows.length ? (
              <EmptyState title="Sem registros para este agrupamento" />
            ) : (
              <div className="bar-list">
                {barRows.map((row) => {
                  const inner = (
                    <>
                      <div className="bar-row-top">
                        <span>{row.label}</span>
                        <strong>{row.total}</strong>
                      </div>
                      <div className="bar-track">
                        <i style={{ width: `${Math.max((row.total / maxBar) * 100, 4)}%` }} />
                      </div>
                    </>
                  )
                  return row.to ? (
                    <Link to={row.to} className="bar-row bar-row-link" key={row.key}>
                      {inner}
                    </Link>
                  ) : (
                    <div className="bar-row" key={row.key}>
                      {inner}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="Resumo por seção eleitoral">
            {!porSecao.length ? (
              <EmptyState title="Nenhuma seção com registros" />
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Seção</th>
                      <th>Zona</th>
                      <th>Cadastros</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porSecao.map((row) => (
                      <tr key={`${row.zona}-${row.secao}`}>
                        <td><strong style={{ fontWeight: 600, fontSize: '.8rem' }}>{row.secao}</strong></td>
                        <td>{row.zona}</td>
                        <td>{row.total}</td>
                        <td>{row.pct}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
