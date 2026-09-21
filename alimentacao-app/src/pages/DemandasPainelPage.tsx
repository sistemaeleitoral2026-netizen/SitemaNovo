import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  Image as ImageIcon,
  Phone,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { Pagination } from '../components/ui/Pagination'
import { Modal } from '../components/ui/Modal'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import {
  attachDemandaFotoUrls,
  fetchDemandaCounts,
  fetchDemandaFilterCounts,
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
  const [urgencia, setUrgencia] = useState<DemandaUrgencia | 'todas'>('todas')
  const [comFotos, setComFotos] = useState(false)
  const [filterCounts, setFilterCounts] = useState({ todas: 0, urgente: 0, normal: 0, fotos: 0 })
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
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
  const [preview, setPreview] = useState<{ demanda: DemandaComAutor; index: number } | null>(null)
  const [batchSaving, setBatchSaving] = useState(false)

  const status: DemandaStatus = tab === 'abertas' ? 'aberta' : 'feita'
  const resolveItem = items.find((d) => d.id === resolveId)

  async function load() {
    setLoading(true)
    try {
      const [list, c] = await Promise.all([
        fetchDemandas({ status, search, urgencia, comFotos, page, pageSize, skipFotos: true }),
        fetchDemandaCounts(),
      ])
      setItems(list.items)
      setTotal(list.total)
      setCounts(c)
      setSelected([])
      setError(null)
      setLoading(false)

      // Assina URLs em lote depois — lista já aparece; fotos entram em seguida
      const withFotos = await attachDemandaFotoUrls(list.items)
      setItems(withFotos)

      try {
        setFilterCounts(await fetchDemandaFilterCounts(status, search))
      } catch {
        setFilterCounts({ todas: list.total, urgente: 0, normal: 0, fotos: 0 })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar demandas.')
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, urgencia, comFotos, page, pageSize])

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
    setSelected([])
  }

  function toggleSelected(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  async function completeSelected() {
    if (!isAdmin || !profile?.id || !selected.length) return
    setBatchSaving(true)
    const results = await Promise.all(selected.map((id) => marcarDemandaFeita(id, profile.id)))
    const failures = results.filter((result) => result.error)
    setBatchSaving(false)
    if (failures.length) setError(`${failures.length} demanda(s) não puderam ser concluídas.`)
    await load()
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
        <div className="dm-urgency-filters" aria-label="Filtrar por urgência e fotos">
          <span>Urgência:</span>
          {(['todas', 'urgente', 'normal'] as const).map((value) => (
            <button key={value} type="button" className={urgencia === value && !comFotos ? 'active' : ''}
              onClick={() => { setUrgencia(value); setComFotos(false); setPage(0) }}>
              {value === 'todas' ? 'Todas' : value === 'urgente' ? 'Urgente' : 'Normal'} ({filterCounts[value]})
            </button>
          ))}
          <button type="button" className={comFotos ? 'active' : ''}
            onClick={() => { setComFotos(!comFotos); setUrgencia('todas'); setPage(0) }}>
            <ImageIcon size={13} /> Com foto ({filterCounts.fotos})
          </button>
        </div>
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

      {isAdmin && tab === 'abertas' && selected.length > 0 && (
        <div className="dm-batch-bar">
          <span><strong>{selected.length}</strong> demandas selecionadas para o visto do chefe</span>
          <div>
            <button type="button" onClick={() => setSelected([])} disabled={batchSaving}>Desmarcar</button>
            <button type="button" className="dm-btn-feita" onClick={() => void completeSelected()} disabled={batchSaving}>
              <CheckCircle2 size={14} /> {batchSaving ? 'Aguarde...' : 'Dar OK / Demanda Feita nas Selecionadas'}
            </button>
          </div>
        </div>
      )}

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
          <div className="dm-results-bar">
            <span>Exibindo <strong>{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)}</strong> de <strong>{total}</strong> demandas</span>
            <span>Mais recentes primeiro</span>
          </div>
          <div className="dm-list">
            {items.map((d) => {
              const proto = protocoloDemanda(d.id)
              const isDone = d.status === 'feita'
              const isExpanded = expanded.includes(d.id)
              const isRecent = Date.now() - new Date(d.created_at).getTime() < 48 * 60 * 60 * 1000
              return (
                <article key={d.id} className={`dm-item${isDone ? ' is-done' : ''}${selected.includes(d.id) ? ' is-selected' : ''}`}>
                  <header className="dm-item-head">
                    <div className="dm-item-tags">
                      {isAdmin && !isDone && (
                        <input type="checkbox" className="dm-select-checkbox" aria-label={`Selecionar ${proto}`}
                          checked={selected.includes(d.id)} onChange={() => toggleSelected(d.id)} />
                      )}
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
                      {!isDone && isRecent && <span className="dm-new-tag">Nova solicitação</span>}
                    </div>
                    <time className="dm-when">{formatWhen(d.created_at)}</time>
                  </header>

                  <div className="dm-item-body">
                    <div className="dm-person-contact-row">
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
                    </div>

                    <div className={`dm-content-grid${d.foto_urls?.length ? ' has-media' : ''}`}>
                      <div className="dm-desc-box">
                        <span className="dm-desc-label">Descrição da solicitação</span>
                        <p className={isExpanded ? '' : 'dm-desc-clamped'}>{d.descricao}</p>
                        {d.descricao.length > 180 && (
                          <button type="button" className="dm-desc-toggle"
                            aria-expanded={isExpanded}
                            onClick={() => setExpanded((current) => current.includes(d.id) ? current.filter((id) => id !== d.id) : [...current, d.id])}>
                            {isExpanded ? 'Mostrar menos' : 'Ler descrição completa'} <ChevronRight size={13} />
                          </button>
                        )}
                      </div>

                      {Boolean(d.foto_urls?.length) && (
                        <aside className="dm-media-panel" aria-label={`Fotos da demanda ${proto}`}>
                          <div className="dm-media-head">
                            <span><ImageIcon size={14} /> Anexos</span>
                            <button type="button" onClick={() => setPreview({ demanda: d, index: 0 })}>
                              {d.foto_urls!.length} {d.foto_urls!.length === 1 ? 'foto' : 'fotos'} · Ampliar
                            </button>
                          </div>
                          <div className={`dm-media-grid count-${Math.min(d.foto_urls!.length, 4)}`}>
                            {d.foto_urls!.slice(0, 4).map((url, i) => {
                              const restantes = d.foto_urls!.length - 4
                              return (
                                <button key={`${d.id}-foto-${i}`} type="button" className="dm-media-thumb"
                                  onClick={() => setPreview({ demanda: d, index: i })} aria-label={`Ampliar foto ${i + 1} de ${d.foto_urls!.length}`}>
                                  <img src={url} alt={`Foto ${i + 1} da demanda ${proto}`} loading="lazy" decoding="async" />
                                  {i === 3 && restantes > 0 && <span>+{restantes}</span>}
                                </button>
                              )
                            })}
                          </div>
                        </aside>
                      )}
                    </div>
                  </div>

                  <footer className="dm-item-foot">
                    <div className="dm-item-foot-actions">
                      <span className="dm-autor">Lançada por <strong>{d.autor_nome ?? '—'}</strong></span>
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
                    </div>
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
          <div className="dm-lightbox-inner dm-gallery-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <div><ImageIcon size={17} /><span><strong>Foto da Demanda</strong><small>{protocoloDemanda(preview.demanda.id)} · Foto {preview.index + 1} de {preview.demanda.foto_urls?.length}</small></span></div>
              <button type="button" onClick={() => setPreview(null)} aria-label="Fechar"><X size={19} /></button>
            </header>
            <div className="dm-gallery-stage">
              <button type="button" aria-label="Foto anterior" disabled={preview.index === 0}
                onClick={() => setPreview({ ...preview, index: preview.index - 1 })}><ChevronLeft /></button>
              <img src={preview.demanda.foto_urls?.[preview.index]} alt={`Foto ${preview.index + 1} da demanda`} />
              <button type="button" aria-label="Próxima foto" disabled={preview.index >= (preview.demanda.foto_urls?.length ?? 1) - 1}
                onClick={() => setPreview({ ...preview, index: preview.index + 1 })}><ChevronRight /></button>
            </div>
            <footer>
              <div className="dm-gallery-modal-thumbs">
                {preview.demanda.foto_urls?.map((url, index) => (
                  <button key={url} type="button" className={index === preview.index ? 'active' : ''}
                    onClick={() => setPreview({ ...preview, index })}><img src={url} alt="" /></button>
                ))}
              </div>
              {isAdmin && preview.demanda.status === 'aberta' && (
                <button type="button" className="dm-btn-feita" onClick={() => { setResolveId(preview.demanda.id); setPreview(null) }}>
                  <CheckCircle2 size={15} /> Demanda feita (OK)
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
