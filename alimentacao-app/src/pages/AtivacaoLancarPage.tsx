import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Bike,
  Car,
  CheckCircle2,
  ExternalLink,
  History,
  Home,
  Link2,
  Minus,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { buildWhatsAppUrl } from '../lib/whatsapp'
import { WhatsAppIcon } from '../components/ui/WhatsAppLink'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import { formatCep, hasWhatsappPhone } from '../lib/normalize'
import { lookupViaCep } from '../lib/geocode'
import {
  FormigasFichaHistoricoDrawer,
} from '../components/FormigasFichaHistoricoDrawer'
import { FormigasFotoField } from '../components/FormigasFotoField'
import { FormigasLockChip, FormigasSectionLock } from '../components/FormigasSectionLock'
import {
  claimNextAtivacao,
  fetchAtivacaoPessoa,
  casaStatusLabel,
  hydrateFormigasSectionDates,
  releaseAtivacaoClaim,
  saveAtivacao,
  searchAtivacaoPessoas,
  type AdesivosCasaStatus,
  type AtivacaoPessoa,
  type ContatoWhatsappStatus,
} from '../lib/ativacao'

function waStatusLabel(status: ContatoWhatsappStatus) {
  if (status === 'sim') return 'Já acionada'
  if (status === 'sem') return 'Sem WhatsApp'
  return 'Não acionada'
}

function normalizePostUrl(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(candidate)
    if (!url.hostname.includes('.') || !['http:', 'https:'].includes(url.protocol)) return null
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
  disabledValues,
}: {
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  disabledValues?: string[]
}) {
  return (
    <div className={`fl-segment${disabled ? ' is-disabled' : ''}`}>
      {options.map((opt) => {
        const locked = disabled || Boolean(disabledValues?.includes(opt.value))
        return (
        <button
          key={opt.value}
          type="button"
          disabled={locked}
          onClick={() => onChange(opt.value)}
          className={value === opt.value ? 'is-active' : undefined}
        >
          {opt.label}
        </button>
        )
      })}
    </div>
  )
}

