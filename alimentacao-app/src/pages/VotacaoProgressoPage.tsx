import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, RefreshCw, Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { hasRole } from '../lib/roles'
import { fetchVotacaoProgresso, type VotacaoProgresso } from '../lib/votacao'
import { supabase } from '../lib/supabase'

export function VotacaoProgressoPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coordNome, setCoordNome] = useState('')
  const [data, setData] = useState<VotacaoProgresso | null>(null)
  const [coordOptions, setCoordOptions] = useState<{ id: string; nome: string }[]>([])
  const [selectedCoord, setSelectedCoord] = useState('')
  const [liderFiltro, setLiderFiltro] = useState('')

  const isStaff = hasRole(profile, ['admin', 'diretoria'])
  const isCoordenador = hasRole(profile, 'coordenador')

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setLoading(true)
      setError(null)
      try {
        if (isCoordenador && profile?.id) {
          const { data: row } = await supabase
            .from('coordenadores')
            .select('nome')
            .or(`user_id.eq.${profile.id}${profile.coordenador_id ? `,id.eq.${profile.coordenador_id}` : ''}`)
            .limit(1)
            .maybeSingle()
          if (cancelled) return
          const nome = row?.nome ?? ''
          setCoordNome(nome)
          if (nome) {
            setData(await fetchVotacaoProgresso(nome))
          } else {
            setError('Coordenação não vinculada ao login.')
          }
        } else if (isStaff) {
          let q = supabase.from('coordenadores').select('id,nome').eq('ativo', true).order('nome')
          if (hasRole(profile, 'diretoria') && profile?.id && !hasRole(profile, 'admin')) {
            q = q.eq('diretoria_id', profile.id)
          }
          const { data: coords, error: err } = await q
          if (err) throw new Error(err.message)
          if (cancelled) return
          const list = (coords ?? []) as { id: string; nome: string }[]
          setCoordOptions(list)
          const first = list[0]
          if (first) {
            setSelectedCoord(first.id)
            setCoordNome(first.nome)
            setData(await fetchVotacaoProgresso(first.nome))
          } else {
            setData(null)
          }
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Falha ao carregar progresso.'
          setError(/votou|column|schema/i.test(msg)
            ? `${msg} — rode o SQL coordenador_auxiliar_votacao_run.sql no Supabase.`
            : msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void boot()
    return () => { cancelled = true }
  }, [profile, isCoordenador, isStaff])

  async function reload(nome?: string) {
    const target = (nome ?? coordNome).trim()
    if (!target) return
    setLoading(true)
    setError(null)
    try {
      setData(await fetchVotacaoProgresso(target))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar progresso.')
    } finally {
      setLoading(false)
    }
  }

  async function onPickCoord(id: string) {
    setSelectedCoord(id)
    const nome = coordOptions.find((c) => c.id === id)?.nome ?? ''
    setCoordNome(nome)
    setLiderFiltro('')
    await reload(nome)
  }

  const lideresFiltrados = useMemo(() => {
    const list = data?.porLider ?? []
    const q = liderFiltro.trim().toLowerCase()
    if (!q) return list
    return list.filter((l) => l.lider.toLowerCase().includes(q))
  }, [data, liderFiltro])

  if (loading && !data) {
    return (
      <div className="vot-page vot-progresso vot-center">
        <Spinner size={36} />
      </div>
    )
  }

  if (error && !data) {
    return (
      <EmptyState
        title="Progresso da votação"
        description={error}
      />
    )
  }

  const tot = data
  const pctGeral = tot && tot.total
    ? Math.round(((tot.votou + tot.naoVotou) / tot.total) * 100)
    : 0

  return (
    <div className="vot-page vot-progresso">
      <header className="vot-head">
        <div>
          <h1 className="vot-title">Progresso da votação</h1>
          <p className="vot-sub">
            {tot?.coordenadorNome
              ? `Coordenação: ${tot.coordenadorNome} · ${pctGeral}% lançado`
              : 'Selecione a coordenação'}
          </p>
        </div>
        <div className="vot-progresso-actions">
          <Link to="/votacao/lancar" className="vot-btn">
            <ClipboardCheck size={16} /> Lançar
          </Link>
          <button type="button" className="vot-btn ghost" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'vot-spin' : undefined} /> Atualizar
          </button>
        </div>
      </header>

      {isStaff && coordOptions.length > 0 && (
        <label className="vot-coord-pick">
          Coordenador
          <select value={selectedCoord} onChange={(e) => void onPickCoord(e.target.value)}>
            {coordOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {tot && (
        <>
          <div className="vot-kpi-row">
            <div className="vot-kpi">
              <em>Total</em>
              <strong>{tot.total}</strong>
            </div>
            <div className="vot-kpi is-pend">
              <em>Pendente</em>
              <strong>{tot.pendente}</strong>
            </div>
            <div className="vot-kpi is-yes">
              <em>Votou</em>
              <strong>{tot.votou}</strong>
            </div>
            <div className="vot-kpi is-no">
              <em>Não votou</em>
              <strong>{tot.naoVotou}</strong>
            </div>
          </div>

          <div className="vot-search vot-progresso-search">
            <Search size={18} aria-hidden />
            <input
              value={liderFiltro}
              onChange={(e) => setLiderFiltro(e.target.value)}
              placeholder="Filtrar liderança"
              autoComplete="off"
            />
          </div>

          {!tot.porLider.length ? (
            <EmptyState
              title="Nenhuma ficha"
              description="Não há cadastros nesta coordenação."
            />
          ) : !lideresFiltrados.length ? (
            <p className="vot-empty">Nenhuma liderança com esse nome.</p>
          ) : (
            <>
              <ul className="vot-lider-list">
                {lideresFiltrados.map((l) => {
                  const done = l.votou + l.naoVotou
                  const pct = l.total ? Math.round((done / l.total) * 100) : 0
                  return (
                    <li key={l.lider} className="vot-lider-card">
                      <div className="vot-lider-top">
                        <strong>{l.lider}</strong>
                        <span>{done}/{l.total} · {pct}%</span>
                      </div>
                      <div className="vot-lider-bar" aria-hidden>
                        <i style={{ width: `${pct}%` }} />
                      </div>
                      <div className="vot-lider-meta">
                        <span className="is-pend">{l.pendente} pend.</span>
                        <span className="is-yes">{l.votou} votou</span>
                        <span className="is-no">{l.naoVotou} não votou</span>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div className="vot-desktop-table-wrap">
                <table className="vot-desktop-table">
                  <thead>
                    <tr>
                      <th>Liderança</th>
                      <th>Total</th>
                      <th>Pendente</th>
                      <th>Votou</th>
                      <th>Não votou</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lideresFiltrados.map((l) => {
                      const done = l.votou + l.naoVotou
                      const pct = l.total ? Math.round((done / l.total) * 100) : 0
                      return (
                        <tr key={l.lider}>
                          <td><strong>{l.lider}</strong></td>
                          <td>{l.total}</td>
                          <td className="is-pend">{l.pendente}</td>
                          <td className="is-yes">{l.votou}</td>
                          <td className="is-no">{l.naoVotou}</td>
                          <td>{pct}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
