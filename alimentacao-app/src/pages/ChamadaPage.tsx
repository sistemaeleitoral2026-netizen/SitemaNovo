import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { fetchChamadaFichas, formatTituloChamada, type ChamadaFicha } from '../lib/chamada'
import { supabase } from '../lib/supabase'
import type { Coordenador, Lider } from '../types'

function todayLabel() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function estimateA4Pages(grupos: [string, ChamadaFicha[]][], soUmaLideranca: boolean) {
  if (!grupos.length) return 0
  const alturaUtil = 282
  const cabecalho = soUmaLideranca ? 26 : 20
  const rodape = 12
  const linha = 4.5
  const faixaLider = soUmaLideranca ? 0 : 8
  let altura = cabecalho + rodape
  for (const [, rows] of grupos) {
    altura += faixaLider + Math.ceil(rows.length / 2) * linha
  }
  return Math.max(1, Math.ceil(altura / alturaUtil))
}

function groupByLider(rows: ChamadaFicha[]) {
  const map = new Map<string, ChamadaFicha[]>()
  for (const row of rows) {
    const key = row.lider.trim() || 'Sem liderança'
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { sensitivity: 'base' }))
}

export function ChamadaPage() {
  const { profile } = useAuth()
  const diretoriaScope = profile?.role === 'diretoria' ? profile.id : null

  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [coordenadorId, setCoordenadorId] = useState('')
  const [liderId, setLiderId] = useState('')
  const [fichas, setFichas] = useState<ChamadaFicha[]>([])
  const [loadingOpts, setLoadingOpts] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingOpts(true)
      try {
        let coordsQuery = supabase.from('coordenadores').select('*').eq('ativo', true).order('nome')
        let lidsQuery = supabase.from('lideres').select('*').eq('ativo', true).order('nome')
        if (diretoriaScope) {
          coordsQuery = coordsQuery.eq('diretoria_id', diretoriaScope)
          lidsQuery = lidsQuery.eq('diretoria_id', diretoriaScope)
        }
        const [coords, lids] = await Promise.all([coordsQuery, lidsQuery])
        if (coords.error) throw new Error(coords.error.message)
        if (lids.error) throw new Error(lids.error.message)
        if (cancelled) return
        setCoordenadores((coords.data ?? []) as Coordenador[])
        setLideres((lids.data ?? []) as Lider[])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar a equipe.')
      } finally {
        if (!cancelled) setLoadingOpts(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [diretoriaScope])

  const coordenador = coordenadores.find((c) => c.id === coordenadorId) ?? null
  const lideresFiltrados = useMemo(() => {
    if (!coordenadorId) return []
    return lideres.filter((l) => l.coordenador_id === coordenadorId)
  }, [lideres, coordenadorId])
  const lider = lideresFiltrados.find((l) => l.id === liderId) ?? null

  useEffect(() => {
    if (!coordenador) {
      setFichas([])
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const rows = await fetchChamadaFichas(coordenador!.nome, lider?.nome)
        if (!cancelled) setFichas(rows)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Não foi possível puxar as fichas.')
          setFichas([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [coordenador?.id, coordenador?.nome, lider?.id, lider?.nome])

  const grupos = useMemo(() => groupByLider(fichas), [fichas])
  const folhas = useMemo(() => estimateA4Pages(grupos, Boolean(lider)), [grupos, lider])
  const dataHoje = todayLabel()
  const folhasLabel = folhas === 1 ? '1 folha A4' : `${folhas} folhas A4`

  return (
    <div className="ch-page">
      <header className="ch-screen">
        <div className="gg-header">
          <div>
            <p className="gg-kicker">Chamada</p>
            <h1>Lista de presença</h1>
            <p className="gg-sub">
              Escolha a coordenação — e a liderança, se quiser. A folha cabe no A4 para assinalar quem está presente.
            </p>
          </div>
          <div className="ch-print-side">
            {coordenador && !loading && fichas.length > 0 ? (
              <strong className="ch-pages">{folhasLabel}</strong>
            ) : null}
            <button
              type="button"
              className="gg-btn primary"
              disabled={!coordenador || !fichas.length}
              onClick={() => window.print()}
            >
              <Printer size={15} />
              Imprimir A4
            </button>
          </div>
        </div>

        <div className="filter-panel cadastros-filter-panel">
          <div className="filters-grid filters-grid-cadastros gg-filters-quick">
            <Select
              value={coordenadorId}
              onChange={(e) => {
                setCoordenadorId(e.target.value)
                setLiderId('')
              }}
              options={coordenadores.map((c) => ({ value: c.id, label: c.nome }))}
              placeholder={loadingOpts ? 'Carregando…' : 'Selecione a coordenação'}
              aria-label="Coordenação"
            />
            <Select
              value={liderId}
              onChange={(e) => setLiderId(e.target.value)}
              options={lideresFiltrados.map((l) => ({ value: l.id, label: l.nome }))}
              placeholder={coordenadorId ? 'Todas as lideranças' : 'Selecione a coordenação'}
              aria-label="Liderança"
              disabled={!coordenadorId}
            />
          </div>
          <div className="filter-results">
            {coordenador ? (
              <span>
                <strong>{fichas.length}</strong> ficha{fichas.length === 1 ? '' : 's'}
                {lider ? ` · ${lider.nome}` : ' · todas as lideranças'}
                {fichas.length ? ` · ${folhasLabel}` : ''}
              </span>
            ) : (
              <span>Selecione a coordenação para puxar a lista.</span>
            )}
          </div>
        </div>

        {error ? <p className="rel-txt-error">{error}</p> : null}
        {loading ? (
          <div className="gg-loading">
            <Spinner size={32} />
          </div>
        ) : null}
      </header>

      {coordenador && !loading ? (
        <section className="ch-sheet" aria-label="Folha de chamada">
          <div className="ch-sheet-head">
            {lider ? (
              <div className="ch-lider-banner">
                <span>Liderança</span>
                <strong>{lider.nome}</strong>
              </div>
            ) : (
              <div>
                <p className="ch-kicker">Chamada do evento</p>
                <h2>Todas as lideranças</h2>
              </div>
            )}
            <div className="ch-meta">
              <span>Coordenação {coordenador.nome}</span>
              <span>{dataHoje}</span>
              <span className="ch-no-print">{fichas.length} nomes · {folhasLabel}</span>
              <span className="ch-no-print">Marque o quadrado de quem está presente.</span>
            </div>
          </div>

          {!fichas.length ? (
            <p className="ch-empty">Nenhuma ficha nesta seleção.</p>
          ) : (
            grupos.map(([liderNome, rows]) => (
              <div key={liderNome} className="ch-block">
                {!lider ? (
                  <h3 className="ch-lider-banner">
                    <span>Liderança</span>
                    <strong>{liderNome}</strong>
                  </h3>
                ) : null}
                <ol className="ch-list">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <i className="ch-box" aria-hidden />
                      <strong>{row.nome_completo || '—'}</strong>
                      <em>{row.lider || '—'}</em>
                      <span>{formatTituloChamada(row.titulo)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}

          {fichas.length > 0 ? (
            <footer className="ch-foot">
              <span>Presentes ________</span>
              <span>Faltas ________</span>
              <span>Total {fichas.length}</span>
              <span>Coordenador {coordenador.nome}</span>
            </footer>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
