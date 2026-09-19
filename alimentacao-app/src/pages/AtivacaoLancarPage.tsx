import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Car, Home, Link2, Plus, Save, Search, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  fetchAtivacaoKpis,
  fetchAtivacaoPessoa,
  saveAtivacao,
  searchAtivacaoPessoas,
  type AtivacaoPessoa,
} from '../lib/ativacao'

export function AtivacaoLancarPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preTipo = searchParams.get('tipo') as AtivacaoPessoa['tipo'] | null
  const preId = searchParams.get('id')

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AtivacaoPessoa[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<AtivacaoPessoa | null>(null)
  const [carros, setCarros] = useState(0)
  const [casa, setCasa] = useState(false)
  const [links, setLinks] = useState<string[]>([])
  const [linkDraft, setLinkDraft] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [kpis, setKpis] = useState({ carros: 0, casas: 0, postagens: 0, pendentes: 0 })

  useEffect(() => {
    void fetchAtivacaoKpis().then(setKpis).catch(() => undefined)
  }, [])

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
    setLinkDraft('')
  }

  function addLink() {
    const url = linkDraft.trim()
    if (!url) return
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
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setOk('Lançamento salvo com sucesso.')
    const refreshed = await fetchAtivacaoPessoa(selected.tipo, selected.id)
    if (refreshed) selectPerson(refreshed)
    void fetchAtivacaoKpis().then(setKpis).catch(() => undefined)
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
    <div className="ativacao-page nv-dash">
      <div className="page-header">
        <div>
          <h1 className="page-title">Lançar Formigas</h1>
          <p className="page-subtitle">
            Localize a pessoa e registre carros, casa adesivada e links de postagem.
          </p>
        </div>
        <div className="page-header-actions">
          <Button variant="secondary" onClick={() => navigate('/ativacao/painel')}>
            Ver Painel
          </Button>
        </div>
      </div>

      <div className="ativacao-kpi-grid">
        <div className="ativacao-kpi"><span>Carros</span><strong>{kpis.carros}</strong></div>
        <div className="ativacao-kpi"><span>Casas</span><strong>{kpis.casas}</strong></div>
        <div className="ativacao-kpi"><span>Postagens</span><strong>{kpis.postagens}</strong></div>
        <div className="ativacao-kpi"><span>Pendentes</span><strong>{kpis.pendentes}</strong></div>
      </div>

      <form className="ativacao-card" onSubmit={handleSave}>
        <div className="ativacao-card-head">
          <div>
            <h2>Registro — Formigas</h2>
            <p>Busque por nome completo ou título de eleitor.</p>
          </div>
          <Link to="/ativacao/painel" className="ativacao-ghost-link">Consultar Painel</Link>
        </div>

        <div className="ui-field ativacao-search-wrap">
          <label className="ui-field-label" htmlFor="ativacao-busca">
            Eleitor, liderança ou coordenador
          </label>
          <div className="ativacao-search">
            <Search size={16} aria-hidden />
            <input
              id="ativacao-busca"
              className="ui-input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (selected) setSelected(null)
              }}
              placeholder="Digite o nome ou o título…"
              autoComplete="off"
            />
            {selected && (
              <button type="button" className="ativacao-clear" onClick={clearPerson} aria-label="Limpar">
                <X size={16} />
              </button>
            )}
          </div>
          {!selected && suggestions.length > 0 && (
            <div className="ativacao-suggest">
              {suggestions.map((s) => (
                <button key={s.key} type="button" onClick={() => selectPerson(s)}>
                  <strong>{s.nome}</strong>
                  <span>{s.tipoLabel}{s.titulo ? ` · Título ${s.titulo}` : ''}{s.zona ? ` · Zona ${s.zona}` : ''}</span>
                </button>
              ))}
            </div>
          )}
          {searching && <span className="ativacao-hint">Buscando…</span>}
        </div>

        {selected && (
          <div className="ativacao-person-card">
            <div className="ativacao-avatar">{initials}</div>
            <div>
              <div className="ativacao-person-name">
                <strong>{selected.nome}</strong>
                <span>{selected.tipoLabel}</span>
              </div>
              <p>
                {selected.titulo ? <>Título: <b>{selected.titulo}</b> · </> : null}
                {selected.zona ? <>Zona: <b>{selected.zona}</b> · </> : null}
                Bairro: <b>{selected.bairro || '—'}</b>
              </p>
            </div>
          </div>
        )}

        <div className="ativacao-action-grid">
          <div className="ativacao-action-card">
            <div className="ativacao-action-top">
              <div className="ativacao-action-icon tone-blue"><Car size={18} /></div>
              <strong>Veículos adesivados</strong>
              <span className="ativacao-badge">{carros} veículo{carros === 1 ? '' : 's'}</span>
            </div>
            <label className="ui-field-label">Quantidade</label>
            <div className="ativacao-stepper">
              <button type="button" onClick={() => setCarros((n) => Math.max(0, n - 1))}>-</button>
              <input
                className="ui-input"
                inputMode="numeric"
                value={carros ? String(carros) : '0'}
                onChange={(e) => setCarros(Math.max(0, Number(e.target.value.replace(/\D/g, '') || 0)))}
              />
              <button type="button" onClick={() => setCarros((n) => n + 1)}>+</button>
            </div>
          </div>

          <div className="ativacao-action-card">
            <div className="ativacao-action-top">
              <div className="ativacao-action-icon tone-green"><Home size={18} /></div>
              <strong>Adesivo residencial</strong>
              <span className="ativacao-badge">{casa ? 'Com adesivo' : 'Sem adesivo'}</span>
            </div>
            <label className="ui-field-label">Confirmação de campo</label>
            <div className="ativacao-simnao">
              <button type="button" className={!casa ? 'is-active' : ''} onClick={() => setCasa(false)}>
                Não possui
              </button>
              <button type="button" className={casa ? 'is-active yes' : ''} onClick={() => setCasa(true)}>
                Possui adesivo
              </button>
            </div>
          </div>
        </div>

        <div className="ativacao-action-card">
          <div className="ativacao-action-top">
            <div className="ativacao-action-icon tone-violet"><Link2 size={18} /></div>
            <strong>Links de postagem</strong>
            <span className="ativacao-badge">{links.length} postagem{links.length === 1 ? '' : 's'}</span>
          </div>
          <p className="ativacao-hint">Cada link válido conta como 1 postagem.</p>
          <div className="ativacao-link-row">
            <Input
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              placeholder="https://instagram.com/…"
            />
            <Button type="button" variant="secondary" onClick={addLink}>
              <Plus size={16} /> Adicionar
            </Button>
          </div>
          {links.length > 0 && (
            <ul className="ativacao-links">
              {links.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                  <button type="button" onClick={() => setLinks((prev) => prev.filter((l) => l !== url))} aria-label="Remover">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ui-field">
          <label className="ui-field-label" htmlFor="ativacao-notas">Observações</label>
          <textarea
            id="ativacao-notas"
            className="ui-input ativacao-notes"
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Anotações de campo (opcional)"
          />
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {ok && <div className="alert alert-success">{ok}</div>}

        <div className="ativacao-form-actions">
          <Button type="submit" loading={saving} disabled={!selected}>
            <Save size={16} /> Salvar lançamento
          </Button>
          <Button type="button" variant="secondary" onClick={clearPerson}>Limpar</Button>
        </div>
      </form>
    </div>
  )
}
