import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronUp,
  Lock,
  LockOpen,
  Paperclip,
  Plus,
  Receipt,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/roles'
import {
  alvoKey,
  buildHierarquiaFinanceiro,
  createLancamento,
  deleteLancamento,
  fetchLancamentos,
  fetchValoresDevidos,
  formatMoneyBRL,
  initials,
  isLocalFinanceiroMode,
  labelAlvoLancamento,
  parseMoneyInput,
  signComprovanteUrl,
  sumAlvos,
  upsertValorDevido,
  type FinanceiroAlvoResumo,
  type FinanceiroCoordBloco,
  type FinanceiroForma,
  type FinanceiroLancamento,
  type FinanceiroValorDevido,
} from '../lib/financeiro'
import type { Coordenador, Lider, Profile } from '../types'

type InlineForm = {
  coordId: string
  /** '' = própria coordenação */
  liderId: string
  amount: string
  method: 'dinheiro' | 'pix'
  file: File | null
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

function MoneyStrip({
  devido,
  pago,
  falta,
}: {
  devido: number
  pago: number
  falta: number
}) {
  return (
    <div className="fin-money-strip" aria-label="Resumo financeiro">
      <span>
        <small>Devido</small>
        <b>{formatMoneyBRL(devido)}</b>
      </span>
      <span>
        <small>Pago</small>
        <b className="is-pago">{formatMoneyBRL(pago)}</b>
      </span>
      <span>
        <small>Falta</small>
        <b className={falta > 0 ? 'is-falta' : ''}>{formatMoneyBRL(falta)}</b>
      </span>
    </div>
  )
}

export function FinanceiroPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = hasRole(profile, 'admin')
  const diretoriaScope = hasRole(profile, 'diretoria') && !isAdmin ? profile?.id ?? null : null

  const [diretorias, setDiretorias] = useState<Profile[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [devidos, setDevidos] = useState<FinanceiroValorDevido[]>([])
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([])
  const [expandedDirId, setExpandedDirId] = useState<string | null>(diretoriaScope)
  const [expandedCoordIds, setExpandedCoordIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localMode, setLocalMode] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [inlineForms, setInlineForms] = useState<Record<string, InlineForm>>({})
  const [devidoDraft, setDevidoDraft] = useState<Record<string, string>>({})
  const [savingDevido, setSavingDevido] = useState<string | null>(null)
  const [savingInline, setSavingInline] = useState<string | null>(null)
  const [payTargetKey, setPayTargetKey] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalDirId, setModalDirId] = useState('')
  const [modalCoordId, setModalCoordId] = useState('')
  const [modalLiderId, setModalLiderId] = useState('')
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
    if (diretoriaScope) setExpandedDirId(diretoriaScope)
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
        setLideres([])
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
        fetchLancamentos({ diretoriaIds: dirIds, limit: 80 }),
      ])
      if (coordsRes.error) throw new Error(coordsRes.error.message)

      const coords = (coordsRes.data ?? []) as Coordenador[]
      setCoordenadores(coords)

      let lideresRows: Lider[] = []
      if (coords.length) {
        let liderQuery = supabase
          .from('lideres')
          .select('*')
          .eq('ativo', true)
          .in('coordenador_id', coords.map((c) => c.id))
          .order('nome')
        if (diretoriaScope) liderQuery = liderQuery.eq('diretoria_id', diretoriaScope)
        else liderQuery = liderQuery.in('diretoria_id', dirIds)
        const liderRes = await liderQuery
        if (liderRes.error) throw new Error(liderRes.error.message)
        lideresRows = (liderRes.data ?? []) as Lider[]
      }
      setLideres(lideresRows)
      setDevidos(devidosRows)
      setLancamentos(lancRows)

      const draft: Record<string, string> = {}
      for (const c of coords) {
        const v = devidosRows.find((x) => x.coordenador_id === c.id && !x.lider_id)?.valor_devido ?? 0
        draft[alvoKey(c.id, null)] = String(v || 0)
      }
      for (const l of lideresRows) {
        if (!l.coordenador_id) continue
        const v = devidosRows.find((x) => x.lider_id === l.id)?.valor_devido ?? 0
        draft[alvoKey(l.coordenador_id, l.id)] = String(v || 0)
      }
      setDevidoDraft(draft)

      const forms: Record<string, InlineForm> = {}
      for (const d of dirs) {
        const list = coords.filter((c) => c.diretoria_id === d.id)
        forms[d.id] = {
          coordId: list[0]?.id ?? '',
          liderId: '',
          amount: '',
          method: 'pix',
          file: null,
        }
      }
      setInlineForms(forms)
      setLocalMode(isLocalFinanceiroMode())

      if (!expandedDirId && dirs.length === 1) setExpandedDirId(dirs[0].id)
      if (coords.length && expandedCoordIds.size === 0) {
        setExpandedCoordIds(new Set(coords.slice(0, 3).map((c) => c.id)))
      }
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

  const nomeCoord = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of coordenadores) m.set(c.id, c.nome)
    return m
  }, [coordenadores])

  const nomeLider = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of lideres) m.set(l.id, l.nome)
    return m
  }, [lideres])

  const nomeDir = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of diretorias) m.set(d.id, d.nome)
    return m
  }, [diretorias])

  const hierarquia = useMemo(
    () => buildHierarquiaFinanceiro(coordenadores, lideres, devidos, lancamentos),
    [coordenadores, lideres, devidos, lancamentos],
  )

  const pageTot = useMemo(() => {
    const alvos: FinanceiroAlvoResumo[] = []
    for (const b of hierarquia) {
      alvos.push(b.proprio, ...b.liderancas)
    }
    return sumAlvos(alvos)
  }, [hierarquia])

  const cards = useMemo(() => {
    return diretorias.map((d) => {
      const blocos = hierarquia.filter((b) => b.diretoria_id === d.id)
      const alvos: FinanceiroAlvoResumo[] = []
      for (const b of blocos) alvos.push(b.proprio, ...b.liderancas)
      const tot = sumAlvos(alvos)
      const liderCount = blocos.reduce((n, b) => n + b.liderancas.length, 0)
      return { dir: d, blocos, tot, liderCount }
    })
  }, [diretorias, hierarquia])

  const recentList = useMemo(() => {
    return lancamentos.slice(0, 12).map((l) => ({
      ...l,
      coordenador_nome: nomeCoord.get(l.coordenador_id) ?? 'Coordenação',
      lider_nome: l.lider_id ? (nomeLider.get(l.lider_id) ?? 'Liderança') : undefined,
      diretoria_nome: nomeDir.get(l.diretoria_id) ?? 'Diretoria',
      alvo_label: labelAlvoLancamento({
        lider_id: l.lider_id,
        lider_nome: l.lider_id ? nomeLider.get(l.lider_id) : undefined,
        coordenador_nome: nomeCoord.get(l.coordenador_id),
      }),
    }))
  }, [lancamentos, nomeCoord, nomeLider, nomeDir])

  const modalCoords = useMemo(() => {
    if (!modalDirId) return []
    return coordenadores.filter((c) => c.diretoria_id === modalDirId)
  }, [coordenadores, modalDirId])

  const modalLideres = useMemo(() => {
    if (!modalCoordId) return []
    return lideres.filter((l) => l.coordenador_id === modalCoordId)
  }, [lideres, modalCoordId])

  function patchInline(dirId: string, patch: Partial<InlineForm>) {
    setInlineForms((prev) => ({
      ...prev,
      [dirId]: {
        ...(prev[dirId] ?? { coordId: '', liderId: '', amount: '', method: 'pix', file: null }),
        ...patch,
      },
    }))
  }

  function toggleCoord(coordId: string) {
    setExpandedCoordIds((prev) => {
      const next = new Set(prev)
      if (next.has(coordId)) next.delete(coordId)
      else next.add(coordId)
      return next
    })
  }

  function openPayFor(alvo: FinanceiroAlvoResumo) {
    setExpandedDirId(alvo.diretoria_id)
    setExpandedCoordIds((prev) => new Set(prev).add(alvo.coordenador_id))
    setPayTargetKey(alvo.key)
    patchInline(alvo.diretoria_id, {
      coordId: alvo.coordenador_id,
      liderId: alvo.lider_id ?? '',
      amount: '',
      file: null,
    })
  }

  function openModal(preDirId?: string, preCoordId?: string, preLiderId?: string) {
    const id = preDirId ?? diretoriaScope ?? expandedDirId ?? diretorias[0]?.id ?? ''
    setModalDirId(id)
    const coords = coordenadores.filter((c) => c.diretoria_id === id)
    const coordId = preCoordId ?? coords[0]?.id ?? ''
    setModalCoordId(coordId)
    setModalLiderId(preLiderId ?? '')
    setModalAmount('')
    setModalMethod('pix')
    setModalFile(null)
    if (modalFileRef.current) modalFileRef.current.value = ''
    setModalOpen(true)
    if (id) setExpandedDirId(id)
  }

  function closeModal() {
    setModalOpen(false)
  }

  function upsertDevidoLocal(row: FinanceiroValorDevido) {
    setDevidos((prev) => {
      const idx = prev.findIndex(
        (r) =>
          r.diretoria_id === row.diretoria_id
          && r.coordenador_id === row.coordenador_id
          && (r.lider_id || null) === (row.lider_id || null),
      )
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = row
        return next
      }
      return [...prev, row]
    })
    setDevidoDraft((prev) => ({
      ...prev,
      [alvoKey(row.coordenador_id, row.lider_id)]: String(row.valor_devido || 0),
    }))
  }

  async function saveDevido(alvo: FinanceiroAlvoResumo, raw?: string) {
    if (!profile) return
    const key = alvo.key
    const valor = parseMoneyInput(raw ?? devidoDraft[key] ?? '0')
    setSavingDevido(key)
    setError(null)
    try {
      const row = await upsertValorDevido({
        diretoriaId: alvo.diretoria_id,
        coordenadorId: alvo.coordenador_id,
        liderId: alvo.lider_id,
        valorDevido: valor,
        travado: true,
        updatedBy: profile.id,
      })
      upsertDevidoLocal(row)
      setLocalMode(isLocalFinanceiroMode())
      showToast('Valor devido salvo e travado!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar valor devido.')
    } finally {
      setSavingDevido(null)
    }
  }

  async function unlockDevido(alvo: FinanceiroAlvoResumo) {
    if (!profile) return
    const key = alvo.key
    const valor = parseMoneyInput(devidoDraft[key] ?? '0')
    setSavingDevido(key)
    setError(null)
    try {
      const row = await upsertValorDevido({
        diretoriaId: alvo.diretoria_id,
        coordenadorId: alvo.coordenador_id,
        liderId: alvo.lider_id,
        valorDevido: valor,
        travado: false,
        updatedBy: profile.id,
      })
      upsertDevidoLocal(row)
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
      const liderId = form.liderId || null
      const row = await createLancamento({
        diretoriaId: dirId,
        coordenadorId: form.coordId,
        liderId,
        valor,
        forma: form.method,
        file: form.file,
        createdBy: profile.id,
      })
      setLancamentos((prev) => [row, ...prev])
      patchInline(dirId, { amount: '', file: null })
      const el = inlineFileRefs.current[dirId]
      if (el) el.value = ''
      setPayTargetKey(null)
      setLocalMode(isLocalFinanceiroMode())
      const label = labelAlvoLancamento({
        lider_id: liderId,
        lider_nome: liderId ? nomeLider.get(liderId) : undefined,
        coordenador_nome: nomeCoord.get(form.coordId),
      })
      showToast(`Pagamento de ${formatMoneyBRL(valor)} abatido de ${label}!`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao lançar pagamento.')
    } finally {
      setSavingInline(null)
    }
  }

  async function submitModal(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !modalDirId || !modalCoordId) {
      showToast('Escolha a coordenação (e liderança, se for o caso).')
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
      const liderId = modalLiderId || null
      const row = await createLancamento({
        diretoriaId: modalDirId,
        coordenadorId: modalCoordId,
        liderId,
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
    const label = labelAlvoLancamento({
      lider_id: l.lider_id,
      lider_nome: l.lider_id ? nomeLider.get(l.lider_id) : undefined,
      coordenador_nome: nomeCoord.get(l.coordenador_id),
    })
    const ok = window.confirm(
      `Apagar o lançamento de ${formatMoneyBRL(l.valor)} em ${label}?\nEssa ação não pode ser desfeita.`,
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

  function renderAlvoRow(alvo: FinanceiroAlvoResumo, nested = false) {
    const key = alvo.key
    const travado = alvo.travado
    const saving = savingDevido === key
    return (
      <div key={key} className={`fin-alvo${nested ? ' is-lider' : ' is-coord'}`}>
        <div className="fin-alvo-main">
          <div className="fin-alvo-id">
            <span className={`fin-badge${nested ? ' is-lider' : ''}`}>
              {nested ? 'Liderança' : 'Coordenação'}
            </span>
            <strong>{alvo.nome}</strong>
          </div>
          <MoneyStrip devido={alvo.valor_devido} pago={alvo.pago} falta={alvo.falta} />
        </div>
        <div className="fin-alvo-actions">
          <div className={`fin-due-row${travado ? ' is-locked' : ''}`}>
            <div className="fin-due-box">
              <span>R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={devidoDraft[key] ?? '0'}
                disabled={travado || saving}
                readOnly={travado}
                onChange={(e) =>
                  setDevidoDraft((prev) => ({
                    ...prev,
                    [key]: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !travado) {
                    e.preventDefault()
                    void saveDevido(alvo, (e.target as HTMLInputElement).value)
                  }
                }}
                aria-label={`Valor devido de ${alvo.nome}`}
              />
            </div>
            {travado ? (
              <button
                type="button"
                className="fin-lock-btn is-locked"
                title="Destrancar valor"
                disabled={saving}
                onClick={() => void unlockDevido(alvo)}
              >
                <Lock size={13} strokeWidth={2.4} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="fin-save-due"
                  disabled={saving}
                  onClick={() => void saveDevido(alvo)}
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
          <button
            type="button"
            className="fin-pay-btn"
            onClick={() => openPayFor(alvo)}
          >
            <Wallet size={13} />
            Pagar
          </button>
        </div>
      </div>
    )
  }

  function renderCoordCard(bloco: FinanceiroCoordBloco, dirId: string) {
    const open = expandedCoordIds.has(bloco.coordenador_id)
    const form = inlineForms[dirId]
    const showPay =
      payTargetKey
      && (payTargetKey === bloco.proprio.key
        || bloco.liderancas.some((l) => l.key === payTargetKey))
      && form?.coordId === bloco.coordenador_id

    return (
      <div key={bloco.coordenador_id} className={`fin-coord-card${open ? ' is-open' : ''}`}>
        <button
          type="button"
          className="fin-coord-head"
          onClick={() => toggleCoord(bloco.coordenador_id)}
          aria-expanded={open}
        >
          <div className="fin-coord-head-left">
            <span className="fin-coord-avatar" aria-hidden>{initials(bloco.nome)}</span>
            <span>
              <strong>{bloco.nome}</strong>
              <em>
                {bloco.liderancas.length}{' '}
                {bloco.liderancas.length === 1 ? 'liderança' : 'lideranças'}
              </em>
            </span>
          </div>
          <div className="fin-coord-head-right">
            <MoneyStrip
              devido={bloco.totalLeitura.devido}
              pago={bloco.totalLeitura.pago}
              falta={bloco.totalLeitura.falta}
            />
            <span className="fin-acc-chevron" aria-hidden>
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </div>
        </button>

        {open ? (
          <div className="fin-coord-body">
            {renderAlvoRow(bloco.proprio, false)}

            <div className="fin-lider-block">
              <div className="fin-lider-block-head">
                <Users size={13} />
                <span>Lideranças</span>
              </div>
              {!bloco.liderancas.length ? (
                <p className="fin-empty-line">Nenhuma liderança nesta coordenação.</p>
              ) : (
                bloco.liderancas.map((l) => renderAlvoRow(l, true))
              )}
            </div>

            <div className="fin-coord-total">
              <span>Total da coordenação</span>
              <MoneyStrip
                devido={bloco.totalLeitura.devido}
                pago={bloco.totalLeitura.pago}
                falta={bloco.totalLeitura.falta}
              />
              <small>Soma da coordenação + lideranças (só leitura)</small>
            </div>

            {showPay && form ? (
              <div className="fin-inline-form">
                <div className="fin-inline-title">
                  <Wallet size={12} />
                  <span>Novo pagamento</span>
                </div>
                <div className="fin-inline-grid">
                  <label className="fin-field">
                    <span>Alvo</span>
                    <select
                      value={form.liderId}
                      onChange={(e) => patchInline(dirId, { liderId: e.target.value })}
                    >
                      <option value="">Esta coordenação ({bloco.nome})</option>
                      {bloco.liderancas.map((l) => (
                        <option key={l.lider_id!} value={l.lider_id!}>
                          Liderança {l.nome}
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
                      value={form.amount}
                      onChange={(e) => patchInline(dirId, { amount: e.target.value })}
                    />
                  </label>
                  <div className="fin-field">
                    <span>Forma</span>
                    <div className="fin-forma-toggle">
                      <button
                        type="button"
                        className={form.method === 'dinheiro' ? 'is-on is-light' : ''}
                        onClick={() => patchInline(dirId, { method: 'dinheiro' })}
                      >
                        R$ Dinheiro
                      </button>
                      <button
                        type="button"
                        className={form.method === 'pix' ? 'is-on is-dark' : ''}
                        onClick={() => patchInline(dirId, { method: 'pix' })}
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
                      onClick={() => inlineFileRefs.current[dirId]?.click()}
                    >
                      <Paperclip size={12} />
                      <span className="fin-attach-text">
                        {form.file?.name || 'Anexar imagem ou PDF'}
                      </span>
                    </button>
                    <input
                      ref={(el) => {
                        inlineFileRefs.current[dirId] = el
                      }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      hidden
                      onChange={(e) =>
                        patchInline(dirId, { file: e.target.files?.[0] ?? null })
                      }
                    />
                  </div>
                </div>
                <div className="fin-inline-actions">
                  <button
                    type="button"
                    className="fin-btn-ghost"
                    onClick={() => {
                      setPayTargetKey(null)
                      patchInline(dirId, { amount: '', file: null })
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="fin-cta fin-cta-sm"
                    disabled={savingInline === dirId}
                    onClick={() => void submitInline(dirId)}
                  >
                    {savingInline === dirId ? 'Salvando…' : 'Confirmar pagamento'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  if (loading) return <Spinner />

  return (
    <div className="fin-page">
      <div className="fin-head">
        <div>
          <p className="fin-kicker">Financeiro</p>
          <h1>Pagamentos</h1>
          <p className="fin-sub">
            Cada coordenação e cada liderança têm valor devido. A diretoria só agrupa os totais.
          </p>
        </div>
        <button type="button" className="fin-cta" onClick={() => openModal()}>
          <Plus size={12} strokeWidth={3} />
          <span>Lançar pagamento</span>
        </button>
      </div>

      <div className="fin-kpi-row" aria-label="Totais gerais">
        <div className="fin-kpi">
          <small>Total devido</small>
          <strong>{formatMoneyBRL(pageTot.devido)}</strong>
        </div>
        <div className="fin-kpi is-pago">
          <small>Pago</small>
          <strong>{formatMoneyBRL(pageTot.pago)}</strong>
        </div>
        <div className="fin-kpi is-falta">
          <small>A pagar</small>
          <strong>{formatMoneyBRL(pageTot.falta)}</strong>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {localMode ? (
        <p className="fin-local-tip">
          Dados neste navegador até rodar{' '}
          <code>supabase/diagnosticos/financeiro_liderancas_run.sql</code>
          {' '}(e o SQL base do financeiro, se ainda não rodou).
        </p>
      ) : null}

      {!diretorias.length ? (
        <EmptyState title="Nenhuma diretora" description="Cadastre diretorias para usar o financeiro." />
      ) : (
        <>
          <div className="fin-dir-list">
            {cards.map(({ dir, blocos, tot, liderCount }) => {
              const open = expandedDirId === dir.id
              return (
                <div key={dir.id} className={`fin-acc${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="fin-acc-head"
                    onClick={() => setExpandedDirId(open ? null : dir.id)}
                    aria-expanded={open}
                  >
                    <div className="fin-acc-left">
                      <span className="fin-acc-avatar" aria-hidden>
                        {initials(dir.nome)}
                      </span>
                      <span className="fin-acc-copy">
                        <strong>{dir.nome}</strong>
                        <em>
                          {blocos.length} {blocos.length === 1 ? 'coordenação' : 'coordenações'}
                          {' · '}
                          {liderCount} {liderCount === 1 ? 'liderança' : 'lideranças'}
                        </em>
                      </span>
                    </div>
                    <div className="fin-acc-right">
                      <span className="fin-acc-money">
                        <small>Devido</small>
                        <b>{formatMoneyBRL(tot.devido)}</b>
                      </span>
                      <span className="fin-acc-money is-pago">
                        <small>Pago</small>
                        <b>{formatMoneyBRL(tot.pago)}</b>
                      </span>
                      <span className="fin-acc-money is-apagar">
                        <small>A pagar</small>
                        <b>{formatMoneyBRL(tot.falta)}</b>
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
                          <p>Defina o devido de cada coordenação e liderança. Totais acima são só leitura.</p>
                        </div>
                        <button
                          type="button"
                          className="fin-cta fin-cta-sm"
                          onClick={() => openModal(dir.id)}
                        >
                          <Plus size={10} strokeWidth={3} />
                          Lançar pagamento
                        </button>
                      </div>

                      {!blocos.length ? (
                        <p className="fin-empty-line">Nenhuma coordenação ativa nesta diretoria.</p>
                      ) : (
                        <div className="fin-coord-list">
                          {blocos.map((b) => renderCoordCard(b, dir.id))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

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
                      <p className="fin-log-name">{l.alvo_label}</p>
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
              {isAdmin ? (
                <label className="fin-field">
                  <span>Diretoria (agrupamento)</span>
                  <select
                    value={modalDirId}
                    onChange={(e) => {
                      const id = e.target.value
                      setModalDirId(id)
                      const first = coordenadores.find((c) => c.diretoria_id === id)
                      setModalCoordId(first?.id ?? '')
                      setModalLiderId('')
                    }}
                  >
                    {diretorias.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="fin-field">
                <span>Coordenação</span>
                <select
                  value={modalCoordId}
                  onChange={(e) => {
                    setModalCoordId(e.target.value)
                    setModalLiderId('')
                  }}
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

              <label className="fin-field">
                <span>Alvo do pagamento</span>
                <select
                  value={modalLiderId}
                  onChange={(e) => setModalLiderId(e.target.value)}
                >
                  <option value="">Esta coordenação</option>
                  {modalLideres.map((l) => (
                    <option key={l.id} value={l.id}>
                      Liderança {l.nome}
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

      <div className={`fin-toast${toast ? ' is-on' : ''}`} role="status">
        <span className="fin-toast-dot" aria-hidden />
        <span>{toast ?? ''}</span>
      </div>
    </div>
  )
}
