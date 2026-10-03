import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { VotacaoBottomNav } from '../components/votacao/VotacaoBottomNav'
import {
  fetchAuxiliarLiderNomes,
  fetchVotacaoFichasPorLiderNome,
  getVotacaoFicha,
  salvarLancamentoVotacao,
  searchVotacaoFichas,
  signVotoFoto,
  type VotacaoHit,
  type VotacaoStatusFiltro,
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

function statusLabel(votou: boolean | null | undefined) {
  if (votou === true) return 'Votou'
  if (votou === false) return 'Não votou'
  return 'Pendente'
}

export function VotacaoLancarPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const editOpenedRef = useRef<string | null>(null)

  const [liderNomes, setLiderNomes] = useState<string[]>([])
  const [coordNome, setCoordNome] = useState<string | null>(null)
  const [loadingScope, setLoadingScope] = useState(true)
  const [selectedLider, setSelectedLider] = useState<string | null>(null)
  const [liderLista, setLiderLista] = useState<VotacaoHit[]>([])
  const [statusFiltro, setStatusFiltro] = useState<VotacaoStatusFiltro>('todos')
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
  const isCoordenador = hasRole(profile, 'coordenador')
  const semLiderancas = isAuxiliar && !loadingScope && liderNomes.length === 0

  useEffect(() => {
    let cancelled = false
    async function loadScope() {
      setLoadingScope(true)
      try {
        if (isAuxiliar && profile?.id) {
          const nomes = await fetchAuxiliarLiderNomes(profile.id)
          if (!cancelled) {
            setLiderNomes(nomes)
            // Uma liderança só: já seleciona; várias: usuário escolhe o botão.
            if (nomes.length === 1) setSelectedLider(nomes[0])
          }
        } else if (isCoordenador && profile?.id) {
          const { data } = await supabase
            .from('coordenadores')
            .select('nome')
            .or(`user_id.eq.${profile.id}${profile.coordenador_id ? `,id.eq.${profile.coordenador_id}` : ''}`)
            .limit(1)
            .maybeSingle()
          if (!cancelled) setCoordNome(data?.nome ?? null)
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar suas lideranças.')
      } finally {
        if (!cancelled) setLoadingScope(false)
      }
    }
    void loadScope()
    return () => { cancelled = true }
  }, [profile, isAuxiliar, isCoordenador])

  useEffect(() => {
    if (!fotoFile) return
    const url = URL.createObjectURL(fotoFile)
    setFotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [fotoFile])

  // Auxiliar: carrega lista completa da liderança escolhida.
  useEffect(() => {
    if (!isAuxiliar || !selectedLider) {
      setLiderLista([])
      return
    }
    let cancelled = false
    setSearching(true)
    setError(null)
    void (async () => {
      try {
        const rows = await fetchVotacaoFichasPorLiderNome(selectedLider)
        if (!cancelled) setLiderLista(rows)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar a liderança.')
          setLiderLista([])
        }
      } finally {
        if (!cancelled) setSearching(false)
      }
    })()
    return () => { cancelled = true }
  }, [isAuxiliar, selectedLider])

  // Busca por texto: auxiliar filtra a lista da liderança; demais usam search API.
  useEffect(() => {
    if (isAuxiliar) return
    const q = query.trim()
    if (q.length < 2) {
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
            coordenadorNome: isCoordenador ? coordNome : undefined,
          })
          if (!cancelled) setHits(rows)
        } catch (e) {
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : 'Falha na busca.'
            setError(/votou|voto_|column|schema/i.test(msg)
              ? `${msg} — rode o SQL coordenador_auxiliar_votacao_run.sql no Supabase.`
              : msg)
            setHits([])
          }
        } finally {
          if (!cancelled) setSearching(false)
        }
      })()
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query, coordNome, isAuxiliar, isCoordenador])

  const displayedHits = useMemo(() => {
    if (isAuxiliar) {
      if (!selectedLider) return []
      let rows = liderLista
      const q = query.trim().toLowerCase()
      if (q.length >= 1) {
        const digits = q.replace(/\D/g, '')
        rows = rows.filter((h) => {
          const blob = [
            h.nome_completo,
            h.nome_mae,
            h.titulo,
            h.zona,
            h.secao,
            h.lider,
          ].join(' ').toLowerCase()
          if (blob.includes(q)) return true
          if (digits.length >= 2 && (h.titulo || '').includes(digits)) return true
          return false
        })
      }
      if (statusFiltro === 'pendente') rows = rows.filter((h) => h.votou == null)
      else if (statusFiltro === 'votou') rows = rows.filter((h) => h.votou === true)
      else if (statusFiltro === 'nao') rows = rows.filter((h) => h.votou === false)
      return rows
    }
    return hits
  }, [isAuxiliar, selectedLider, liderLista, query, statusFiltro, hits])

  const liderCounts = useMemo(() => {
    const pend = liderLista.filter((h) => h.votou == null).length
    const yes = liderLista.filter((h) => h.votou === true).length
    const no = liderLista.filter((h) => h.votou === false).length
    return { total: liderLista.length, pend, yes, no }
  }, [liderLista])

  // Abre ficha em edição vinda do Histórico (?edit=id).
  useEffect(() => {
    if (loadingScope) return
    const editId = searchParams.get('edit')?.trim()
    if (!editId || editOpenedRef.current === editId) return
    if (isAuxiliar && !liderNomes.length) return

    let cancelled = false
    editOpenedRef.current = editId
    void (async () => {
      try {
        const hit = await getVotacaoFicha(editId)
        if (cancelled) return
        if (!hit) {
          setError('Ficha não encontrada para editar.')
          navigate('/votacao/lancar', { replace: true })
          return
        }
        if (isAuxiliar) {
          const allowed = new Set(liderNomes.map((n) => n.trim().toLowerCase()))
          if (!allowed.has((hit.lider || '').trim().toLowerCase())) {
            setError('Esta ficha não está nas suas lideranças.')
            navigate('/votacao/lancar', { replace: true })
            return
          }
        }
        await openFicha(hit, false)
        navigate('/votacao/lancar', { replace: true })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Não foi possível abrir a ficha.')
          navigate('/votacao/lancar', { replace: true })
        }
      }
    })()
    return () => { cancelled = true }
    // openFicha é estável o suficiente para este fluxo de deep-link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingScope, searchParams, isAuxiliar, liderNomes, navigate])

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
      try {
        setFotoPreview(await signVotoFoto(hit.voto_foto_path))
      } catch (e) {
        setFotoPreview(null)
        setError(e instanceof Error ? e.message : 'Não foi possível abrir o anexo.')
      }
    } else {
      setFotoPreview(null)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelFicha() {
    setSelected(null)
    setViewOnly(false)
    setFotoFile(null)
    setFotoPreview(null)
    setClearFoto(false)
    setOkMsg(null)
    setError(null)
    setVotou(null)
    setNome('')
    setTitulo('')
    setZona('')
    setSecao('')
    setNomeMae('')
    setNascimento('')
    // Mantém a busca para escolher outro nome da lista.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function onPickFile(file: File | null, input?: HTMLInputElement | null) {
    if (!file) return
    setClearFoto(false)
    setFotoFile(file)
    // Permite tirar/escolher de novo a mesma foto (senão o onChange não dispara).
    if (input) input.value = ''
  }

  async function handleSave() {
    if (!selected || !profile?.id) return
    if (votou === null) {
      setError('Selecione Votou ou Não votou.')
      return
    }
    if (!nome.trim()) {
      setError('Informe o nome da pessoa.')
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
      setLiderLista((prev) => prev.map((h) => (h.id === saved.id ? { ...h, ...saved } : h)))
      setFotoFile(null)
      setClearFoto(false)
      if (saved.voto_foto_path) {
        try {
          setFotoPreview(await signVotoFoto(saved.voto_foto_path))
        } catch {
          /* lançamento ok; anexo pode falhar só na visualização */
        }
      }
      setOkMsg('Lançamento salvo. Você pode editar os dados se precisar corrigir.')
      setViewOnly(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível salvar.'
      if (/votou|voto_|column|schema|bucket|storage/i.test(msg)) {
        setError(`${msg} — rode o SQL coordenador_auxiliar_votacao_run.sql no Supabase.`)
      } else {
        setError(msg)
      }
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
      return `Só as fichas das suas lideranças: ${liderNomes.join(', ')}`
    }
    if (isCoordenador) return coordNome ? `Coordenação: ${coordNome}` : 'Coordenação não vinculada'
    return 'Busca nas fichas (visão admin/diretoria).'
  }, [isAuxiliar, isCoordenador, liderNomes, coordNome])

  if (loadingScope) {
    return (
      <div className="vot-page vot-lancar vot-center">
        <Spinner size={36} />
      </div>
    )
  }

  return (
    <div className={`vot-page vot-lancar vot-has-bottom${selected ? ' vot-lancar-editing' : ''}`}>
      <div className="page-header vot-lancar-header">
        <div>
          <h1 className="page-title">Lançar votação</h1>
          <p className="page-subtitle">{scopeHint}</p>
        </div>
        {selected ? (
          <div className="page-header-actions">
            <button type="button" className="vot-btn ghost" onClick={cancelFicha} disabled={saving}>
              <X size={16} /> Cancelar
            </button>
          </div>
        ) : null}
      </div>

      {!selected && (
        <>
          {semLiderancas && (
            <div className="alert alert-error">
              Seu coordenador ainda não liberou nenhuma liderança para você.
              Peça para marcar as lideranças em Equipe → Auxiliares.
            </div>
          )}

          {isAuxiliar && !semLiderancas && (
            <section className="vot-lider-pick">
              <div className="vot-lider-pick-head">
                <strong>Suas lideranças</strong>
                <span>Escolha uma para ver a lista</span>
              </div>
              <div className="vot-lider-chips" role="listbox" aria-label="Lideranças">
                {liderNomes.map((nome) => (
                  <button
                    key={nome}
                    type="button"
                    role="option"
                    aria-selected={selectedLider === nome}
                    className={`vot-lider-chip${selectedLider === nome ? ' is-on' : ''}`}
                    onClick={() => {
                      setSelectedLider(nome)
                      setQuery('')
                      setStatusFiltro('todos')
                    }}
                  >
                    {nome}
                  </button>
                ))}
              </div>
            </section>
          )}

          {(!isAuxiliar || selectedLider) && !semLiderancas && (
            <div className="vot-search">
              <Search size={18} aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  isAuxiliar
                    ? 'Filtrar nesta liderança (nome, mãe, título…)'
                    : 'Nome, mãe, título, zona ou seção'
                }
                autoComplete="off"
                enterKeyHint="search"
              />
              {query && (
                <button type="button" className="vot-clear" onClick={() => setQuery('')} aria-label="Limpar">
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          {isAuxiliar && selectedLider && !semLiderancas && (
            <div className="vot-status-chips" aria-label="Filtrar status">
              {(
                [
                  ['todos', `Todas (${liderCounts.total})`],
                  ['pendente', `Pendente (${liderCounts.pend})`],
                  ['votou', `Votou (${liderCounts.yes})`],
                  ['nao', `Não votou (${liderCounts.no})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`vot-status-chip${statusFiltro === key ? ' is-on' : ''}`}
                  onClick={() => setStatusFiltro(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          {searching && (
            <div className="vot-center vot-muted">
              <Spinner size={22} /> {isAuxiliar ? 'Carregando liderança…' : 'Buscando…'}
            </div>
          )}

          {isAuxiliar && !semLiderancas && !selectedLider && (
            <p className="vot-empty">Toque numa liderança acima para ver as fichas e lançar.</p>
          )}

          {!searching && isAuxiliar && selectedLider && !displayedHits.length && (
            <p className="vot-empty">
              {query.trim() || statusFiltro !== 'todos'
                ? 'Nenhuma ficha com esse filtro nesta liderança.'
                : 'Nenhuma ficha nesta liderança.'}
            </p>
          )}

          {!searching && !isAuxiliar && query.trim().length >= 2 && !displayedHits.length && (
            <p className="vot-empty">
              Nenhuma ficha para “{query.trim()}”.
            </p>
          )}

          {!isAuxiliar && query.trim().length < 2 && (
            <p className="vot-empty">Digite nome (pode ser só partes), mãe, título, zona ou seção.</p>
          )}

          <ul className="vot-list">
            {displayedHits.map((h) => (
              <li key={h.id}>
                <button type="button" className="vot-hit" onClick={() => void openFicha(h, false)}>
                  <div className="vot-hit-main">
                    <strong>{h.nome_completo}</strong>
                    <span>
                      Título {h.titulo || '—'} · Zona {h.zona || '—'} · Seção {h.secao || '—'}
                    </span>
                    <em>
                      {h.lider || 'Sem liderança'}
                      {h.nome_mae ? ` · Mãe: ${h.nome_mae}` : ''}
                    </em>
                  </div>
                  <span className={`vot-badge${h.votou === true ? ' is-yes' : h.votou === false ? ' is-no' : ' is-pend'}`}>
                    {statusLabel(h.votou)}
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
            <button type="button" className="vot-back" onClick={cancelFicha} disabled={saving}>
              <X size={16} /> Cancelar · buscar outra pessoa
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

          <div className="vot-ficha-person">
            <span className="vot-ficha-person-label">Pessoa selecionada</span>
            <strong>{selected.nome_completo}</strong>
            <span>
              Título {selected.titulo || '—'} · Zona {selected.zona || '—'} · Seção {selected.secao || '—'}
            </span>
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
              <p className="vot-muted">Nenhuma foto — tire com a câmera ou escolha da galeria.</p>
            )}
            {!viewOnly && (
              <div className="vot-foto-btns">
                <label className="vot-btn">
                  <Camera size={18} /> Câmera
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-label="Tirar foto com a câmera"
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null, e.target)}
                  />
                </label>
                <label className="vot-btn ghost">
                  <ImagePlus size={18} /> Galeria
                  <input
                    ref={galleryRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/*"
                    aria-label="Escolher foto da galeria"
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null, e.target)}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="vot-fields">
            <p className="vot-fields-hint">
              {viewOnly
                ? 'Toque em Editar para corrigir Nome, Título, Zona, Seção, Nome da mãe ou Nascimento.'
                : 'Corrija os dados errados abaixo antes de salvar o lançamento.'}
            </p>
            <label>
              Nome
              <input value={nome} disabled={viewOnly} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
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

          <div className="vot-actions-bar">
            <button
              type="button"
              className="vot-cancel"
              disabled={saving}
              onClick={cancelFicha}
            >
              <X size={18} />
              Cancelar
            </button>
            {!viewOnly ? (
              <button type="button" className="vot-save" disabled={saving} onClick={() => void handleSave()}>
                <Check size={18} strokeWidth={2.6} />
                {saving ? 'Salvando…' : 'Salvar lançamento'}
              </button>
            ) : (
              <button type="button" className="vot-save" onClick={() => setViewOnly(false)}>
                <Eye size={18} />
                Editar lançamento
              </button>
            )}
          </div>
        </div>
      )}

      <VotacaoBottomNav />
    </div>
  )
}
