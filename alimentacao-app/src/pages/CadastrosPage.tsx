import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Download, Filter, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { formatCpf, formatDate, formatPhone, formatCep } from '../lib/format'
import { fetchCadastros } from '../lib/cadastros'
import { logAudit } from '../lib/audit'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { supabase } from '../lib/supabase'
import type { Cadastro, Profile } from '../types'

type ViewMode = 'todos' | 'mapped' | 'unmapped' | 'week7'

export function CadastrosPage() {
  const { profile } = useAuth()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const isOwnOnly = location.pathname === '/meus-cadastros'

  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
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
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, profilesResult] = await Promise.all([
        fetchCadastros({ operatorId: isOwnOnly ? profile?.id : undefined }),
        isOwnOnly
          ? Promise.resolve({ data: [] })
          : supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
      ])
      setCadastros(data)
      setNerites((profilesResult.data ?? []) as Profile[])
      setPage(0)
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
    () => [...new Set(cadastros.map((c) => c.zona).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    [cadastros],
  )
  const secoes = useMemo(
    () => [...new Set(cadastros.filter((c) => !zonaFilter || c.zona === zonaFilter).map((c) => c.secao).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
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
        neriteNames.get(c.operator_id) ?? '',
      ].some((value) => {
        const normalized = value.toLowerCase()
        return normalized.includes(textTerm) || (!!digitTerm && value.replace(/\D/g, '').includes(digitTerm))
      })

      if (!matchesSearch) return false
      if (operatorFilter && c.operator_id !== operatorFilter) return false
      if (coordTerm && (c.coordenador ?? '').trim().toLowerCase() !== coordTerm) return false
      if (liderTerm && (c.lider ?? '').trim().toLowerCase() !== liderTerm) return false
      if (diretoriaFilter) {
        const nerite = neriteById.get(c.operator_id)
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

  const totalPages = Math.max(1, Math.ceil(filteredCadastros.length / pageSize))
  const pageItems = filteredCadastros.slice(page * pageSize, (page + 1) * pageSize)

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

  const canEdit = (c: Cadastro) =>
    profile?.role === 'admin' || c.operator_id === profile?.id

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from('cadastros').delete().eq('id', deleteId)
    if (!error) {
      await logAudit('excluir', 'cadastros', deleteId)
      setCadastros((prev) => prev.filter((c) => c.id !== deleteId))
    }
    setDeleting(false)
    setDeleteId(null)
  }

  function exportCsv() {
    const header = ['Nome', 'Coordenador', 'Lideranca', 'Data nascimento', 'Telefone', 'Titulo', 'Zona', 'Secao', 'CEP', 'Data']
    const rows = filteredCadastros.map((c) => [
      c.nome_completo,
      c.coordenador || '',
      c.lider || '',
      c.data_nascimento ? formatDate(c.data_nascimento) : '',
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
    <div>
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
            <Button variant="secondary" onClick={exportCsv}>
              <Download size={16} /> Exportar
            </Button>
          )}
        </div>
      </div>

      <Card>
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

        <div className="filter-panel">
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

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Spinner size={36} />
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
                    <th>Nome</th>
                    {!isOwnOnly && <th>Nerite</th>}
                    <th>Coordenador</th>
                    <th>Líder</th>
                    <th>Nascimento</th>
                    <th>CPF</th>
                    <th>Telefone</th>
                    <th>Título</th>
                    <th>Zona</th>
                    <th>Seção</th>
                    <th>CEP</th>
                    <th>Localização</th>
                    <th>Data</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => {
                    const hasGeo = c.lat != null && c.lng != null
                    return (
                      <tr key={c.id}>
                        <td><strong style={{ fontWeight: 600, fontSize: '.8rem' }}>{c.nome_completo}</strong></td>
                        {!isOwnOnly && <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{neriteNames.get(c.operator_id) ?? '—'}</span></td>}
                        <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{c.coordenador || '—'}</span></td>
                        <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{c.lider || '—'}</span></td>
                        <td>{c.data_nascimento ? formatDate(c.data_nascimento) : '—'}</td>
                        <td>{formatCpf(c.cpf) || '—'}</td>
                        <td>{formatPhone(c.telefone)}</td>
                        <td>{c.titulo}</td>
                        <td>{c.zona}</td>
                        <td>{c.secao}</td>
                        <td>{formatCep(c.cep) || '—'}</td>
                        <td>
                          <span className={`badge ${hasGeo ? 'badge-success' : 'badge-warning'}`}>
                            {hasGeo ? 'Com localização' : 'Sem localização'}
                          </span>
                        </td>
                        <td>{formatDate(c.created_at)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {canEdit(c) && (
                              <>
                                <Link to={`/cadastros/${c.id}/editar`}>
                                  <Button variant="ghost" size="sm" aria-label="Editar"><Pencil size={16} /></Button>
                                </Link>
                                <Button variant="ghost" size="sm" aria-label="Excluir" onClick={() => setDeleteId(c.id)}>
                                  <Trash2 size={16} color="var(--color-danger)" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
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
                        <span style={{ display: 'block', color: '#8a95a7', fontSize: '.7rem', marginTop: '.1rem' }}>
                          {formatPhone(c.telefone)} · {formatDate(c.created_at)} · {hasGeo ? 'Com localização' : 'Sem localização'}
                        </span>
                      </div>
                      {canEdit(c) && (
                        <div style={{ display: 'flex', gap: '.3rem' }}>
                          <Link to={`/cadastros/${c.id}/editar`}>
                            <Button variant="ghost" size="sm" aria-label="Editar"><Pencil size={16} /></Button>
                          </Link>
                          <Button variant="ghost" size="sm" aria-label="Excluir" onClick={() => setDeleteId(c.id)}>
                            <Trash2 size={16} color="var(--color-danger)" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem .75rem', marginTop: '.8rem', paddingTop: '.7rem', borderTop: '1px solid #e9edf4' }}>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>Coordenador</span><strong style={{ fontSize: '.76rem' }}>{c.coordenador || '—'}</strong></div>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>Líder</span><strong style={{ fontSize: '.76rem' }}>{c.lider || '—'}</strong></div>
                      <div><span style={{ display: 'block', color: '#8a95a7', fontSize: '.63rem' }}>Nascimento</span><strong style={{ fontSize: '.76rem' }}>{c.data_nascimento ? formatDate(c.data_nascimento) : '—'}</strong></div>
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
      </Card>

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
