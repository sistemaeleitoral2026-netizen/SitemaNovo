import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Car,
  CheckCircle2,
  ExternalLink,
  Home,
  Link2,
  Minus,
  Plus,
  Search,
  Share2,
  X,
  MessageCircle,
  Clock3,
} from 'lucide-react'
import { buildWhatsAppUrl } from '../lib/whatsapp'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchAtivacaoKpis,
  fetchAtivacaoPessoa,
  saveAtivacao,
  searchAtivacaoPessoas,
  type AtivacaoPessoa,
} from '../lib/ativacao'

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
  const scopeDiretoriaId = profile?.role === 'diretoria' ? profile.id : undefined

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AtivacaoPessoa[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<AtivacaoPessoa | null>(null)
  const [carros, setCarros] = useState(0)
  const [casa, setCasa] = useState(false)
  const [links, setLinks] = useState<string[]>([])
  const [linkDraft, setLinkDraft] = useState('')
  const [notas, setNotas] = useState('')
  const [contatoWhatsapp, setContatoWhatsapp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [kpis, setKpis] = useState({ carros: 0, casas: 0, postagens: 0, whatsapp: 0, pendentes: 0 })

  const isFormActive = selected !== null
  const waUrl = buildWhatsAppUrl(selected?.telefone)

  useEffect(() => {
    void fetchAtivacaoKpis({
      tipo: 'todos',
      diretoria_id: scopeDiretoriaId,
    }).then(setKpis).catch(() => undefined)
  }, [scopeDiretoriaId])

  useEffect(() => {
    if (!preId || !preTipo) return
    if (!['eleitor', 'lideranca', 'coordenador'].includes(preTipo)) return
    void fetchAtivacaoPessoa(preTipo, preId).then((p) => {
      if (p) selectPerson(p)
    })
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
    setContatoWhatsapp(Boolean(p.contato_whatsapp))
    setError(null)
    setOk(null)
  }

  function clearPerson() {
    setSelected(null)
    setQuery('')
    setCarros(0)
    setCasa(false)
    setLinks([])
    setNotas('')
    setContatoWhatsapp(false)
    setLinkDraft('')
    setError(null)
    setOk(null)
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
    setSaving(true)
    setError(null)
    setOk(null)
    const { error: err } = await saveAtivacao(selected.tipo, selected.id, {
      carros_adesivados: carros,
      casa,
      links,
      notas,
      contato_whatsapp: contatoWhatsapp,
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setOk('Lançamento salvo com sucesso.')
    const refreshed = await fetchAtivacaoPessoa(selected.tipo, selected.id)
    if (refreshed) selectPerson(refreshed)
    void fetchAtivacaoKpis({
      tipo: 'todos',
      diretoria_id: scopeDiretoriaId,
    }).then(setKpis).catch(() => undefined)
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

  return (
    <div className="fl-page">
      <div className="fl-page-head">
        <div>
          <h1 className="fl-title">Lançar Formigas</h1>
          <p className="fl-subtitle">
            Localize a pessoa e registre carros, casa adesivada e links de postagem.
          </p>
        </div>
        <button type="button" className="fl-btn-secondary" onClick={() => navigate('/ativacao/painel')}>
          Ver Painel
        </button>
      </div>

      <div className="fl-stats">
        {(
          [
            {
              key: 'carros',
              label: 'Carros',
              value: kpis.carros,
              Icon: Car,
              tone: 'blue',
              to: '/ativacao/painel?equipe=todos&status=com_carro',
            },
            {
              key: 'casas',
              label: 'Casas',
              value: kpis.casas,
              Icon: Home,
              tone: 'teal',
              to: '/ativacao/painel?equipe=todos&status=casa_sim',
            },
            {
              key: 'postagens',
              label: 'Postagens',
              value: kpis.postagens,
              Icon: Share2,
              tone: 'violet',
              to: '/ativacao/painel?equipe=todos&status=com_links',
            },
            {
              key: 'whatsapp',
              label: 'WhatsApp',
              value: kpis.whatsapp,
              Icon: MessageCircle,
              tone: 'wa',
              to: '/ativacao/painel?equipe=todos&status=contato_sim',
            },
            {
              key: 'pendentes',
              label: 'Pendentes',
              value: kpis.pendentes,
              Icon: Clock3,
              tone: 'amber',
              to: '/ativacao/painel?equipe=todos&status=sem_ativacao',
            },
          ] as const
        ).map(({ key, label, value, Icon, tone, to }) => (
          <button
            key={key}
            type="button"
            className={`fl-stat fl-stat-card tone-${tone}`}
            onClick={() => navigate(to)}
          >
            <div className="fl-stat-top">
              <span>{label}</span>
              <div className="fl-stat-icon" aria-hidden>
                <Icon size={18} strokeWidth={2.25} />
              </div>
            </div>
            <strong>{value.toLocaleString('pt-BR')}</strong>
            <em className="fl-stat-cta">Ver no painel →</em>
          </button>
        ))}
      </div>

      <form className="fl-card" onSubmit={handleSave}>
        <div className="fl-card-head">
          <h2>Registro — Formigas</h2>
          <Link to="/ativacao/painel" className="fl-link">Consultar Painel</Link>
        </div>

        <div className="fl-card-body">
          <div className="fl-field">
            <label htmlFor="fl-busca">Eleitor, liderança ou coordenador</label>
            <div className="fl-search">
              <Search className="fl-search-icon" size={20} />
              <input
                id="fl-busca"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  if (selected) setSelected(null)
                }}
                placeholder="Digite o nome ou o título…"
                autoComplete="off"
              />
              {selected && (
                <button type="button" className="fl-search-clear" onClick={clearPerson} aria-label="Limpar">
                  <X size={20} />
                </button>
              )}
            </div>

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
              <span className={`fl-pill${contatoWhatsapp ? ' ok' : ''}`}>
                {contatoWhatsapp ? 'Acionada' : 'Ainda não'}
              </span>
            </div>

            {!isFormActive ? (
              <p className="fl-hint italic">
                Selecione uma pessoa na busca acima para liberar as opções do WhatsApp.
              </p>
            ) : (
              <div className="fl-wa-body">
                <p className="fl-hint">
                  Abra a conversa e marque se essa pessoa já foi acionada pelo WhatsApp.
                </p>
                <div className="fl-wa-row">
                  <div className="fl-wa-segment">
                    <SegmentedControl
                      options={[
                        { label: 'Não acionada', value: 'nao' },
                        { label: 'Já acionada', value: 'sim' },
                      ]}
                      value={contatoWhatsapp ? 'sim' : 'nao'}
                      onChange={(v) => setContatoWhatsapp(v === 'sim')}
                    />
                  </div>
                  {waUrl ? (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="fl-btn-wa"
                      onClick={() => setContatoWhatsapp(true)}
                    >
                      <ExternalLink size={16} />
                      Abrir WhatsApp Web
                    </a>
                  ) : (
                    <button type="button" className="fl-btn-wa is-disabled" disabled>
                      <ExternalLink size={16} />
                      Sem telefone
                    </button>
                  )}
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
              <label className="fl-label-sm">Quantidade</label>
              <div className="fl-stepper">
                <button
                  type="button"
                  disabled={!isFormActive}
                  onClick={() => setCarros((n) => Math.max(0, n - 1))}
                  aria-label="Diminuir"
                >
                  <Minus size={16} />
                </button>
                <input
                  inputMode="numeric"
                  disabled={!isFormActive}
                  value={String(carros)}
                  onChange={(e) => setCarros(Math.max(0, Number(e.target.value.replace(/\D/g, '') || 0)))}
                />
                <button
                  type="button"
                  disabled={!isFormActive}
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
              <label className="fl-label-sm">Confirmação de campo</label>
              <SegmentedControl
                disabled={!isFormActive}
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
            <p className="fl-hint">Cada link válido conta como 1 postagem.</p>
            <div className="fl-link-row">
              <input
                type="url"
                placeholder="https://instagram.com/…"
                value={linkDraft}
                disabled={!isFormActive}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addLink()
                  }
                }}
              />
              <button
                type="button"
                className="fl-btn-dark"
                disabled={!isFormActive || !linkDraft.trim()}
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
              rows={5}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {ok && <div className="alert alert-success">{ok}</div>}
        </div>

        <div className="fl-card-foot">
          <button type="submit" className="fl-btn-primary" disabled={!isFormActive || saving}>
            <CheckCircle2 size={20} />
            {saving ? 'Salvando…' : 'Salvar lançamento'}
          </button>
          <button
            type="button"
            className="fl-btn-secondary"
            disabled={!isFormActive}
            onClick={clearPerson}
          >
            Limpar
          </button>
        </div>
      </form>
    </div>
  )
}
