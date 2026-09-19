import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  Image as ImageIcon,
  Phone,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { Pagination } from '../components/ui/Pagination'
import { Modal } from '../components/ui/Modal'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import {
  fetchDemandaCounts,
  fetchDemandas,
  labelUrgencia,
  marcarDemandaFeita,
  protocoloDemanda,
  type DemandaComAutor,
} from '../lib/demandas'
import { formatPhone } from '../lib/format'
import type { DemandaStatus, DemandaUrgencia } from '../types'

type ViewTab = 'abertas' | 'historico'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function UrgenciaBadge({ value }: { value?: DemandaUrgencia | null }) {
  const urgencia = value ?? 'normal'
  return (
    <span className={`dm-urg-badge tone-${urgencia}`}>
      <span className="dm-urg-dot" />
      {labelUrgencia(urgencia)}
    </span>
  )
}

export function DemandasPainelPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [tab, setTab] = useState<ViewTab>('abertas')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(12)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<DemandaComAutor[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({ abertas: 0, feitas: 0 })
  const [error, setError] = useState<string | null>(null)

  const [resolveId, setResolveId] = useState<string | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null)

  const status: DemandaStatus = tab === 'abertas' ? 'aberta' : 'feita'
  const resolveItem = items.find((d) => d.id === resolveId)

  async function load() {
    setLoading(true)
    try {
      const [list, c] = await Promise.all([
        fetchDemandas({ status, search, page, pageSize }),
        fetchDemandaCounts(),
      ])
      setItems(list.items)
      setTotal(list.total)
      setCounts(c)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar demandas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, page, pageSize])

  async function confirmFeita() {
    if (!resolveId || !profile?.id) return
    setSaving(true)
    const { error: err } = await marcarDemandaFeita(resolveId, profile.id, resolveNote)
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setResolveId(null)
    setResolveNote('')
    await load()
  }

  function setFilter(next: ViewTab) {
    setTab(next)
    setPage(0)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="dm-page">
      <div className="dm-header">
        <div>
          <p className="dm-kicker">Demandas</p>
          <h1>Visualizar demandas</h1>
          <p className="dm-sub">Acompanhe o que entrou e o histórico do que já foi concluído.</p>
        </div>
        <Link to="/demandas/lancar" className="dm-btn-primary">
          <Plus size={14} /> Nova demanda
        </Link>
      </div>

      <div className="dm-metrics">
        <button
          type="button"
          className={`dm-metric tone-open${tab === 'abertas' ? ' active' : ''}`}
          onClick={() => setFilter('abertas')}
        >
          <div className="dm-metric-top">
            <span>Em aberto</span>
            <em>
              <span className="dm-metric-dot" /> Filtrar ativas
            </em>
          </div>
          <div className="dm-metric-bottom">
            <strong>{counts.abertas}</strong>
            <span>
              Visualizar lista <ChevronRight size={14} />
            </span>
          </div>
        </button>

        <button
          type="button"
          className={`dm-metric tone-done${tab === 'historico' ? ' active' : ''}`}
          onClick={() => setFilter('historico')}
        >
          <div className="dm-metric-top">
            <span>Concluídas</span>
            <em>
              <CheckCircle2 size={11} /> Histórico
            </em>
          </div>
          <div className="dm-metric-bottom">
            <strong>{counts.feitas}</strong>
            <span>
              Abrir histórico <ChevronRight size={14} />
            </span>
          </div>
        </button>
      </div>

      <div className="dm-filters">
        <button
          type="button"
          className={`dm-filter-tab${tab === 'abertas' ? ' active' : ''}`}
          onClick={() => setFilter('abertas')}
        >
          <Clock3 size={14} /> Em aberto
          <em>{counts.abertas}</em>
        </button>
        <button
          type="button"
          className={`dm-filter-tab${tab === 'historico' ? ' active' : ''}`}
          onClick={() => setFilter('historico')}
        >
          <History size={14} /> Histórico de concluídas
          <em>{counts.feitas}</em>
        </button>
      </div>

      <div className="dm-toolbar">
        <div className="dm-search">
          <Search size={16} aria-hidden />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Buscar por nome, documento ou descrição..."
          />
          <button
            type="button"
            className="dm-clear-inline"
            onClick={() => {
              setSearch('')
              setPage(0)
            }}
          >
            <RotateCcw size={13} /> Limpar
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="dm-loading">
          <Spinner size={36} />
        </div>
      ) : !items.length ? (
        <div className="dm-empty">
          <div className="dm-empty-icon">
            <History size={22} />
          </div>
          <h3>{tab === 'abertas' ? 'Nenhuma demanda em aberto' : 'Nenhuma demanda no histórico'}</h3>
          <p>
            {tab === 'abertas'
              ? 'Quando alguém registrar uma demanda, ela aparece aqui.'
              : 'Demandas finalizadas com “Demanda feita” constam neste histórico.'}
          </p>
          <Link to="/demandas/lancar" className="dm-btn-primary">
            Lançar demanda
          </Link>
        </div>
      ) : (
        <>
          <div className="dm-list">
            {items.map((d) => {
              const proto = protocoloDemanda(d.id)
              const isDone = d.status === 'feita'
              return (
                <article key={d.id} className={`dm-item${isDone ? ' is-done' : ''}`}>
                  <header className="dm-item-head">
                    <div className="dm-item-tags">
                      <span className="dm-proto">{proto}</span>
                      <span className={`dm-status-badge ${isDone ? 'done' : 'open'}`}>
                        {isDone ? (
                          <>
                            <CheckCircle2 size={11} /> Concluída
                          </>
                        ) : (
                          <>
                            <span className="dm-status-dot" /> Em aberto
                          </>
                        )}
                      </span>
                      <UrgenciaBadge value={d.urgencia} />
                      {!isDone && <span className="dm-new-tag">Nova solicitação</span>}
                    </div>
                    <time className="dm-when">{formatWhen(d.created_at)}</time>
                  </header>

                  <div className="dm-item-body">
                    <div className="dm-person">
                      <h3>{d.nome}</h3>
                      <span className="dm-origem">{d.origem === 'avulso' ? 'Avulso' : 'Do cadastro'}</span>
                      {d.documento && <span className="dm-doc">Doc: {d.documento}</span>}
                    </div>

                    <div className="dm-contacts">
                      {d.telefone && (
                        <span>
                          <Phone size={13} /> {formatPhone(d.telefone)}
                          <WhatsAppLink
                            phone={d.telefone}
                            showLabel
                            label="WhatsApp"
                            message={`Olá ${d.nome}, referente à demanda ${proto}...`}
                          />
                        </span>
                      )}
                      {d.telefone_extra && (
                        <span className="dm-extra">
                          Contato extra: <strong>{formatPhone(d.telefone_extra)}</strong>
                          <WhatsAppLink phone={d.telefone_extra} showLabel label="WhatsApp" />
                        </span>
                      )}
                    </div>

                    <div className="dm-desc-box">{d.descricao}</div>

                    {(d.foto_url || d.autor_nome) && (
                      <div className="dm-item-meta">
                        {d.foto_url && (
                          <button
                            type="button"
                            className="dm-thumb"
                            onClick={() => setPreview({ url: d.foto_url!, label: `${proto} · ${d.nome}` })}
                          >
                            <img src={d.foto_url} alt="" />
                            <span>
                              <ImageIcon size={13} /> Ver foto
                            </span>
                          </button>
                        )}
                        <span className="dm-autor">Lançada por {d.autor_nome}</span>
                      </div>
                    )}
                  </div>

                  <footer className="dm-item-foot">
                    {isDone ? (
                      <span className="dm-resolved">
                        Concluída {d.resolved_at ? formatWhen(d.resolved_at) : ''}
                        {d.resolvedor_nome ? ` · ${d.resolvedor_nome}` : ''}
                        {d.resolved_note ? ` — ${d.resolved_note}` : ''}
                      </span>
                    ) : isAdmin ? (
                      <button
                        type="button"
                        className="dm-btn-feita"
                        onClick={() => {
                          setResolveId(d.id)
                          setResolveNote('')
                        }}
                      >
                        <CheckCircle2 size={15} /> Demanda feita
                      </button>
                    ) : (
                      <span className="dm-resolved">Aguardando confirmação do administrador</span>
                    )}
                  </footer>
                </article>
              )
            })}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(0)
            }}
            pageSizeOptions={[12, 24, 48]}
          />
        </>
      )}

      <Modal
        open={Boolean(resolveId)}
        title="Demanda Feita"
        onClose={() => !saving && setResolveId(null)}
        onConfirm={confirmFeita}
        confirmLabel="Confirmar conclusão"
        loading={saving}
      >
        <p className="dm-modal-proto">
          {resolveItem ? `${protocoloDemanda(resolveItem.id)} · ${resolveItem.nome}` : ''}
        </p>
        <p className="dm-modal-text">
          Confirma que este atendimento foi resolvido? A demanda será transferida automaticamente para o
          histórico de concluídas.
        </p>
        <label className="dm-label">Observação / parecer (opcional)</label>
        <textarea
          className="dm-textarea"
          rows={3}
          value={resolveNote}
          onChange={(e) => setResolveNote(e.target.value)}
          placeholder="Ex.: resolvido com a equipe local"
        />
      </Modal>

      {preview && (
        <div className="dm-lightbox" onClick={() => setPreview(null)} role="presentation">
          <div className="dm-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <p>{preview.label}</p>
            <img src={preview.url} alt="Foto da demanda" />
            <button type="button" onClick={() => setPreview(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
