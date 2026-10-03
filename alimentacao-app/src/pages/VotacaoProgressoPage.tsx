import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, ClipboardCheck, Eye, ImageIcon, RefreshCw, Search, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { VotacaoBottomNav } from '../components/votacao/VotacaoBottomNav'
import { hasRole } from '../lib/roles'
import {
  fetchVotacaoFichasLider,
  fetchVotacaoProgresso,
  signVotoFoto,
  type VotacaoHit,
  type VotacaoProgresso,
} from '../lib/votacao'
import { supabase } from '../lib/supabase'

function statusLabel(votou: boolean | null | undefined) {
  if (votou === true) return 'Votou'
  if (votou === false) return 'Não votou'
  return 'Pendente'
}

export function VotacaoProgressoPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkDone = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coordNome, setCoordNome] = useState('')
  const [data, setData] = useState<VotacaoProgresso | null>(null)
  const [coordOptions, setCoordOptions] = useState<{ id: string; nome: string }[]>([])
  const [selectedCoord, setSelectedCoord] = useState('')
  const [liderFiltro, setLiderFiltro] = useState(() => searchParams.get('lider') ?? '')
  const [expandedLider, setExpandedLider] = useState<string | null>(null)
  const [fichas, setFichas] = useState<VotacaoHit[]>([])
  const [loadingFichas, setLoadingFichas] = useState(false)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [fotoTitle, setFotoTitle] = useState('')
  const [fotoBusy, setFotoBusy] = useState(false)

  const isStaff = hasRole(profile, ['admin', 'diretoria'])
  const isCoordenador = hasRole(profile, 'coordenador')
  const deepLider = (searchParams.get('lider') ?? '').trim()
  const deepCoord = (searchParams.get('coordenador') ?? '').trim()

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
          const fromUrl = deepCoord
            ? list.find((c) => c.nome.trim().toLowerCase() === deepCoord.toLowerCase())
            : null
          const first = fromUrl ?? list[0]
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
    setExpandedLider(null)
    setFichas([])
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

  async function toggleLider(lider: string) {
    if (expandedLider === lider) {
      setExpandedLider(null)
      setFichas([])
      return
    }
    setExpandedLider(lider)
    setLoadingFichas(true)
    setError(null)
    try {
      setFichas(await fetchVotacaoFichasLider(coordNome, lider))
    } catch (e) {
      setFichas([])
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as fichas.')
    } finally {
      setLoadingFichas(false)
    }
  }

  // Deep-link: /votacao/progresso?lider=X&coordenador=Y (vindo da Equipe).
  useEffect(() => {
    if (!data || !deepLider || deepLinkDone.current || loading) return
    const match = data.porLider.find(
      (l) => l.lider.trim().toLowerCase() === deepLider.toLowerCase(),
    )
    setLiderFiltro(deepLider)
    deepLinkDone.current = true
    if (match) {
      void toggleLider(match.lider)
    }
    // Limpa a URL sem perder o filtro na tela.
    const next = new URLSearchParams(searchParams)
    next.delete('lider')
    next.delete('coordenador')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, deepLider, loading])

  async function openFoto(hit: VotacaoHit) {
    if (!hit.voto_foto_path) return
    setFotoBusy(true)
    setError(null)
    try {
      const url = await signVotoFoto(hit.voto_foto_path)
      if (!url) throw new Error('Anexo indisponível.')
      setFotoUrl(url)
      setFotoTitle(hit.nome_completo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o anexo.')
    } finally {
      setFotoBusy(false)
    }
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
    <div className="vot-page vot-progresso vot-has-bottom">
      <header className="vot-head">
        <div>
          <h1 className="vot-title">Progresso da votação</h1>
          <p className="vot-sub">
            {tot?.coordenadorNome
              ? `Coordenação: ${tot.coordenadorNome} · ${pctGeral}% lançado`
              : 'Selecione a coordenação'}
          </p>
        </div>
      </header>

      <div className="vot-progresso-actions vot-actions-grid">
        <Link to="/votacao/lancar" className="vot-btn">
          <ClipboardCheck size={16} /> Lançar
        </Link>
        <button type="button" className="vot-btn ghost" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'vot-spin' : undefined} /> Atualizar
        </button>
      </div>

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
          <div className="vot-kpi-row vot-kpi-2x2">
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

          <p className="vot-fields-hint vot-hint-mobile">
            Toque numa liderança para ver as fichas e abrir o anexo.
          </p>
          <p className="vot-fields-hint vot-hint-desktop">
            Abra uma liderança para ver as fichas e o anexo do lançamento.
          </p>

          {!tot.porLider.length ? (
            <EmptyState
              title="Nenhuma ficha"
              description="Não há cadastros nesta coordenação."
            />
          ) : !lideresFiltrados.length ? (
            <p className="vot-empty">Nenhuma liderança com esse nome.</p>
          ) : (
            <ul className="vot-lider-list">
              {lideresFiltrados.map((l) => {
                const done = l.votou + l.naoVotou
                const pct = l.total ? Math.round((done / l.total) * 100) : 0
                const open = expandedLider === l.lider
                return (
                  <li key={l.lider} className={`vot-lider-card${open ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="vot-lider-toggle"
                      onClick={() => void toggleLider(l.lider)}
                      aria-expanded={open}
                    >
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
                        <span className="vot-lider-chevron" aria-hidden>
                          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </div>
                    </button>

                    {open && (
                      <div className="vot-lider-fichas">
                        {loadingFichas ? (
                          <div className="vot-center vot-muted">
                            <Spinner size={22} /> Carregando fichas…
                          </div>
                        ) : !fichas.length ? (
                          <p className="vot-empty">Nenhuma ficha nesta liderança.</p>
                        ) : (
                          <ul className="vot-ficha-mini-list">
                            {fichas.map((h) => (
                              <li key={h.id} className="vot-ficha-mini">
                                <div>
                                  <strong>{h.nome_completo}</strong>
                                  <span>
                                    Título {h.titulo || '—'} · Z {h.zona || '—'} · S {h.secao || '—'}
                                  </span>
                                </div>
                                <div className="vot-ficha-mini-side">
                                  <span className={`vot-badge${h.votou === true ? ' is-yes' : h.votou === false ? ' is-no' : ' is-pend'}`}>
                                    {statusLabel(h.votou)}
                                  </span>
                                  {h.voto_foto_path ? (
                                    <button
                                      type="button"
                                      className="vot-btn ghost vot-btn-xs"
                                      disabled={fotoBusy}
                                      onClick={() => void openFoto(h)}
                                    >
                                      <Eye size={14} /> Ver anexo
                                    </button>
                                  ) : (
                                    <span className="vot-muted vot-no-anexo">
                                      <ImageIcon size={12} /> Sem anexo
                                    </span>
                                  )}
                                  <Link
                                    to="/votacao/lancar"
                                    className="vot-btn ghost vot-btn-xs"
                                    title="Abrir no Lançar para editar"
                                  >
                                    Lançar
                                  </Link>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {fotoUrl && (
        <div className="vot-foto-modal" role="dialog" aria-modal aria-label="Anexo do lançamento">
          <button type="button" className="vot-foto-modal-backdrop" onClick={() => setFotoUrl(null)} aria-label="Fechar" />
          <div className="vot-foto-modal-card">
            <div className="vot-foto-modal-head">
              <strong>{fotoTitle}</strong>
              <button type="button" className="vot-clear" onClick={() => setFotoUrl(null)} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <img src={fotoUrl} alt={`Anexo de ${fotoTitle}`} />
            <a className="vot-btn" href={fotoUrl} target="_blank" rel="noopener noreferrer">
              Abrir em nova aba
            </a>
          </div>
        </div>
      )}

      <VotacaoBottomNav />
    </div>
  )
}
