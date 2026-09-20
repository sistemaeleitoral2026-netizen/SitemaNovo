import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Car,
  CheckCircle2,
  ExternalLink,
  Home,
  Link2,
  Minus,
  Plus,
  Search,
  X,
  MessageCircle,
} from 'lucide-react'
import { buildWhatsAppUrl } from '../lib/whatsapp'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import {
  claimNextAtivacao,
  fetchAtivacaoPessoa,
  releaseAtivacaoClaim,
  saveAtivacao,
  searchAtivacaoPessoas,
  type AtivacaoPessoa,
  type ContatoWhatsappStatus,
} from '../lib/ativacao'

function canEditSection(
  ownerId: string | null | undefined,
  userId: string | null | undefined,
  canOverride: boolean,
) {
  if (!ownerId) return true
  if (canOverride) return true
  return Boolean(userId && ownerId === userId)
}

function waStatusLabel(status: ContatoWhatsappStatus) {
  if (status === 'sim') return 'Já acionada'
  if (status === 'sem') return 'Sem WhatsApp'
  return 'Não acionada'
}

function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className={`fl-segment${disabled ? ' is-disabled' : ''}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={value === opt.value ? 'is-active' : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function AtivacaoLancarPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const preTipo = searchParams.get('tipo') as AtivacaoPessoa['tipo'] | null
  const preId = searchParams.get('id')

  const scopeDiretoriaId = useMemo(() => {
    if (hasRole(profile, 'diretoria')) return profile?.id
    if (hasRole(profile, 'mobilizador') && profile?.diretoria_id) return profile.diretoria_id
    return undefined
  }, [profile])

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AtivacaoPessoa[]>([])
  const [searching, setSearching] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [selected, setSelected] = useState<AtivacaoPessoa | null>(null)
  const [carros, setCarros] = useState(0)
  const [casa, setCasa] = useState(false)
  const [links, setLinks] = useState<string[]>([])
  const [linkDraft, setLinkDraft] = useState('')
  const [notas, setNotas] = useState('')
  const [contatoStatus, setContatoStatus] = useState<ContatoWhatsappStatus>('nao')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [dirtyPrompt, setDirtyPrompt] = useState<'proximo' | 'limpar' | 'trocar' | null>(null)
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)

  const isFormActive = selected !== null
  const waUrl = buildWhatsAppUrl(selected?.telefone)
  const canOverride = hasRole(profile, 'admin') || hasRole(profile, 'diretoria')
  const editWa = canEditSection(selected?.formigas_wa_by, profile?.id, canOverride)
  const editCarros = canEditSection(selected?.formigas_carros_by, profile?.id, canOverride)
  const editCasa = canEditSection(selected?.formigas_casa_by, profile?.id, canOverride)
  const editLinks = canEditSection(selected?.formigas_links_by, profile?.id, canOverride)

  const isDirty = useMemo(() => {
    if (!selected) return false
    const nextLinks = links.map((l) => l.trim()).filter(Boolean)
    const prevLinks = selected.postagem_links
    const linksChanged =
      nextLinks.length !== prevLinks.length
      || [...nextLinks].sort().join('\n') !== [...prevLinks].sort().join('\n')
    return (
      carros !== selected.carros_adesivados
      || casa !== (selected.adesivos_casa > 0)
      || contatoStatus !== selected.contato_whatsapp_status
      || notas.trim() !== (selected.ativacao_notas || '').trim()
      || linksChanged
    )
  }, [selected, carros, casa, links, notas, contatoStatus])

  useEffect(() => {
    if (!dirtyPrompt) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [dirtyPrompt])

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!preId || !preTipo) return
    if (!['eleitor', 'lideranca', 'coordenador'].includes(preTipo)) return
    void fetchAtivacaoPessoa(preTipo, preId).then((p) => {
      if (p) selectPerson(p)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preId, preTipo])

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2 || selected) {
      setSuggestions([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      void searchAtivacaoPessoas(term).then((rows) => {
        if (!cancelled) {
          setSuggestions(rows)
          setSearching(false)
        }
      })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query, selected])

  function selectPerson(p: AtivacaoPessoa) {
    setSelected(p)
    setQuery(p.nome)
    setSuggestions([])
    setCarros(p.carros_adesivados)
    setCasa(p.adesivos_casa > 0)
    setLinks(p.postagem_links.length ? [...p.postagem_links] : [])
    setNotas(p.ativacao_notas || '')
    setContatoStatus(p.contato_whatsapp_status)
    setError(null)
    setOk(null)
  }

  function resetForm() {
    setSelected(null)
    setQuery('')
    setCarros(0)
    setCasa(false)
    setLinks([])
    setNotas('')
    setContatoStatus('nao')
    setLinkDraft('')
  }

  async function persistCurrent(): Promise<boolean> {
    if (!selected) return false
    setSaving(true)
    setError(null)
    const snapshot = selected
    const { error: err } = await saveAtivacao(snapshot.tipo, snapshot.id, {
      carros_adesivados: carros,
      casa,
      links,
      notas,
      contato_whatsapp_status: contatoStatus,
    }, snapshot)
    setSaving(false)
    if (err) {
      setError(err)
      return false
    }
    return true
  }

  async function clearPerson() {
    if (selected && isDirty) {
      setDirtyPrompt('limpar')
      setError(null)
      setOk(null)
      return
    }
    if (selected) {
      void releaseAtivacaoClaim(selected.tipo, selected.id)
    }
    resetForm()
    setError(null)
    setOk(null)
  }

  async function goProximo() {
    setClaiming(true)
    setError(null)
    const { pessoa, error: err } = await claimNextAtivacao(scopeDiretoriaId)
    setClaiming(false)
    if (err) {
      setError(err)
      return
    }
    if (!pessoa) {
      setError('Ninguém pendente agora. Tente de novo em instantes.')
      resetForm()
      return
    }
    selectPerson(pessoa)
    setOk(null)
  }

  async function handleProximo() {
    setError(null)
    setOk(null)

    if (selected && isDirty) {
      setDirtyPrompt('proximo')
      return
    }

    if (selected) {
      await releaseAtivacaoClaim(selected.tipo, selected.id)
    }
    await goProximo()
  }

  async function confirmDirtySalvar() {
    const action = dirtyPrompt
    setDirtyPrompt(null)
    const saved = await persistCurrent()
    if (!saved) return

    if (action === 'proximo') {
      setOk('Lançamento salvo.')
      await goProximo()
      return
    }
    if (action === 'limpar') {
      resetForm()
      setOk('Lançamento salvo.')
      return
    }
    if (action === 'trocar') {
      resetForm()
      if (pendingQuery != null) setQuery(pendingQuery)
      setPendingQuery(null)
      setOk('Lançamento salvo.')
    }
  }

  async function confirmDirtyLimpar() {
    const action = dirtyPrompt
    const snap = selected
    setDirtyPrompt(null)
    if (snap) {
      void releaseAtivacaoClaim(snap.tipo, snap.id)
    }

    if (action === 'proximo') {
      resetForm()
      await goProximo()
      return
    }
    if (action === 'limpar') {
      resetForm()
      setOk(null)
      setError(null)
      return
    }
    if (action === 'trocar') {
      resetForm()
      if (pendingQuery != null) setQuery(pendingQuery)
      setPendingQuery(null)
      setOk(null)
      setError(null)
    }
  }

  function confirmDirtyCancelar() {
    setDirtyPrompt(null)
    setPendingQuery(null)
  }

  function addLink() {
    const url = linkDraft.trim()
    if (!url || !isFormActive) return
    if (links.includes(url)) {
      setLinkDraft('')
      return
    }
    setLinks((prev) => [...prev, url])
    setLinkDraft('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) {
      setError('Selecione uma pessoa para lançar Formigas.')
      return
    }
    if (!isDirty) {
      setOk('Nada para salvar — nenhuma alteração nesta ficha.')
      return
    }
    const saved = await persistCurrent()
    if (!saved) return
    setOk('Lançamento salvo. Busque ou clique em Próximo.')
    resetForm()
  }

  function tryLeaveSelected(nextQuery: string) {
    if (!selected) {
      setQuery(nextQuery)
      return
    }
    if (isDirty) {
      setPendingQuery(nextQuery)
      setDirtyPrompt('trocar')
      setError(null)
      setOk(null)
      return
    }
    void releaseAtivacaoClaim(selected.tipo, selected.id)
    setSelected(null)
    setQuery(nextQuery)
  }

  const initials = useMemo(() => {
    if (!selected) return '--'
    return selected.nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '--'
  }, [selected])

  const saveLabel = saving ? 'Salvando…' : 'Salvar lançamento'
  const proximoBusy = claiming || saving || dirtyPrompt !== null
  const proximoLabel = claiming
    ? '…'
    : <>Próximo <ArrowRight size={16} strokeWidth={2.5} /></>

  const dirtyPromptTitle =
    dirtyPrompt === 'proximo'
      ? 'Alterações sem salvar'
      : dirtyPrompt === 'limpar'
        ? 'Limpar esta ficha?'
        : 'Trocar de pessoa?'

  const dirtyPromptText =
    dirtyPrompt === 'proximo'
      ? 'Você mexeu nesta ficha. Salve para guardar, limpe para descartar, ou cancele para continuar editando.'
      : dirtyPrompt === 'limpar'
        ? 'Há alterações pendentes. Salve antes de limpar, descarte tudo, ou cancele.'
        : 'Há alterações pendentes. Salve, descarte, ou cancele para continuar nesta ficha.'

  return (
    <div className="fl-page fl-page-lancar">
      <div className="fl-page-head fl-page-head-compact">
        <div>
          <h1 className="fl-title">Lançar Formigas</h1>
        </div>
        <button type="button" className="fl-btn-secondary fl-btn-painel-desktop" onClick={() => navigate('/ativacao/painel')}>
          Ver Painel
        </button>
      </div>

      <form id="fl-lancar-form" className="fl-card fl-card-sheet" onSubmit={handleSave}>
        <div className="fl-card-head">
          <h2>Registro —<br className="fl-br-mobile" /> Formigas</h2>
          <Link to="/ativacao/painel" className="fl-link">Consultar<br className="fl-br-mobile" /> Painel</Link>
        </div>

        <div className="fl-card-body">
          <div className="fl-field">
            <label htmlFor="fl-busca">Eleitor, liderança ou coordenador</label>
            <div className="fl-search-row">
              <div className="fl-search">
                <Search className="fl-search-icon" size={20} />
                <input
                  id="fl-busca"
                  value={query}
                  onChange={(e) => {
                    tryLeaveSelected(e.target.value)
                  }}
                  placeholder="Nome, CPF ou telefone…"
                  autoComplete="off"
                />
                {selected && (
                  <button type="button" className="fl-search-clear" onClick={() => void clearPerson()} aria-label="Limpar">
                    <X size={20} />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="fl-btn-proximo"
                disabled={proximoBusy}
                onClick={() => void handleProximo()}
              >
                {proximoLabel}
              </button>
            </div>

            {isDirty && (
              <p className="fl-hint fl-dirty-hint">
                Alterações pendentes — use <b>Salvar lançamento</b> ou, ao clicar em Próximo, escolha Salvar / Limpar / Cancelar.
              </p>
            )}

            {!selected && suggestions.length > 0 && (
              <div className="fl-suggest">
                {suggestions.map((s) => (
                  <button key={s.key} type="button" onClick={() => selectPerson(s)}>
                    <strong>{s.nome}</strong>
                    <span>
                      {s.tipoLabel}
                      {s.titulo ? ` · Título ${s.titulo}` : ''}
                      {s.zona ? ` · Zona ${s.zona}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searching && <p className="fl-hint">Buscando…</p>}

            {selected && (
              <div className="fl-person">
                <div className="fl-person-avatar">{initials}</div>
                <div>
                  <div className="fl-person-name">
                    <h3>{selected.nome}</h3>
                    <span>{selected.tipoLabel}</span>
                  </div>
                  <div className="fl-person-meta">
                    {selected.titulo ? <p><em>Título:</em> <b>{selected.titulo}</b></p> : null}
                    {selected.zona ? <p><em>Zona:</em> <b>{selected.zona}</b></p> : null}
                    <p><em>Bairro:</em> <b>{selected.bairro || '—'}</b></p>
                    {selected.telefone ? <p><em>Tel:</em> <b>{selected.telefone}</b></p> : null}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={`fl-block${isFormActive ? ' is-wa' : ''}`}>
            <div className="fl-block-top">
              <div className="fl-block-title">
                <div className={`fl-icon${isFormActive ? ' tone-wa' : ''}`}>
                  <MessageCircle size={20} />
                </div>
                <h3>WhatsApp</h3>
              </div>
              <span className={`fl-pill${contatoStatus === 'sim' ? ' ok' : contatoStatus === 'sem' ? ' warn' : ''}`}>
                {isFormActive ? waStatusLabel(contatoStatus) : 'Ainda não'}
              </span>
            </div>

            {!isFormActive ? (
              <p className="fl-hint italic">
                Selecione ou busque o <b>próximo</b> acima para liberar as opções do WhatsApp.
              </p>
            ) : (
              <div className="fl-wa-body">
                <p className="fl-hint">
                  Abra a conversa e marque se essa pessoa já foi acionada pelo WhatsApp.
                </p>
                {!editWa && (
                  <p className="fl-hint fl-lock-hint">
                    Só a formiga que registrou este status pode alterá-lo.
                  </p>
                )}
                {waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fl-btn-wa fl-btn-wa-main"
                    onClick={() => {
                      if (editWa) setContatoStatus('sim')
                    }}
                  >
                    <ExternalLink size={16} />
                    Enviar mensagem
                  </a>
                ) : (
                  <button type="button" className="fl-btn-wa fl-btn-wa-main is-disabled" disabled>
                    <ExternalLink size={16} />
                    Sem telefone
                  </button>
                )}
                <div className="fl-wa-row">
                  <div className="fl-wa-segment fl-wa-segment-3">
                    <SegmentedControl
                      disabled={!editWa}
                      options={[
                        { label: 'Não acionada', value: 'nao' },
                        { label: 'Já acionada', value: 'sim' },
                        { label: 'Sem WhatsApp', value: 'sem' },
                      ]}
                      value={contatoStatus}
                      onChange={(v) => setContatoStatus(v as ContatoWhatsappStatus)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="fl-grid-2">
            <div className={`fl-block${isFormActive ? ' is-active' : ''}`}>
              <div className="fl-block-top">
                <div className="fl-block-title">
                  <div className="fl-icon tone-blue"><Car size={20} /></div>
                  <h3>Veículos adesivados</h3>
                </div>
                <span className="fl-pill">{carros} veículo{carros === 1 ? '' : 's'}</span>
              </div>
              {!editCarros && isFormActive && (
                <p className="fl-hint fl-lock-hint">Só quem registrou os carros pode alterar.</p>
              )}
              <label className="fl-label-sm">Quantidade</label>
              <div className="fl-stepper">
                <button
                  type="button"
                  disabled={!isFormActive || !editCarros}
                  onClick={() => setCarros((n) => Math.max(0, n - 1))}
                  aria-label="Diminuir"
                >
                  <Minus size={16} />
                </button>
                <input
                  inputMode="numeric"
                  disabled={!isFormActive || !editCarros}
                  value={String(carros)}
                  onChange={(e) => setCarros(Math.max(0, Number(e.target.value.replace(/\D/g, '') || 0)))}
                />
                <button
                  type="button"
                  disabled={!isFormActive || !editCarros}
                  onClick={() => setCarros((n) => n + 1)}
                  aria-label="Aumentar"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className={`fl-block${isFormActive ? ' is-active' : ''}`}>
              <div className="fl-block-top">
                <div className="fl-block-title">
                  <div className="fl-icon tone-teal"><Home size={20} /></div>
                  <h3>Adesivo residencial</h3>
                </div>
                <span className={`fl-pill${casa ? ' teal' : ''}`}>
                  {casa ? 'Com adesivo' : 'Sem adesivo'}
                </span>
              </div>
              {!editCasa && isFormActive && (
                <p className="fl-hint fl-lock-hint">Só quem registrou o adesivo pode alterar.</p>
              )}
              <label className="fl-label-sm">Confirmação de campo</label>
              <SegmentedControl
                disabled={!isFormActive || !editCasa}
                options={[
                  { label: 'Não possui', value: 'nao' },
                  { label: 'Possui adesivo', value: 'sim' },
                ]}
                value={casa ? 'sim' : 'nao'}
                onChange={(v) => setCasa(v === 'sim')}
              />
            </div>
          </div>

          <div className={`fl-block${isFormActive ? ' is-active' : ''}`}>
            <div className="fl-block-top">
              <div className="fl-block-title">
                <div className="fl-icon tone-violet"><Link2 size={20} /></div>
                <h3>Links de postagem</h3>
              </div>
              <span className="fl-pill">{links.length} postagem{links.length === 1 ? '' : 's'}</span>
            </div>
            {!editLinks && isFormActive && (
              <p className="fl-hint fl-lock-hint">Só quem registrou as postagens pode alterar os links.</p>
            )}
            <p className="fl-hint">Cada link válido conta como 1 postagem.</p>
            <div className="fl-link-row">
              <input
                type="url"
                placeholder="https://instagram.com/…"
                value={linkDraft}
                disabled={!isFormActive || !editLinks}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (editLinks) addLink()
                  }
                }}
              />
              <button
                type="button"
                className="fl-btn-dark"
                disabled={!isFormActive || !editLinks || !linkDraft.trim()}
                onClick={addLink}
              >
                <Plus size={16} /> Adicionar
              </button>
            </div>
            {links.length > 0 && (
              <ul className="fl-links">
                {links.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                    <button
                      type="button"
                      disabled={!editLinks}
                      onClick={() => setLinks((prev) => prev.filter((l) => l !== url))}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="fl-field">
            <h3 className="fl-obs-title">Observações</h3>
            <textarea
              disabled={!isFormActive}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Anotações de campo (opcional)"
              rows={4}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {ok && <div className="alert alert-success">{ok}</div>}
        </div>

        <div className="fl-card-foot fl-card-foot-desktop">
          <button
            type="submit"
            className={`fl-btn-primary${isDirty ? ' is-dirty' : ''}`}
            disabled={!isFormActive || saving || !isDirty}
          >
            <CheckCircle2 size={20} />
            {saveLabel}
          </button>
          <button
            type="button"
            className="fl-btn-secondary"
            disabled={!isFormActive || saving}
            onClick={() => void clearPerson()}
          >
            Limpar
          </button>
        </div>
      </form>

      <div className="fl-save-bar" aria-label="Salvar">
        <button
          type="submit"
          form="fl-lancar-form"
          className={`fl-btn-primary fl-btn-save-full${isDirty ? ' is-dirty' : ''}`}
          disabled={!isFormActive || saving || !isDirty}
        >
          <CheckCircle2 size={20} />
          {saveLabel}
        </button>
      </div>

      {dirtyPrompt
        && createPortal(
          <div className="fl-dirty-overlay" role="presentation" onClick={confirmDirtyCancelar}>
            <div
              className="fl-dirty-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="fl-dirty-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="fl-dirty-title">{dirtyPromptTitle}</h3>
              <p>{dirtyPromptText}</p>
              <div className="fl-dirty-actions">
                <button
                  type="button"
                  className="fl-btn-primary"
                  disabled={saving || claiming}
                  onClick={() => void confirmDirtySalvar()}
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  type="button"
                  className="fl-btn-danger-outline"
                  disabled={saving || claiming}
                  onClick={() => void confirmDirtyLimpar()}
                >
                  Limpar alterações
                </button>
                <button
                  type="button"
                  className="fl-btn-secondary"
                  disabled={saving || claiming}
                  onClick={confirmDirtyCancelar}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
