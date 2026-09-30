import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Check,
  Eye,
  ImagePlus,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import {
  fetchAuxiliarLiderNomes,
  getVotacaoFicha,
  salvarLancamentoVotacao,
  searchVotacaoFichas,
  signVotoFoto,
  type VotacaoHit,
} from '../lib/votacao'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/roles'

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

function toInputDate(iso: string | null | undefined) {
  if (!iso) return ''
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/)
  return m?.[1] ?? ''
}

export function VotacaoLancarPage() {
  const { profile } = useAuth()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [liderNomes, setLiderNomes] = useState<string[]>([])
  const [coordNome, setCoordNome] = useState<string | null>(null)
  const [loadingScope, setLoadingScope] = useState(true)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<VotacaoHit[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<VotacaoHit | null>(null)
  const [viewOnly, setViewOnly] = useState(false)

  const [votou, setVotou] = useState<boolean | null>(null)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [clearFoto, setClearFoto] = useState(false)

  const [nome, setNome] = useState('')
  const [titulo, setTitulo] = useState('')
  const [zona, setZona] = useState('')
  const [secao, setSecao] = useState('')
  const [nomeMae, setNomeMae] = useState('')
  const [nascimento, setNascimento] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const isAuxiliar = hasRole(profile, 'auxiliar')

  useEffect(() => {
    let cancelled = false
    async function loadScope() {
      setLoadingScope(true)
      try {
        if (isAuxiliar && profile?.id) {
          const nomes = await fetchAuxiliarLiderNomes(profile.id)
          if (!cancelled) setLiderNomes(nomes)
        } else if (hasRole(profile, 'coordenador') && profile?.coordenador_id) {
          const { data } = await supabase
            .from('coordenadores')
            .select('nome')
            .eq('id', profile.coordenador_id)
            .maybeSingle()
          if (!cancelled) setCoordNome(data?.nome ?? null)
        } else if (hasRole(profile, 'coordenador') && profile?.id) {
          const { data } = await supabase
            .from('coordenadores')
            .select('nome')
            .eq('user_id', profile.id)
            .maybeSingle()
          if (!cancelled) setCoordNome(data?.nome ?? null)
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar as lideranças do auxiliar.')
      } finally {
        if (!cancelled) setLoadingScope(false)
      }
    }
    void loadScope()
    return () => { cancelled = true }
  }, [profile, isAuxiliar])

  useEffect(() => {
    if (!fotoFile) {
      setFotoPreview(null)
      return
    }
    const url = URL.createObjectURL(fotoFile)
    setFotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [fotoFile])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    if (isAuxiliar && !liderNomes.length) {
      setHits([])
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        setSearching(true)
        setError(null)
        try {
          const rows = await searchVotacaoFichas({
            query: q,
            liderNomes: isAuxiliar ? liderNomes : undefined,
            coordenadorNome: !isAuxiliar ? coordNome : undefined,
          })
          if (!cancelled) setHits(rows)
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Falha na busca.')
        } finally {
          if (!cancelled) setSearching(false)
        }
      })()
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query, liderNomes, coordNome, isAuxiliar])

  async function openFicha(hit: VotacaoHit, onlyView: boolean) {
    setError(null)
    setOkMsg(null)
    setViewOnly(onlyView)
    setSelected(hit)
    setVotou(hit.votou ?? null)
    setFotoFile(null)
    setClearFoto(false)
    setNome(hit.nome_completo ?? '')
    setTitulo(hit.titulo ?? '')
    setZona(hit.zona ?? '')
    setSecao(hit.secao ?? '')
    setNomeMae(hit.nome_mae ?? '')
    setNascimento(toInputDate(hit.data_nascimento))
    if (hit.voto_foto_path) {
      const url = await signVotoFoto(hit.voto_foto_path)
      setFotoPreview(url)
    } else {
      setFotoPreview(null)
    }
  }

  function closeFicha() {
    setSelected(null)
    setViewOnly(false)
    setFotoFile(null)
    setFotoPreview(null)
    setClearFoto(false)
    setOkMsg(null)
  }

  function onPickFile(file: File | null) {
    if (!file) return
    setClearFoto(false)
    setFotoFile(file)
  }

  async function handleSave() {
    if (!selected || !profile?.id) return
    if (votou === null) {
      setError('Selecione Votou ou Não votou.')
      return
    }
    setSaving(true)
    setError(null)
    setOkMsg(null)
    try {
      const saved = await salvarLancamentoVotacao({
        cadastroId: selected.id,
        userId: profile.id,
        votou,
        fotoFile,
        clearFoto: clearFoto && !fotoFile,
        correcoes: {
          nome_completo: nome,
          titulo,
          zona,
          secao,
          nome_mae: nomeMae,
          data_nascimento: nascimento || null,
        },
      })
      setSelected(saved)
      setHits((prev) => prev.map((h) => (h.id === saved.id ? { ...h, ...saved } : h)))
      setFotoFile(null)
      setClearFoto(false)
      if (saved.voto_foto_path) {
        setFotoPreview(await signVotoFoto(saved.voto_foto_path))
      }
      setOkMsg('Lançamento salvo.')
      setViewOnly(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function refreshSelected() {
    if (!selected) return
    const fresh = await getVotacaoFicha(selected.id)
    if (fresh) await openFicha(fresh, viewOnly)
  }

  const scopeHint = useMemo(() => {
    if (isAuxiliar) {
      if (!liderNomes.length) return 'Nenhuma liderança atribuída. Peça ao coordenador.'
      return `${liderNomes.length} liderança${liderNomes.length === 1 ? '' : 's'} liberada${liderNomes.length === 1 ? '' : 's'}`
    }
    return coordNome ? `Coordenação: ${coordNome}` : 'Sua coordenação'
  }, [isAuxiliar, liderNomes, coordNome])

  if (loadingScope) {
    return (
      <div className="vot-page vot-center">
        <Spinner size={36} />
      </div>
    )
  }

  return (
    <div className="vot-page">
      <header className="vot-head">
        <h1 className="vot-title">Lançar votação</h1>
        <p className="vot-sub">{scopeHint}</p>
      </header>

      {!selected && (
        <>
          <div className="vot-search">
            <Search size={18} aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome ou título de eleitor"
              autoComplete="off"
              enterKeyHint="search"
            />
            {query && (
              <button type="button" className="vot-clear" onClick={() => setQuery('')} aria-label="Limpar">
                <X size={16} />
              </button>
            )}
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {searching && (
            <div className="vot-center vot-muted">
              <Spinner size={22} /> Buscando…
            </div>
          )}

          {!searching && query.trim().length >= 2 && !hits.length && (
            <p className="vot-empty">Nenhuma ficha encontrada.</p>
          )}

          <ul className="vot-list">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" className="vot-hit" onClick={() => void openFicha(h, false)}>
                  <div className="vot-hit-main">
                    <strong>{h.nome_completo}</strong>
                    <span>
                      Título {h.titulo || '—'} · Zona {h.zona || '—'} · Seção {h.secao || '—'}
                    </span>
                    <em>{h.lider || 'Sem liderança'}</em>
                  </div>
                  <span className={`vot-badge${h.votou === true ? ' is-yes' : h.votou === false ? ' is-no' : ''}`}>
                    {h.votou === true ? 'Votou' : h.votou === false ? 'Não' : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selected && (
        <div className="vot-ficha">
          <div className="vot-ficha-bar">
            <button type="button" className="vot-back" onClick={closeFicha}>
              ← Voltar
            </button>
            <div className="vot-ficha-actions">
              {viewOnly ? (
                <button type="button" className="vot-btn ghost" onClick={() => setViewOnly(false)}>
                  Editar
                </button>
              ) : (
                <button type="button" className="vot-btn ghost" onClick={() => void refreshSelected().then(() => setViewOnly(true))}>
                  <Eye size={16} /> Ver
                </button>
              )}
            </div>
          </div>

          {okMsg && <div className="alert alert-success">{okMsg}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          <div className="vot-status">
            <button
              type="button"
              disabled={viewOnly}
              className={`vot-choice yes${votou === true ? ' active' : ''}`}
              onClick={() => setVotou(true)}
            >
              <Check size={18} /> Votou
            </button>
            <button
              type="button"
              disabled={viewOnly}
              className={`vot-choice no${votou === false ? ' active' : ''}`}
              onClick={() => setVotou(false)}
            >
              <X size={18} /> Não votou
            </button>
          </div>

          <div className="vot-fields">
            <label>
              Nome
              <input value={nome} disabled={viewOnly} onChange={(e) => setNome(e.target.value)} />
            </label>
            <label>
              Título
              <input value={titulo} disabled={viewOnly} inputMode="numeric" onChange={(e) => setTitulo(e.target.value)} />
            </label>
            <div className="vot-row2">
              <label>
                Zona
                <input value={zona} disabled={viewOnly} inputMode="numeric" onChange={(e) => setZona(e.target.value)} />
              </label>
              <label>
                Seção
                <input value={secao} disabled={viewOnly} inputMode="numeric" onChange={(e) => setSecao(e.target.value)} />
              </label>
            </div>
            <label>
              Nome da mãe
              <input value={nomeMae} disabled={viewOnly} onChange={(e) => setNomeMae(e.target.value)} />
            </label>
            <label>
              Data de nascimento
              <input
                type="date"
                value={nascimento}
                disabled={viewOnly}
                onChange={(e) => setNascimento(e.target.value)}
              />
            </label>
            <div className="vot-meta">
              <span>Liderança: <strong>{selected.lider || '—'}</strong></span>
              <span>Coord.: <strong>{selected.coordenador || '—'}</strong></span>
              {selected.voto_em && (
                <span>Último lançamento: {fmtDate(selected.voto_em)}</span>
              )}
            </div>
          </div>

          <div className="vot-foto">
            <div className="vot-foto-label">Foto do lançamento</div>
            {fotoPreview ? (
              <div className="vot-foto-preview">
                <img src={fotoPreview} alt="Comprovante" />
                {!viewOnly && (
                  <button
                    type="button"
                    className="vot-foto-remove"
                    onClick={() => {
                      setFotoFile(null)
                      setFotoPreview(null)
                      setClearFoto(true)
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
            ) : (
              <p className="vot-muted">Nenhuma foto anexada.</p>
            )}
            {!viewOnly && (
              <div className="vot-foto-btns">
                <button type="button" className="vot-btn" onClick={() => cameraRef.current?.click()}>
                  <Camera size={18} /> Câmera
                </button>
                <button type="button" className="vot-btn ghost" onClick={() => galleryRef.current?.click()}>
                  <ImagePlus size={18} /> Galeria
                </button>
              </div>
            )}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {!viewOnly && (
            <button type="button" className="vot-save" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
