import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, FileSearch, Phone, Plus, Search, UserPlus, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import {
  createDemanda,
  searchCadastrosDemanda,
  type DemandaCadastroHit,
} from '../lib/demandas'
import { formatPhone } from '../lib/format'
import type { DemandaUrgencia } from '../types'

type Mode = 'buscar' | 'avulso'

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

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

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

  function switchMode(next: Mode) {
    setMode(next)
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
    setError(null)
    setOk(null)
  }

  function onFoto(file: File | null) {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview)
    setFoto(file)
    setFotoPreview(file ? URL.createObjectURL(file) : null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.id) return
    setError(null)
    setOk(null)

    if (mode === 'buscar' && !selected) {
      setError('Selecione uma pessoa do cadastro ou use o modo avulso.')
      return
    }

    setSaving(true)
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

  return (
    <div className="dm-page">
      <div className="dm-header">
        <div>
          <p className="dm-kicker">Demandas</p>
          <h1>Lançar demanda</h1>
          <p className="dm-sub">Vincule a um cadastro existente ou registre um atendimento avulso.</p>
        </div>
        <Link to="/demandas/painel" className="dm-link">Ver demandas</Link>
      </div>

      <div className="dm-mode">
        <button
          type="button"
          className={`dm-mode-btn${mode === 'buscar' ? ' active' : ''}`}
          onClick={() => switchMode('buscar')}
        >
          <FileSearch size={14} /> Do cadastro
        </button>
        <button
          type="button"
          className={`dm-mode-btn${mode === 'avulso' ? ' active' : ''}`}
          onClick={() => switchMode('avulso')}
        >
          <UserPlus size={14} /> Avulso
        </button>
      </div>

      <form className="dm-card" onSubmit={handleSubmit}>
        {mode === 'buscar' ? (
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
              {mode === 'buscar' && selected?.telefone ? (
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
              <Plus size={14} /> Anexar imagem
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
          <button
            type="submit"
            className="dm-submit"
            disabled={saving || (mode === 'buscar' && !selected)}
          >
            {saving ? <Spinner size={16} /> : 'Registrar demanda'}
          </button>
        </div>
      </form>
    </div>
  )
}
