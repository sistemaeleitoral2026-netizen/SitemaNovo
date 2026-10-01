import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  Lock,
  LockOpen,
  Paperclip,
  Plus,
  Receipt,
  Search,
  Trash2,
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

const AVATAR_TONES = ['blue', 'teal', 'amber', 'rose', 'violet', 'slate'] as const

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

function pctPago(devido: number, pago: number) {
  if (devido <= 0) return pago > 0 ? 100 : 0
  return Math.min(100, Math.round((pago / devido) * 100))
}

function avatarTone(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length
  return AVATAR_TONES[h]
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  return (
    <svg className="fin-ring" viewBox="0 0 64 64" aria-hidden>
      <circle className="fin-ring-bg" cx="32" cy="32" r={r} />
      <circle
        className="fin-ring-fg"
        cx="32"
        cy="32"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
      <text className="fin-ring-text" x="32" y="36" textAnchor="middle">
        {pct}%
      </text>
    </svg>
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
  const [query, setQuery] = useState('')
  const [filterDirId, setFilterDirId] = useState('')
  const [lancFilterKey, setLancFilterKey] = useState<string | null>(null)

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
  const recentRef = useRef<HTMLElement | null>(null)

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
        setExpandedCoordIds(new Set(coords.slice(0, 1).map((c) => c.id)))
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
    const q = query.trim().toLowerCase()
    return diretorias
      .filter((d) => !filterDirId || d.id === filterDirId)
      .map((d) => {
        let blocos = hierarquia.filter((b) => b.diretoria_id === d.id)
        if (q) {
          blocos = blocos
            .map((b) => {
              const coordHit = b.nome.toLowerCase().includes(q)
              const liderancas = b.liderancas.filter((l) => l.nome.toLowerCase().includes(q))
              if (coordHit) return b
              if (liderancas.length) return { ...b, liderancas }
              return null
            })
            .filter(Boolean) as FinanceiroCoordBloco[]
        }
        const alvos: FinanceiroAlvoResumo[] = []
        for (const b of blocos) alvos.push(b.proprio, ...b.liderancas)
        const tot = sumAlvos(alvos)
        const liderCount = blocos.reduce((n, b) => n + b.liderancas.length, 0)
        return { dir: d, blocos, tot, liderCount }
      })
      .filter((c) => !q || c.blocos.length > 0)
  }, [diretorias, hierarquia, query, filterDirId])

  const recentList = useMemo(() => {
    return lancamentos.slice(0, 80).map((l) => {
      const key = alvoKey(l.coordenador_id, l.lider_id)
      return {
        ...l,
        alvo_key: key,
        coordenador_nome: nomeCoord.get(l.coordenador_id) ?? 'Coordenação',
        lider_nome: l.lider_id ? (nomeLider.get(l.lider_id) ?? 'Liderança') : undefined,
        diretoria_nome: nomeDir.get(l.diretoria_id) ?? 'Diretoria',
        alvo_label: labelAlvoLancamento({
          lider_id: l.lider_id,
          lider_nome: l.lider_id ? nomeLider.get(l.lider_id) : undefined,
          coordenador_nome: nomeCoord.get(l.coordenador_id),
        }),
      }
    }).filter((l) => !lancFilterKey || l.alvo_key === lancFilterKey)
  }, [lancamentos, nomeCoord, nomeLider, nomeDir, lancFilterKey])

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

  function viewLancamentos(alvo: FinanceiroAlvoResumo) {
    setLancFilterKey(alvo.key)
    setExpandedDirId(alvo.diretoria_id)
    window.setTimeout(() => {
      recentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
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
      // Só trava quando há valor real — R$ 0 fica editável
      const row = await upsertValorDevido({
        diretoriaId: alvo.diretoria_id,
        coordenadorId: alvo.coordenador_id,
        liderId: alvo.lider_id,
        valorDevido: valor,
        travado: valor > 0,
        updatedBy: profile.id,
      })
      upsertDevidoLocal(row)
      setLocalMode(isLocalFinanceiroMode())
      showToast(valor > 0 ? 'Valor devido salvo e travado!' : 'Valor devido salvo.')
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

  function renderDueEditor(alvo: FinanceiroAlvoResumo) {
    const key = alvo.key
    // R$ 0 “travado” impede editar — trata como aberto
    const locked = Boolean(alvo.travado && alvo.valor_devido > 0)
    const saving = savingDevido === key
    return (
      <div className={`fin-due-edit${locked ? ' is-locked' : ''}`}>
        {locked ? (
          <>
            <b>{formatMoneyBRL(alvo.valor_devido)}</b>
            <button
              type="button"
              className="fin-edit-due"
              title="Editar valor devido"
              disabled={saving}
              onClick={() => void unlockDevido(alvo)}
            >
              <Lock size={12} strokeWidth={2.4} />
              {saving ? '…' : 'Editar'}
            </button>
          </>
        ) : (
          <>
            <div className="fin-due-box">
              <span>R$</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={devidoDraft[key] ?? ''}
                disabled={saving}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  setDevidoDraft((prev) => ({
                    ...prev,
                    [key]: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void saveDevido(alvo, (e.target as HTMLInputElement).value)
                  }
                }}
                aria-label={`Valor devido de ${alvo.nome}`}
              />
            </div>
            <button
              type="button"
              className="fin-save-due"
              disabled={saving}
              onClick={() => void saveDevido(alvo)}
            >
              {saving ? '…' : 'Salvar'}
            </button>
            <span className="fin-icon-btn is-muted" title="Destrancado" aria-hidden>
              <LockOpen size={12} strokeWidth={2.2} />
            </span>
          </>
        )}
      </div>
    )
  }

  function renderPayForm(bloco: FinanceiroCoordBloco, dirId: string) {
    const form = inlineForms[dirId]
    if (!form) return null
    return (
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
            className="fin-btn-dark"
            disabled={savingInline === dirId}
            onClick={() => void submitInline(dirId)}
          >
            {savingInline === dirId ? 'Salvando…' : 'Confirmar pagamento'}
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
    const tone = avatarTone(bloco.nome)

    return (
      <div key={bloco.coordenador_id} className={`fin-coord-card${open ? ' is-open' : ''}`}>
        <button
          type="button"
          className="fin-coord-head"
          onClick={() => toggleCoord(bloco.coordenador_id)}
          aria-expanded={open}
        >
          <div className="fin-coord-head-left">
            <span className={`fin-avatar tone-${tone}`} aria-hidden>
              {initials(bloco.nome)}
            </span>
            <span>
              <strong>Coordenação {bloco.nome}</strong>
              <em>
                {bloco.liderancas.length}{' '}
                {bloco.liderancas.length === 1 ? 'liderança' : 'lideranças'}
              </em>
            </span>
          </div>
          <div className="fin-cols-money">
            <span>
              <small>Devido</small>
              <b>{formatMoneyBRL(bloco.totalLeitura.devido)}</b>
            </span>
            <span className="is-pago">
              <small>Pago</small>
              <b>{formatMoneyBRL(bloco.totalLeitura.pago)}</b>
            </span>
            <span className="is-apagar">
              <small>A pagar</small>
              <b>{formatMoneyBRL(bloco.totalLeitura.falta)}</b>
            </span>
          </div>
          <span className="fin-acc-chevron" aria-hidden>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {open ? (
          <div className="fin-coord-body">
            <div className="fin-coord-self">
              <div className="fin-person">
                <span className={`fin-avatar tone-${tone}`} aria-hidden>
                  {initials(bloco.nome)}
                </span>
                <div>
                  <strong>{bloco.nome}</strong>
                  <em>Coordenação</em>
                </div>
              </div>
              <div className="fin-cols-money is-inline">
                <span>
                  <small>Devido</small>
                  {renderDueEditor(bloco.proprio)}
                </span>
                <span className="is-pago">
                  <small>Pago</small>
                  <b>{formatMoneyBRL(bloco.proprio.pago)}</b>
                </span>
                <span className="is-apagar">
                  <small>A pagar</small>
                  <b>{formatMoneyBRL(bloco.proprio.falta)}</b>
                </span>
              </div>
              <div className="fin-row-actions">
                <button
                  type="button"
                  className="fin-btn-dark"
                  onClick={() => openPayFor(bloco.proprio)}
                >
                  Pagar
                </button>
                <button
                  type="button"
                  className="fin-btn-outline"
                  onClick={() => viewLancamentos(bloco.proprio)}
                >
                  Ver lançamentos
                </button>
              </div>
            </div>

            <div className="fin-lider-block">
              <div className="fin-lider-block-head">
                <span>Lideranças da coordenação</span>
              </div>
              {!bloco.liderancas.length ? (
                <p className="fin-empty-line">Nenhuma liderança nesta coordenação.</p>
              ) : (
                <div className="fin-table-wrap">
                  <table className="fin-table">
                    <thead>
                      <tr>
                        <th>Liderança</th>
                        <th>Devido</th>
                        <th>Pago</th>
                        <th>A pagar</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bloco.liderancas.map((l) => (
                        <tr key={l.key}>
                          <td>
                            <div className="fin-person">
                              <span className={`fin-avatar sm tone-${avatarTone(l.nome)}`} aria-hidden>
                                {initials(l.nome)}
                              </span>
                              <strong>{l.nome}</strong>
                            </div>
                          </td>
                          <td>{renderDueEditor(l)}</td>
                          <td className="is-pago">{formatMoneyBRL(l.pago)}</td>
                          <td className="is-apagar">{formatMoneyBRL(l.falta)}</td>
                          <td>
                            <div className="fin-row-actions">
                              <button
                                type="button"
                                className="fin-btn-dark fin-btn-xs"
                                onClick={() => openPayFor(l)}
                              >
                                Pagar
                              </button>
                              <button
                                type="button"
                                className="fin-btn-outline fin-btn-xs"
                                onClick={() => viewLancamentos(l)}
                              >
                                Ver lançamentos
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="fin-coord-total">
              <span>Total da coordenação</span>
              <div className="fin-cols-money is-inline">
                <span>
                  <small>Devido</small>
                  <b>{formatMoneyBRL(bloco.totalLeitura.devido)}</b>
                </span>
                <span className="is-pago">
                  <small>Pago</small>
                  <b>{formatMoneyBRL(bloco.totalLeitura.pago)}</b>
                </span>
                <span className="is-apagar">
                  <small>A pagar</small>
                  <b>{formatMoneyBRL(bloco.totalLeitura.falta)}</b>
                </span>
              </div>
              <small>Soma da coordenação + lideranças (só leitura)</small>
            </div>

            {showPay ? renderPayForm(bloco, dirId) : null}
          </div>
        ) : null}
      </div>
    )
  }

  if (loading) return <Spinner />

  const progressoGeral = pctPago(pageTot.devido, pageTot.pago)

  return (
    <div className="fin-page">
      <header className="fin-head">
        <div>
          <h1>Pagamentos</h1>
          <p className="fin-sub">
            Controle de valores devidos e pagamentos por coordenação e liderança.
          </p>
        </div>
        <button type="button" className="fin-btn-dark" onClick={() => openModal()}>
          <Plus size={13} strokeWidth={3} />
          <span>Lançar pagamento</span>
        </button>
      </header>

      <div className="fin-kpi-row" aria-label="Totais gerais">
        <div className="fin-kpi is-due">
          <div>
            <small>Valor devido cadastrado</small>
            <strong>{formatMoneyBRL(pageTot.devido)}</strong>
          </div>
          <span className="fin-kpi-icon" aria-hidden><Lock size={16} /></span>
        </div>
        <div className="fin-kpi is-pago">
          <div>
            <small>Valor pago</small>
            <strong>{formatMoneyBRL(pageTot.pago)}</strong>
          </div>
          <span className="fin-kpi-icon" aria-hidden><CheckCircle2 size={16} /></span>
        </div>
        <div className="fin-kpi is-falta">
          <div>
            <small>Valor a pagar</small>
            <strong>{formatMoneyBRL(pageTot.falta)}</strong>
          </div>
          <span className="fin-kpi-icon" aria-hidden><Clock3 size={16} /></span>
        </div>
        <div className="fin-kpi is-progress">
          <div className="fin-kpi-progress-copy">
            <small>Progresso geral</small>
            <strong>{progressoGeral}%</strong>
            <em>
              {formatMoneyBRL(pageTot.pago)} de {formatMoneyBRL(pageTot.devido)}
            </em>
            <div className="fin-progress-track">
              <div className="fin-progress-fill" style={{ width: `${progressoGeral}%` }} />
            </div>
          </div>
          <ProgressRing pct={progressoGeral} />
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
          <section className="fin-section">
            <div className="fin-section-head">
              <div>
                <h2>Por diretoria</h2>
                <p>Abra uma diretoria e gerencie o devido de cada coordenação e liderança.</p>
              </div>
              <div className="fin-toolbar">
                <label className="fin-search">
                  <Search size={14} aria-hidden />
                  <input
                    type="search"
                    placeholder="Buscar coordenação ou liderança…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                {isAdmin ? (
                  <select
                    className="fin-filter"
                    value={filterDirId}
                    onChange={(e) => setFilterDirId(e.target.value)}
                    aria-label="Filtrar diretoria"
                  >
                    <option value="">Todas as diretorias</option>
                    {diretorias.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>

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
                        <span className={`fin-avatar tone-${avatarTone(dir.nome)}`} aria-hidden>
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
                      <div className="fin-cols-money">
                        <span>
                          <small>Devido</small>
                          <b>{formatMoneyBRL(tot.devido)}</b>
                        </span>
                        <span className="is-pago">
                          <small>Pago</small>
                          <b>{formatMoneyBRL(tot.pago)}</b>
                        </span>
                        <span className="is-apagar">
                          <small>A pagar</small>
                          <b>{formatMoneyBRL(tot.falta)}</b>
                        </span>
                      </div>
                      <span className="fin-acc-chevron" aria-hidden>
                        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>

                    {open ? (
                      <div className="fin-acc-body">
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
              {!cards.length ? (
                <p className="fin-empty-line">Nenhum resultado para a busca.</p>
              ) : null}
            </div>
          </section>

          <section className="fin-recent" ref={recentRef} id="fin-recent">
            <div className="fin-recent-head">
              <div>
                <h2>Últimos lançamentos</h2>
                <p>
                  Até 80 pagamentos recentes
                  {isAdmin ? ' · só o admin pode apagar' : ''}
                </p>
              </div>
              {lancFilterKey ? (
                <button
                  type="button"
                  className="fin-btn-outline fin-btn-xs"
                  onClick={() => setLancFilterKey(null)}
                >
                  Limpar filtro
                </button>
              ) : null}
            </div>
            {!recentList.length ? (
              <p className="fin-empty-line">Nenhum pagamento registrado.</p>
            ) : (
              <div className="fin-table-wrap">
                <table className="fin-table fin-log-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Alvo</th>
                      <th>Descrição</th>
                      <th>Valor</th>
                      <th>Forma</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentList.map((l) => (
                      <tr key={l.id}>
                        <td className="fin-muted">{fmtWhen(l.created_at)}</td>
                        <td>
                          <div className="fin-person">
                            <span className={`fin-avatar sm tone-${avatarTone(l.alvo_label)}`} aria-hidden>
                              {initials(l.alvo_label)}
                            </span>
                            <div>
                              <strong>{l.alvo_label}</strong>
                              <em>{l.diretoria_nome}</em>
                            </div>
                          </div>
                        </td>
                        <td className="fin-muted">
                          {l.observacao?.trim() || 'Pagamento'}
                        </td>
                        <td>
                          <strong className="fin-valor">{formatMoneyBRL(l.valor)}</strong>
                        </td>
                        <td>
                          <span className={`fin-log-tag ${l.forma}`}>{formaLabel(l.forma)}</span>
                        </td>
                        <td>
                          <div className="fin-row-actions">
                            {l.comprovante_path ? (
                              <button
                                type="button"
                                className="fin-comp-link"
                                onClick={() => void openComprovante(l.comprovante_path)}
                              >
                                <Eye size={13} />
                                Ver
                              </button>
                            ) : (
                              <span className="fin-muted">—</span>
                            )}
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <button type="submit" className="fin-btn-dark" disabled={savingModal}>
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
