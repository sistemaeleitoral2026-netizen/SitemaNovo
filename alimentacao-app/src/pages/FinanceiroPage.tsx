import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Lock, LockOpen, Paperclip, Plus, Receipt, Trash2, Wallet, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/roles'
import {
  buildCoordResumos,
  createLancamento,
  deleteLancamento,
  fetchLancamentos,
  fetchValoresDevidos,
  formatMoneyBRL,
  initials,
  isLocalFinanceiroMode,
  parseMoneyInput,
  signComprovanteUrl,
  sumResumos,
  upsertValorDevido,
  type FinanceiroForma,
  type FinanceiroLancamento,
  type FinanceiroValorDevido,
} from '../lib/financeiro'
import type { Coordenador, Profile } from '../types'

type InlineForm = {
  coordId: string
  amount: string
  method: 'dinheiro' | 'pix'
  file: File | null
  visible: boolean
}

function formaLabel(forma: FinanceiroForma) {
  if (forma === 'pix') return 'PIX'
  if (forma === 'transferencia') return 'Transferência'
  return 'R$'
}

function fmtWhen(iso: string) {
  try {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}, ${hh}:${mi}`
  } catch {
    return iso
  }
}

export function FinanceiroPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = hasRole(profile, 'admin')
  const diretoriaScope = hasRole(profile, 'diretoria') && !isAdmin ? profile?.id ?? null : null

  const [diretorias, setDiretorias] = useState<Profile[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [devidos, setDevidos] = useState<FinanceiroValorDevido[]>([])
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(diretoriaScope)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localMode, setLocalMode] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [inlineForms, setInlineForms] = useState<Record<string, InlineForm>>({})
  const [devidoDraft, setDevidoDraft] = useState<Record<string, string>>({})
  const [savingDevido, setSavingDevido] = useState<string | null>(null)
  const [savingInline, setSavingInline] = useState<string | null>(null)

  // Modal global
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDirId, setModalDirId] = useState('')
  const [modalCoordId, setModalCoordId] = useState('')
  const [modalAmount, setModalAmount] = useState('')
  const [modalMethod, setModalMethod] = useState<FinanceiroForma>('pix')
  const [modalFile, setModalFile] = useState<File | null>(null)
  const [savingModal, setSavingModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const modalFileRef = useRef<HTMLInputElement>(null)
  const inlineFileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const wantLancar = searchParams.get('lancar') === '1'

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    if (diretoriaScope) {
      setExpandedId(diretoriaScope)
    }
  }, [diretoriaScope])

  useEffect(() => {
    if (wantLancar) {
      openModal(diretoriaScope ?? undefined)
      setSearchParams({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantLancar])

  async function reload() {
    setLoading(true)
    setError(null)
    try {
      let dirs: Profile[] = []
      if (isAdmin) {
        const { data, error: err } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'diretoria')
          .order('nome')
        if (err) throw new Error(err.message)
        dirs = (data ?? []) as Profile[]
      } else if (profile && diretoriaScope) {
        dirs = [profile]
      }
      setDiretorias(dirs)

      const dirIds = dirs.map((d) => d.id)
      if (!dirIds.length) {
        setCoordenadores([])
        setDevidos([])
        setLancamentos([])
        return
      }

      let coordsQuery = supabase.from('coordenadores').select('*').eq('ativo', true).order('nome')
      if (diretoriaScope) coordsQuery = coordsQuery.eq('diretoria_id', diretoriaScope)
      else coordsQuery = coordsQuery.in('diretoria_id', dirIds)

      const [coordsRes, devidosRows, lancRows] = await Promise.all([
        coordsQuery,
        fetchValoresDevidos(dirIds),
        fetchLancamentos({ diretoriaIds: dirIds, limit: 50 }),
      ])
      if (coordsRes.error) throw new Error(coordsRes.error.message)

      const coords = (coordsRes.data ?? []) as Coordenador[]
      setCoordenadores(coords)
      setDevidos(devidosRows)
      setLancamentos(lancRows)

      const draft: Record<string, string> = {}
      const forms: Record<string, InlineForm> = {}
      for (const d of dirs) {
        const list = coords.filter((c) => c.diretoria_id === d.id)
        forms[d.id] = {
          coordId: list[0]?.id ?? '',
          amount: '',
          method: 'pix',
          file: null,
          visible: true,
        }
      }
      for (const c of coords) {
        const v = devidosRows.find((x) => x.coordenador_id === c.id)?.valor_devido ?? 0
        draft[c.id] = String(v || 0)
      }
      setDevidoDraft(draft)
      setInlineForms(forms)
      setLocalMode(isLocalFinanceiroMode())

      if (!expandedId && dirs.length === 1) setExpandedId(dirs[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o financeiro.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, diretoriaScope, profile?.id])

  const coordByDir = useMemo(() => {
    const map = new Map<string, Coordenador[]>()
    for (const c of coordenadores) {
      const list = map.get(c.diretoria_id) ?? []
      list.push(c)
      map.set(c.diretoria_id, list)
    }
    return map
  }, [coordenadores])

  const nomeCoord = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of coordenadores) m.set(c.id, c.nome)
    return m
  }, [coordenadores])

  const nomeDir = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of diretorias) m.set(d.id, d.nome)
    return m
  }, [diretorias])

  const cards = useMemo(() => {
    return diretorias.map((d) => {
      const coords = coordByDir.get(d.id) ?? []
      const resumos = buildCoordResumos(
        coords,
        devidos.filter((x) => x.diretoria_id === d.id),
        lancamentos.filter((x) => x.diretoria_id === d.id),
      )
      return { dir: d, coords, resumos, tot: sumResumos(resumos) }
    })
  }, [diretorias, coordByDir, devidos, lancamentos])

  const recentList = useMemo(() => {
    return lancamentos.slice(0, 12).map((l) => ({
      ...l,
      coordenador_nome: nomeCoord.get(l.coordenador_id) ?? 'Coordenação',
      diretoria_nome: nomeDir.get(l.diretoria_id) ?? 'Diretoria',
    }))
  }, [lancamentos, nomeCoord, nomeDir])

  const modalCoords = useMemo(() => {
    if (!modalDirId) return []
    return coordenadores.filter((c) => c.diretoria_id === modalDirId)
  }, [coordenadores, modalDirId])

  function patchInline(dirId: string, patch: Partial<InlineForm>) {
    setInlineForms((prev) => ({
      ...prev,
      [dirId]: { ...(prev[dirId] ?? { coordId: '', amount: '', method: 'pix', file: null, visible: true }), ...patch },
    }))
  }

  function openModal(preDirId?: string) {
    const id = preDirId ?? diretoriaScope ?? expandedId ?? diretorias[0]?.id ?? ''
    setModalDirId(id)
    const coords = coordenadores.filter((c) => c.diretoria_id === id)
    setModalCoordId(coords[0]?.id ?? '')
    setModalAmount('')
    setModalMethod('pix')
    setModalFile(null)
    if (modalFileRef.current) modalFileRef.current.value = ''
    setModalOpen(true)
    if (id) setExpandedId(id)
  }

  function closeModal() {
    setModalOpen(false)
  }

  async function saveDevido(coordId: string, dirId: string, raw?: string) {
    if (!profile) return
    const valor = parseMoneyInput(raw ?? devidoDraft[coordId] ?? '0')
    setSavingDevido(coordId)
    setError(null)
    try {
      const row = await upsertValorDevido({
        diretoriaId: dirId,
        coordenadorId: coordId,
        valorDevido: valor,
        travado: true,
        updatedBy: profile.id,
      })
      setDevidos((prev) => {
        const idx = prev.findIndex((r) => r.coordenador_id === coordId && r.diretoria_id === dirId)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = row
          return next
        }
        return [...prev, row]
      })
      setDevidoDraft((prev) => ({ ...prev, [coordId]: String(valor) }))
      setLocalMode(isLocalFinanceiroMode())
      showToast('Valor devido salvo e travado!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar valor devido.')
    } finally {
      setSavingDevido(null)
    }
  }

  async function unlockDevido(coordId: string, dirId: string) {
    if (!profile) return
    const valor = parseMoneyInput(devidoDraft[coordId] ?? '0')
    setSavingDevido(coordId)
    setError(null)
    try {
      const row = await upsertValorDevido({
        diretoriaId: dirId,
        coordenadorId: coordId,
        valorDevido: valor,
        travado: false,
        updatedBy: profile.id,
      })
      setDevidos((prev) => {
        const idx = prev.findIndex((r) => r.coordenador_id === coordId && r.diretoria_id === dirId)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = row
          return next
        }
        return [...prev, { ...row, travado: false }]
      })
      showToast('Valor destrancado — edite e salve de novo.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao destrancar.')
    } finally {
      setSavingDevido(null)
    }
  }

  async function submitInline(dirId: string) {
    if (!profile) return
    const form = inlineForms[dirId]
    if (!form?.coordId) {
      showToast('Selecione a coordenação.')
      return
    }
    const valor = parseMoneyInput(form.amount)
    if (valor <= 0) {
      showToast('Informe um valor pago válido!')
      return
    }
    setSavingInline(dirId)
    setError(null)
    try {
      const row = await createLancamento({
        diretoriaId: dirId,
        coordenadorId: form.coordId,
        valor,
        forma: form.method,
        file: form.file,
        createdBy: profile.id,
      })
      setLancamentos((prev) => [row, ...prev])
      patchInline(dirId, { amount: '', file: null })
      const el = inlineFileRefs.current[dirId]
      if (el) el.value = ''
      setLocalMode(isLocalFinanceiroMode())
      const nome = nomeCoord.get(form.coordId) ?? 'coordenação'
      showToast(`Pagamento de ${formatMoneyBRL(valor)} abatido de ${nome}!`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao lançar pagamento.')
    } finally {
      setSavingInline(null)
    }
  }

  async function submitModal(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !modalDirId || !modalCoordId) {
      showToast('Escolha diretoria e coordenação.')
      return
    }
    const valor = parseMoneyInput(modalAmount)
    if (valor <= 0) {
      showToast('Informe um valor pago válido!')
      return
    }
    setSavingModal(true)
    setError(null)
    try {
      const row = await createLancamento({
        diretoriaId: modalDirId,
        coordenadorId: modalCoordId,
        valor,
        forma: modalMethod,
        file: modalFile,
        createdBy: profile.id,
      })
      setLancamentos((prev) => [row, ...prev])
      setLocalMode(isLocalFinanceiroMode())
      closeModal()
      showToast(`Pagamento de ${formatMoneyBRL(valor)} registrado!`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao lançar pagamento.')
    } finally {
      setSavingModal(false)
    }
  }

  async function openComprovante(path: string | null) {
    if (!path) return
    const url = await signComprovanteUrl(path)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleDeleteLancamento(l: FinanceiroLancamento) {
    if (!isAdmin) return
    const nome = nomeCoord.get(l.coordenador_id) ?? 'coordenação'
    const ok = window.confirm(
      `Apagar o lançamento de ${formatMoneyBRL(l.valor)} em ${nome}?\nEssa ação não pode ser desfeita.`,
    )
    if (!ok) return
    setDeletingId(l.id)
    setError(null)
    try {
      await deleteLancamento(l.id, l.comprovante_path, { asAdmin: true })
      setLancamentos((prev) => prev.filter((x) => x.id !== l.id))
      showToast('Lançamento apagado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao apagar lançamento.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="fin-page">
      {/* PAGE HEADER */}
      <div className="fin-head">
        <div>
          <p className="fin-kicker">Financeiro</p>
          <h1>Pagamentos</h1>
          <p className="fin-sub">
            Cada coordenação tem um valor. Veja quanto falta pagar e registre os pagamentos.
          </p>
        </div>
        <button type="button" className="fin-cta" onClick={() => openModal()}>
          <Plus size={12} strokeWidth={3} />
          <span>Lançar pagamento</span>
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {localMode ? (
        <p className="fin-local-tip">
          Dados neste navegador até rodar{' '}
          <code>supabase/diagnosticos/financeiro_coordenador_run.sql</code>.
        </p>
      ) : null}

      {!diretorias.length ? (
        <EmptyState title="Nenhuma diretora" description="Cadastre diretorias para usar o financeiro." />
      ) : (
        <>
          {/* DIRECTOR ACCORDION CARDS */}
          <div className="fin-dir-list">
            {cards.map(({ dir, coords, resumos, tot }) => {
              const open = expandedId === dir.id
              const form = inlineForms[dir.id]
              return (
                <div key={dir.id} className={`fin-acc${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="fin-acc-head"
                    onClick={() => setExpandedId(open ? null : dir.id)}
                    aria-expanded={open}
                  >
                    <div className="fin-acc-left">
                      <span className="fin-acc-avatar" aria-hidden>
                        {initials(dir.nome)}
                      </span>
                      <span className="fin-acc-copy">
                        <strong>{dir.nome}</strong>
                        <em>
                          {coords.length} {coords.length === 1 ? 'coordenação' : 'coordenações'}
                        </em>
                      </span>
                    </div>
                    <div className="fin-acc-right">
                      <span className="fin-acc-money is-apagar">
                        <small>A pagar</small>
                        <b>{formatMoneyBRL(tot.falta)}</b>
                      </span>
                      <span className="fin-acc-money is-pago">
                        <small>Pago</small>
                        <b>{formatMoneyBRL(tot.pago)}</b>
                      </span>
                      <span className="fin-acc-chevron" aria-hidden>
                        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </div>
                  </button>

                  {open ? (
                    <div className="fin-acc-body">
                      <div className="fin-acc-body-head">
                        <div>
                          <h2>{dir.nome}</h2>
                          <p>Defina o valor de cada coordenação e acompanhe o que falta pagar.</p>
                        </div>
                        <button
                          type="button"
                          className="fin-cta fin-cta-sm"
                          onClick={() => openModal(dir.id)}
                        >
                          <Plus size={10} strokeWidth={3} />
                          Lançar nesta diretoria
                        </button>
                      </div>

                      {/* INLINE PAYMENT FORM */}
                      {form?.visible !== false ? (
                        <div className="fin-inline-form">
                          <div className="fin-inline-title">
                            <Wallet size={12} />
                            <span>Novo pagamento</span>
                          </div>
                          <div className="fin-inline-grid">
                            <label className="fin-field">
                              <span>Coordenação</span>
                              <select
                                value={form?.coordId ?? ''}
                                onChange={(e) => patchInline(dir.id, { coordId: e.target.value })}
                              >
                                {!coords.length ? <option value="">Sem coordenações</option> : null}
                                {coords.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nome}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="fin-field">
                              <span>Valor pago</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="R$ 0,00"
                                value={form?.amount ?? ''}
                                onChange={(e) => patchInline(dir.id, { amount: e.target.value })}
                              />
                            </label>
                            <div className="fin-field">
                              <span>Forma</span>
                              <div className="fin-forma-toggle">
                                <button
                                  type="button"
                                  className={form?.method === 'dinheiro' ? 'is-on is-light' : ''}
                                  onClick={() => patchInline(dir.id, { method: 'dinheiro' })}
                                >
                                  R$ Dinheiro
                                </button>
                                <button
                                  type="button"
                                  className={form?.method === 'pix' ? 'is-on is-dark' : ''}
                                  onClick={() => patchInline(dir.id, { method: 'pix' })}
                                >
                                  PIX
                                </button>
                              </div>
                            </div>
                            <div className="fin-field">
                              <span>Comprovante</span>
                              <button
                                type="button"
                                className="fin-attach"
                                onClick={() => inlineFileRefs.current[dir.id]?.click()}
                              >
                                <Paperclip size={12} />
                                <span className="fin-attach-text">
                                  {form?.file?.name || 'Anexar imagem ou PDF'}
                                </span>
                              </button>
                              <input
                                ref={(el) => {
                                  inlineFileRefs.current[dir.id] = el
                                }}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                hidden
                                onChange={(e) =>
                                  patchInline(dir.id, { file: e.target.files?.[0] ?? null })
                                }
                              />
                            </div>
                          </div>
                          <div className="fin-inline-actions">
                            <button
                              type="button"
                              className="fin-btn-ghost"
                              onClick={() =>
                                patchInline(dir.id, { amount: '', file: null })
                              }
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              className="fin-cta fin-cta-sm"
                              disabled={savingInline === dir.id}
                              onClick={() => void submitInline(dir.id)}
                            >
                              {savingInline === dir.id ? 'Salvando…' : 'Confirmar pagamento'}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {/* COORDINATORS TABLE */}
                      {!resumos.length ? (
                        <p className="fin-empty-line">Nenhuma coordenação ativa nesta diretoria.</p>
                      ) : (
                        <div className="fin-table-card">
                          <div className="fin-table-scroll">
                            <table className="fin-tbl">
                              <thead>
                                <tr>
                                  <th>Coordenação</th>
                                  <th className="is-center">Valor devido</th>
                                  <th className="is-center">Pago</th>
                                  <th className="is-center">Falta</th>
                                </tr>
                              </thead>
                              <tbody>
                                {resumos.map((r) => {
                                  const devidoRow = devidos.find(
                                    (d) =>
                                      d.coordenador_id === r.coordenador_id &&
                                      d.diretoria_id === dir.id,
                                  )
                                  const travado = Boolean(devidoRow?.travado)
                                  const saving = savingDevido === r.coordenador_id
                                  return (
                                    <tr key={r.coordenador_id}>
                                      <td className="fin-tbl-name">{r.nome}</td>
                                      <td className="is-center">
                                        <div className={`fin-due-row${travado ? ' is-locked' : ''}`}>
                                          <div className="fin-due-box">
                                            <span>R$</span>
                                            <input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              value={devidoDraft[r.coordenador_id] ?? '0'}
                                              disabled={travado || saving}
                                              readOnly={travado}
                                              onChange={(e) =>
                                                setDevidoDraft((prev) => ({
                                                  ...prev,
                                                  [r.coordenador_id]: e.target.value,
                                                }))
                                              }
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !travado) {
                                                  e.preventDefault()
                                                  void saveDevido(
                                                    r.coordenador_id,
                                                    dir.id,
                                                    (e.target as HTMLInputElement).value,
                                                  )
                                                }
                                              }}
                                              aria-label={`Valor devido de ${r.nome}`}
                                            />
                                          </div>
                                          {travado ? (
                                            <button
                                              type="button"
                                              className="fin-lock-btn is-locked"
                                              title="Destrancar valor"
                                              disabled={saving}
                                              onClick={() =>
                                                void unlockDevido(r.coordenador_id, dir.id)
                                              }
                                            >
                                              <Lock size={13} strokeWidth={2.4} />
                                            </button>
                                          ) : (
                                            <>
                                              <button
                                                type="button"
                                                className="fin-save-due"
                                                disabled={saving}
                                                onClick={() =>
                                                  void saveDevido(r.coordenador_id, dir.id)
                                                }
                                              >
                                                {saving ? '…' : 'Salvar'}
                                              </button>
                                              <button
                                                type="button"
                                                className="fin-lock-btn"
                                                title="Destrancado"
                                                disabled
                                                aria-hidden
                                              >
                                                <LockOpen size={13} strokeWidth={2.2} />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                      <td className="is-center fin-tbl-pago">
                                        {formatMoneyBRL(r.pago)}
                                      </td>
                                      <td
                                        className={`is-center fin-tbl-falta${r.falta > 0 ? ' has-falta' : ''}`}
                                      >
                                        {formatMoneyBRL(r.falta)}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* RECENT LOGS */}
          <section className="fin-recent">
            <div className="fin-recent-head">
              <h2>Últimos lançamentos</h2>
              <p>
                Pagamentos registrados recentemente
                {isAdmin ? ' · só o admin pode apagar' : ''}
              </p>
            </div>
            {!recentList.length ? (
              <p className="fin-empty-line">Nenhum pagamento registrado.</p>
            ) : (
              <div className="fin-log-list">
                {recentList.map((l) => (
                  <div key={l.id} className="fin-log-card">
                    <div>
                      <p className="fin-log-name">{l.coordenador_nome}</p>
                      <p className="fin-log-meta">
                        {l.diretoria_nome} · {fmtWhen(l.created_at)}
                      </p>
                    </div>
                    <div className="fin-log-side">
                      <span className={`fin-log-tag ${l.forma}`}>{formaLabel(l.forma)}</span>
                      <strong>{formatMoneyBRL(l.valor)}</strong>
                      {l.comprovante_path ? (
                        <button
                          type="button"
                          className="fin-comp-link"
                          onClick={() => void openComprovante(l.comprovante_path)}
                        >
                          Ver
                        </button>
                      ) : null}
                      {isAdmin ? (
                        <button
                          type="button"
                          className="fin-del-btn"
                          title="Apagar lançamento"
                          disabled={deletingId === l.id}
                          onClick={() => void handleDeleteLancamento(l)}
                        >
                          <Trash2 size={13} strokeWidth={2.2} />
                          {deletingId === l.id ? '…' : 'Apagar'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* GLOBAL PAYMENT MODAL */}
      {modalOpen ? (
        <div className="fin-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="fin-modal"
            role="dialog"
            aria-modal
            aria-labelledby="fin-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fin-modal-head">
              <div className="fin-modal-head-title">
                <Receipt size={14} />
                <h3 id="fin-modal-title">Novo pagamento</h3>
              </div>
              <button type="button" className="fin-modal-close" onClick={closeModal} aria-label="Fechar">
                <X size={14} />
              </button>
            </div>
            <form className="fin-modal-body" onSubmit={(e) => void submitModal(e)}>
              <label className="fin-field">
                <span>Diretoria</span>
                <select
                  value={modalDirId}
                  onChange={(e) => {
                    const id = e.target.value
                    setModalDirId(id)
                    const first = coordenadores.find((c) => c.diretoria_id === id)
                    setModalCoordId(first?.id ?? '')
                  }}
                  disabled={Boolean(diretoriaScope)}
                >
                  {diretorias.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label className="fin-field">
                <span>Coordenação</span>
                <select
                  value={modalCoordId}
                  onChange={(e) => setModalCoordId(e.target.value)}
                  required
                >
                  {!modalCoords.length ? <option value="">Sem coordenações</option> : null}
                  {modalCoords.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>

              <div className="fin-modal-row">
                <label className="fin-field">
                  <span>Valor pago</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="R$ 0,00"
                    value={modalAmount}
                    onChange={(e) => setModalAmount(e.target.value)}
                    required
                  />
                </label>
                <label className="fin-field">
                  <span>Forma</span>
                  <select
                    value={modalMethod}
                    onChange={(e) => setModalMethod(e.target.value as FinanceiroForma)}
                  >
                    <option value="pix">PIX</option>
                    <option value="dinheiro">R$ Dinheiro</option>
                    <option value="transferencia">Transferência</option>
                  </select>
                </label>
              </div>

              <div className="fin-field">
                <span>Comprovante</span>
                <button
                  type="button"
                  className="fin-attach fin-attach-dashed"
                  onClick={() => modalFileRef.current?.click()}
                >
                  <Paperclip size={12} />
                  <span>
                    {modalFile ? `✓ ${modalFile.name}` : 'Anexar imagem ou PDF'}
                  </span>
                </button>
                <input
                  ref={modalFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  hidden
                  onChange={(e) => setModalFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="fin-modal-actions">
                <button type="button" className="fin-btn-ghost" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="fin-cta fin-cta-sm" disabled={savingModal}>
                  {savingModal ? 'Salvando…' : 'Confirmar pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* TOAST */}
      <div className={`fin-toast${toast ? ' is-on' : ''}`} role="status">
        <span className="fin-toast-dot" aria-hidden />
        <span>{toast ?? ''}</span>
      </div>
    </div>
  )
}
