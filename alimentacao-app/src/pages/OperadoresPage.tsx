import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Pagination } from '../components/ui/Pagination'
import { formatDateTime } from '../lib/format'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Cadastro, OperadorStats, Profile } from '../types'

const AVATARS = ['avatar-blue', 'avatar-green', 'avatar-purple', 'avatar-orange', 'avatar-teal']
const PAGE_SIZE = 10

function initials(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

export function OperadoresPage() {
  const { createNerite } = useAuth()
  const [operadores, setOperadores] = useState<Profile[]>([])
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', email: '', password: '', confirm: '' })

  async function load() {
    setLoading(true)
    const [ops, cads] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
      supabase.from('cadastros').select('*'),
    ])
    setOperadores((ops.data ?? []) as Profile[])
    setCadastros((cads.data ?? []) as Cadastro[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo((): OperadorStats[] => {
    const searchTerm = search.trim().toLowerCase()
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

    const result = operadores
      .map((op) => {
        const all = cadastros.filter((c) => c.operator_id === op.id)
        const ultima = all.length
          ? all.reduce((latest, c) => (c.created_at > latest ? c.created_at : latest), all[0].created_at)
          : null

        return {
          id: op.id,
          nome: op.nome,
          email: op.email,
          ativo: op.ativo,
          total: all.length,
          periodo: all.length,
          ultima_atividade: ultima,
        }
      })
      .filter((op) => {
        if (searchTerm && !op.nome.toLowerCase().includes(searchTerm) && !op.email.toLowerCase().includes(searchTerm)) return false
        if (statusFilter === 'active' && !op.ativo) return false
        if (statusFilter === 'inactive' && op.ativo) return false
        if (activityFilter === 'with' && op.total === 0) return false
        if (activityFilter === 'without' && op.total > 0) return false
        if (activityFilter === 'week7') {
          if (!op.ultima_atividade) return false
          if (new Date(op.ultima_atividade).getTime() < weekAgo) return false
        }
        return true
      })

    return result.sort((a, b) => {
      if (sortBy === 'total') return b.total - a.total
      if (sortBy === 'recent') {
        if (!a.ultima_atividade) return 1
        if (!b.ultima_atividade) return -1
        return b.ultima_atividade.localeCompare(a.ultima_atividade)
      }
      if (sortBy === 'status') return Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR')
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })
  }, [operadores, cadastros, search, statusFilter, activityFilter, sortBy])

  useEffect(() => setPage(0), [search, statusFilter, activityFilter, sortBy])

  const chips = useMemo(() => {
    const list: { key: string; label: string; clear: () => void }[] = []
    if (search) list.push({ key: 'q', label: `Busca: ${search}`, clear: () => setSearch('') })
    if (statusFilter === 'active') list.push({ key: 'st', label: 'Ativa', clear: () => setStatusFilter('') })
    if (statusFilter === 'inactive') list.push({ key: 'st', label: 'Inativa', clear: () => setStatusFilter('') })
    if (activityFilter === 'with') list.push({ key: 'ac', label: 'Com atividade', clear: () => setActivityFilter('') })
    if (activityFilter === 'without') list.push({ key: 'ac', label: 'Sem atividade', clear: () => setActivityFilter('') })
    if (activityFilter === 'week7') list.push({ key: 'ac', label: 'Ativas nos últimos 7 dias', clear: () => setActivityFilter('') })
    if (sortBy !== 'name') {
      const labels: Record<string, string> = {
        total: 'Ordenar por cadastros',
        recent: 'Ordenar por última atividade',
        status: 'Ordenar por status',
      }
      list.push({ key: 'sort', label: labels[sortBy] ?? sortBy, clear: () => setSortBy('name') })
    }
    return list
  }, [search, statusFilter, activityFilter, sortBy])

  const ativas = operadores.filter((o) => o.ativo).length
  const totalPages = Math.max(1, Math.ceil(stats.length / PAGE_SIZE))
  const pageItems = stats.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setActivityFilter('')
    setSortBy('name')
  }

  async function handleCreate() {
    setCreateError(null)
    if (!form.nome.trim()) {
      setCreateError('Informe o nome da nerite.')
      return
    }
    if (!form.email.trim()) {
      setCreateError('Informe o e-mail de acesso.')
      return
    }
    if (form.password.length < 8) {
      setCreateError('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (form.password !== form.confirm) {
      setCreateError('As senhas não coincidem.')
      return
    }

    setCreating(true)
    const { error } = await createNerite({
      nome: form.nome,
      email: form.email,
      password: form.password,
    })
    setCreating(false)

    if (error) {
      setCreateError(error)
      return
    }

    setCreateOpen(false)
    setForm({ nome: '', email: '', password: '', confirm: '' })
    await load()
  }

  async function toggleAtivo(op: OperadorStats) {
    await supabase.from('profiles').update({ ativo: !op.ativo }).eq('id', op.id)
    await load()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nerites</h1>
          <p className="page-subtitle">Gerencie as nerites, defina senhas e acompanhe o desempenho.</p>
        </div>
        <div className="page-header-actions">
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus size={16} /> Nova nerite
          </Button>
        </div>
      </div>

      <Card>
        <div className="filters-grid filters-grid-nerites">
          <div className="search-field">
            <Search size={16} />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar nerite"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'active', label: 'Ativa' },
              { value: 'inactive', label: 'Inativa' },
            ]}
            placeholder="Todos os status"
            aria-label="Status"
          />
          <Select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
            options={[
              { value: 'with', label: 'Com atividade' },
              { value: 'without', label: 'Sem atividade' },
              { value: 'week7', label: 'Ativas nos últimos 7 dias' },
            ]}
            placeholder="Qualquer atividade"
            aria-label="Atividade"
          />
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            options={[
              { value: 'name', label: 'Ordenar por nome' },
              { value: 'total', label: 'Ordenar por cadastros' },
              { value: 'recent', label: 'Ordenar por última atividade' },
              { value: 'status', label: 'Ordenar por status' },
            ]}
            aria-label="Ordenar"
          />
        </div>

        {chips.length > 0 && (
          <div className="chips-row">
            <span style={{ color: '#8a95a7', fontSize: '.68rem', fontWeight: 600 }}>Filtros ativos:</span>
            {chips.map((chip) => (
              <span className="chip" key={chip.key + chip.label}>
                {chip.label}
                <button type="button" onClick={chip.clear} aria-label="Remover filtro">×</button>
              </span>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              style={{ border: 0, background: 'transparent', color: '#2f6fed', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Limpar tudo
            </button>
          </div>
        )}

        <div className="filter-results">
          <strong>{stats.length}</strong> de {operadores.length} nerites encontradas · {ativas} ativas
        </div>

        {!stats.length ? (
          <EmptyState
            title={chips.length ? 'Nenhuma nerite encontrada' : 'Nenhuma nerite cadastrada'}
            description={chips.length ? 'Ajuste ou limpe os filtros para ver outros resultados.' : 'Crie a primeira conta em Nova nerite.'}
            action={!chips.length ? <Button onClick={() => setCreateOpen(true)}>Criar primeira nerite</Button> : (
              <Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button>
            )}
          />
        ) : (
          <>
            <div className="table-wrapper desktop-only">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nerite</th>
                    <th>E-mail</th>
                    <th>Status</th>
                    <th>Cadastros</th>
                    <th>Última atividade</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((op, index) => (
                    <tr key={op.id}>
                      <td>
                        <div className="person-cell">
                          <div className={`avatar-pill ${AVATARS[index % AVATARS.length]}`}>{initials(op.nome)}</div>
                          <strong style={{ fontSize: '.8rem', fontWeight: 650 }}>{op.nome}</strong>
                        </div>
                      </td>
                      <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{op.email}</span></td>
                      <td>
                        <span className={`badge ${op.ativo ? 'badge-success' : 'badge-danger'}`}>
                          {op.ativo ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td>{op.total}</td>
                      <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{formatDateTime(op.ultima_atividade)}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                          <Link to={`/nerites/${op.id}`}>
                            <Button variant="secondary" size="sm">Ver análise</Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => toggleAtivo(op)}>
                            {op.ativo ? 'Desativar' : 'Ativar'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-cards">
              {pageItems.map((op, index) => (
                <div className="mobile-card" key={op.id}>
                  <div className="mobile-card-top">
                    <div className={`avatar-pill ${AVATARS[index % AVATARS.length]}`}>{initials(op.nome)}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.nome}</strong>
                      <span style={{ display: 'block', color: '#8a95a7', fontSize: '.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.email}</span>
                    </div>
                    <span className={`badge ${op.ativo ? 'badge-success' : 'badge-danger'}`}>
                      {op.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <div className="mobile-card-meta">
                    <div>
                      <span>Cadastros</span>
                      <strong style={{ fontSize: '.95rem' }}>{op.total}</strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span>Última atividade</span>
                      <strong>{formatDateTime(op.ultima_atividade)}</strong>
                    </div>
                  </div>
                  <Link to={`/nerites/${op.id}`} style={{ display: 'block', marginTop: '.75rem' }}>
                    <Button variant="secondary" size="sm" style={{ width: '100%' }}>Ver análise</Button>
                  </Link>
                </div>
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={stats.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={createOpen}
        title="Nova nerite"
        description="Informe nome, e-mail e senha. A conta já fica pronta para entrar — sem confirmar e-mail."
        onClose={() => !creating && setCreateOpen(false)}
        onConfirm={handleCreate}
        confirmLabel="Criar conta"
        loading={creating}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Input label="Nome completo" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome da nerite" />
          <Input label="E-mail de acesso" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="nerite@exemplo.com" />
          <Input label="Senha" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mínimo 8 caracteres" />
          <Input label="Confirmar senha" type="password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} />
          {createError && <div className="alert alert-error">{createError}</div>}
        </div>
      </Modal>
    </div>
  )
}
