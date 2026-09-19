import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Camera,
  FileSearch,
  History,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { Modal } from '../components/ui/Modal'
import {
  canManageDemanda,
  createDemanda,
  deleteDemanda,
  fetchDemandas,
  labelUrgencia,
  protocoloDemanda,
  searchCadastrosDemanda,
  updateDemanda,
  type DemandaCadastroHit,
  type DemandaComAutor,
} from '../lib/demandas'
import { formatPhone } from '../lib/format'
import type { DemandaUrgencia } from '../types'

type Mode = 'buscar' | 'avulso' | 'historico'

const URGENCIA_OPTIONS: { value: DemandaUrgencia; label: string }[] = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '--'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

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

export function DemandasLancarPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>('buscar')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<DemandaCadastroHit[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<DemandaCadastroHit | null>(null)

  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [telefone, setTelefone] = useState('')
  const [telefoneExtra, setTelefoneExtra] = useState('')
  const [urgencia, setUrgencia] = useState<DemandaUrgencia>('normal')
  const [descricao, setDescricao] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [existingFotoUrl, setExistingFotoUrl] = useState<string | null>(null)
  const [removeFoto, setRemoveFoto] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [historico, setHistorico] = useState<DemandaComAutor[]>([])
  const [histSearch, setHistSearch] = useState('')
  const [histLoading, setHistLoading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function loadHistorico(search = histSearch) {
    setHistLoading(true)
    try {
      const { items } = await fetchDemandas({ status: 'todas', search, page: 0, pageSize: 50 })
      setHistorico(items)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar histórico.')
    } finally {
      setHistLoading(false)
    }
  }

  useEffect(() => {
    if (mode !== 'historico' || editingId) return
    const t = window.setTimeout(() => {
      void loadHistorico(histSearch)
    }, 200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, histSearch, editingId])

  useEffect(() => {
    if (mode !== 'buscar' || selected) {
      setHits([])
      return
    }
    const term = query.trim()
    if (term.length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      void searchCadastrosDemanda(term)
        .then((rows) => {
          if (!cancelled) setHits(rows)
        })
        .catch(() => {
          if (!cancelled) setHits([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query, mode, selected])

  useEffect(() => {
    return () => {
      if (fotoPreview) URL.revokeObjectURL(fotoPreview)
    }
  }, [fotoPreview])

  function resetFormFields() {
    setSelected(null)
    setQuery('')
    setHits([])
    setNome('')
    setDocumento('')
    setTelefone('')
    setTelefoneExtra('')
    setUrgencia('normal')
    setDescricao('')
    setFoto(null)
    if (fotoPreview) URL.revokeObjectURL(fotoPreview)
    setFotoPreview(null)
    setExistingFotoUrl(null)
    setRemoveFoto(false)
    setEditingId(null)
    setError(null)
    setOk(null)
  }

  function switchMode(next: Mode) {
    setMode(next)
    resetFormFields()
  }

  function pickCadastro(hit: DemandaCadastroHit) {
    setSelected(hit)
    setQuery(hit.nome)
    setHits([])
    setNome(hit.nome)
    setDocumento(hit.documento)
    setTelefone(hit.telefone)
    setError(null)
    setOk(null)
  }

  function clearCadastro() {
    setSelected(null)
    setQuery('')
    setNome('')
    setDocumento('')
    setTelefone('')
  }

  function onFoto(file: File | null) {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview)
    setFoto(file)
    setFotoPreview(file ? URL.createObjectURL(file) : null)
    if (file) setRemoveFoto(false)
  }

  function startEdit(d: DemandaComAutor) {
    if (!canManageDemanda(d, profile?.id, profile?.role)) return
    setEditingId(d.id)
    setMode('historico')
    setNome(d.nome)
    setDocumento(d.documento ?? '')
    setTelefone(d.telefone ?? '')
    setTelefoneExtra(d.telefone_extra ?? '')
    setUrgencia(d.urgencia ?? 'normal')
    setDescricao(d.descricao)
    setFoto(null)
    if (fotoPreview) URL.revokeObjectURL(fotoPreview)
    setFotoPreview(null)
    setExistingFotoUrl(d.foto_url ?? null)
    setRemoveFoto(false)
    setSelected(null)
    setError(null)
    setOk(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    resetFormFields()
    setMode('historico')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.id) return
    setError(null)
    setOk(null)

    if (!editingId && mode === 'buscar' && !selected) {
      setError('Selecione uma pessoa do cadastro ou use o modo avulso.')
      return
    }

    setSaving(true)

    if (editingId) {
      const { error: err } = await updateDemanda(editingId, profile.id, {
        nome,
        documento,
        telefone,
        telefone_extra: telefoneExtra,
        urgencia,
        descricao,
        foto,
        removeFoto,
      })
      setSaving(false)
      if (err) {
        setError(err)
        return
      }
      setOk('Demanda atualizada.')
      resetFormFields()
      setMode('historico')
      await loadHistorico()
      return
    }

    const { error: err } = await createDemanda(profile.id, {
      origem: mode === 'buscar' ? 'cadastro' : 'avulso',
      cadastro_id: selected?.id,
      nome: mode === 'buscar' ? (selected?.nome ?? nome) : nome,
      documento: mode === 'buscar' ? (selected?.documento ?? documento) : documento,
      telefone,
      telefone_extra: telefoneExtra,
      urgencia,
      descricao,
      foto,
    })
    setSaving(false)

    if (err) {
      setError(err)
      return
    }

    setOk('Demanda registrada.')
    setDescricao('')
    setTelefoneExtra('')
    setUrgencia('normal')
    onFoto(null)
    if (mode === 'avulso') {
      setNome('')
      setDocumento('')
      setTelefone('')
    }
    window.setTimeout(() => navigate('/demandas/painel'), 700)
  }

  async function confirmDelete() {
    if (!deleteId) return
    const id = deleteId
    setSaving(true)
    const { error: err } = await deleteDemanda(id)
    setSaving(false)
    if (err) {
      setError(err)
      setDeleteId(null)
      return
    }
    setDeleteId(null)
    setOk('Demanda excluída.')
    if (editingId === id) cancelEdit()
    await loadHistorico()
  }

  const deleteItem = historico.find((d) => d.id === deleteId)
  const showForm = mode !== 'historico' || Boolean(editingId)

  return (
    <div className="dm-page">
      <div className="dm-header">
        <div>
          <p className="dm-kicker">Demandas</p>
          <h1>{editingId ? 'Editar demanda' : 'Lançar demanda'}</h1>
          <p className="dm-sub">
            {editingId
              ? 'Altere os dados e salve. Demandas concluídas só o admin pode alterar.'
              : 'Vincule a um cadastro existente, registre avulso ou gerencie o histórico.'}
          </p>
        </div>
        <Link to="/demandas/painel" className="dm-link">Ver demandas</Link>
      </div>

      <div className="dm-mode">
        <button
          type="button"
          className={`dm-mode-btn${mode === 'buscar' && !editingId ? ' active' : ''}`}
          onClick={() => switchMode('buscar')}
        >
          <FileSearch size={14} /> Do cadastro
        </button>
        <button
          type="button"
          className={`dm-mode-btn${mode === 'avulso' && !editingId ? ' active' : ''}`}
          onClick={() => switchMode('avulso')}
        >
          <UserPlus size={14} /> Avulso
        </button>
        <button
          type="button"
          className={`dm-mode-btn${mode === 'historico' ? ' active' : ''}`}
          onClick={() => switchMode('historico')}
        >
          <History size={14} /> Histórico
        </button>
      </div>

      {showForm && (
        <form className="dm-card" onSubmit={handleSubmit}>
          {editingId && (
            <div className="dm-edit-banner">
              <span>Editando {protocoloDemanda(editingId)}</span>
              <button type="button" onClick={cancelEdit}>Cancelar edição</button>
            </div>
          )}

          {!editingId && mode === 'buscar' ? (
            <section className="dm-section">
              <label className="dm-label">Buscar por nome, CPF, título ou telefone</label>
              <div className="dm-search">
                <Search size={16} aria-hidden />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    if (selected) clearCadastro()
                  }}
                  placeholder="Digite para localizar..."
                  autoComplete="off"
                />
                {(query || selected) && (
                  <button type="button" className="dm-icon-btn" onClick={clearCadastro} aria-label="Limpar">
                    <X size={14} />
                  </button>
                )}
                {!selected && hits.length > 0 && (
                  <ul className="dm-hits-dropdown">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button type="button" onClick={() => pickCadastro(h)}>
                          <strong>{h.nome}</strong>
                          <span>
                            {[h.documento && `CPF: ${h.documento}`, h.bairro, h.telefone && formatPhone(h.telefone)]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {searching && <p className="dm-hint">Buscando…</p>}
              {selected && (
                <div className="dm-picked">
                  <div className="dm-picked-left">
                    <span className="dm-avatar">{initials(selected.nome)}</span>
                    <div>
                      <strong>{selected.nome}</strong>
                      <span>
                        {[
                          selected.documento && `CPF: ${selected.documento}`,
                          selected.bairro && `Bairro: ${selected.bairro}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  </div>
                  <button type="button" className="dm-picked-swap" onClick={clearCadastro}>
                    Trocar vínculo
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className="dm-section dm-grid-2">
              <div>
                <label className="dm-label">Nome do solicitante</label>
                <input
                  className="dm-input"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome completo..."
                  required
                />
              </div>
              <div>
                <label className="dm-label">Documento (opcional)</label>
                <input
                  className="dm-input"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="CPF, RG ou referência..."
                />
              </div>
            </section>
          )}

          <section className="dm-section dm-grid-2">
            <div>
              <label className="dm-label">
                <Phone size={13} /> Celular
                {!editingId && mode === 'buscar' && selected?.telefone ? (
                  <em className="dm-label-note">(preenchido pelo cadastro)</em>
                ) : null}
              </label>
              <input
                className="dm-input"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </div>
            <div>
              <label className="dm-label">Outro número (opcional)</label>
              <input
                className="dm-input"
                value={telefoneExtra}
                onChange={(e) => setTelefoneExtra(e.target.value)}
                placeholder="Contato adicional"
                inputMode="tel"
              />
            </div>
          </section>

          <section className="dm-section">
            <label className="dm-label">Nível de urgência</label>
            <div className="dm-urgencia">
              {URGENCIA_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`dm-urgencia-btn tone-${opt.value}${urgencia === opt.value ? ' active' : ''}`}
                  onClick={() => setUrgencia(opt.value)}
                >
                  <span className="dm-urgencia-dot" />
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          <section className="dm-section">
            <label className="dm-label">Descrição da demanda</label>
            <textarea
              className="dm-textarea"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que precisa ser resolvido, local, urgência..."
              rows={4}
              required
            />
          </section>

          <section className="dm-section">
            <label className="dm-label">
              <Camera size={13} /> Foto (opcional)
            </label>
            <div className="dm-foto-row">
              <button type="button" className="dm-foto-btn" onClick={() => fileRef.current?.click()}>
                <Plus size={14} /> {editingId ? 'Trocar imagem' : 'Anexar imagem'}
              </button>
              {foto && (
                <div className="dm-foto-chip">
                  {fotoPreview && <img src={fotoPreview} alt="" />}
                  <span>{foto.name}</span>
                  <button type="button" onClick={() => onFoto(null)} aria-label="Remover foto">
                    <X size={14} />
                  </button>
                </div>
              )}
              {!foto && existingFotoUrl && !removeFoto && (
                <div className="dm-foto-chip">
                  <img src={existingFotoUrl} alt="" />
                  <span>Foto atual</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveFoto(true)
                      setExistingFotoUrl(null)
                    }}
                    aria-label="Remover foto"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={(e) => onFoto(e.target.files?.[0] ?? null)}
              />
            </div>
          </section>

          {error && <div className="alert alert-error">{error}</div>}
          {ok && <div className="alert alert-success">{ok}</div>}

          <div className="dm-actions">
            {editingId && (
              <button type="button" className="dm-btn-ghost" onClick={cancelEdit}>
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="dm-submit"
              disabled={saving || (!editingId && mode === 'buscar' && !selected)}
            >
              {saving ? <Spinner size={16} /> : editingId ? 'Salvar alterações' : 'Registrar demanda'}
            </button>
          </div>
        </form>
      )}

      {mode === 'historico' && !editingId && (
        <div className="dm-hist">
          <div className="dm-toolbar">
            <div className="dm-search">
              <Search size={16} aria-hidden />
              <input
                value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)}
                placeholder="Buscar no histórico..."
              />
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {ok && <div className="alert alert-success">{ok}</div>}

          {histLoading ? (
            <div className="dm-loading">
              <Spinner size={32} />
            </div>
          ) : !historico.length ? (
            <div className="dm-empty">
              <div className="dm-empty-icon">
                <History size={22} />
              </div>
              <h3>Nenhuma demanda no histórico</h3>
              <p>As demandas lançadas aparecem aqui para editar ou excluir.</p>
            </div>
          ) : (
            <div className="dm-list">
              {historico.map((d) => {
                const canManage = canManageDemanda(d, profile?.id, profile?.role)
                return (
                  <article key={d.id} className={`dm-item${d.status === 'feita' ? ' is-done' : ''}`}>
                    <header className="dm-item-head">
                      <div className="dm-item-tags">
                        <span className="dm-proto">{protocoloDemanda(d.id)}</span>
                        <span className={`dm-status-badge ${d.status === 'feita' ? 'done' : 'open'}`}>
                          {d.status === 'feita' ? 'Concluída' : 'Em aberto'}
                        </span>
                        <span className={`dm-urg-badge tone-${d.urgencia ?? 'normal'}`}>
                          <span className="dm-urg-dot" />
                          {labelUrgencia(d.urgencia)}
                        </span>
                      </div>
                      <time className="dm-when">{formatWhen(d.created_at)}</time>
                    </header>

                    <div className="dm-item-body">
                      <div className="dm-person">
                        <h3>{d.nome}</h3>
                        <span className="dm-origem">{d.origem === 'avulso' ? 'Avulso' : 'Do cadastro'}</span>
                        {d.documento && <span className="dm-doc">Doc: {d.documento}</span>}
                      </div>
                      <div className="dm-desc-box">{d.descricao}</div>
                    </div>

                    <footer className="dm-item-foot dm-hist-foot">
                      {!canManage ? (
                        <span className="dm-resolved">
                          {d.status === 'feita'
                            ? 'Concluída — só o admin pode alterar'
                            : 'Sem permissão para editar'}
                        </span>
                      ) : (
                        <div className="dm-hist-actions">
                          <button type="button" className="dm-btn-edit" onClick={() => startEdit(d)}>
                            <Pencil size={14} /> Editar
                          </button>
                          <button
                            type="button"
                            className="dm-btn-delete"
                            onClick={() => setDeleteId(d.id)}
                          >
                            <Trash2 size={14} /> Excluir
                          </button>
                        </div>
                      )}
                    </footer>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      <Modal
        open={Boolean(deleteId)}
        title="Excluir demanda"
        onClose={() => !saving && setDeleteId(null)}
        onConfirm={confirmDelete}
        confirmLabel="Excluir"
        confirmVariant="danger"
        loading={saving}
      >
        <p className="dm-modal-text">
          {deleteItem
            ? `Excluir ${protocoloDemanda(deleteItem.id)} — ${deleteItem.nome}? Esta ação não pode ser desfeita.`
            : 'Excluir esta demanda?'}
        </p>
      </Modal>
    </div>
  )
}
