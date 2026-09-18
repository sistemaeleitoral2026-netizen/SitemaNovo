import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Car,
  Home,
  MessageSquare,
  Minus,
  Search,
  ExternalLink,
  Save,
  CheckCircle2,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { fetchCadastros, updateEquipeMobilizacaoFlags, updateMobilizacaoFlags } from '../lib/cadastros'
import { supabase } from '../lib/supabase'
import type { Cadastro, Coordenador, Lider } from '../types'

type StatusFilter = 'todos' | 'carros' | 'casa' | 'postagens' | 'pendente'
type TipoPessoa = 'todos' | 'eleitor' | 'coordenador' | 'lideranca'
type QtyField = 'carros_adesivados' | 'adesivos_casa' | 'postagens'

type PessoaRow = {
  key: string
  id: string
  nome: string
  tipo: 'eleitor' | 'coordenador' | 'lideranca'
  tipoLabel: string
  detalhe: string
  carros_adesivados: number
  adesivos_casa: number
  postagens: number
  href: string | null
}

const TIPO_LABEL: Record<TipoPessoa, string> = {
  todos: 'Todas as pessoas',
  eleitor: 'Eleitores',
  coordenador: 'Coordenadores',
  lideranca: 'Lideranças',
}

function toQty(value: unknown) {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function matchesStatus(row: PessoaRow, status: StatusFilter) {
  if (status === 'todos') return true
  if (status === 'carros') return row.carros_adesivados > 0
  if (status === 'casa') return row.adesivos_casa > 0
  if (status === 'postagens') return row.postagens > 0
  return row.carros_adesivados === 0 && row.adesivos_casa === 0 && row.postagens === 0
}

export function MobilizacaoPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const status: StatusFilter =
    statusParam === 'carros' || statusParam === 'casa' || statusParam === 'postagens' || statusParam === 'pendente'
      ? statusParam
      : statusParam === 'adesivo'
        ? 'carros'
        : 'todos'

  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<TipoPessoa>('todos')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<QtyField, string>>>>({})

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
      carros_adesivados: toQty(c.carros_adesivados),
      adesivos_casa: toQty(c.adesivos_casa),
      postagens: toQty(c.postagens),
      href: `/cadastros/${c.id}/editar`,
    }))

    const coords: PessoaRow[] = coordenadores.map((c) => ({
      key: `coordenador-${c.id}`,
      id: c.id,
      nome: c.nome,
      tipo: 'coordenador',
      tipoLabel: 'Coordenador',
      detalhe: 'Equipe',
      carros_adesivados: toQty(c.carros_adesivados),
      adesivos_casa: toQty(c.adesivos_casa),
      postagens: toQty(c.postagens),
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
      carros_adesivados: toQty(l.carros_adesivados),
      adesivos_casa: toQty(l.adesivos_casa),
      postagens: toQty(l.postagens),
      href: null,
    }))

    return [...coords, ...lids, ...eleitores].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR'),
    )
  }, [cadastros, coordenadores, lideres])

  const counts = useMemo(() => {
    let carros = 0
    let casa = 0
    let postagens = 0
    let pendentes = 0
    pessoas.forEach((p) => {
      carros += p.carros_adesivados
      casa += p.adesivos_casa
      postagens += p.postagens
      if (p.carros_adesivados === 0 && p.adesivos_casa === 0 && p.postagens === 0) pendentes += 1
    })
    return { carros, casa, postagens, pendentes }
  }, [pessoas])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return pessoas.filter((p) => {
      if (tipoFilter !== 'todos' && p.tipo !== tipoFilter) return false
      if (!matchesStatus(p, status)) return false
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

  function draftValue(row: PessoaRow, field: QtyField) {
    const draft = drafts[row.key]?.[field]
    if (draft !== undefined) return draft
    return String(row[field] || '')
  }

  function setDraft(rowKey: string, field: QtyField, value: string) {
    const cleaned = value.replace(/\D/g, '')
    setDrafts((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [field]: cleaned },
    }))
  }

  const dirtyRows = useMemo(
    () => pessoas.filter((row) => {
      const draft = drafts[row.key]
      return draft && (Object.keys(draft) as QtyField[]).some((field) => toQty(draft[field]) !== row[field])
    }),
    [drafts, pessoas],
  )

  async function saveRow(row: PessoaRow, showFeedback = true) {
    const draft = drafts[row.key]
    if (!draft) return true

    const changes: Partial<Record<QtyField, number>> = {}
    ;(Object.keys(draft) as QtyField[]).forEach((field) => {
      const next = toQty(draft[field])
      if (next !== row[field]) changes[field] = next
    })

    if (Object.keys(changes).length === 0) {
      setDrafts((prev) => {
        const copy = { ...prev }
        delete copy[row.key]
        return copy
      })
      return true
    }

    setSavingKey(row.key)
    setError(null)
    setSuccess(null)

    let err: string | null = null
    if (row.tipo === 'eleitor') {
      ;({ error: err } = await updateMobilizacaoFlags(row.id, changes))
    } else if (row.tipo === 'coordenador') {
      ;({ error: err } = await updateEquipeMobilizacaoFlags('coordenadores', row.id, changes))
    } else {
      ;({ error: err } = await updateEquipeMobilizacaoFlags('lideres', row.id, changes))
    }

    setSavingKey(null)
    if (err) {
      setError(err)
      return false
    }

    if (row.tipo === 'eleitor') {
      setCadastros((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...changes } : c)))
    } else if (row.tipo === 'coordenador') {
      setCoordenadores((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...changes } : c)))
    } else {
      setLideres((prev) => prev.map((l) => (l.id === row.id ? { ...l, ...changes } : l)))
    }

    setDrafts((prev) => {
      const copy = { ...prev }
      delete copy[row.key]
      return copy
    })
    if (showFeedback) setSuccess(`Alterações de ${row.nome} salvas.`)
    return true
  }

  async function saveAll() {
    if (!dirtyRows.length) return
    setSavingAll(true)
    setError(null)
    setSuccess(null)
    let saved = 0
    for (const row of dirtyRows) {
      if (await saveRow(row, false)) saved += 1
      else break
    }
    setSavingAll(false)
    if (saved > 0) setSuccess(`${saved} ${saved === 1 ? 'registro salvo' : 'registros salvos'} com sucesso.`)
  }

  function qtyInput(row: PessoaRow, field: QtyField, label: string) {
    const busy = savingKey === row.key || savingAll
    return (
      <input
        type="text"
        inputMode="numeric"
        className="mobilizacao-qty"
        value={draftValue(row, field)}
        disabled={busy}
        placeholder="0"
        aria-label={`${label} — ${row.nome}`}
        onChange={(e) => setDraft(row.key, field, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            saveRow(row)
          }
        }}
      />
    )
  }

  const statusFilters = [
    { key: 'carros' as const, label: 'Carros adesivados', value: counts.carros, Icon: Car },
    { key: 'casa' as const, label: 'Adesivos para casa', value: counts.casa, Icon: Home },
    { key: 'postagens' as const, label: 'Postagens', value: counts.postagens, Icon: MessageSquare },
    { key: 'pendente' as const, label: 'Sem lançamento', value: counts.pendentes, Icon: Minus },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div className="mobilizacao-page nv-dash">
      <div className="nv-heading">
        <div>
          <p className="nv-eyebrow">Gestão</p>
          <h1>Mobilização</h1>
          <p className="nv-sub">
            Quantidades de carros adesivados, adesivos para casa e postagens.
          </p>
        </div>
        <div className="nv-heading-actions page-header-actions">
          <Button
            type="button"
            onClick={saveAll}
            loading={savingAll}
            disabled={!dirtyRows.length}
          >
            <Save size={16} strokeWidth={1.6} />
            {dirtyRows.length ? `Salvar (${dirtyRows.length})` : 'Tudo salvo'}
          </Button>
        </div>
      </div>

      <div className="mob-status-strip" role="group" aria-label="Filtro por status">
        {statusFilters.map(({ key, label, value, Icon }) => (
          <button
            key={key}
            type="button"
            className={`mob-status-cell${status === key ? ' is-active' : ''}`}
            onClick={() => setStatus(status === key ? 'todos' : key)}
          >
            <Icon size={15} strokeWidth={1.6} aria-hidden />
            <span className="mob-status-label">{label}</span>
            <strong className="tabular-nums">{value.toLocaleString('pt-BR')}</strong>
          </button>
        ))}
      </div>

      <div className="nv-panel mob-panel">
        <div className="mob-toolbar">
          <div className="mob-search">
            <Search size={15} strokeWidth={1.6} aria-hidden />
            <Input
              placeholder="Buscar por nome, tipo ou detalhe…"
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

        {error && <div className="alert alert-error mob-alert">{error}</div>}
        {success && (
          <div className="alert alert-success mobilizacao-feedback mob-alert" role="status">
            <CheckCircle2 size={15} strokeWidth={1.6} /> {success}
          </div>
        )}

        {!filtered.length ? (
          <EmptyState
            title="Nenhuma pessoa neste filtro"
            description="Ajuste o status acima ou a busca."
          />
        ) : (
          <>
            <div className="table-wrapper mobilizacao-table-desktop">
              <table className="data-table mob-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Detalhe</th>
                    <th>Carros</th>
                    <th>Adesivos casa</th>
                    <th>Postagens</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((p) => (
                    <tr key={p.key} className={drafts[p.key] ? 'is-dirty' : undefined}>
                      <td>
                        <strong>{p.nome}</strong>
                      </td>
                      <td>
                        <span className="mob-tipo">{p.tipoLabel}</span>
                      </td>
                      <td>
                        <span className="mobilizacao-name-cell">{p.detalhe}</span>
                      </td>
                      <td>{qtyInput(p, 'carros_adesivados', 'Carros adesivados')}</td>
                      <td>{qtyInput(p, 'adesivos_casa', 'Adesivos para casa')}</td>
                      <td>{qtyInput(p, 'postagens', 'Postagens')}</td>
                      <td>
                        <div className="mobilizacao-actions">
                          {drafts[p.key] && (
                            <Button size="sm" onClick={() => saveRow(p)} loading={savingKey === p.key}>
                              <Save size={14} strokeWidth={1.6} /> Salvar
                            </Button>
                          )}
                          {p.href && (
                            <Link to={p.href}>
                              <Button variant="ghost" size="sm" aria-label={`Abrir ficha de ${p.nome}`} title="Abrir ficha">
                                <ExternalLink size={15} strokeWidth={1.6} />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobilizacao-mobile-list">
              {pageItems.map((p) => (
                <article className={`mobilizacao-mobile-card${drafts[p.key] ? ' is-dirty' : ''}`} key={p.key}>
                  <div className="mobilizacao-mobile-head">
                    <div>
                      <strong>{p.nome}</strong>
                      <span>{p.detalhe}</span>
                    </div>
                    <span className="mob-tipo">{p.tipoLabel}</span>
                  </div>
                  <div className="mobilizacao-mobile-fields">
                    <label><span>Carros</span>{qtyInput(p, 'carros_adesivados', 'Carros adesivados')}</label>
                    <label><span>Adesivos casa</span>{qtyInput(p, 'adesivos_casa', 'Adesivos para casa')}</label>
                    <label><span>Postagens</span>{qtyInput(p, 'postagens', 'Postagens')}</label>
                  </div>
                  <div className="mobilizacao-mobile-actions">
                    {p.href && (
                      <Link to={p.href} className="mobilizacao-open-link">
                        <ExternalLink size={14} strokeWidth={1.6} /> Abrir ficha
                      </Link>
                    )}
                    <Button size="sm" onClick={() => saveRow(p)} loading={savingKey === p.key} disabled={!drafts[p.key]}>
                      <Save size={14} strokeWidth={1.6} /> {drafts[p.key] ? 'Salvar' : 'Salvo'}
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            <div className="mob-pager">
              <Pagination
                page={page}
                totalPages={totalPages}
                totalItems={filtered.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(0) }}
                pageSizeOptions={[25, 50, 100, 200]}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
