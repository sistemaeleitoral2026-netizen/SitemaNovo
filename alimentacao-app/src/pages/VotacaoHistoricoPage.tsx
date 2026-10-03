import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, ImageIcon, Pencil, Search, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { VotacaoBottomNav } from '../components/votacao/VotacaoBottomNav'
import { hasRole } from '../lib/roles'
import {
  fetchAuxiliarLiderNomes,
  fetchVotacaoHistorico,
  signVotoFoto,
  type VotacaoHit,
} from '../lib/votacao'
import { supabase } from '../lib/supabase'

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    if (sameDay) return `Hoje, ${hh}:${mi}`
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}, ${hh}:${mi}`
  } catch {
    return iso
  }
}

function statusChip(votou: boolean | null | undefined) {
  if (votou === true) return { label: 'Votou', cls: 'is-yes' }
  if (votou === false) return { label: 'Não votou', cls: 'is-no' }
  return { label: 'Lançado', cls: 'is-pend' }
}

export function VotacaoHistoricoPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<VotacaoHit[]>([])
  const [coordNome, setCoordNome] = useState('')
  const [liderNomes, setLiderNomes] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [fotoTitle, setFotoTitle] = useState('')
  const [scopeReady, setScopeReady] = useState(false)

  const isStaff = hasRole(profile, ['admin', 'diretoria'])
  const isCoordenador = hasRole(profile, 'coordenador')
  const isAuxiliar =
    hasRole(profile, 'auxiliar') && !hasRole(profile, ['admin', 'diretoria', 'coordenador'])

  useEffect(() => {
    let cancelled = false
    async function resolveScope() {
      try {
        if (isAuxiliar && profile?.id) {
          const nomes = await fetchAuxiliarLiderNomes(profile.id)
          if (cancelled) return
          setLiderNomes(nomes)
          if (!nomes.length) {
            setError('Nenhuma liderança atribuída. Peça ao coordenador em Equipe → Auxiliares.')
          }
        } else if (isCoordenador && profile?.id && !isStaff) {
          const { data: row } = await supabase
            .from('coordenadores')
            .select('nome')
            .or(`user_id.eq.${profile.id}${profile.coordenador_id ? `,id.eq.${profile.coordenador_id}` : ''}`)
            .limit(1)
            .maybeSingle()
          if (cancelled) return
          const nome = row?.nome ?? ''
          if (!nome) {
            setError('Coordenação não vinculada ao login.')
            setScopeReady(true)
            setLoading(false)
            return
          }
          setCoordNome(nome)
        }
        if (!cancelled) setScopeReady(true)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar escopo.')
          setScopeReady(true)
          setLoading(false)
        }
      }
    }
    void resolveScope()
    return () => { cancelled = true }
  }, [profile, isCoordenador, isStaff, isAuxiliar])

  useEffect(() => {
    if (!scopeReady) return
    if (isCoordenador && !isStaff && !coordNome) return
    if (isAuxiliar && !liderNomes.length) {
      setRows([])
      setLoading(false)
      return
    }
    const q = query.trim()
    if (q.length === 1) return

    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true)
        setError(null)
        try {
          const list = await fetchVotacaoHistorico({
            coordenadorNome: isCoordenador && !isStaff ? coordNome : null,
            liderNomes: isAuxiliar ? liderNomes : undefined,
            query: q,
            limit: 80,
          })
          if (!cancelled) setRows(list)
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar histórico.')
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, q ? 280 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [scopeReady, query, coordNome, liderNomes, isCoordenador, isStaff, isAuxiliar])

  async function openFoto(hit: VotacaoHit) {
    if (!hit.voto_foto_path) return
    setError(null)
    try {
      const url = await signVotoFoto(hit.voto_foto_path)
      if (!url) throw new Error('Anexo indisponível.')
      setFotoUrl(url)
      setFotoTitle(hit.nome_completo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o anexo.')
    }
  }

  const subtitle = useMemo(() => {
    if (isAuxiliar) {
      if (!liderNomes.length) return 'Sem lideranças atribuídas'
      return `Lançamentos das suas lideranças: ${liderNomes.join(', ')}`
    }
    if (coordNome) return `Lançamentos da coordenação ${coordNome}`
    return 'Registros recentes salvos no sistema'
  }, [coordNome, isAuxiliar, liderNomes])

  if (!scopeReady || (loading && !rows.length && !error)) {
    return (
      <div className="vot-page vot-historico vot-center">
        <Spinner size={36} />
      </div>
    )
  }

  return (
    <div className="vot-page vot-historico vot-historico-wide vot-has-bottom">
      <div className="page-header">
        <div>
          <h1 className="page-title">Histórico de lançamentos</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <div className="page-header-actions">
          <Link to="/votacao/lancar">
            <Button variant="secondary">Novo lançamento</Button>
          </Link>
        </div>
      </div>

      <div className="filter-panel vot-hist-filter">
        <div className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, mãe, título, zona ou seção…"
            autoComplete="off"
          />
          {query ? (
            <button type="button" className="vot-clear" onClick={() => setQuery('')} aria-label="Limpar">
              <X size={16} />
            </button>
          ) : null}
        </div>
        <div className="vot-hist-count">
          <strong>{rows.length}</strong>
          <span> lançamento{rows.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="cadastros-table-card vot-hist-table-card">
        {loading && !rows.length ? (
          <div className="vot-hist-loading">
            <Spinner size={36} />
          </div>
        ) : !rows.length ? (
          <EmptyState
            title="Nenhum lançamento"
            description={
              isAuxiliar
                ? 'Ainda não há votos lançados nas suas lideranças.'
                : 'Ainda não há votos registrados neste escopo.'
            }
          />
        ) : (
          <>
            {loading ? (
              <div className="vot-hist-loading thin">
                <Spinner size={22} />
              </div>
            ) : null}

            {/* Desktop: tabela com cabeçalhos iguais ao Todos os Cadastros */}
            <div className="table-wrapper desktop-only">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Nome</th>
                    <th>Título</th>
                    <th>Zona</th>
                    <th>Seção</th>
                    <th>Nome da mãe</th>
                    <th>Líder</th>
                    <th>Coordenador</th>
                    <th>Quando</th>
                    <th className="sticky-actions-head">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((h) => {
                    const chip = statusChip(h.votou)
                    return (
                      <tr key={h.id}>
                        <td>
                          <span className={`vot-pill ${chip.cls}`}>{chip.label}</span>
                        </td>
                        <td>
                          <strong className="vot-hist-td-name">{h.nome_completo}</strong>
                        </td>
                        <td className="mono-cell">{h.titulo || '—'}</td>
                        <td>{h.zona || '—'}</td>
                        <td>{h.secao || '—'}</td>
                        <td>
                          <span className="vot-hist-muted">{h.nome_mae || '—'}</span>
                        </td>
                        <td>
                          <span className="vot-hist-muted">{h.lider || '—'}</span>
                        </td>
                        <td>
                          <span className="vot-hist-muted">{h.coordenador || '—'}</span>
                        </td>
                        <td>
                          <time className="vot-hist-when">{fmtWhen(h.voto_em)}</time>
                        </td>
                        <td className="sticky-actions-cell">
                          <div className="vot-hist-row-actions">
                            <Link to={`/votacao/lancar?edit=${encodeURIComponent(h.id)}`}>
                              <Button variant="ghost" size="sm" aria-label="Editar">
                                <Pencil size={16} />
                              </Button>
                            </Link>
                            {h.voto_foto_path ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Ver anexo"
                                onClick={() => void openFoto(h)}
                              >
                                <Eye size={16} />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards com os mesmos campos rotulados */}
            <div className="mobile-cards">
              {rows.map((h) => {
                const chip = statusChip(h.votou)
                return (
                  <div className="mobile-card" key={h.id}>
                    <div className="mobile-card-top">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="vot-hist-mobile-status">
                          <span className={`vot-pill ${chip.cls}`}>{chip.label}</span>
                          <time>{fmtWhen(h.voto_em)}</time>
                        </div>
                        <strong style={{ display: 'block', fontSize: '.88rem' }}>{h.nome_completo}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '.3rem' }}>
                        <Link to={`/votacao/lancar?edit=${encodeURIComponent(h.id)}`}>
                          <Button variant="ghost" size="sm" aria-label="Editar">
                            <Pencil size={16} />
                          </Button>
                        </Link>
                        {h.voto_foto_path ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Ver anexo"
                            onClick={() => void openFoto(h)}
                          >
                            <Eye size={16} />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="mobile-card-meta vot-hist-mobile-grid">
                      <div>
                        <span>Título</span>
                        <strong>{h.titulo || '—'}</strong>
                      </div>
                      <div>
                        <span>Zona / Seção</span>
                        <strong>{h.zona || '—'} / {h.secao || '—'}</strong>
                      </div>
                      <div>
                        <span>Nome da mãe</span>
                        <strong>{h.nome_mae || '—'}</strong>
                      </div>
                      <div>
                        <span>Líder</span>
                        <strong>{h.lider || '—'}</strong>
                      </div>
                      <div>
                        <span>Coordenador</span>
                        <strong>{h.coordenador || '—'}</strong>
                      </div>
                      {!h.voto_foto_path ? (
                        <div>
                          <span>Anexo</span>
                          <strong className="vot-hist-no-foto">
                            <ImageIcon size={12} /> Sem anexo
                          </strong>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {fotoUrl && (
        <div className="vot-foto-modal" role="dialog" aria-modal aria-label="Anexo">
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