export function AtivacaoLancarPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const preTipo = searchParams.get('tipo') as AtivacaoPessoa['tipo'] | null
  const preId = searchParams.get('id')

  // Só a conta "diretoria" fica presa à própria pasta.
  // Formigas (mobilizador) buscam e editam qualquer ficha — como admin.
  const scopeDiretoriaId = useMemo(() => {
    if (hasRole(profile, 'diretoria')) return profile?.id
    return undefined
  }, [profile])

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AtivacaoPessoa[]>([])
  const [searching, setSearching] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [selected, setSelected] = useState<AtivacaoPessoa | null>(null)
  const [carros, setCarros] = useState(0)
  const [motos, setMotos] = useState(0)
  const [veiculoCarro, setVeiculoCarro] = useState(false)
  const [veiculoMoto, setVeiculoMoto] = useState(false)
  const [casaStatus, setCasaStatus] = useState<AdesivosCasaStatus>('nao')
  const [casaCep, setCasaCep] = useState('')
  const [casaEndereco, setCasaEndereco] = useState('')
  const [casaNumero, setCasaNumero] = useState('')
  const [casaBairro, setCasaBairro] = useState('')
  const [fotoVeiculoKeep, setFotoVeiculoKeep] = useState<string[]>([])
  const [fotoVeiculoFiles, setFotoVeiculoFiles] = useState<File[]>([])
  const [fotoCasaKeep, setFotoCasaKeep] = useState<string[]>([])
  const [fotoCasaFiles, setFotoCasaFiles] = useState<File[]>([])
  const [cepLoading, setCepLoading] = useState(false)
  const [links, setLinks] = useState<string[]>([])
  const [linkDraft, setLinkDraft] = useState('')
  const [linkJustSaved, setLinkJustSaved] = useState<string | null>(null)
  const [savingLink, setSavingLink] = useState(false)
  const [notas, setNotas] = useState('')
  const [contatoStatus, setContatoStatus] = useState<ContatoWhatsappStatus>('nao')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [dirtyPrompt, setDirtyPrompt] = useState<'proximo' | 'limpar' | 'trocar' | null>(null)
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)
  const [histOpen, setHistOpen] = useState(false)
  const skipSaveRef = useRef(false)

  const isFormActive = selected !== null
  const waUrl = buildWhatsAppUrl(selected?.telefone)
  // Qualquer formiga edita; o “cadeado” só mostra quem alterou por último
  const editWa = true
  const editCarros = true
  const editCasa = true
  const editLinks = true
  // Endereço opcional (sim/talvez): mostra campos, sem obrigar CEP/rua
  const showCasaAddr = casaStatus === 'sim' || casaStatus === 'talvez'
  const editCasaAddr = editCasa
  const lockChipProps = {
    userId: profile?.id,
  }

  const isDirty = useMemo(() => {
    if (!selected) return false
    const nextLinks = links.map((l) => l.trim()).filter(Boolean)
    const prevLinks = selected.postagem_links
    const linksChanged =
      nextLinks.length !== prevLinks.length
      || [...nextLinks].sort().join('\n') !== [...prevLinks].sort().join('\n')
    const addrChanged =
      casaCep.replace(/\D/g, '') !== selected.cep.replace(/\D/g, '')
      || casaEndereco.trim() !== selected.endereco.trim()
      || casaNumero.trim() !== selected.numero.trim()
      || casaBairro.trim() !== selected.bairro.trim()
    const nextCarrosSave = veiculoCarro ? carros : 0
    const nextMotosSave = veiculoMoto ? motos : 0
    const fotosVeiculoChanged =
      fotoVeiculoFiles.length > 0
      || fotoVeiculoKeep.join('|') !== selected.foto_veiculo_paths.join('|')
    const fotosCasaChanged =
      fotoCasaFiles.length > 0
      || fotoCasaKeep.join('|') !== selected.foto_casa_paths.join('|')
    return (
      nextCarrosSave !== selected.carros_adesivados
      || nextMotosSave !== selected.motos_adesivadas
      || casaStatus !== selected.adesivos_casa_status
      || contatoStatus !== selected.contato_whatsapp_status
      || notas.trim() !== (selected.ativacao_notas || '').trim()
      || linksChanged
      || (showCasaAddr && addrChanged)
      || ((veiculoCarro || veiculoMoto) && fotosVeiculoChanged)
      || ((casaStatus === 'sim' || casaStatus === 'talvez') && fotosCasaChanged)
    )
  }, [
    selected, carros, motos, veiculoCarro, veiculoMoto, casaStatus, casaCep, casaEndereco, casaNumero, casaBairro,
    links, notas, contatoStatus, fotoVeiculoKeep, fotoVeiculoFiles, fotoCasaKeep, fotoCasaFiles, showCasaAddr,
  ])

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
      if (p && (!scopeDiretoriaId || p.diretoria_id === scopeDiretoriaId)) selectPerson(p)
      else if (p) setError('Esta pessoa não pertence à sua diretoria.')
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
      void searchAtivacaoPessoas(term, 12, scopeDiretoriaId).then((rows) => {
        if (!cancelled) {
          setSuggestions(rows)
          setSearching(false)
          setError(null)
        }
      }).catch((err: Error) => {
        if (!cancelled) {
          setSuggestions([])
          setSearching(false)
          setError(err.message || 'Não foi possível buscar as pessoas.')
        }
      })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query, selected, scopeDiretoriaId])

  function selectPerson(p: AtivacaoPessoa) {
    setSelected(p)
    setQuery(p.nome)
    setSuggestions([])
    setCarros(p.carros_adesivados)
    setMotos(p.motos_adesivadas)
    setVeiculoCarro(p.carros_adesivados > 0)
    setVeiculoMoto(p.motos_adesivadas > 0)
    setCasaStatus(p.adesivos_casa_status)
    setCasaCep(p.cep ? formatCep(p.cep) : '')
    setCasaEndereco(p.endereco || '')
    setCasaNumero(p.numero || '')
    setCasaBairro(p.bairro || '')
    setFotoVeiculoKeep([...(p.foto_veiculo_paths || [])])
    setFotoVeiculoFiles([])
    setFotoCasaKeep([...(p.foto_casa_paths || [])])
    setFotoCasaFiles([])
    setLinks(p.postagem_links.length ? [...p.postagem_links] : [])
    setLinkDraft('')
    setLinkJustSaved(null)
    setNotas(p.ativacao_notas || '')
    setContatoStatus(p.contato_whatsapp_status)
    setError(null)
    setOk(null)
    void hydrateFormigasSectionDates(p).then((next) => {
      setSelected((cur) => (cur?.id === next.id && cur.tipo === next.tipo ? { ...cur, ...next } : cur))
    })
  }

  function resetForm() {
    setSelected(null)
    setQuery('')
    setCarros(0)
    setMotos(0)
    setVeiculoCarro(false)
    setVeiculoMoto(false)
    setCasaStatus('nao')
    setCasaCep('')
    setCasaEndereco('')
    setCasaNumero('')
    setCasaBairro('')
    setFotoVeiculoKeep([])
    setFotoVeiculoFiles([])
    setFotoCasaKeep([])
    setFotoCasaFiles([])
    setLinks([])
    setLinkDraft('')
    setLinkJustSaved(null)
    setNotas('')
    setContatoStatus('nao')
    setHistOpen(false)
  }

  async function persistCurrent(): Promise<boolean> {
    if (!selected) return false
    if (skipSaveRef.current) return false
    const nextCarros = veiculoCarro ? carros : 0
    const nextMotos = veiculoMoto ? motos : 0
    if (editCarros && (nextCarros > 0 || nextMotos > 0) && fotoVeiculoKeep.length + fotoVeiculoFiles.length < 1) {
      setError('Adicione pelo menos 1 foto do veículo adesivado.')
      return false
    }
    if (editCasa && casaStatus === 'sim' && fotoCasaKeep.length + fotoCasaFiles.length < 1) {
      setError('Adicione pelo menos 1 foto da casa adesivada.')
      return false
    }
    setSaving(true)
    setError(null)
    const snapshot = selected
    const { error: err } = await saveAtivacao(snapshot.tipo, snapshot.id, {
      carros_adesivados: nextCarros,
      motos_adesivadas: nextMotos,
      adesivos_casa_status: casaStatus,
      links,
      notas,
      contato_whatsapp_status: contatoStatus,
      cep: casaCep,
      endereco: casaEndereco,
      numero: casaNumero,
      bairro: casaBairro,
      foto_veiculo_keep: nextCarros > 0 || nextMotos > 0 ? fotoVeiculoKeep : [],
      foto_veiculo_files: nextCarros > 0 || nextMotos > 0 ? fotoVeiculoFiles : [],
      foto_casa_keep: casaStatus === 'sim' || casaStatus === 'talvez' ? fotoCasaKeep : [],
      foto_casa_files: casaStatus === 'sim' || casaStatus === 'talvez' ? fotoCasaFiles : [],
      canOverride: true,
    }, snapshot)
    setSaving(false)
    if (err) {
      setError(err)
      return false
    }
    return true
  }

  async function fillFromCep(raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    const addr = await lookupViaCep(digits)
    setCepLoading(false)
    if (!addr) return
    if (addr.logradouro) setCasaEndereco((prev) => prev.trim() || addr.logradouro)
    if (addr.bairro) setCasaBairro((prev) => prev.trim() || addr.bairro)
  }

  async function clearPerson() {
    if (selected && isDirty) {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
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
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      setDirtyPrompt('proximo')
      return
    }

    if (selected) {
      await releaseAtivacaoClaim(selected.tipo, selected.id)
    }
    await goProximo()
  }

  async function confirmDirtySalvar() {
    if (skipSaveRef.current) return
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
    // Trava qualquer submit/Enter que possa salvar no mesmo gesto
    skipSaveRef.current = true
    const action = dirtyPrompt
    const snap = selected
    setDirtyPrompt(null)
    if (snap) {
      void releaseAtivacaoClaim(snap.tipo, snap.id)
    }

    if (action === 'proximo') {
      resetForm()
      await goProximo()
      skipSaveRef.current = false
      return
    }
    if (action === 'limpar') {
      resetForm()
      setOk(null)
      setError(null)
      skipSaveRef.current = false
      return
    }
    if (action === 'trocar') {
      resetForm()
      if (pendingQuery != null) setQuery(pendingQuery)
      setPendingQuery(null)
      setOk(null)
      setError(null)
    }
    skipSaveRef.current = false
  }

  function confirmDirtyCancelar() {
    setDirtyPrompt(null)
    setPendingQuery(null)
  }

  function preventEnterSubmit(e: React.KeyboardEvent) {
    if (e.key === 'Enter') e.preventDefault()
  }

  async function handleSaveLink() {
    if (!isFormActive || !editLinks || saving || savingLink) return
    if (!selected) {
      setError('Selecione uma pessoa para lançar Formigas.')
      return
    }
    const url = normalizePostUrl(linkDraft)
    if (!url) {
      setError('Informe um link válido, como instagram.com/publicacao.')
      return
    }
    if (links.some((item) => item.toLowerCase() === url.toLowerCase())) {
      setLinkDraft('')
      setError('Este link já foi salvo.')
      return
    }
    const nextLinks = [...links, url]
    const snapshot = selected
    setLinks(nextLinks)
    setLinkDraft('')
    setError(null)
    setOk(null)
    setSavingLink(true)
    const { error: err } = await saveAtivacao(snapshot.tipo, snapshot.id, {
      carros_adesivados: snapshot.carros_adesivados,
      motos_adesivadas: snapshot.motos_adesivadas,
      adesivos_casa_status: snapshot.adesivos_casa_status,
      links: nextLinks,
      notas: snapshot.ativacao_notas || '',
      contato_whatsapp_status: snapshot.contato_whatsapp_status,
      canOverride: true,
      onlySections: 'links',
    }, snapshot)
    setSavingLink(false)
    if (err) {
      setLinks(links)
      setError(err)
      return
    }
    const refreshed = await fetchAtivacaoPessoa(snapshot.tipo, snapshot.id)
    setSelected((cur) => {
      if (!cur || cur.id !== snapshot.id) return cur
      const fromDb = refreshed && refreshed.id === snapshot.id ? refreshed : null
      return {
        ...cur,
        postagem_links: fromDb?.postagem_links ?? nextLinks,
        postagens: fromDb?.postagens ?? nextLinks.length,
        formigas_links_by: fromDb?.formigas_links_by ?? cur.formigas_links_by ?? profile?.id ?? null,
        formigas_links_by_nome: fromDb?.formigas_links_by_nome ?? cur.formigas_links_by_nome ?? profile?.nome ?? null,
        formigas_links_em: fromDb?.formigas_links_em ?? cur.formigas_links_em ?? new Date().toISOString(),
        ativacao_em: fromDb?.ativacao_em ?? cur.ativacao_em ?? new Date().toISOString(),
      }
    })
    if (refreshed?.id === snapshot.id) setLinks([...refreshed.postagem_links])
    setLinkJustSaved(url)
    setOk('Link salvo.')
    window.setTimeout(() => setLinkJustSaved((cur) => (cur === url ? null : cur)), 4000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (dirtyPrompt || skipSaveRef.current) return
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
      ;(document.activeElement as HTMLElement | null)?.blur?.()
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
  const proximoBusy = claiming || saving || savingLink || dirtyPrompt !== null
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
      ? 'Você mexeu nesta ficha. Salve para guardar, descarte para ir ao próximo sem salvar, ou cancele para continuar editando.'
      : dirtyPrompt === 'limpar'
        ? 'Há alterações pendentes. Salve antes de limpar, descarte tudo sem salvar, ou cancele.'
        : 'Há alterações pendentes. Salve, descarte sem salvar, ou cancele para continuar nesta ficha.'

  return (
    <div className="fl-page fl-page-lancar">
      <div className="fl-page-head fl-page-head-compact">
        <div>
          <h1 className="fl-title">Lançar Formigas</h1>
          <p className="fl-subtitle">
            Qualquer formiga edita qualquer parte. O aviso mostra quem preencheu; ao salvar, o nome passa a ser o seu.
          </p>
        </div>
        <button type="button" className="fl-btn-secondary fl-btn-painel-desktop" onClick={() => navigate('/ativacao/painel')}>
          Ver Painel
        </button>
      </div>

      <form
        id="fl-lancar-form"
        className="fl-card fl-card-sheet"
        onSubmit={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
          }
        }}
      >
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
                      {s.telefone ? ` · ${s.telefone}` : ''}
                      {s.bairro ? ` · ${s.bairro}` : ''}
                      {s.coordenador ? ` · Coord. ${s.coordenador}` : ''}
                      {s.lider ? ` · Lid. ${s.lider}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {searching && <p className="fl-hint">Buscando…</p>}

            {selected && (
              <div className="fl-person">
                <div className="fl-person-avatar">{initials}</div>
                <div className="fl-person-main">
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
                  <button
                    type="button"
                    className="fl-hist-ficha-btn"
                    onClick={() => setHistOpen(true)}
                  >
                    <History size={14} strokeWidth={2.25} />
                    Histórico desta ficha
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={`fl-block${isFormActive ? ' is-wa' : ''}${isFormActive && !editWa && selected?.formigas_wa_by ? ' is-locked' : ''}`}>
            <div className="fl-block-top">
              <div className="fl-block-title">
                <div className="fl-icon tone-wa is-brand">
                  <WhatsAppIcon size={20} />
                </div>
                <h3>WhatsApp</h3>
              </div>
              <div className="fl-block-meta">
                <FormigasLockChip
                  ownerId={selected?.formigas_wa_by}
                  ownerNome={selected?.formigas_wa_by_nome}
                  {...lockChipProps}
                />
                <span className={`fl-pill${contatoStatus === 'sim' ? ' ok' : contatoStatus === 'sem' ? ' warn' : ''}`}>
                  {isFormActive ? waStatusLabel(contatoStatus) : 'Ainda não'}
                </span>
              </div>
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
                {!hasWhatsappPhone(selected.telefone) && (
                  <p className="fl-hint fl-lock-hint" role="status">
                    Esta ficha não tem número de WhatsApp. Dá para marcar o status, mas não abre conversa daqui.
                  </p>
                )}
                {selected.formigas_wa_by ? (
                  <FormigasSectionLock
                    ownerId={selected.formigas_wa_by}
                    ownerNome={selected.formigas_wa_by_nome}
                    at={selected.formigas_wa_em}
                    userId={profile?.id}
                  />
                ) : null}
                {waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fl-btn-wa fl-btn-wa-main"
                  >
                    <ExternalLink size={16} />
                    Enviar mensagem
                  </a>
                ) : (
                  <button type="button" className="fl-btn-wa fl-btn-wa-main is-disabled" disabled>
                    <ExternalLink size={16} />
                    Ficha sem WhatsApp
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
                <p className="fl-hint">Abrir a conversa não altera o registro. Depois do envio, marque “Já acionada”.</p>
              </div>
            )}
          </div>

          <div className="fl-grid-2">
            <div className={`fl-block${isFormActive ? ' is-active' : ''}${isFormActive && !editCarros && selected?.formigas_carros_by ? ' is-locked' : ''}`}>
              <div className="fl-block-top">
                <div className="fl-block-title">
                  <div className="fl-icon tone-blue"><Car size={20} /></div>
                  <h3>Veículos adesivados</h3>
                </div>
                <div className="fl-block-meta">
                  <FormigasLockChip
                    ownerId={selected?.formigas_carros_by}
                    ownerNome={selected?.formigas_carros_by_nome}
                    {...lockChipProps}
                  />
                  <span className="fl-pill">
                    {(veiculoCarro ? carros : 0) + (veiculoMoto ? motos : 0)} veículo
                    {(veiculoCarro ? carros : 0) + (veiculoMoto ? motos : 0) === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              {isFormActive && selected?.formigas_carros_by ? (
                <FormigasSectionLock
                  ownerId={selected.formigas_carros_by}
                  ownerNome={selected.formigas_carros_by_nome}
                  at={selected.formigas_carros_em}
                  userId={profile?.id}
                />
              ) : null}
              <label className="fl-label-sm">Tipo de veículo</label>
              <div className="fl-veiculo-tipos" role="group" aria-label="Tipo de veículo">
                <button
                  type="button"
                  className={`fl-veiculo-tipo${veiculoCarro ? ' is-on' : ''}`}
                  disabled={!isFormActive || !editCarros}
                  aria-pressed={veiculoCarro}
                  onClick={() => {
                    setVeiculoCarro((on) => {
                      const next = !on
                      if (next && carros === 0) setCarros(1)
                      if (!next) setCarros(0)
                      return next
                    })
                  }}
                >
                  <Car size={18} strokeWidth={2.25} />
                  <span>Carro</span>
                </button>
                <button
                  type="button"
                  className={`fl-veiculo-tipo${veiculoMoto ? ' is-on' : ''}`}
                  disabled={!isFormActive || !editCarros}
                  aria-pressed={veiculoMoto}
                  onClick={() => {
                    setVeiculoMoto((on) => {
                      const next = !on
                      if (next && motos === 0) setMotos(1)
                      if (!next) setMotos(0)
                      return next
                    })
                  }}
                >
                  <Bike size={18} strokeWidth={2.25} />
                  <span>Moto</span>
                </button>
              </div>

              {(veiculoCarro || veiculoMoto) && (
                <div className={`fl-veiculo-qtds${veiculoCarro && veiculoMoto ? ' is-both' : ''}`}>
                  {veiculoCarro && (
                    <div className="fl-veiculo-qtd">
                      <label className="fl-label-sm">
                        <Car size={14} /> Quantidade de carros
                      </label>
                      <div className="fl-stepper">
                        <button
                          type="button"
                          disabled={!isFormActive || !editCarros}
                          onClick={() => setCarros((n) => Math.max(0, n - 1))}
                          aria-label="Diminuir carros"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          inputMode="numeric"
                          disabled={!isFormActive || !editCarros}
                          value={String(carros)}
                          onKeyDown={preventEnterSubmit}
                          onChange={(e) => setCarros(Math.max(0, Number(e.target.value.replace(/\D/g, '') || 0)))}
                        />
                        <button
                          type="button"
                          disabled={!isFormActive || !editCarros}
                          onClick={() => setCarros((n) => n + 1)}
                          aria-label="Aumentar carros"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                  {veiculoMoto && (
                    <div className="fl-veiculo-qtd">
                      <label className="fl-label-sm">
                        <Bike size={14} /> Quantidade de motos
                      </label>
                      <div className="fl-stepper">
                        <button
                          type="button"
                          disabled={!isFormActive || !editCarros}
                          onClick={() => setMotos((n) => Math.max(0, n - 1))}
                          aria-label="Diminuir motos"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          inputMode="numeric"
                          disabled={!isFormActive || !editCarros}
                          value={String(motos)}
                          onKeyDown={preventEnterSubmit}
                          onChange={(e) => setMotos(Math.max(0, Number(e.target.value.replace(/\D/g, '') || 0)))}
                        />
                        <button
                          type="button"
                          disabled={!isFormActive || !editCarros}
                          onClick={() => setMotos((n) => n + 1)}
                          aria-label="Aumentar motos"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {isFormActive && (veiculoCarro || veiculoMoto) && (
                <FormigasFotoField
                  label="Fotos do veículo adesivado"
                  keptPaths={fotoVeiculoKeep}
                  onKeptPathsChange={setFotoVeiculoKeep}
                  newFiles={fotoVeiculoFiles}
                  onNewFilesChange={setFotoVeiculoFiles}
                  disabled={!editCarros || saving}
                  requiredHint="Obrigatório: pelo menos 1 foto (máx. 3). Toque para ampliar."
                />
              )}
              {isFormActive && !veiculoCarro && !veiculoMoto && (
                <p className="fl-hint" style={{ marginTop: '.65rem', marginBottom: 0 }}>
                  Selecione carro e/ou moto para informar a quantidade.
                </p>
              )}
            </div>

            <div className={`fl-block${isFormActive ? ' is-active' : ''}${isFormActive && !editCasa && selected?.formigas_casa_by ? ' is-locked' : ''}`}>
              <div className="fl-block-top">
                <div className="fl-block-title">
                  <div className="fl-icon tone-teal"><Home size={20} /></div>
                  <h3>Adesivo residencial</h3>
                </div>
                <div className="fl-block-meta">
                  <FormigasLockChip
                    ownerId={selected?.formigas_casa_by}
                    ownerNome={selected?.formigas_casa_by_nome}
                    {...lockChipProps}
                  />
                  <span className={`fl-pill${casaStatus === 'sim' ? ' teal' : casaStatus === 'talvez' ? ' warn' : ''}`}>
                    {isFormActive ? casaStatusLabel(casaStatus) : 'Ainda não'}
                  </span>
                </div>
              </div>
              {isFormActive && selected?.formigas_casa_by ? (
                <FormigasSectionLock
                  ownerId={selected.formigas_casa_by}
                  ownerNome={selected.formigas_casa_by_nome}
                  at={selected.formigas_casa_em}
                  userId={profile?.id}
                />
              ) : null}
              <label className="fl-label-sm">Confirmação de campo</label>
              <div className="fl-wa-segment fl-wa-segment-3">
                <SegmentedControl
                  disabled={!isFormActive || !editCasa}
                  options={[
                    { label: 'Não possui', value: 'nao' },
                    { label: 'Talvez', value: 'talvez' },
                    { label: 'Possui adesivo', value: 'sim' },
                  ]}
                  value={casaStatus}
                  onChange={(v) => setCasaStatus(v as AdesivosCasaStatus)}
                />
              </div>
              {isFormActive && showCasaAddr && (
                <div className="fl-casa-addr">
                  <p className="fl-hint">
                    {casaStatus === 'talvez'
                      ? 'Endereço opcional. Se quiser, informe CEP/rua para aparecer no mapa — basta marcar Talvez.'
                      : (selected?.tipo === 'eleitor'
                        ? `Endereço opcional. Para “Possui adesivo”, a foto já basta${
                            (selected.cep || selected.endereco)
                              ? ' (pode ajustar o endereço da ficha se quiser).'
                              : '.'
                          }`
                        : 'Endereço opcional. Para “Possui adesivo”, a foto já basta; CEP/rua só se quiser no mapa.')}
                  </p>
                  <div className="fl-casa-addr-grid">
                    <label className="fl-field fl-casa-cep">
                      <span>CEP</span>
                      <input
                        inputMode="numeric"
                        disabled={!editCasaAddr || saving}
                        value={casaCep}
                        placeholder="00000-000"
                        onKeyDown={preventEnterSubmit}
                        onChange={(e) => {
                          const next = formatCep(e.target.value)
                          setCasaCep(next)
                          if (next.replace(/\D/g, '').length === 8) void fillFromCep(next)
                        }}
                      />
                      {cepLoading ? <em className="fl-cep-loading">Buscando…</em> : null}
                    </label>
                    <label className="fl-field fl-casa-num">
                      <span>Nº</span>
                      <input
                        disabled={!editCasaAddr || saving}
                        value={casaNumero}
                        placeholder="nº"
                        onKeyDown={preventEnterSubmit}
                        onChange={(e) => setCasaNumero(e.target.value)}
                      />
                    </label>
                    <label className="fl-field fl-casa-rua">
                      <span>Endereço</span>
                      <input
                        disabled={!editCasaAddr || saving}
                        value={casaEndereco}
                        placeholder="Rua / avenida"
                        onKeyDown={preventEnterSubmit}
                        onChange={(e) => setCasaEndereco(e.target.value)}
                      />
                    </label>
                    <label className="fl-field fl-casa-bairro">
                      <span>Bairro</span>
                      <input
                        disabled={!editCasaAddr || saving}
                        value={casaBairro}
                        placeholder="Bairro"
                        onKeyDown={preventEnterSubmit}
                        onChange={(e) => setCasaBairro(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}
              {isFormActive && (casaStatus === 'sim' || casaStatus === 'talvez') && (
                <FormigasFotoField
                  label="Fotos da casa adesivada"
                  keptPaths={fotoCasaKeep}
                  onKeptPathsChange={setFotoCasaKeep}
                  newFiles={fotoCasaFiles}
                  onNewFilesChange={setFotoCasaFiles}
                  disabled={!editCasa || saving}
                  requiredHint={
                    casaStatus === 'sim'
                      ? 'Obrigatório: pelo menos 1 foto (máx. 3). Toque para ampliar.'
                      : 'Opcional no Talvez: pode carregar ou trocar fotos (máx. 3).'
                  }
                />
              )}
            </div>
          </div>

          <div className={`fl-block${isFormActive ? ' is-active' : ''}${isFormActive && !editLinks && selected?.formigas_links_by ? ' is-locked' : ''}`}>
            <div className="fl-block-top">
              <div className="fl-block-title">
                <div className="fl-icon tone-violet"><Link2 size={20} /></div>
                <h3>Links de postagem</h3>
              </div>
              <div className="fl-block-meta">
                <FormigasLockChip
                  ownerId={selected?.formigas_links_by}
                  ownerNome={selected?.formigas_links_by_nome}
                  {...lockChipProps}
                />
                <span className="fl-pill">{links.length} postagem{links.length === 1 ? '' : 's'}</span>
              </div>
            </div>
            {isFormActive && selected?.formigas_links_by ? (
              <FormigasSectionLock
                ownerId={selected.formigas_links_by}
                ownerNome={selected.formigas_links_by_nome}
                at={selected.formigas_links_em}
                userId={profile?.id}
              />
            ) : null}
            <p className="fl-hint">Cole o link da rede social e toque em Salvar link. Cada um conta como 1 postagem.</p>
            <div className="fl-link-row">
              <input
                type="url"
                placeholder="https://instagram.com/…"
                value={linkDraft}
                disabled={!isFormActive || !editLinks || savingLink}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (editLinks) void handleSaveLink()
                  }
                }}
              />
              <button
                type="button"
                className="fl-btn-dark fl-btn-save-link"
                disabled={!isFormActive || !editLinks || savingLink || !linkDraft.trim()}
                onClick={() => void handleSaveLink()}
              >
                <CheckCircle2 size={16} /> {savingLink ? 'Salvando…' : 'Salvar link'}
              </button>
            </div>
            {links.length > 0 && (
              <ul className="fl-links">
                {links.map((url) => (
                  <li key={url} className={url === linkJustSaved ? 'is-just-saved' : undefined}>
                    <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                    {url === linkJustSaved ? <span className="fl-link-saved">Salvo</span> : null}
                    <button
                      type="button"
                      disabled={!editLinks || savingLink}
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
            disabled={!isFormActive || saving || savingLink || !isDirty}
          >
            <CheckCircle2 size={20} />
            {saveLabel}
          </button>
          <button
            type="button"
            className="fl-btn-secondary"
            disabled={!isFormActive || saving || savingLink}
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
          disabled={!isFormActive || saving || savingLink || !isDirty}
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
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void confirmDirtyLimpar()
                  }}
                >
                  Descartar sem salvar
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

      {selected && (
        <FormigasFichaHistoricoDrawer
          open={histOpen}
          onClose={() => setHistOpen(false)}
          tipo={selected.tipo}
          pessoaId={selected.id}
          pessoaNome={selected.nome}
        />
      )}
    </div>
  )
}
