import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Check, Columns3, Download, Filter, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import { formatCpf, formatDate, formatPhone, formatCep } from '../lib/format'
import { fetchCadastros } from '../lib/cadastros'
import { logAudit } from '../lib/audit'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { supabase } from '../lib/supabase'
import type { Cadastro, Profile } from '../types'

type ViewMode = 'todos' | 'mapped' | 'unmapped' | 'week7'
type ColumnKey = 'nome' | 'nerite' | 'coordenador' | 'lider' | 'nascimento' | 'nome_mae' | 'cpf' | 'telefone' | 'titulo' | 'zona' | 'secao' | 'cep' | 'endereco' | 'localizacao' | 'data' | 'acoes'
type SortKey = Exclude<ColumnKey, 'acoes'>
type SortDir = 'desc' | 'asc'
type CadastroOperator = Pick<Profile, 'id' | 'nome' | 'diretoria_id'>

const columnOptions: { key: ColumnKey; label: string; defaultVisible: boolean }[] = [
  { key: 'nome', label: 'Nome', defaultVisible: true },
  { key: 'nerite', label: 'Nerite', defaultVisible: true },
  { key: 'coordenador', label: 'Coordenador', defaultVisible: true },
  { key: 'lider', label: 'Líder', defaultVisible: true },
  { key: 'nascimento', label: 'Nascimento', defaultVisible: true },
  { key: 'nome_mae', label: 'Nome da mãe', defaultVisible: true },
  { key: 'cpf', label: 'CPF', defaultVisible: false },
  { key: 'telefone', label: 'Telefone', defaultVisible: true },
  { key: 'titulo', label: 'Título', defaultVisible: true },
  { key: 'zona', label: 'Zona', defaultVisible: false },
  { key: 'secao', label: 'Seção', defaultVisible: false },
  { key: 'cep', label: 'CEP', defaultVisible: false },
  { key: 'endereco', label: 'Endereço', defaultVisible: false },
  { key: 'localizacao', label: 'Localização', defaultVisible: false },
  { key: 'data', label: 'Data', defaultVisible: false },
  { key: 'acoes', label: 'Ações', defaultVisible: true },
]

function compareText(a: string, b: string) {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })
}

function sortValue(
  c: Cadastro,
  key: SortKey,
  neriteNames: Map<string, string>,
): string | number {
  switch (key) {
    case 'nome':
      return (c.nome_completo ?? '').trim()
    case 'nerite':
      return (c.operator_id && neriteNames.get(c.operator_id)) || ''
    case 'coordenador':
      return (c.coordenador ?? '').trim()
    case 'lider':
      return (c.lider ?? '').trim()
    case 'nascimento':
      return c.data_nascimento || ''
    case 'nome_mae':
      return (c.nome_mae ?? '').trim()
    case 'cpf':
      return (c.cpf ?? '').replace(/\D/g, '')
    case 'telefone':
      return (c.telefone ?? '').replace(/\D/g, '')
    case 'titulo':
      return (c.titulo ?? '').trim()
    case 'zona':
      return (c.zona ?? '').trim()
    case 'secao':
      return (c.secao ?? '').trim()
    case 'cep':
      return (c.cep ?? '').replace(/\D/g, '')
    case 'endereco':
      return [c.endereco, c.numero, c.bairro].filter(Boolean).join(' ')
    case 'localizacao':
      return c.lat != null && c.lng != null ? 1 : 0
    case 'data':
      return c.created_at || ''
  }
}

async function fetchCadastroOperators() {
  const rpcResult = await supabase.rpc('list_cadastro_operadores')
  if (!rpcResult.error) return rpcResult
  return supabase.from('profiles').select('id, nome, diretoria_id').eq('role', 'operador').order('nome')
}

