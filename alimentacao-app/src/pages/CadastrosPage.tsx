import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Filter, Pencil, Search, Trash2, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { formatCpf, formatDate, formatPhone, formatCep } from '../lib/format'
import { fetchCadastros } from '../lib/cadastros'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { Cadastro, Profile } from '../types'

const PAGE_SIZE = 15

export function CadastrosPage() {
  const { profile } = useAuth()
  const location = useLocation()
  const isOwnOnly = location.pathname === '/meus-cadastros'

  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [operatorFilter, setOperatorFilter] = useState('')
  const [zonaFilter, setZonaFilter] = useState('')
  const [secaoFilter, setSecaoFilter] = useState('')
  const [geoFilter, setGeoFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
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

  const neriteNames = useMemo(
    () => new Map(nerites.map((nerite) => [nerite.id, nerite.nome])),
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

  const filteredCadastros = useMemo(() => {
    const textTerm = search.trim().toLowerCase()
    const digitTerm = search.replace(/\D/g, '')

    return cadastros.filter((c) => {
      const matchesSearch = !textTerm || [
        c.nome_completo,
        c.cpf ?? '',
        c.telefone,
        c.titulo,
        c.cep ?? '',
        neriteNames.get(c.operator_id) ?? '',
      ].some((value) => {
        const normalized = value.toLowerCase()
        return normalized.includes(textTerm) || (!!digitTerm && value.replace(/\D/g, '').includes(digitTerm))
      })

      if (!matchesSearch) return false
      if (operatorFilter && c.operator_id !== operatorFilter) return false
      if (zonaFilter && c.zona !== zonaFilter) return false
      if (secaoFilter && c.secao !== secaoFilter) return false
      if (geoFilter === 'mapped' && (c.lat == null || c.lng == null)) return false
      if (geoFilter === 'unmapped' && c.lat != null && c.lng != null) return false
      if (dateFrom && c.created_at.slice(0, 10) < dateFrom) return false
      if (dateTo && c.created_at.slice(0, 10) > dateTo) return false
      return true
    })
  }, [cadastros, dateFrom, dateTo, geoFilter, neriteNames, operatorFilter, search, secaoFilter, zonaFilter])

  useEffect(() => setPage(0), [search, operatorFilter, zonaFilter, secaoFilter, geoFilter, dateFrom, dateTo])

  const hasFilters = Boolean(search || operatorFilter || zonaFilter || secaoFilter || geoFilter || dateFrom || dateTo)
  const totalPages = Math.max(1, Math.ceil(filteredCadastros.length / PAGE_SIZE))
  const pageItems = filteredCadastros.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function clearFilters() {
    setSearch('')
    setOperatorFilter('')
    setZonaFilter('')
    setSecaoFilter('')
    setGeoFilter('')
    setDateFrom('')
    setDateTo('')
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isOwnOnly ? 'Meus Cadastros' : 'Todos os Cadastros'}</h1>
          <p className="page-subtitle">
            {isOwnOnly ? 'Cadastros realizados por você' : 'Todos os cadastros feitos pelas nerites'}
          </p>
        </div>
        {isOwnOnly && (
          <Link to="/cadastros/novo">
            <Button>Novo Cadastro</Button>
          </Link>
        )}
      </div>

      <Card>
        <div className="filter-panel">
          <div className="filter-panel-heading">
            <div><Filter size={17} /><strong>Filtros</strong><span>Refine os registros exibidos</span></div>
            {hasFilters && <button type="button" className="clear-filters" onClick={clearFilters}><X size={14} /> Limpar filtros</button>}
          </div>
          <div className="filters-grid filters-grid-cadastros">
            <div className="search-field">
              <Search size={16} />
              <Input
                placeholder="Nome, CPF, telefone, título ou CEP"
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
                aria-label="Filtrar por nerite"
              />
            )}
            <Select
              value={zonaFilter}
              onChange={(e) => { setZonaFilter(e.target.value); setSecaoFilter('') }}
              options={zonas.map((zona) => ({ value: zona, label: `Zona ${zona}` }))}
              placeholder="Todas as zonas"
              aria-label="Filtrar por zona"
            />
            <Select
              value={secaoFilter}
              onChange={(e) => setSecaoFilter(e.target.value)}
              options={secoes.map((secao) => ({ value: secao, label: `Seção ${secao}` }))}
              placeholder="Todas as seções"
              aria-label="Filtrar por seção"
            />
            <Select
              value={geoFilter}
              onChange={(e) => setGeoFilter(e.target.value)}
              options={[{ value: 'mapped', label: 'Com localização' }, { value: 'unmapped', label: 'Sem localização' }]}
              placeholder="Qualquer localização"
              aria-label="Filtrar por geolocalização"
            />
            <div className="compact-date-filter"><span>De</span><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Data inicial" /></div>
            <div className="compact-date-filter"><span>Até</span><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Data final" /></div>
          </div>
          <div className="filter-results">
            <strong>{filteredCadastros.length}</strong> de {cadastros.length} registros encontrados
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
          />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    {!isOwnOnly && <th>Nerite</th>}
                    <th>CPF</th>
                    <th>Telefone</th>
                    <th>Título</th>
                    <th>Zona eleitoral</th>
                    <th>Seção eleitoral</th>
                    <th>CEP</th>
                    <th>Data</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nome_completo}</td>
                      {!isOwnOnly && <td>{neriteNames.get(c.operator_id) ?? '—'}</td>}
                      <td>{formatCpf(c.cpf)}</td>
                      <td>{formatPhone(c.telefone)}</td>
                      <td>{c.titulo}</td>
                      <td>{c.zona}</td>
                      <td>{c.secao}</td>
                      <td>{formatCep(c.cep)}</td>
                      <td>{formatDate(c.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {canEdit(c) && (
                            <>
                              <Link to={`/cadastros/${c.id}/editar`}>
                                <Button variant="ghost" size="sm" aria-label="Editar">
                                  <Pencil size={16} />
                                </Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Excluir"
                                onClick={() => setDeleteId(c.id)}
                              >
                                <Trash2 size={16} color="var(--color-danger)" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                {filteredCadastros.length} registro(s) — Página {page + 1} de {totalPages}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
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
