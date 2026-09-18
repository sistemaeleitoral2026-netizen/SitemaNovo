import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Car, Megaphone, CheckCircle2, CircleDashed, Search, ExternalLink } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { fetchCadastros, updateEquipeMobilizacaoFlags, updateMobilizacaoFlags } from '../lib/cadastros'
import { supabase } from '../lib/supabase'
import type { Cadastro, Coordenador, Lider } from '../types'

type StatusFilter = 'todos' | 'ambos' | 'adesivo' | 'rede' | 'pendente'
type TipoPessoa = 'todos' | 'eleitor' | 'coordenador' | 'lideranca'

type PessoaRow = {
  key: string
  id: string
  nome: string
  tipo: 'eleitor' | 'coordenador' | 'lideranca'
  tipoLabel: string
  detalhe: string
  adesivou_carro: boolean
  postou_rede: boolean
  href: string | null
}

const TIPO_LABEL: Record<TipoPessoa, string> = {
  todos: 'Todas as pessoas',
  eleitor: 'Eleitores',
  coordenador: 'Coordenadores',
  lideranca: 'Lideranças',
}

function matchesStatus(adesivo: boolean, rede: boolean, status: StatusFilter) {
  if (status === 'todos') return true
  if (status === 'ambos') return adesivo && rede
  if (status === 'adesivo') return adesivo && !rede
  if (status === 'rede') return !adesivo && rede
  return !adesivo && !rede
}

