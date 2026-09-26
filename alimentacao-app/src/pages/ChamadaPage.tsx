import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { fetchEquipeChamada, type ChamadaPessoa } from '../lib/chamada'
import type { Coordenador, Lider } from '../types'

function todayLabel() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function estimateA4Pages(total: number) {
  if (total <= 0) return 0
  return Math.max(1, Math.ceil(total / 40))
}

export function ChamadaPage() {
  const { profile } = useAuth()
  const diretoriaScope = profile?.role === 'diretoria' ? profile.id : null

  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [coordenadorId, setCoordenadorId] = useState('')
  const [liderIds, setLiderIds] = useState<Set<string>>(new Set())
  const [loadingOpts, setLoadingOpts] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingOpts(true)
      try {
        const equipe = await fetchEquipeChamada(diretoriaScope)
        if (cancelled) return
        setCoordenadores(equipe.coordenadores)
        setLideres(equipe.lideres)
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
  const lideresDaCoord = useMemo(() => {
    if (!coordenadorId) return []
    return lideres.filter((l) => l.coordenador_id === coordenadorId)
  }, [lideres, coordenadorId])

  const lideresSel = useMemo(
    () => lideresDaCoord.filter((l) => liderIds.has(l.id)),
    [lideresDaCoord, liderIds],
  )

  const todosMarcados = lideresDaCoord.length > 0 && lideresSel.length === lideresDaCoord.length

  const lista = useMemo(() => {
    if (!coordenador) return []
    const pessoas: ChamadaPessoa[] = [
      { id: coordenador.id, nome: coordenador.nome, cargo: 'coordenador' },
    ]
    for (const item of lideresSel) {
      pessoas.push({ id: item.id, nome: item.nome, cargo: 'lideranca' })
    }
    return pessoas
  }, [coordenador, lideresSel])

  const coordenadoresLista = lista.filter((p) => p.cargo === 'coordenador')
  const liderancasLista = lista.filter((p) => p.cargo === 'lideranca')
  const folhas = estimateA4Pages(lista.length)
  const folhasLabel = folhas === 1 ? '1 folha A4' : `${folhas} folhas A4`
  const dataHoje = todayLabel()

  function escolherCoord(id: string) {
    setCoordenadorId(id)
    const lids = lideres.filter((l) => l.coordenador_id === id)
    setLiderIds(new Set(lids.map((l) => l.id)))
  }

  function toggleLider(id: string) {
    setLiderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodos(checked: boolean) {
    setLiderIds(checked ? new Set(lideresDaCoord.map((l) => l.id)) : new Set())
  }

  return (
    <div className="ch-page">
      <header className="ch-screen">
        <div className="gg-header">
          <div>
            <p className="gg-kicker">Chamada</p>
            <h1>Lista de presença</h1>
            <p className="gg-sub">
              Só coordenador e lideranças. Escolha a coordenação e marque no checkbox quem entra na folha.
            </p>
          </div>
          <div className="ch-print-side">
            {coordenador && lista.length > 0 ? (
              <strong className="ch-pages">{folhasLabel}</strong>
            ) : null}
            <button
              type="button"
              className="gg-btn primary"
              disabled={!coordenador || !lista.length}
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
              onChange={(e) => escolherCoord(e.target.value)}
              options={coordenadores.map((c) => ({ value: c.id, label: c.nome }))}
              placeholder={loadingOpts ? 'Carregando…' : 'Selecione a coordenação'}
              aria-label="Coordenação"
            />
          </div>
          <div className="filter-results">
            {coordenador ? (
              <span>
                <strong>{lista.length}</strong> {lista.length === 1 ? 'pessoa' : 'pessoas'}
                {' · coordenador e '}
                {lideresSel.length} {lideresSel.length === 1 ? 'liderança' : 'lideranças'}
                {lista.length ? ` · ${folhasLabel}` : ''}
              </span>
            ) : (
              <span>Selecione a coordenação para montar a chamada.</span>
            )}
          </div>
        </div>

        {coordenador && !loadingOpts ? (
          <div className="ch-checks">
            <label className="ch-check ch-check-all">
              <input
                type="checkbox"
                checked={todosMarcados}
                onChange={(e) => toggleTodos(e.target.checked)}
                disabled={!lideresDaCoord.length}
              />
              <span>Selecionar todas as lideranças</span>
            </label>
            {lideresDaCoord.length ? (
              <ul className="ch-check-list">
                {lideresDaCoord.map((l) => (
                  <li key={l.id}>
                    <label className="ch-check">
                      <input
                        type="checkbox"
                        checked={liderIds.has(l.id)}
                        onChange={() => toggleLider(l.id)}
                      />
                      <span>{l.nome}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ch-empty">Nenhuma liderança nesta coordenação.</p>
            )}
          </div>
        ) : null}

        {error ? <p className="rel-txt-error">{error}</p> : null}
        {loadingOpts ? (
          <div className="gg-loading">
            <Spinner size={32} />
          </div>
        ) : null}
      </header>

      {coordenador && !loadingOpts ? (
        <div className="ch-a4">
          <section className="ch-sheet" aria-label="Folha de chamada">
            <div className="ch-sheet-head">
              <div className="ch-banners">
                <div className="ch-lider-banner">
                  <span>Coordenador</span>
                  <strong>{coordenador.nome}</strong>
                </div>
                <div className="ch-lider-banner">
                  <span>Liderança</span>
                  <strong>
                    {lideresSel.length === 0
                      ? 'Nenhuma selecionada'
                      : lideresSel.length === 1
                        ? lideresSel[0].nome
                        : todosMarcados
                          ? 'Todas desta coordenação'
                          : `${lideresSel.length} selecionadas`}
                  </strong>
                </div>
              </div>
              <div className="ch-meta">
                <span>{dataHoje}</span>
                <span className="ch-no-print">{lista.length} pessoas · {folhasLabel}</span>
                <span className="ch-no-print">Marque o quadrado de quem está presente.</span>
              </div>
            </div>

            <div className="ch-block ch-block-keep">
              <h3 className="ch-lider-banner">
                <span>Presença</span>
                <strong>Coordenador</strong>
              </h3>
              <ol className="ch-list">
                {coordenadoresLista.map((p) => (
                  <li key={p.id}>
                    <i className="ch-box" aria-hidden />
                    <strong>{p.nome}</strong>
                    <em>Coordenador</em>
                  </li>
                ))}
              </ol>
            </div>

            <div className="ch-block">
              <h3 className="ch-lider-banner">
                <span>Presença</span>
                <strong>Lideranças</strong>
              </h3>
              {liderancasLista.length ? (
                <ol className={`ch-list${liderancasLista.length > 8 ? ' ch-list-cols' : ''}`}>
                  {liderancasLista.map((p) => (
                    <li key={p.id}>
                      <i className="ch-box" aria-hidden />
                      <strong>{p.nome}</strong>
                      <em>Liderança</em>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="ch-empty">Nenhuma liderança selecionada.</p>
              )}
            </div>

            <footer className="ch-foot">
              <span>Presentes ________</span>
              <span>Faltas ________</span>
              <span>Total {lista.length}</span>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  )
}