export function CadastrosPage() {
  const { profile } = useAuth()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const isOwnOnly = location.pathname === '/meus-cadastros'

  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [nerites, setNerites] = useState<CadastroOperator[]>([])
  const [search, setSearch] = useState('')
  const [operatorFilter, setOperatorFilter] = useState(() => searchParams.get('operator') ?? '')
  const [coordenadorFilter, setCoordenadorFilter] = useState(() => searchParams.get('coordenador') ?? '')
  const [liderFilter, setLiderFilter] = useState(() => searchParams.get('lider') ?? '')
  const [diretoriaFilter, setDiretoriaFilter] = useState(() => searchParams.get('diretoria') ?? '')
  const [zonaFilter, setZonaFilter] = useState(() => searchParams.get('zona') ?? '')
  const [secaoFilter, setSecaoFilter] = useState(() => searchParams.get('secao') ?? '')
  const [geoFilter, setGeoFilter] = useState('')
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [cepFilter, setCepFilter] = useState('')
  const [tituloFilter, setTituloFilter] = useState('')
  const [dupFilter, setDupFilter] = useState('')
  const [view, setView] = useState<ViewMode>('todos')
  const [advOpen, setAdvOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    () => new Set(columnOptions.filter((column) => column.defaultVisible).map((column) => column.key)),
  )
  const [sortKey, setSortKey] = useState<SortKey>('data')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const showColumn = (key: ColumnKey) => visibleColumns.has(key) && (key !== 'nerite' || !isOwnOnly)

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setPage(0)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [data, profilesResult] = await Promise.all([
        fetchCadastros({ operatorId: isOwnOnly ? profile?.id : undefined }),
        isOwnOnly
          ? Promise.resolve({ data: [] })
          : fetchCadastroOperators(),
      ])
      if ('error' in profilesResult && profilesResult.error) throw profilesResult.error
      setCadastros(data)
      setNerites((profilesResult.data ?? []) as CadastroOperator[])
      setPage(0)
    } catch {
      setLoadError('Não foi possível carregar as fichas. Confira sua conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [isOwnOnly, profile?.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const next = new URLSearchParams()
    if (operatorFilter) next.set('operator', operatorFilter)
    if (coordenadorFilter) next.set('coordenador', coordenadorFilter)
    if (liderFilter) next.set('lider', liderFilter)
    if (diretoriaFilter) next.set('diretoria', diretoriaFilter)
    setSearchParams(next, { replace: true })
  }, [operatorFilter, coordenadorFilter, liderFilter, diretoriaFilter, setSearchParams])

  const neriteNames = useMemo(
    () => new Map(nerites.map((nerite) => [nerite.id, nerite.nome])),
    [nerites],
  )

  const neriteById = useMemo(
    () => new Map(nerites.map((n) => [n.id, n])),
    [nerites],
  )

  const zonas = useMemo(
    () => [...new Set(cadastros.map((c) => c.zona).filter((z): z is string => Boolean(z)))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    [cadastros],
  )
  const secoes = useMemo(
    () => [...new Set(
      cadastros
        .filter((c) => !zonaFilter || c.zona === zonaFilter)
        .map((c) => c.secao)
        .filter((s): s is string => Boolean(s)),
    )].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    [cadastros, zonaFilter],
  )
  const coordenadoresOpts = useMemo(
    () => [...new Set(cadastros.map((c) => (c.coordenador ?? '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [cadastros],
  )
  const lideresOpts = useMemo(
    () => [...new Set(cadastros.map((c) => (c.lider ?? '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [cadastros],
  )

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])
  const weekAgo = useMemo(() => Date.now() - 7 * 24 * 60 * 60 * 1000, [])

  const duplicateTitles = useMemo(() => {
    const counts = new Map<string, number>()
    cadastros.forEach((c) => {
      const key = (c.titulo ?? '').trim().toLowerCase()
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    })
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k))
  }, [cadastros])

  const filteredCadastros = useMemo(() => {
    const textTerm = search.trim().toLowerCase()
    const digitTerm = search.replace(/\D/g, '')
    const cepTerm = cepFilter.replace(/\D/g, '')
    const tituloTerm = tituloFilter.trim().toLowerCase()
    const coordTerm = coordenadorFilter.trim().toLowerCase()
    const liderTerm = liderFilter.trim().toLowerCase()

    return cadastros.filter((c) => {
      const matchesSearch = !textTerm || [
        c.nome_completo ?? '',
        c.coordenador ?? '',
        c.lider ?? '',
        c.cpf ?? '',
        c.telefone ?? '',
        c.titulo ?? '',
        c.cep ?? '',
        neriteNames.get(c.operator_id ?? '') ?? '',
      ].some((value) => {
        const normalized = value.toLowerCase()
        return normalized.includes(textTerm) || (!!digitTerm && value.replace(/\D/g, '').includes(digitTerm))
      })

      if (!matchesSearch) return false
      if (operatorFilter && c.operator_id !== operatorFilter) return false
      if (coordTerm && (c.coordenador ?? '').trim().toLowerCase() !== coordTerm) return false
      if (liderTerm && (c.lider ?? '').trim().toLowerCase() !== liderTerm) return false
      if (diretoriaFilter) {
        const nerite = neriteById.get(c.operator_id ?? '')
        const dirId = c.diretoria_id || nerite?.diretoria_id
        if (dirId !== diretoriaFilter) return false
      }
      if (zonaFilter && c.zona !== zonaFilter) return false
      if (secaoFilter && c.secao !== secaoFilter) return false

      const hasGeo = c.lat != null && c.lng != null
      const effectiveGeo = geoFilter || (view === 'mapped' ? 'mapped' : view === 'unmapped' ? 'unmapped' : '')
      if (effectiveGeo === 'mapped' && !hasGeo) return false
      if (effectiveGeo === 'unmapped' && hasGeo) return false

      if (view === 'week7' && new Date(c.created_at).getTime() < weekAgo) return false

      if (period.start && new Date(c.created_at) < period.start) return false
      if (period.end && new Date(c.created_at) > period.end) return false
      if (dateFrom && c.created_at.slice(0, 10) < dateFrom) return false
      if (dateTo && c.created_at.slice(0, 10) > dateTo) return false
      if (cepTerm && !(c.cep ?? '').replace(/\D/g, '').includes(cepTerm)) return false
      if (tituloTerm && !(c.titulo ?? '').toLowerCase().includes(tituloTerm)) return false

      const titleKey = (c.titulo ?? '').trim().toLowerCase()
      if (dupFilter === 'only' && !duplicateTitles.has(titleKey)) return false
      if (dupFilter === 'hide' && titleKey && duplicateTitles.has(titleKey)) return false

      return true
    })
  }, [
    cadastros, search, operatorFilter, coordenadorFilter, liderFilter, diretoriaFilter,
    zonaFilter, secaoFilter, geoFilter, view, weekAgo,
    period, dateFrom, dateTo, cepFilter, tituloFilter, dupFilter, duplicateTitles, neriteNames, neriteById,
  ])

  const sortedCadastros = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1
    return [...filteredCadastros].sort((a, b) => {
      const va = sortValue(a, sortKey, neriteNames)
      const vb = sortValue(b, sortKey, neriteNames)
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir
      }
      const cmp = compareText(String(va), String(vb))
      if (cmp !== 0) return cmp * dir
      // desempate estável por data mais recente
      return b.created_at.localeCompare(a.created_at)
    })
  }, [filteredCadastros, sortKey, sortDir, neriteNames])

  useEffect(() => setPage(0), [
    search, operatorFilter, coordenadorFilter, liderFilter, diretoriaFilter,
    zonaFilter, secaoFilter, geoFilter, view, periodPreset,
    dateFrom, dateTo, cepFilter, tituloFilter, dupFilter, pageSize,
  ])

  const hasFilters = Boolean(
    search || operatorFilter || coordenadorFilter || liderFilter || diretoriaFilter
    || zonaFilter || secaoFilter || geoFilter || periodPreset !== 'all'
    || dateFrom || dateTo || cepFilter || tituloFilter || dupFilter || view !== 'todos',
  )

  const scopeHint = useMemo(() => {
    const parts: string[] = []
    if (liderFilter) parts.push(`Liderança ${liderFilter}`)
    if (coordenadorFilter) parts.push(`Coordenador ${coordenadorFilter}`)
    if (operatorFilter) parts.push(neriteNames.get(operatorFilter) ?? 'Nerite')
    return parts.join(' · ')
  }, [liderFilter, coordenadorFilter, operatorFilter, neriteNames])

  const totalPages = Math.max(1, Math.ceil(sortedCadastros.length / pageSize))
  const pageItems = sortedCadastros.slice(page * pageSize, (page + 1) * pageSize)

  function SortHeader({ column, label }: { column: SortKey; label: string }) {
    const active = sortKey === column
    return (
      <th aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}>
        <button
          type="button"
          className={`sort-th-btn${active ? ' is-active' : ''}`}
          onClick={() => toggleSort(column)}
        >
          <span>{label}</span>
          <span className="sort-th-icon" aria-hidden>
            {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
          </span>
        </button>
      </th>
    )
  }

  function clearFilters() {
    setSearch('')
    setOperatorFilter('')
    setCoordenadorFilter('')
    setLiderFilter('')
    setDiretoriaFilter('')
    setZonaFilter('')
    setSecaoFilter('')
    setGeoFilter('')
    setPeriodPreset('all')
    setDateFrom('')
    setDateTo('')
    setCepFilter('')
    setTituloFilter('')
    setDupFilter('')
    setView('todos')
    setSearchParams({}, { replace: true })
  }

  const canEdit = (_c: Cadastro) =>
    hasRole(profile, ['admin', 'diretoria']) || _c.operator_id === profile?.id

  const canDelete = (c: Cadastro) => {
    if (hasRole(profile, 'admin')) return true
    if (c.operator_id === profile?.id) return true
    if (hasRole(profile, 'diretoria')) return true
    return false
  }

  async function handleDelete() {
    if (!deleteId) return
    const cadastro = cadastros.find((item) => item.id === deleteId)
    if (!cadastro || !canDelete(cadastro)) {
      setDeleteId(null)
      return
    }
    setDeleting(true)
    const { error } = await supabase.from('cadastros').delete().eq('id', deleteId)
    if (!error) {
      logAudit('excluir', 'cadastros', deleteId)
      setCadastros((prev) => prev.filter((c) => c.id !== deleteId))
    }
    setDeleting(false)
    setDeleteId(null)
  }

  function exportCsv() {
    const header = ['Nome', 'Coordenador', 'Lideranca', 'Data nascimento', 'Nome da mae', 'Telefone', 'Titulo', 'Zona', 'Secao', 'CEP', 'Data']
    const rows = filteredCadastros.map((c) => [
      c.nome_completo,
      c.coordenador || '',
      c.lider || '',
      c.data_nascimento ? formatDate(c.data_nascimento) : '',
      c.nome_mae || '',
      c.telefone,
      c.titulo,
      c.zona,
      c.secao,
      c.cep ?? '',
      formatDate(c.created_at),
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cadastros.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="cadastros-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isOwnOnly ? 'Meus Cadastros' : 'Todos os Cadastros'}</h1>
          <p className="page-subtitle">
            {isOwnOnly ? 'Cadastros realizados por você.' : 'Todos os cadastros feitos pelas nerites.'}
          </p>
        </div>
        <div className="page-header-actions">
          {isOwnOnly && (
            <Link to="/cadastros/novo">
              <Button><Plus size={16} /> Novo cadastro</Button>
            </Link>
          )}
          {!isOwnOnly && (
            <>
              <div className="column-picker">
                <Button variant="secondary" onClick={() => setColumnMenuOpen((open) => !open)} aria-expanded={columnMenuOpen}>
                  <Columns3 size={15} /> Colunas visíveis
                </Button>
                {columnMenuOpen && (
                  <div className="column-picker-menu">
                    <div className="column-picker-title">
                      <strong>Exibir colunas</strong>
                      <span>{visibleColumns.size} selecionadas</span>
                    </div>
                    <div className="column-picker-grid">
                      {columnOptions.map((column) => (
                        <label key={column.key}>
                          <input
                            type="checkbox"
                            checked={visibleColumns.has(column.key)}
                            onChange={() => toggleColumn(column.key)}
                          />
                          <span className="column-check"><Check size={11} /></span>
                          {column.label}
                        </label>
                      ))}
                    </div>
                    <div className="column-picker-footer">
                      <button type="button" onClick={() => setVisibleColumns(new Set(columnOptions.map((column) => column.key)))}>Ver todas ({columnOptions.length})</button>
                      <button type="button" className="apply-columns" onClick={() => setColumnMenuOpen(false)}>Aplicar</button>
                    </div>
                  </div>
                )}
              </div>
              <Button variant="secondary" onClick={exportCsv}>
                <Download size={15} /> Exportar
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="views-row">
          {([
            ['todos', 'Todos'],
            ['mapped', 'Com localização'],
            ['unmapped', 'Sem localização'],
            ['week7', 'Últimos 7 dias'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`view-chip${view === key ? ' active' : ''}`}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
      </div>

      <div className="filter-panel cadastros-filter-panel">
          <div className="filter-panel-heading">
            <div>
              <Filter size={17} />
              <strong>Filtros</strong>
              <span>Refine os registros exibidos</span>
            </div>
            <div style={{ display: 'flex', gap: '.35rem' }}>
              <button type="button" className="clear-filters" onClick={() => setAdvOpen((v) => !v)}>
                {advOpen ? 'Ocultar avançados' : 'Filtros avançados'}
              </button>
              <button type="button" className="clear-filters" onClick={clearFilters} style={{ color: '#2f6fed' }}>
                <RotateCcw size={13} /> Limpar tudo
              </button>
            </div>
          </div>

          <div className="filters-grid filters-grid-cadastros">
            <div className="search-field">
              <Search size={16} />
              <Input
                placeholder="Nome, CPF, telefone, título ou CEP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar cadastros"
              />
            </div>
            {!isOwnOnly && (
              <Select
                value={operatorFilter}
                onChange={(e) => setOperatorFilter(e.target.value)}
                options={nerites.map((nerite) => ({ value: nerite.id, label: nerite.nome }))}
                placeholder="Todas as nerites"
                aria-label="Nerite"
              />
            )}
            {!isOwnOnly && (
              <Select
                value={coordenadorFilter}
                onChange={(e) => setCoordenadorFilter(e.target.value)}
                options={coordenadoresOpts.map((nome) => ({ value: nome, label: nome }))}
                placeholder="Todos os coordenadores"
                aria-label="Coordenador"
              />
            )}
            {!isOwnOnly && (
              <Select
                value={liderFilter}
                onChange={(e) => setLiderFilter(e.target.value)}
                options={lideresOpts.map((nome) => ({ value: nome, label: nome }))}
                placeholder="Todas as lideranças"
                aria-label="Liderança"
              />
            )}
            <Select
              value={zonaFilter}
              onChange={(e) => { setZonaFilter(e.target.value); setSecaoFilter('') }}
              options={zonas.map((zona) => ({ value: zona, label: `Zona ${zona}` }))}
              placeholder="Todas as zonas"
              aria-label="Zona"
            />
            <Select
              value={secaoFilter}
              onChange={(e) => setSecaoFilter(e.target.value)}
              options={secoes.map((secao) => ({ value: secao, label: `Seção ${secao}` }))}
              placeholder="Todas as seções"
              aria-label="Seção"
            />
            <Select
              value={geoFilter}
              onChange={(e) => setGeoFilter(e.target.value)}
              options={[{ value: 'mapped', label: 'Com localização' }, { value: 'unmapped', label: 'Sem localização' }]}
              placeholder="Qualquer localização"
              aria-label="Localização"
            />
            <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} showRange={false} />
            <div className="compact-date-filter">
              <span>De</span>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Data inicial" />
            </div>
          </div>

          {advOpen && (
            <div className="adv-grid">
              <div>
                <label className="field-label" style={{ display: 'block', color: '#6c788d', fontSize: '.66rem', fontWeight: 600, marginBottom: '.3rem' }}>Até</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#6c788d', fontSize: '.66rem', fontWeight: 600, marginBottom: '.3rem' }}>CEP</label>
                <Input value={cepFilter} onChange={(e) => setCepFilter(e.target.value)} placeholder="00000-000" />
              </div>
              <div>
                <label style={{ display: 'block', color: '#6c788d', fontSize: '.66rem', fontWeight: 600, marginBottom: '.3rem' }}>Título de eleitor</label>
                <Input value={tituloFilter} onChange={(e) => setTituloFilter(e.target.value)} placeholder="Somente números" />
              </div>
              <div>
                <label style={{ display: 'block', color: '#6c788d', fontSize: '.66rem', fontWeight: 600, marginBottom: '.3rem' }}>Duplicidade</label>
                <Select
                  value={dupFilter}
                  onChange={(e) => setDupFilter(e.target.value)}
                  options={[
                    { value: 'only', label: 'Somente duplicados' },
                    { value: 'hide', label: 'Ocultar duplicados' },
                  ]}
                  placeholder="Todos"
                />
              </div>
            </div>
          )}

          <div className="filter-results" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <span>
              <strong>{filteredCadastros.length}</strong> de {cadastros.length} registros encontrados
              {scopeHint ? <span style={{ color: '#657084' }}> · {scopeHint}</span> : null}
            </span>
            <span style={{ color: '#8a95a7', fontSize: '.68rem' }}>Ordenado por data</span>
          </div>
      </div>

      <div className="cadastros-table-card">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Spinner size={36} />
          </div>
        ) : loadError ? (
          <div className="alert alert-error" style={{ margin: '1rem' }}>
            {loadError} <Button size="sm" variant="secondary" onClick={() => void load()}>Tentar novamente</Button>
          </div>
        ) : !pageItems.length ? (
          <EmptyState
            title="Nenhum cadastro encontrado"
            description={hasFilters ? 'Ajuste ou limpe os filtros para ver outros resultados.' : undefined}
            action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button> : undefined}
          />
        ) : (
          <>
            <div className="table-wrapper desktop-only">
              <table className="data-table">
                <thead>
                  <tr>
                    {showColumn('nome') && <SortHeader column="nome" label="Nome" />}
                    {showColumn('nerite') && <SortHeader column="nerite" label="Nerite" />}
                    {showColumn('coordenador') && <SortHeader column="coordenador" label="Coordenador" />}
                    {showColumn('lider') && <SortHeader column="lider" label="Líder" />}
                    {showColumn('nascimento') && <SortHeader column="nascimento" label="Nascimento" />}
                    {showColumn('nome_mae') && <SortHeader column="nome_mae" label="Nome da mãe" />}
                    {showColumn('cpf') && <SortHeader column="cpf" label="CPF" />}
                    {showColumn('telefone') && <SortHeader column="telefone" label="Telefone" />}
                    {showColumn('titulo') && <SortHeader column="titulo" label="Título" />}
                    {showColumn('zona') && <SortHeader column="zona" label="Zona" />}
                    {showColumn('secao') && <SortHeader column="secao" label="Seção" />}
                    {showColumn('cep') && <SortHeader column="cep" label="CEP" />}
                    {showColumn('endereco') && <SortHeader column="endereco" label="Endereço" />}
                    {showColumn('localizacao') && <SortHeader column="localizacao" label="Localização" />}
                    {showColumn('data') && <SortHeader column="data" label="Data" />}
                    {showColumn('acoes') && <th className="sticky-actions-head">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => {
                    const hasGeo = c.lat != null && c.lng != null
                    return (
                      <tr key={c.id}>
                        {showColumn('nome') && <td><strong style={{ fontWeight: 600, fontSize: '.8rem' }}>{c.nome_completo}</strong></td>}
                        {showColumn('nerite') && <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{(c.operator_id && neriteNames.get(c.operator_id)) || '—'}</span></td>}
                        {showColumn('coordenador') && <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{c.coordenador || '—'}</span></td>}
                        {showColumn('lider') && <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{c.lider || '—'}</span></td>}
                        {showColumn('nascimento') && <td>{c.data_nascimento ? formatDate(c.data_nascimento) : '—'}</td>}
                        {showColumn('nome_mae') && <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{c.nome_mae || '—'}</span></td>}
                        {showColumn('cpf') && <td>{formatCpf(c.cpf) || '—'}</td>}
                        {showColumn('telefone') && <td>
                          <span className="phone-cell">
                            {formatPhone(c.telefone) || '—'}
                            {c.telefone ? <WhatsAppLink phone={c.telefone} className="whatsapp-link-inline" /> : null}
                          </span>
                        </td>}
                        {showColumn('titulo') && <td className="mono-cell">{c.titulo}</td>}
                        {showColumn('zona') && <td>{c.zona}</td>}
                        {showColumn('secao') && <td>{c.secao}</td>}
                        {showColumn('cep') && <td>{formatCep(c.cep) || '—'}</td>}
                        {showColumn('endereco') && (
                          <td>
                            <span style={{ color: '#6c788d', fontSize: '.78rem' }}>
                              {[c.endereco, c.numero && `nº ${c.numero}`, c.bairro].filter(Boolean).join(', ') || '—'}
                            </span>
                          </td>
                        )}
                        {showColumn('localizacao') && <td>
                          <span className={`badge ${hasGeo ? 'badge-success' : 'badge-warning'}`}>
                            {hasGeo ? 'Com localização' : 'Sem localização'}
                          </span>
                        </td>}
                        {showColumn('data') && <td>{formatDate(c.created_at)}</td>}
                        {showColumn('acoes') && <td className="sticky-actions-cell">
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {(canEdit(c) || canDelete(c)) && (
                              <>
                                {canEdit(c) && (
                                <Link to={`/cadastros/${c.id}/editar`}>
                                  <Button variant="ghost" size="sm" aria-label="Editar"><Pencil size={16} /></Button>
                                </Link>
                                )}
                                {canDelete(c) && (
                                <Button variant="ghost" size="sm" aria-label="Excluir" onClick={() => setDeleteId(c.id)}>
                                  <Trash2 size={16} color="var(--color-danger)" />
                                </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-cards">
              {pageItems.map((c) => {
                const hasGeo = c.lat != null && c.lng != null
                return (
                  <div className="mobile-card" key={c.id}>
                    <div className="mobile-card-top">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ display: 'block', fontSize: '.88rem' }}>{c.nome_completo}</strong>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexWrap: 'wrap', color: '#8a95a7', fontSize: '.7rem', marginTop: '.1rem' }}>
                          {formatPhone(c.telefone) || '—'}
                          {c.telefone ? <WhatsAppLink phone={c.telefone} className="whatsapp-link-inline" /> : null}
                          <span>· {formatDate(c.created_at)} · {hasGeo ? 'Com localização' : 'Sem localização'}</span>
                        </span>
                      </div>
                      {(canEdit(c) || canDelete(c)) && (
                        <div style={{ display: 'flex', gap: '.3rem' }}>
                          {canEdit(c) && (
                          <Link to={`/cadastros/${c.id}/editar`}>
                            <Button variant="ghost" size="sm" aria-label="Editar"><Pencil size={16} /></Button>
                          </Link>
                          )}
                          {canDelete(c) && (
                          <Button variant="ghost" size="sm" aria-label="Excluir" onClick={() => setDeleteId(c.id)}>
                            <Trash2 size={16} color="var(--color-danger)" />
                          </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem .75rem', marginTop: '.8rem', paddingTop: '.7rem', borderTop: '1px solid #e9edf4' }}>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>Coordenador</span><strong style={{ fontSize: '.76rem' }}>{c.coordenador || '—'}</strong></div>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>Líder</span><strong style={{ fontSize: '.76rem' }}>{c.lider || '—'}</strong></div>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>Nascimento</span><strong style={{ fontSize: '.76rem' }}>{c.data_nascimento ? formatDate(c.data_nascimento) : '—'}</strong></div>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>Nome da mãe</span><strong style={{ fontSize: '.76rem' }}>{c.nome_mae || '—'}</strong></div>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>CPF</span><strong style={{ fontSize: '.76rem' }}>{formatCpf(c.cpf) || '—'}</strong></div>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>Título</span><strong style={{ fontSize: '.76rem' }}>{c.titulo}</strong></div>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>Zona / Seção</span><strong style={{ fontSize: '.76rem' }}>{c.zona} / {c.secao}</strong></div>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>CEP</span><strong style={{ fontSize: '.76rem' }}>{formatCep(c.cep) || '—'}</strong></div>
                    </div>
                  </div>
                )
              })}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={filteredCadastros.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(0) }}
              pageSizeOptions={[25, 50, 100, 200]}
            />
          </>
        )}
      </div>

      <Modal
        open={!!deleteId}
        title="Excluir cadastro?"
        description="Esta ação excluirá o cadastro selecionado. Deseja continuar?"
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        loading={deleting}
      />
    </div>
  )
}
