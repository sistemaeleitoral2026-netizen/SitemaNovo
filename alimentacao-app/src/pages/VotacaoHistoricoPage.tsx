import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, ImageIcon, Pencil, Search, Trash2, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Pagination } from '../components/ui/Pagination'
import { VotacaoBottomNav } from '../components/votacao/VotacaoBottomNav'
import { hasRole } from '../lib/roles'
import { logAudit } from '../lib/audit'
import {
  excluirLancamentoVotacao,
  fetchAuxiliarLiderNomes,
  fetchVotacaoHistorico,
  labelAdicionadoNoLancamento,
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
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [coordNome, setCoordNome] = useState('')
  const [liderNomes, setLiderNomes] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [fotoTitle, setFotoTitle] = useState('')
  const [scopeReady, setScopeReady] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<VotacaoHit | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const isStaff = hasRole(profile, ['admin', 'diretoria'])
  const isCoordenador = hasRole(profile, 'coordenador')
  const isAuxiliar =
    hasRole(profile, 'auxiliar') && !hasRole(profile, ['admin', 'diretoria', 'coordenador'])
  /** Coord / diretoria / admin podem tirar lançamento inválido do histórico. */
  const canExcluirLancamento = isStaff || isCoordenador

  useEffect(() => {
    let cancelled = false
    async function resolveScope() {
      try {
        if (isAuxiliar && profile?.id) {
          let cNome = ''
          if (profile.coordenador_id) {
            const { data: coord } = await supabase
              .from('coordenadores')
              .select('nome')
              .eq('id', profile.coordenador_id)
              .maybeSingle()
            cNome = (coord?.nome ?? '').trim()
          }
          if (!cancelled) setCoordNome(cNome)
          const nomes = await fetchAuxiliarLiderNomes(profile.id)
          if (cancelled) return
          setLiderNomes(nomes)
          if (!cNome) {
            setError('Coordenação não vinculada ao login. Peça ao coordenador ou à diretoria.')
          } else if (!nomes.length) {
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
    if (isAuxiliar && (!coordNome || !liderNomes.length)) {
      setRows([])
      setTotal(0)
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
          const { rows: list, total: count } = await fetchVotacaoHistorico({
            coordenadorNome: ((isCoordenador && !isStaff) || isAuxiliar) ? coordNome : null,
            liderNomes: isAuxiliar ? liderNomes : undefined,
            query: q,
            page,
            pageSize,
          })
          if (!cancelled) {
            setRows(list)
            setTotal(count)
          }
        } catch (e) {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : 'Falha ao carregar histórico.'
            setError(/votou|voto_|column|schema/i.test(msg)
              ? `${msg} — rode o SQL coordenador_auxiliar_votacao_run.sql no Supabase.`
              : msg)
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, q ? 280 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [scopeReady, query, page, pageSize, coordNome, liderNomes, isCoordenador, isStaff, isAuxiliar])

  useEffect(() => {
    setPage(0)
  }, [query, coordNome, liderNomes])

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

  async function handleExcluirLancamento() {
    if (!deleteTarget || !canExcluirLancamento) return
    setDeleting(true)
    setError(null)
    setOkMsg(null)
    try {
      const result = await excluirLancamentoVotacao(deleteTarget)
      logAudit(
        result.mode === 'deleted' ? 'excluir_ficha_lancamento' : 'reverter_lancamento_votacao',
        'cadastros',
        deleteTarget.id,
        {
          nome: deleteTarget.nome_completo,
          adicionado_por_auxiliar: Boolean(deleteTarget.adicionado_por_auxiliar),
        },
      )
      setRows((prev) => {
        const next = prev.filter((r) => r.id !== deleteTarget.id)
        if (!next.length && page > 0) setPage((p) => Math.max(0, p - 1))
        return next
      })
      setTotal((t) => Math.max(0, t - 1))
      setOkMsg(
        result.mode === 'deleted'
          ? 'Ficha adicionada pelo auxiliar excluída do sistema.'
          : 'Lançamento removido do histórico. A ficha voltou para pendente.',
      )
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir o lançamento.')
    } finally {
      setDeleting(false)
    }
  }

  function rowActions(h: VotacaoHit) {
    return (
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
        {canExcluirLancamento ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Excluir lançamento"
            onClick={() => {
              setOkMsg(null)
              setDeleteTarget(h)
            }}
          >
            <Trash2 size={16} />
          </Button>
        ) : null}
      </div>
    )
  }

  const subtitle = useMemo(() => {
    if (isAuxiliar) {
      if (!liderNomes.length) return 'Sem lideranças atribuídas'
      return `Lançamentos das suas lideranças: ${liderNomes.join(', ')}`
    }
    if (coordNome) return `Lançamentos da coordenação ${coordNome}`
    return 'Registros recentes salvos no sistema'
  }, [coordNome, isAuxiliar, liderNomes])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageSafe = Math.min(page, totalPages - 1)

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
          <strong>{total}</strong>
          <span> lançamento{total === 1 ? '' : 's'}</span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {okMsg && <div className="alert alert-success">{okMsg}</div>}

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
                          {labelAdicionadoNoLancamento(h) ? (
                            <em className="vot-tag-aux">{labelAdicionadoNoLancamento(h)}</em>
                          ) : null}
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
                          {rowActions(h)}
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
                        {labelAdicionadoNoLancamento(h) ? (
                          <em className="vot-tag-aux">{labelAdicionadoNoLancamento(h)}</em>
                        ) : null}
                      </div>
                      {rowActions(h)}
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

            {total > pageSize && (
              <Pagination
                page={pageSafe}
                totalPages={totalPages}
                totalItems={total}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(0)
                }}
                pageSizeOptions={[15, 25, 50, 100]}
                label={`${pageSafe * pageSize + 1}–${Math.min(total, (pageSafe + 1) * pageSize)} de ${total}`}
              />
            )}
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

      <Modal
        open={!!deleteTarget}
        title={
          deleteTarget?.adicionado_por_auxiliar
            ? 'Excluir ficha do auxiliar?'
            : 'Remover lançamento do histórico?'
        }
        description={
          deleteTarget?.adicionado_por_auxiliar
            ? `A ficha "${deleteTarget.nome_completo}" foi adicionada pelo auxiliar e será apagada do sistema (some do histórico e do progresso).`
            : `O lançamento de "${deleteTarget?.nome_completo ?? ''}" sai do histórico e a ficha volta para pendente. O cadastro permanece.`
        }
        onClose={() => { if (!deleting) setDeleteTarget(null) }}
        onConfirm={() => void handleExcluirLancamento()}
        confirmLabel={deleteTarget?.adicionado_por_auxiliar ? 'Excluir ficha' : 'Remover lançamento'}
        cancelLabel="Cancelar"
        confirmVariant="danger"
        loading={deleting}
      />

      <VotacaoBottomNav />
    </div>
  )
}
