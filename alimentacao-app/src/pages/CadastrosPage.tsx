import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { formatCpf, formatDate, formatPhone, formatCep } from '../lib/format'
import { fetchCadastros } from '../lib/cadastros'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { Cadastro } from '../types'

const PAGE_SIZE = 15

export function CadastrosPage() {
  const { profile } = useAuth()
  const location = useLocation()
  const isOwnOnly = location.pathname === '/meus-cadastros'

  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchCadastros({
        operatorId: isOwnOnly ? profile?.id : undefined,
        search: search || undefined,
      })
      setCadastros(data)
      setPage(0)
    } finally {
      setLoading(false)
    }
  }, [isOwnOnly, profile?.id, search])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  const totalPages = Math.max(1, Math.ceil(cadastros.length / PAGE_SIZE))
  const pageItems = cadastros.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
        <div style={{ marginBottom: '1rem', maxWidth: 400 }}>
          <Input
            placeholder="Buscar nome, CPF, telefone ou título..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <Spinner size={36} />
          </div>
        ) : !pageItems.length ? (
          <EmptyState
            title="Nenhum cadastro encontrado"
            description={search ? 'Tente outro termo de busca.' : undefined}
          />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
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
                {cadastros.length} registro(s) — Página {page + 1} de {totalPages}
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