export function MobilizacaoPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const status: StatusFilter =
    statusParam === 'ambos' || statusParam === 'adesivo' || statusParam === 'rede' || statusParam === 'pendente'
      ? statusParam
      : 'todos'

  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<TipoPessoa>('todos')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  const diretoriaScope = profile?.role === 'diretoria' ? profile.id : null

  async function load() {
    setLoading(true)
    setError(null)
    try {
      let coordsQuery = supabase.from('coordenadores').select('*').eq('ativo', true).order('nome')
      let lidsQuery = supabase.from('lideres').select('*').eq('ativo', true).order('nome')
      if (diretoriaScope) {
        coordsQuery = coordsQuery.eq('diretoria_id', diretoriaScope)
        lidsQuery = lidsQuery.eq('diretoria_id', diretoriaScope)
      }

      const [rows, coords, lids] = await Promise.all([
        fetchCadastros(),
        coordsQuery,
        lidsQuery,
      ])
      setCadastros(rows)
      setCoordenadores((coords.data ?? []) as Coordenador[])
      setLideres((lids.data ?? []) as Lider[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os dados.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [diretoriaScope])

  function setStatus(next: StatusFilter) {
    const params = new URLSearchParams(searchParams)
    if (next === 'todos') params.delete('status')
    else params.set('status', next)
    setSearchParams(params)
  }

  const pessoas = useMemo((): PessoaRow[] => {
    const coordById = new Map(coordenadores.map((c) => [c.id, c.nome]))

    const eleitores: PessoaRow[] = cadastros.map((c) => ({
      key: `eleitor-${c.id}`,
      id: c.id,
      nome: c.nome_completo?.trim() || 'Sem nome',
      tipo: 'eleitor',
      tipoLabel: 'Eleitor',
      detalhe: [c.coordenador?.trim(), c.lider?.trim()].filter(Boolean).join(' · ') || '—',
      adesivou_carro: Boolean(c.adesivou_carro),
      postou_rede: Boolean(c.postou_rede),
      href: `/cadastros/${c.id}/editar`,
    }))

    const coords: PessoaRow[] = coordenadores.map((c) => ({
      key: `coordenador-${c.id}`,
      id: c.id,
      nome: c.nome,
      tipo: 'coordenador',
      tipoLabel: 'Coordenador',
      detalhe: 'Equipe',
      adesivou_carro: Boolean(c.adesivou_carro),
      postou_rede: Boolean(c.postou_rede),
      href: null,
    }))

    const lids: PessoaRow[] = lideres.map((l) => ({
      key: `lideranca-${l.id}`,
      id: l.id,
      nome: l.nome,
      tipo: 'lideranca',
      tipoLabel: 'Liderança',
      detalhe: l.coordenador_id
        ? `Coord. ${coordById.get(l.coordenador_id) ?? '—'}`
        : 'Equipe',
      adesivou_carro: Boolean(l.adesivou_carro),
      postou_rede: Boolean(l.postou_rede),
      href: null,
    }))

    return [...coords, ...lids, ...eleitores].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR'),
    )
  }, [cadastros, coordenadores, lideres])

  const counts = useMemo(() => {
    let adesivados = 0
    let postagens = 0
    let ambos = 0
    let pendentes = 0
    pessoas.forEach((p) => {
      if (p.adesivou_carro) adesivados += 1
      if (p.postou_rede) postagens += 1
      if (p.adesivou_carro && p.postou_rede) ambos += 1
      if (!p.adesivou_carro && !p.postou_rede) pendentes += 1
    })
    return { adesivados, postagens, ambos, pendentes }
  }, [pessoas])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return pessoas.filter((p) => {
      if (tipoFilter !== 'todos' && p.tipo !== tipoFilter) return false
      if (!matchesStatus(p.adesivou_carro, p.postou_rede, status)) return false
      if (!q) return true
      return (
        p.nome.toLowerCase().includes(q)
        || p.tipoLabel.toLowerCase().includes(q)
        || p.detalhe.toLowerCase().includes(q)
      )
    })
  }, [pessoas, tipoFilter, status, search])

  useEffect(() => {
    setPage(0)
  }, [status, tipoFilter, search, pageSize])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize)

  async function setFlag(row: PessoaRow, field: 'adesivou_carro' | 'postou_rede', value: boolean) {
    if (row[field] === value) return
    setSavingKey(row.key)
    setError(null)

    let err: string | null = null
    if (row.tipo === 'eleitor') {
      ;({ error: err } = await updateMobilizacaoFlags(row.id, { [field]: value }))
    } else if (row.tipo === 'coordenador') {
      ;({ error: err } = await updateEquipeMobilizacaoFlags('coordenadores', row.id, { [field]: value }))
    } else {
      ;({ error: err } = await updateEquipeMobilizacaoFlags('lideres', row.id, { [field]: value }))
    }

    setSavingKey(null)
    if (err) {
      setError(err)
      return
    }

    if (row.tipo === 'eleitor') {
      setCadastros((prev) => prev.map((c) => (c.id === row.id ? { ...c, [field]: value } : c)))
    } else if (row.tipo === 'coordenador') {
      setCoordenadores((prev) => prev.map((c) => (c.id === row.id ? { ...c, [field]: value } : c)))
    } else {
      setLideres((prev) => prev.map((l) => (l.id === row.id ? { ...l, [field]: value } : l)))
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div className="mobilizacao-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mobilização</h1>
          <p className="page-subtitle">
            Eleitores, coordenadores e lideranças — marque quem adesivou e quem postou.
          </p>
        </div>
      </div>

      <div className="mobilizacao-kpi-grid">
        <button
          type="button"
          className={`mobilizacao-kpi${status === 'adesivo' ? ' active' : ''}`}
          onClick={() => setStatus(status === 'adesivo' ? 'todos' : 'adesivo')}
        >
          <span className="mobilizacao-kpi-icon"><Car size={18} /></span>
          <div>
            <span>Carros adesivados</span>
            <strong className="tabular-nums">{counts.adesivados.toLocaleString('pt-BR')}</strong>
          </div>
        </button>
        <button
          type="button"
          className={`mobilizacao-kpi${status === 'rede' ? ' active' : ''}`}
          onClick={() => setStatus(status === 'rede' ? 'todos' : 'rede')}
        >
          <span className="mobilizacao-kpi-icon"><Megaphone size={18} /></span>
          <div>
            <span>Postagens</span>
            <strong className="tabular-nums">{counts.postagens.toLocaleString('pt-BR')}</strong>
          </div>
        </button>
        <button
          type="button"
          className={`mobilizacao-kpi${status === 'ambos' ? ' active' : ''}`}
          onClick={() => setStatus(status === 'ambos' ? 'todos' : 'ambos')}
        >
          <span className="mobilizacao-kpi-icon"><CheckCircle2 size={18} /></span>
          <div>
            <span>Completos</span>
            <strong className="tabular-nums">{counts.ambos.toLocaleString('pt-BR')}</strong>
          </div>
        </button>
        <button
          type="button"
          className={`mobilizacao-kpi${status === 'pendente' ? ' active' : ''}`}
          onClick={() => setStatus(status === 'pendente' ? 'todos' : 'pendente')}
        >
          <span className="mobilizacao-kpi-icon"><CircleDashed size={18} /></span>
          <div>
            <span>Pendentes</span>
            <strong className="tabular-nums">{counts.pendentes.toLocaleString('pt-BR')}</strong>
          </div>
        </button>
      </div>

      <Card>
        <div className="filters-grid filters-grid-nerites" style={{ marginBottom: '1rem' }}>
          <div className="search-field">
            <Search size={16} />
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value as TipoPessoa)}
            options={(Object.keys(TIPO_LABEL) as TipoPessoa[]).map((key) => ({
              value: key,
              label: TIPO_LABEL[key],
            }))}
          />
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {!filtered.length ? (
          <EmptyState
            title="Nenhuma pessoa neste filtro"
            description="Clique num card acima ou ajuste a busca."
          />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Detalhe</th>
                    <th>Adesivou</th>
                    <th>Postou</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p) => {
                    const busy = savingKey === p.key
                    return (
                      <tr key={p.key}>
                        <td>
                          <strong>{p.nome}</strong>
                        </td>
                        <td>
                          <span className={`mobilizacao-tipo mobilizacao-tipo-${p.tipo}`}>
                            {p.tipoLabel}
                          </span>
                        </td>
                        <td>
                          <span className="mobilizacao-name-cell">{p.detalhe}</span>
                        </td>
                        <td>
                          <select
                            className="mobilizacao-select"
                            value={p.adesivou_carro ? 'sim' : 'nao'}
                            disabled={busy}
                            aria-label={`Adesivou — ${p.nome}`}
                            onChange={(e) => setFlag(p, 'adesivou_carro', e.target.value === 'sim')}
                          >
                            <option value="nao">Não</option>
                            <option value="sim">Sim</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="mobilizacao-select"
                            value={p.postou_rede ? 'sim' : 'nao'}
                            disabled={busy}
                            aria-label={`Postou — ${p.nome}`}
                            onChange={(e) => setFlag(p, 'postou_rede', e.target.value === 'sim')}
                          >
                            <option value="nao">Não</option>
                            <option value="sim">Sim</option>
                          </select>
                        </td>
                        <td>
                          {p.href ? (
                            <Link to={p.href}>
                              <Button variant="ghost" size="sm" aria-label="Abrir ficha">
                                <ExternalLink size={16} />
                              </Button>
                            </Link>
                          ) : (
                            <span className="mobilizacao-name-cell">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(0) }}
              pageSizeOptions={[25, 50, 100, 200]}
            />
          </>
        )}
      </Card>
    </div>
  )
}
