import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Eye, ImageIcon, RefreshCw, Search, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import { VotacaoBottomNav } from '../components/votacao/VotacaoBottomNav'
import { hasRole } from '../lib/roles'
import { buildWhatsAppUrl } from '../lib/whatsapp'
import {
  fetchAuxiliarLiderNomes,
  fetchVotacaoFichasLider,
  fetchVotacaoProgresso,
  fetchVotacaoStatsPorLideres,
  labelAdicionadoNoLancamento,
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

function normName(s: string) {
  return s.trim().toLowerCase()
}

/** Só renderiza ícone se o telefone abrir WhatsApp de verdade. */
function WaIcon({ phone, label }: { phone?: string | null; label: string }) {
  if (!buildWhatsAppUrl(phone)) return null
  return (
    <span
      className="vot-wa-wrap"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <WhatsAppLink
        phone={phone}
        label={label}
        className="whatsapp-link-inline vot-wa"
      />
    </span>
  )
}

function buildProgressoFromStats(
  coordenadorNome: string,
  stats: Record<string, { lider: string; total: number; pendente: number; votou: number; naoVotou: number }>,
): VotacaoProgresso {
  const porLider = Object.values(stats).sort((a, b) => {
    if (b.pendente !== a.pendente) return b.pendente - a.pendente
    return a.lider.localeCompare(b.lider, 'pt-BR')
  })
  return {
    coordenadorNome,
    total: porLider.reduce((s, l) => s + l.total, 0),
    pendente: porLider.reduce((s, l) => s + l.pendente, 0),
    votou: porLider.reduce((s, l) => s + l.votou, 0),
    naoVotou: porLider.reduce((s, l) => s + l.naoVotou, 0),
    porLider,
  }
}

export function VotacaoProgressoPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkDone = useRef(false)
  const openCardRef = useRef<HTMLLIElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coordNome, setCoordNome] = useState('')
  const [liderPhones, setLiderPhones] = useState<Record<string, string>>({})
  const [allowedLideres, setAllowedLideres] = useState<string[] | null>(null)
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
  const isAuxiliar =
    hasRole(profile, 'auxiliar') && !hasRole(profile, ['admin', 'diretoria', 'coordenador'])
  const deepLider = (searchParams.get('lider') ?? '').trim()
  const deepCoord = (searchParams.get('coordenador') ?? '').trim()

  async function loadLiderPhones(opts: { coordenadorId?: string | null; liderNomes?: string[] }) {
    async function run(cols: string) {
      let q = supabase.from('lideres').select(cols).eq('ativo', true)
      if (opts.coordenadorId) q = q.eq('coordenador_id', opts.coordenadorId)
      return q
    }
    let { data: rows, error } = await run('nome,telefone')
    if (error && /telefone|column|schema/i.test(error.message)) {
      setLiderPhones({})
      return
    }
    if (error) {
      setLiderPhones({})
      return
    }
    const allow = opts.liderNomes?.length
      ? new Set(opts.liderNomes.map(normName))
      : null
    const map: Record<string, string> = {}
    for (const r of rows ?? []) {
      const nome = String((r as { nome?: string }).nome ?? '').trim()
      const tel = String((r as { telefone?: string | null }).telefone ?? '').trim()
      if (!nome || !tel || !buildWhatsAppUrl(tel)) continue
      if (allow && !allow.has(normName(nome))) continue
      map[normName(nome)] = tel
    }
    setLiderPhones(map)
  }

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setLoading(true)
      setError(null)
      try {
        if (isAuxiliar && profile?.id) {
          const nomes = await fetchAuxiliarLiderNomes(profile.id)
          if (cancelled) return
          setAllowedLideres(nomes)
          let cNome = ''
          let cId: string | null = profile.coordenador_id ?? null
          if (cId) {
            const { data: row } = await supabase
              .from('coordenadores')
              .select('id,nome')
              .eq('id', cId)
              .maybeSingle()
            cNome = (row?.nome ?? '').trim()
            cId = row?.id ?? cId
          }
          // Sem coordenação vinculada: não busca stats globais por nome de liderança.
          if (!cNome) {
            setCoordNome('')
            setSelectedCoord('')
            setData(null)
            setError('Coordenação não vinculada ao login. Peça ao coordenador ou à diretoria.')
            return
          }
          setCoordNome(cNome)
          setSelectedCoord(cId ?? '')
          await loadLiderPhones({ coordenadorId: cId, liderNomes: nomes })
          if (!nomes.length) {
            setData({
              coordenadorNome: cNome,
              total: 0,
              pendente: 0,
              votou: 0,
              naoVotou: 0,
              porLider: [],
            })
          } else {
            const stats = await fetchVotacaoStatsPorLideres({
              liderNomes: nomes,
              coordenadorNome: cNome,
            })
            if (!cancelled) setData(buildProgressoFromStats(cNome, stats))
          }
        } else if (isCoordenador && profile?.id) {
          setAllowedLideres(null)
          const { data: row, error: rowErr } = await supabase
            .from('coordenadores')
            .select('id,nome')
            .or(`user_id.eq.${profile.id}${profile.coordenador_id ? `,id.eq.${profile.coordenador_id}` : ''}`)
            .limit(1)
            .maybeSingle()
          if (rowErr) throw new Error(rowErr.message)
          if (cancelled) return
          const nome = row?.nome ?? ''
          setCoordNome(nome)
          setSelectedCoord(row?.id ?? '')
          if (row?.id) await loadLiderPhones({ coordenadorId: row.id })
          if (nome) {
            setData(await fetchVotacaoProgresso(nome))
          } else {
            setError('Coordenação não vinculada ao login.')
          }
        } else if (isStaff) {
          setAllowedLideres(null)
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
            await loadLiderPhones({ coordenadorId: first.id })
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
  }, [profile, isAuxiliar, isCoordenador, isStaff])

  async function reload(nome?: string) {
    setLoading(true)
    setError(null)
    setExpandedLider(null)
    setFichas([])
    try {
      if (isAuxiliar && profile?.id) {
        const target = (nome ?? coordNome).trim()
        if (!target) {
          setError('Coordenação não vinculada ao login. Peça ao coordenador ou à diretoria.')
          setData(null)
          return
        }
        const nomes = allowedLideres ?? await fetchAuxiliarLiderNomes(profile.id)
        if (!nomes.length) {
          setData({
            coordenadorNome: target,
            total: 0,
            pendente: 0,
            votou: 0,
            naoVotou: 0,
            porLider: [],
          })
          return
        }
        const stats = await fetchVotacaoStatsPorLideres({
          liderNomes: nomes,
          coordenadorNome: target,
        })
        setData(buildProgressoFromStats(target, stats))
      } else {
        const target = (nome ?? coordNome).trim()
        if (!target) {
          setError('Coordenação não vinculada ao login.')
          return
        }
        setData(await fetchVotacaoProgresso(target))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar progresso.')
    } finally {
      setLoading(false)
    }
  }

  async function onPickCoord(id: string) {
    setSelectedCoord(id)
    const row = coordOptions.find((c) => c.id === id)
    const nome = row?.nome ?? ''
    setCoordNome(nome)
    setLiderFiltro('')
    await loadLiderPhones({ coordenadorId: id })
    await reload(nome)
  }

  async function toggleLider(lider: string) {
    if (expandedLider === lider) {
      setExpandedLider(null)
      setFichas([])
      return
    }
    if (allowedLideres) {
      const ok = allowedLideres.some((n) => normName(n) === normName(lider))
      if (!ok) {
        setError('Esta liderança não está liberada para você.')
        return
      }
    }
    setExpandedLider(lider)
    setLoadingFichas(true)
    setError(null)
    try {
      if (!coordNome.trim()) {
        setFichas([])
        setError('Coordenação não vinculada — não é possível listar as fichas.')
        return
      }
      setFichas(await fetchVotacaoFichasLider(coordNome, lider))
      requestAnimationFrame(() => {
        openCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (e) {
      setFichas([])
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as fichas.')
    } finally {
      setLoadingFichas(false)
    }
  }

  function goLancar(hit: VotacaoHit) {
    navigate(`/votacao/lancar?edit=${encodeURIComponent(hit.id)}`)
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
            {isAuxiliar
              ? 'Suas lideranças · toque numa ficha para lançar · WhatsApp só com telefone.'
              : 'Toque numa liderança · role a lista · toque na ficha para lançar.'}
          </p>
          <p className="vot-fields-hint vot-hint-desktop">
            {isAuxiliar
              ? 'Somente as lideranças liberadas para você. Clique na ficha para abrir o lançamento.'
              : 'Abra uma liderança, veja o anexo e clique na ficha para ir ao lançamento.'}
          </p>

          {!tot.porLider.length ? (
            <EmptyState
              title={isAuxiliar ? 'Nenhuma liderança' : 'Nenhuma ficha'}
              description={
                isAuxiliar
                  ? 'Nenhuma liderança atribuída. Peça ao coordenador.'
                  : 'Não há cadastros nesta coordenação.'
              }
            />
          ) : !lideresFiltrados.length ? (
            <p className="vot-empty">Nenhuma liderança com esse nome.</p>
          ) : (
            <ul className="vot-lider-list">
              {lideresFiltrados.map((l) => {
                const done = l.votou + l.naoVotou
                const pct = l.total ? Math.round((done / l.total) * 100) : 0
                const open = expandedLider === l.lider
                const liderTel = liderPhones[normName(l.lider)]
                return (
                  <li
                    key={l.lider}
                    ref={open ? openCardRef : undefined}
                    className={`vot-lider-card${open ? ' is-open' : ''}`}
                  >
                    <div className="vot-lider-toggle-wrap">
                      <button
                        type="button"
                        className="vot-lider-toggle"
                        onClick={() => void toggleLider(l.lider)}
                        aria-expanded={open}
                      >
                        <div className="vot-lider-top">
                          <strong className="vot-lider-name">
                            <span>{l.lider}</span>
                          </strong>
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
                      {liderTel ? (
                        <div className="vot-lider-wa">
                          <WaIcon phone={liderTel} label={`WhatsApp ${l.lider}`} />
                        </div>
                      ) : null}
                    </div>

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
                                <button
                                  type="button"
                                  className="vot-ficha-mini-open"
                                  onClick={() => goLancar(h)}
                                >
                                  <strong className="vot-ficha-mini-name">
                                    <span>{h.nome_completo}</span>
                                  </strong>
                                  <span>
                                    Título {h.titulo || '—'} · Z {h.zona || '—'} · S {h.secao || '—'}
                                  </span>
                                  {labelAdicionadoNoLancamento(h) ? (
                                    <em className="vot-tag-aux">{labelAdicionadoNoLancamento(h)}</em>
                                  ) : null}
                                  <em className="vot-ficha-go">Toque para lançar</em>
                                </button>
                                <div className="vot-ficha-mini-side">
                                  <WaIcon phone={h.telefone} label={`WhatsApp ${h.nome_completo}`} />
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
                                      <Eye size={14} /> Anexo
                                    </button>
                                  ) : (
                                    <span className="vot-muted vot-no-anexo">
                                      <ImageIcon size={12} /> Sem anexo
                                    </span>
                                  )}
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
