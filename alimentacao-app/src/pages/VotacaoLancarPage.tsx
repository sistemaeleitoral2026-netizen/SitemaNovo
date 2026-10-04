import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Camera,
  Check,
  Eye,
  ImagePlus,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import { VotacaoBottomNav } from '../components/votacao/VotacaoBottomNav'
import { buildWhatsAppUrl, WHATSAPP_VOTACAO_MESSAGE } from '../lib/whatsapp'
import {
  criarCadastroLancamentoVotacao,
  fetchAuxiliarLiderNomes,
  fetchVotacaoFichasLider,
  fetchVotacaoFichasPorLiderNome,
  getVotacaoFicha,
  labelAdicionadoNoLancamento,
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
  const fotoFileRef = useRef<File | null>(null)
  const fotoSectionRef = useRef<HTMLDivElement | null>(null)
  const editOpenedRef = useRef<string | null>(null)
  const listaAnchorRef = useRef<HTMLDivElement | null>(null)
  const liderPickRef = useRef<HTMLElement | null>(null)

  const [liderNomes, setLiderNomes] = useState<string[]>([])
  const [coordNome, setCoordNome] = useState<string | null>(null)
  const [coordOptions, setCoordOptions] = useState<{ id: string; nome: string }[]>([])
  const [selectedCoordId, setSelectedCoordId] = useState('')
  const [loadingScope, setLoadingScope] = useState(true)
  const [selectedLider, setSelectedLider] = useState<string | null>(null)
  const [liderLista, setLiderLista] = useState<VotacaoHit[]>([])
  const [statusFiltro, setStatusFiltro] = useState<VotacaoStatusFiltro>('todos')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<VotacaoHit[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<VotacaoHit | null>(null)
  const [modoNovo, setModoNovo] = useState(false)
  const [viewOnly, setViewOnly] = useState(false)
  const [scopeDiretoriaId, setScopeDiretoriaId] = useState<string | null>(null)

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

  const isAuxiliar =
    hasRole(profile, 'auxiliar') && !hasRole(profile, ['admin', 'diretoria', 'coordenador'])
  const isCoordenador = hasRole(profile, 'coordenador')
  const isStaff = hasRole(profile, ['admin', 'diretoria'])
  /** Auxiliar não altera dados de ficha existente — em ficha nova pode preencher. */
  const cadastroSomenteLeitura = isAuxiliar && !modoNovo
  /** Auxiliar, coordenador, diretoria e admin: botões de liderança + lista. */
  const useLiderBrowse = isAuxiliar || isCoordenador || isStaff
  const semLiderancas = isAuxiliar && !loadingScope && liderNomes.length === 0
  const liderParaNovo = selectedLider || (liderNomes.length === 1 ? liderNomes[0] : null)
  const podeAdicionarNovo = useLiderBrowse && !semLiderancas && liderNomes.length > 0

  async function loadLiderNomesByCoordId(coordId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('lideres')
      .select('nome')
      .eq('coordenador_id', coordId)
      .order('nome')
    if (error) throw new Error(error.message)
    return [...new Set((data ?? []).map((r) => String(r.nome ?? '').trim()).filter(Boolean))]
  }

  useEffect(() => {
    let cancelled = false
    async function loadScope() {
      setLoadingScope(true)
      try {
        if (isAuxiliar && profile?.id) {
          // Escopo = lideranças liberadas + coordenação do auxiliar (não vê outras coords).
          if (profile.coordenador_id) {
            const { data: coord } = await supabase
              .from('coordenadores')
              .select('id,nome,diretoria_id')
              .eq('id', profile.coordenador_id)
              .maybeSingle()
            if (!cancelled) {
              setCoordNome(coord?.nome ?? null)
              setSelectedCoordId(coord?.id ?? '')
              setScopeDiretoriaId(
                (coord?.diretoria_id as string | null | undefined)
                  ?? profile.diretoria_id
                  ?? null,
              )
            }
          } else if (!cancelled) {
            setScopeDiretoriaId(profile.diretoria_id ?? null)
          }
          const nomes = await fetchAuxiliarLiderNomes(profile.id)
          if (!cancelled) {
            setLiderNomes(nomes)
            if (nomes.length === 1) setSelectedLider(nomes[0])
          }
        } else if (isCoordenador && profile?.id) {
          const { data } = await supabase
            .from('coordenadores')
            .select('id,nome,diretoria_id')
            .or(`user_id.eq.${profile.id}${profile.coordenador_id ? `,id.eq.${profile.coordenador_id}` : ''}`)
            .limit(1)
            .maybeSingle()
          if (cancelled) return
          setCoordNome(data?.nome ?? null)
          setSelectedCoordId(data?.id ?? '')
          setScopeDiretoriaId(
            (data?.diretoria_id as string | null | undefined) ?? profile.diretoria_id ?? null,
          )
          if (data?.id) {
            const nomes = await loadLiderNomesByCoordId(data.id)
            if (!cancelled) {
              setLiderNomes(nomes)
              if (nomes.length === 1) setSelectedLider(nomes[0])
            }
          }
        } else if (isStaff) {
          let q = supabase.from('coordenadores').select('id,nome,diretoria_id').eq('ativo', true).order('nome')
          if (hasRole(profile, 'diretoria') && profile?.id && !hasRole(profile, 'admin')) {
            q = q.eq('diretoria_id', profile.id)
          }
          const { data: coords, error: err } = await q
          if (err) throw new Error(err.message)
          if (cancelled) return
          const list = (coords ?? []) as { id: string; nome: string; diretoria_id?: string | null }[]
          setCoordOptions(list.map((c) => ({ id: c.id, nome: c.nome })))
          const first = list[0]
          if (first) {
            setSelectedCoordId(first.id)
            setCoordNome(first.nome)
            setScopeDiretoriaId(
              first.diretoria_id
                || (profile && hasRole(profile, 'diretoria') ? profile.id : null)
                || profile?.diretoria_id
                || null,
            )
            const nomes = await loadLiderNomesByCoordId(first.id)
            if (!cancelled) {
              setLiderNomes(nomes)
              setSelectedLider(nomes.length === 1 ? nomes[0] : null)
            }
          } else {
            setLiderNomes([])
            setCoordNome(null)
            setScopeDiretoriaId(profile && hasRole(profile, 'diretoria') ? profile.id : null)
          }
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar as lideranças.')
      } finally {
        if (!cancelled) setLoadingScope(false)
      }
    }
    void loadScope()
    return () => { cancelled = true }
  }, [profile, isAuxiliar, isCoordenador, isStaff])

  async function onPickStaffCoord(id: string) {
    setSelectedCoordId(id)
    const nome = coordOptions.find((c) => c.id === id)?.nome ?? ''
    setCoordNome(nome || null)
    setSelectedLider(null)
    setLiderLista([])
    setQuery('')
    setStatusFiltro('todos')
    // Sobe até os botões da liderança (e a lista, se só houver uma).
    requestAnimationFrame(() => {
      ;(liderPickRef.current ?? listaAnchorRef.current)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
    if (!id) {
      setLiderNomes([])
      setScopeDiretoriaId(hasRole(profile, 'diretoria') ? (profile?.id ?? null) : null)
      return
    }
    setSearching(true)
    try {
      const { data: coord } = await supabase
        .from('coordenadores')
        .select('diretoria_id')
        .eq('id', id)
        .maybeSingle()
      const dirFromCoord = (coord?.diretoria_id as string | null | undefined) || null
      const dirFromProfile = profile && hasRole(profile, 'diretoria')
        ? profile.id
        : (profile?.diretoria_id ?? null)
      setScopeDiretoriaId(dirFromCoord || dirFromProfile)
      const nomes = await loadLiderNomesByCoordId(id)
      setLiderNomes(nomes)
      if (nomes.length === 1) setSelectedLider(nomes[0])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar lideranças.')
      setLiderNomes([])
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (!fotoFile) return
    const url = URL.createObjectURL(fotoFile)
    setFotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [fotoFile])

  const searchActive = query.trim().length >= 2
  /** Lista por liderança só quando não está pesquisando por texto. */
  const liderBrowseActive = useLiderBrowse && Boolean(selectedLider) && !searchActive

  // Clique na liderança → carrega a lista dela e sobe a tela até as fichas.
  useEffect(() => {
    if (!liderBrowseActive || !selectedLider) {
      if (!selectedLider) setLiderLista([])
      return
    }
    let cancelled = false
    setSearching(true)
    setError(null)
    void (async () => {
      try {
        const rows = coordNome
          ? await fetchVotacaoFichasLider(coordNome, selectedLider)
          : await fetchVotacaoFichasPorLiderNome(selectedLider)
        if (!cancelled) {
          setLiderLista(rows)
          requestAnimationFrame(() => {
            listaAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          })
        }
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
  }, [liderBrowseActive, selectedLider, coordNome])

  // Pesquisa sempre disponível (em paralelo aos botões de liderança).
  useEffect(() => {
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
            // Auxiliar: só as lideranças liberadas. Coord/staff: só a coordenação.
            liderNomes: isAuxiliar ? liderNomes : undefined,
            coordenadorNome: (isAuxiliar || isCoordenador || isStaff) ? coordNome : undefined,
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
  }, [query, coordNome, isAuxiliar, isCoordenador, isStaff, liderNomes])

  const listSource = searchActive ? hits : (liderBrowseActive ? liderLista : [])

  const displayedHits = useMemo(() => {
    let rows = listSource
    if (statusFiltro === 'pendente') rows = rows.filter((h) => h.votou == null)
    else if (statusFiltro === 'votou') rows = rows.filter((h) => h.votou === true)
    else if (statusFiltro === 'nao') rows = rows.filter((h) => h.votou === false)
    return rows
  }, [listSource, statusFiltro])

  const liderCounts = useMemo(() => {
    const pend = listSource.filter((h) => h.votou == null).length
    const yes = listSource.filter((h) => h.votou === true).length
    const no = listSource.filter((h) => h.votou === false).length
    return { total: listSource.length, pend, yes, no }
  }, [listSource])

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
        if ((isAuxiliar || isCoordenador) && coordNome) {
          const sameCoord = (hit.coordenador || '').trim().toLowerCase() === coordNome.trim().toLowerCase()
          if (!sameCoord) {
            setError('Esta ficha não é da sua coordenação.')
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
  }, [loadingScope, searchParams, isAuxiliar, isCoordenador, liderNomes, coordNome, navigate])

  async function openFicha(hit: VotacaoHit, onlyView: boolean) {
    setError(null)
    setOkMsg(null)
    setModoNovo(false)
    setViewOnly(onlyView)
    setSelected(hit)
    setVotou(hit.votou ?? null)
    fotoFileRef.current = null
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
      } catch {
        // Não bloqueia o lançamento se só a prévia do anexo falhar.
        setFotoPreview(null)
      }
    } else {
      setFotoPreview(null)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelFicha() {
    setSelected(null)
    setModoNovo(false)
    setViewOnly(false)
    fotoFileRef.current = null
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

  function startNovo() {
    if (!podeAdicionarNovo) return
    const lider = liderParaNovo
    if (!lider) {
      setError('Selecione a liderança nos botões antes de adicionar uma pessoa.')
      return
    }
    if (!coordNome) {
      setError(isStaff ? 'Selecione a coordenação antes de adicionar.' : 'Coordenação não vinculada ao seu login.')
      return
    }
    setError(null)
    setOkMsg(null)
    setModoNovo(true)
    setViewOnly(false)
    setQuery('')
    setSelectedLider(lider)
    setSelected({
      id: '',
      nome_completo: '',
      titulo: '',
      zona: '',
      secao: '',
      nome_mae: '',
      data_nascimento: null,
      telefone: '',
      coordenador: coordNome,
      lider,
      votou: null,
      voto_foto_path: null,
      voto_em: null,
      voto_por: null,
      diretoria_id: scopeDiretoriaId,
      adicionado_por_auxiliar: isAuxiliar,
      criado_por: profile?.id ?? null,
    })
    setVotou(null)
    fotoFileRef.current = null
    setFotoFile(null)
    setFotoPreview(null)
    setClearFoto(false)
    setNome('')
    setTitulo('')
    setZona('')
    setSecao('')
    setNomeMae('')
    setNascimento('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function onPickFile(file: File | null, input?: HTMLInputElement | null) {
    if (!file) {
      setError('Não foi possível ler a foto. Tire de novo pela câmera ou escolha na galeria.')
      return
    }
    // Cópia estável: no iOS limpar o input no mesmo tick pode “perder” o File.
    const stable = new File(
      [file],
      file.name?.trim() || `comprovante-${Date.now()}.jpg`,
      { type: file.type || 'image/jpeg', lastModified: file.lastModified || Date.now() },
    )
    fotoFileRef.current = stable
    setClearFoto(false)
    setFotoFile(stable)
    setError(null)
    setOkMsg('Foto do comprovante anexada. Pode salvar o lançamento.')
    // A prévia é gerada (e revogada) pelo useEffect([fotoFile]); não criar
    // outra object URL aqui evita vazamento ao anexar várias fotos seguidas.
    // Limpa depois, para poder escolher a mesma foto de novo sem perder o arquivo.
    if (input) {
      window.setTimeout(() => {
        try { input.value = '' } catch { /* ignore */ }
      }, 0)
    }
  }

  async function handleSave() {
    if (!selected || !profile?.id) return
    if (votou === null) {
      setError('Selecione Votou ou Não votou antes de salvar.')
      return
    }
    if ((modoNovo || !cadastroSomenteLeitura) && !nome.trim()) {
      setError('Informe o nome da pessoa.')
      return
    }
    if (modoNovo && nome.trim().split(/\s+/).filter(Boolean).length < 2) {
      setError('Informe nome e sobrenome.')
      return
    }
    // Ref evita estado “atrasado” no celular após tirar a foto.
    const arquivoFoto = fotoFileRef.current || fotoFile
    const temAnexo = Boolean(arquivoFoto) || (!modoNovo && Boolean(selected.voto_foto_path) && !clearFoto)
    if (!temAnexo) {
      setError('Tire a foto do comprovante (câmera) ou anexe da galeria antes de salvar.')
      fotoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSaving(true)
    setError(null)
    setOkMsg(null)
    try {
      let saved: VotacaoHit
      if (modoNovo) {
        saved = await criarCadastroLancamentoVotacao({
          userId: profile.id,
          diretoriaId: scopeDiretoriaId ?? profile.diretoria_id ?? null,
          coordenadorNome: coordNome || selected.coordenador,
          liderNome: selected.lider || liderParaNovo || '',
          nomeCompleto: nome,
          titulo,
          zona,
          secao,
          nomeMae,
          dataNascimento: nascimento || null,
          votou,
          fotoFile: arquivoFoto,
          porAuxiliar: isAuxiliar,
        })
        setModoNovo(false)
        setLiderLista((prev) => [saved, ...prev.filter((h) => h.id !== saved.id)])
        setHits((prev) => [saved, ...prev.filter((h) => h.id !== saved.id)])
      } else {
        saved = await salvarLancamentoVotacao({
          cadastroId: selected.id,
          userId: profile.id,
          votou,
          fotoFile: arquivoFoto,
          clearFoto: clearFoto && !arquivoFoto,
          // Auxiliar não pode alterar nome, título, zona, seção, mãe nem nascimento.
          correcoes: cadastroSomenteLeitura
            ? undefined
            : {
                nome_completo: nome,
                titulo,
                zona,
                secao,
                nome_mae: nomeMae,
                data_nascimento: nascimento || null,
              },
        })
      }
      // Preserva campos se o reload vier parcial; atualiza listas e volta à escolha.
      const merged: VotacaoHit = {
        ...selected,
        ...saved,
        nome_completo: (saved.nome_completo || nome).trim() || saved.nome_completo,
        titulo: saved.titulo || titulo,
        zona: saved.zona || zona,
        secao: saved.secao || secao,
        nome_mae: saved.nome_mae || nomeMae,
        data_nascimento: saved.data_nascimento || nascimento || null,
        coordenador: saved.coordenador || selected.coordenador,
        lider: saved.lider || selected.lider,
        votou: saved.votou ?? votou,
        voto_foto_path: saved.voto_foto_path ?? (clearFoto && !arquivoFoto ? null : selected.voto_foto_path),
      }
      setHits((prev) => {
        const rest = prev.filter((h) => h.id !== merged.id)
        return [merged, ...rest]
      })
      setLiderLista((prev) => {
        const rest = prev.filter((h) => h.id !== merged.id)
        return [merged, ...rest]
      })
      const nomeSalvo = (merged.nome_completo || '').trim()
      cancelFicha()
      setOkMsg(
        labelAdicionadoNoLancamento(saved)
          ? `${nomeSalvo || 'Pessoa'} adicionada. Escolha a próxima.`
          : `${nomeSalvo || 'Lançamento'} salvo. Escolha a próxima pessoa.`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível salvar.'
      if (/auxiliar_adicionar|adicionado_por_auxiliar|criado_por/i.test(msg)) {
        setError(msg)
      } else if (/votou|voto_|column|schema|bucket|storage/i.test(msg)) {
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
      if (!coordNome) return 'Coordenação não vinculada ao login.'
      if (!liderNomes.length) return 'Nenhuma liderança atribuída. Peça ao coordenador em Equipe → Auxiliares.'
      return 'Clique no botão da liderança para listar as fichas.'
    }
    if (isCoordenador) {
      return coordNome
        ? `Coordenação: ${coordNome} · clique no botão da liderança`
        : 'Coordenação não vinculada ao login. Peça à diretoria para vincular seu usuário.'
    }
    if (isStaff) {
      return coordNome
        ? `Coordenação: ${coordNome} · clique no botão da liderança`
        : 'Selecione a coordenação e clique no botão da liderança'
    }
    return 'Busca nas fichas.'
  }, [isAuxiliar, isCoordenador, isStaff, liderNomes.length, coordNome])

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
        <div className="page-header-actions">
          {selected ? (
            <button type="button" className="vot-btn ghost" onClick={cancelFicha} disabled={saving}>
              <X size={16} /> Cancelar
            </button>
          ) : podeAdicionarNovo ? (
            <button type="button" className="vot-btn" onClick={startNovo}>
              <Plus size={16} /> Adicionar novo
            </button>
          ) : null}
        </div>
      </div>

      {!selected && (
        <>
          {okMsg && <div className="alert alert-success">{okMsg}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          {isAuxiliar && !coordNome && (
            <div className="alert alert-error">
              Coordenação não vinculada ao seu login. Peça ao coordenador ou à diretoria.
            </div>
          )}

          {isCoordenador && !coordNome && (
            <div className="alert alert-error">
              Coordenação não vinculada ao login. Peça à diretoria para vincular seu usuário ao coordenador.
            </div>
          )}

          {semLiderancas && (
            <div className="alert alert-error">
              Seu coordenador ainda não liberou nenhuma liderança para você.
              Peça para marcar as lideranças em Equipe → Auxiliares.
            </div>
          )}

          {isStaff && useLiderBrowse && (
            <label className="vot-coord-pick">
              Coordenador
              <select
                value={selectedCoordId}
                onChange={(e) => void onPickStaffCoord(e.target.value)}
              >
                {!coordOptions.length && <option value="">Nenhuma coordenação</option>}
                {coordOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </label>
          )}

          {!semLiderancas && (
            <div className="vot-search vot-search-sticky">
              <Search size={18} aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar nome, mãe, título, zona ou seção"
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

          {useLiderBrowse && !semLiderancas && (
            <section className="vot-lider-pick" ref={liderPickRef}>
              <div className="vot-lider-pick-head">
                <strong>Botões da liderança</strong>
                <span>
                  {liderNomes.length
                    ? 'Clique para listar as fichas'
                    : 'Nenhuma liderança nesta coordenação'}
                </span>
              </div>
              {liderNomes.length > 0 && (
                <ul className="vot-lider-list-pick" role="listbox" aria-label="Botões da liderança">
                  {liderNomes.map((nome) => (
                    <li key={nome}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={!searchActive && selectedLider === nome}
                        className={`vot-lider-row${!searchActive && selectedLider === nome ? ' is-on' : ''}`}
                        onClick={() => {
                          setQuery('')
                          setStatusFiltro('todos')
                          setSelectedLider((prev) => (prev === nome ? null : nome))
                        }}
                      >
                        <span>{nome}</span>
                        {!searchActive && selectedLider === nome ? <Check size={18} aria-hidden /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div ref={listaAnchorRef} className="vot-lista-anchor" aria-hidden={!searchActive && !liderBrowseActive} />

          {(searchActive || liderBrowseActive) && !semLiderancas && (
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

          {searching && (
            <div className="vot-center vot-muted">
              <Spinner size={22} /> {searchActive ? 'Buscando…' : 'Carregando liderança…'}
            </div>
          )}

          {!semLiderancas && !searchActive && !selectedLider && useLiderBrowse && liderNomes.length > 0 && (
            <p className="vot-empty">
              Clique num botão da liderança para listar as fichas, ou pesquise o nome.
            </p>
          )}

          {!searching && searchActive && !displayedHits.length && (
            <p className="vot-empty">Nenhuma ficha para “{query.trim()}”.</p>
          )}

          {!searching && liderBrowseActive && !displayedHits.length && (
            <p className="vot-empty">
              {statusFiltro !== 'todos'
                ? 'Nenhuma ficha com esse filtro nesta liderança.'
                : podeAdicionarNovo
                  ? 'Nenhuma ficha nesta liderança. Use Adicionar novo se precisar cadastrar alguém.'
                  : 'Nenhuma ficha nesta liderança.'}
            </p>
          )}

          {!useLiderBrowse && !searchActive && (
            <p className="vot-empty">Digite ao menos 2 letras para pesquisar.</p>
          )}

          {podeAdicionarNovo && liderBrowseActive && !searchActive && (
            <button type="button" className="vot-btn vot-add-novo" onClick={startNovo}>
              <Plus size={18} /> Adicionar novo nesta liderança
            </button>
          )}

          <ul className="vot-list">
            {displayedHits.map((h) => {
              const temWa = Boolean(buildWhatsAppUrl(h.telefone, WHATSAPP_VOTACAO_MESSAGE))
              return (
                <li key={h.id} className="vot-hit-row">
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
                      {labelAdicionadoNoLancamento(h) ? (
                        <em className="vot-tag-aux">{labelAdicionadoNoLancamento(h)}</em>
                      ) : null}
                    </div>
                    <span className={`vot-badge${h.votou === true ? ' is-yes' : h.votou === false ? ' is-no' : ' is-pend'}`}>
                      {statusLabel(h.votou)}
                    </span>
                  </button>
                  {temWa ? (
                    <span className="vot-wa-wrap">
                      <WhatsAppLink
                        phone={h.telefone}
                        message={WHATSAPP_VOTACAO_MESSAGE}
                        label={`WhatsApp ${h.nome_completo}`}
                        className="whatsapp-link-inline vot-wa"
                      />
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {selected && (
        <div className="vot-ficha">
          <div className="vot-ficha-bar">
            <button type="button" className="vot-back" onClick={cancelFicha} disabled={saving}>
              <X size={16} /> {modoNovo ? 'Cancelar · voltar' : 'Cancelar · buscar outra pessoa'}
            </button>
            <div className="vot-ficha-actions">
              {!modoNovo && (viewOnly ? (
                <button type="button" className="vot-btn ghost" onClick={() => setViewOnly(false)}>
                  Editar
                </button>
              ) : (
                <button type="button" className="vot-btn ghost" onClick={() => void refreshSelected().then(() => setViewOnly(true))}>
                  <Eye size={16} /> Ver
                </button>
              ))}
            </div>
          </div>

          <div className="vot-ficha-person">
            <span className="vot-ficha-person-label">
              {modoNovo ? 'Nova pessoa' : 'Pessoa selecionada'}
            </span>
            <strong>{modoNovo ? (nome.trim() || 'Preencha os dados abaixo') : selected.nome_completo}</strong>
            <span>
              {modoNovo
                ? `Liderança ${selected.lider || '—'} · Coord. ${selected.coordenador || '—'}`
                : `Título ${selected.titulo || '—'} · Zona ${selected.zona || '—'} · Seção ${selected.secao || '—'}`}
            </span>
            {(modoNovo || labelAdicionadoNoLancamento(selected)) && (
              <em className="vot-tag-aux">
                {modoNovo
                  ? (isAuxiliar ? 'Adicionado pelo auxiliar' : 'Adicionado no lançamento')
                  : labelAdicionadoNoLancamento(selected)}
              </em>
            )}
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="vot-status">
            <p className="vot-foto-req">Obrigatório: selecione Votou ou Não votou.</p>
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

          <div className="vot-foto is-required" ref={fotoSectionRef}>
            <div className="vot-foto-label">
              Foto do comprovante *
            </div>
            <p className="vot-foto-req">Obrigatório tirar a foto do comprovante (ou anexar da galeria).</p>
            {okMsg && selected ? <div className="alert alert-success">{okMsg}</div> : null}
            {fotoPreview ? (
              <div className="vot-foto-preview">
                <img src={fotoPreview} alt="Comprovante" />
                {!viewOnly && (
                  <button
                    type="button"
                    className="vot-foto-remove"
                    onClick={() => {
                      fotoFileRef.current = null
                      setFotoFile(null)
                      setFotoPreview(null)
                      setClearFoto(true)
                      setOkMsg(null)
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
            ) : (
              <p className="vot-muted">
                Tire a foto do comprovante com a câmera ou escolha da galeria. Espere aparecer a prévia antes de salvar.
              </p>
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

          <div className={`vot-fields${cadastroSomenteLeitura ? ' is-locked' : ''}`}>
            <p className="vot-fields-hint">
              {modoNovo
                ? 'Preencha os dados. Diretoria, coordenação e liderança já vêm da sua liberação.'
                : cadastroSomenteLeitura
                  ? 'Dados da ficha só para consulta — auxiliar não pode alterar.'
                  : viewOnly
                    ? 'Toque em Editar para corrigir Nome, Título, Zona, Seção, Nome da mãe ou Nascimento.'
                    : 'Corrija os dados errados abaixo antes de salvar o lançamento.'}
            </p>
            <label>
              Nome
              <input
                value={nome}
                disabled={cadastroSomenteLeitura || viewOnly}
                onChange={(e) => setNome(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label>
              Título
              <input
                value={titulo}
                disabled={cadastroSomenteLeitura || viewOnly}
                inputMode="numeric"
                onChange={(e) => setTitulo(e.target.value)}
              />
            </label>
            <div className="vot-row2">
              <label>
                Zona
                <input
                  value={zona}
                  disabled={cadastroSomenteLeitura || viewOnly}
                  inputMode="numeric"
                  onChange={(e) => setZona(e.target.value)}
                />
              </label>
              <label>
                Seção
                <input
                  value={secao}
                  disabled={cadastroSomenteLeitura || viewOnly}
                  inputMode="numeric"
                  onChange={(e) => setSecao(e.target.value)}
                />
              </label>
            </div>
            <label>
              Nome da mãe
              <input
                value={nomeMae}
                disabled={cadastroSomenteLeitura || viewOnly}
                onChange={(e) => setNomeMae(e.target.value)}
              />
            </label>
            <label>
              Data de nascimento
              <input
                type="date"
                value={nascimento}
                disabled={cadastroSomenteLeitura || viewOnly}
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
              <button
                type="button"
                className="vot-save"
                disabled={
                  saving
                  || votou === null
                  || !(fotoFileRef.current || fotoFile || (!modoNovo && selected.voto_foto_path && !clearFoto))
                }
                onClick={() => void handleSave()}
              >
                <Check size={18} strokeWidth={2.6} />
                {saving ? 'Salvando…' : modoNovo ? 'Salvar nova pessoa' : 'Salvar lançamento'}
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
