import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Pencil, Search } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import {
  fetchAtivacaoPainel,
  type AtivacaoListFilters,
  type AtivacaoPessoa,
} from '../lib/ativacao'

export function AtivacaoPainelPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AtivacaoPessoa[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [tipo, setTipo] = useState<AtivacaoListFilters['tipo']>(
    (searchParams.get('tipo') as AtivacaoListFilters['tipo']) || 'todos',
  )
  const rawStatus = searchParams.get('status')
  const initialStatus: AtivacaoListFilters['status'] =
    rawStatus === 'carros' || rawStatus === 'adesivo'
      ? 'com_carro'
      : rawStatus === 'casa'
        ? 'casa_sim'
        : rawStatus === 'postagens'
          ? 'com_links'
          : rawStatus === 'pendente'
            ? 'sem_ativacao'
            : (rawStatus as AtivacaoListFilters['status']) || 'todos'
  const [status, setStatus] = useState<AtivacaoListFilters['status']>(initialStatus)
  const [page, setPage] = useState(Number(searchParams.get('page') || 0) || 0)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchAtivacaoPainel({ search, tipo, status, page, pageSize })
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setTotal(res.total)
        setError(null)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Falha ao carregar painel.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [search, tipo, status, page, pageSize])

  useEffect(() => {
    const next = new URLSearchParams()
    if (search) next.set('q', search)
    if (tipo && tipo !== 'todos') next.set('tipo', tipo)
    if (status && status !== 'todos') next.set('status', status)
    if (page > 0) next.set('page', String(page))
    setSearchParams(next, { replace: true })
  }, [search, tipo, status, page, setSearchParams])

  function exportCsv() {
    const header = ['Tipo', 'Nome', 'Titulo', 'Zona', 'Bairro', 'Carros', 'Casa', 'Postagens', 'Links', 'Notas']
    const rows = items.map((p) => [
      p.tipoLabel,
      p.nome,
      p.titulo,
      p.zona,
      p.bairro,
      String(p.carros_adesivados),
      p.adesivos_casa > 0 ? 'Sim' : 'Nao',
      String(p.postagem_links.length || p.postagens),
      p.postagem_links.join(' | '),
      p.ativacao_notas,
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ativacao-painel.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="ativacao-page nv-dash">
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel — Formigas</h1>
          <p className="page-subtitle">Acompanhe lançamentos de carros, casas e postagens.</p>
        </div>
        <div className="page-header-actions">
          <Button onClick={() => navigate('/ativacao/lancar')}>+ Fazer lançamento</Button>
        </div>
      </div>

      <div className="ativacao-filters">
        <div className="ativacao-search painel">
          <Search size={16} aria-hidden />
          <input
            className="ui-input"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            placeholder="Buscar por nome, título ou bairro…"
          />
        </div>
        <Select
          value={tipo ?? 'todos'}
          onChange={(e) => { setTipo(e.target.value as AtivacaoListFilters['tipo']); setPage(0) }}
          options={[
            { value: 'todos', label: 'Todos os perfis' },
            { value: 'eleitor', label: 'Eleitores' },
            { value: 'lideranca', label: 'Lideranças' },
            { value: 'coordenador', label: 'Coordenadores' },
          ]}
        />
        <Select
          value={status ?? 'todos'}
          onChange={(e) => { setStatus(e.target.value as AtivacaoListFilters['status']); setPage(0) }}
          options={[
            { value: 'todos', label: 'Todos os status' },
            { value: 'com_ativacao', label: 'Com algum lançamento' },
            { value: 'sem_ativacao', label: 'Sem lançamento' },
            { value: 'com_carro', label: 'Com carro adesivado' },
            { value: 'casa_sim', label: 'Com casa adesivada' },
            { value: 'com_links', label: 'Com links de rede' },
          ]}
        />
        <Button variant="secondary" onClick={exportCsv}>
          <Download size={16} /> Exportar
        </Button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Spinner size={36} />
        </div>
      ) : !items.length ? (
        <EmptyState
          title="Nenhum cadastro localizado"
          description="Revise a busca ou os filtros selecionados."
          action={<Button onClick={() => navigate('/ativacao/lancar')}>Fazer lançamento</Button>}
        />
      ) : (
        <>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Perfil</th>
                  <th>Carros</th>
                  <th>Casa</th>
                  <th>Postagens</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.key}>
                    <td>
                      <strong>{p.nome}</strong>
                      {(p.titulo || p.bairro) && (
                        <span className="ativacao-sub">
                          {[p.titulo && `Título ${p.titulo}`, p.bairro].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td><span className="mob-tipo">{p.tipoLabel}</span></td>
                    <td className="tabular-nums">{p.carros_adesivados}</td>
                    <td>{p.adesivos_casa > 0 ? 'Sim' : 'Não'}</td>
                    <td className="tabular-nums">{p.postagem_links.length || p.postagens}</td>
                    <td>
                      <Link
                        to={`/ativacao/lancar?tipo=${p.tipo}&id=${p.id}`}
                        aria-label={`Editar lançamento de ${p.nome}`}
                      >
                        <Button variant="ghost" size="sm"><Pencil size={16} /></Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(0) }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </>
      )}
    </div>
  )
}
