import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, Search, X } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { formatDateTime } from '../lib/format'
import {
  FICHA_CAMPOS,
  fetchCorrecaoBackups,
  reverterCorrecaoBackup,
  type CorrecaoBackup,
} from '../lib/relatorioFichasTxt'

type SortKey = 'quando' | 'pessoa' | 'quem' | 'status'
type SortDir = 'desc' | 'asc'
type StatusFiltro = 'todos' | 'ativos' | 'revertidos'

const CAMPO_LABEL = Object.fromEntries(FICHA_CAMPOS.map((c) => [c.key, c.label])) as Record<string, string>

function campoLabel(key: string) {
  return CAMPO_LABEL[key] ?? key
}

function sortValue(row: CorrecaoBackup, key: SortKey) {
  if (key === 'quando') return row.alterado_em || ''
  if (key === 'pessoa') return (row.nome_completo || '').toLocaleLowerCase('pt-BR')
  if (key === 'quem') return (row.alterado_por_nome || '').toLocaleLowerCase('pt-BR')
  return row.revertido ? '1' : '0'
}

export function RelatorioBackupPage() {
  const { profile } = useAuth()
  const [nome, setNome] = useState('')
  const [quem, setQuem] = useState('')
  const [status, setStatus] = useState<StatusFiltro>('todos')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [rows, setRows] = useState<CorrecaoBackup[]>([])
  const [loading, setLoading] = useState(false)
  const [reverting, setReverting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [buscou, setBuscou] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('quando')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  async function buscar(filtros?: {
    nome?: string
    quem?: string
    status?: StatusFiltro
    dataDe?: string
    dataAte?: string
  }) {
    const q = filtros ?? { nome, quem, status, dataDe, dataAte }
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      setRows(await fetchCorrecaoBackups({
        nome: q.nome,
        quem: q.quem,
        status: q.status,
        dataDe: q.dataDe,
        dataAte: q.dataAte,
        ascending: false,
      }))
      setBuscou(true)
      setSortKey('quando')
      setSortDir('desc')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível buscar o backup.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void buscar({ nome: '', quem: '', status: 'todos', dataDe: '', dataAte: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function limparFiltros() {
    setNome('')
    setQuem('')
    setStatus('todos')
    setDataDe('')
    setDataAte('')
    void buscar({ nome: '', quem: '', status: 'todos', dataDe: '', dataAte: '' })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'quando' ? 'desc' : 'asc')
  }

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sortKey)
      const vb = sortValue(b, sortKey)
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }, [rows, sortKey, sortDir])

  const ativos = useMemo(() => rows.filter((r) => !r.revertido).length, [rows])
  const revertidos = useMemo(() => rows.filter((r) => r.revertido).length, [rows])

  async function reverter(id: string) {
    setReverting(id)
    setError(null)
    setMessage(null)
    try {
      await reverterCorrecaoBackup(id, profile?.id ?? null)
      setRows((atual) => atual.map((row) => (row.id === id ? { ...row, revertido: true } : row)))
      setMessage('Alteração revertida. A ficha voltou ao que era antes.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível reverter.')
    } finally {
      setReverting(null)
    }
  }

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

  const hasFilters = Boolean(nome.trim() || quem.trim() || status !== 'todos' || dataDe || dataAte)

  return (
    <div className="rel-txt-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Backup</h1>
          <p className="page-subtitle">
            Histórico das correções que mudaram a ficha. Filtre, ordene e reverta quando precisar.
          </p>
        </div>
      </div>

      <div className="rel-txt-stats">
        <div className="rel-txt-stat">
          <span>Nesta lista</span>
          <strong>{rows.length.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="rel-txt-stat">
          <span>Podem reverter</span>
          <strong>{ativos.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="rel-txt-stat">
          <span>Já revertidos</span>
          <strong>{revertidos.toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      <Card title="Filtros">
        <div className="rel-bk-filters">
          <label className="rel-txt-field" style={{ minWidth: 200 }}>
            <span>Nome da pessoa</span>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Clairton Sidney"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void buscar()
              }}
            />
          </label>
          <label className="rel-txt-field" style={{ minWidth: 180 }}>
            <span>Quem alterou</span>
            <Input
              value={quem}
              onChange={(e) => setQuem(e.target.value)}
              placeholder="Nome de quem salvou"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void buscar()
              }}
            />
          </label>
          <div className="rel-txt-field" style={{ minWidth: 150 }}>
            <Select
              label="Situação"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFiltro)}
              options={[
                { value: 'todos', label: 'Todas' },
                { value: 'ativos', label: 'Podem reverter' },
                { value: 'revertidos', label: 'Já revertidas' },
              ]}
            />
          </div>
          <label className="rel-txt-field">
            <span>De</span>
            <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
          </label>
          <label className="rel-txt-field">
            <span>Até</span>
            <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
          </label>
          <div className="rel-bk-filter-actions">
            <Button type="button" onClick={() => void buscar()} loading={loading}>
              <Search size={16} /> Buscar
            </Button>
            {hasFilters ? (
              <Button type="button" variant="secondary" onClick={limparFiltros} disabled={loading}>
                <X size={16} /> Limpar
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {error ? <p className="rel-txt-error">{error}</p> : null}
      {message ? <p className="rel-txt-ok">{message}</p> : null}

      <Card
        title={sortedRows.length ? `Alterações (${sortedRows.length})` : 'Alterações'}
        subtitle="Clique no cabeçalho para ordenar crescente ou decrescente."
      >
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Spinner />
          </div>
        ) : !sortedRows.length ? (
          <p className="rel-txt-empty">
            {buscou
              ? 'Nada nesta busca. Ajuste os filtros e clique em Buscar de novo.'
              : 'Carregando as últimas correções…'}
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table rel-txt-table rel-bk-table">
              <thead>
                <tr>
                  <SortHeader column="quando" label="Quando" />
                  <SortHeader column="pessoa" label="Pessoa" />
                  <SortHeader column="quem" label="Quem alterou" />
                  <th>O que mudou</th>
                  <SortHeader column="status" label="Situação" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const antes = row.antes ?? {}
                  const depois = row.depois ?? {}
                  const diffs = Object.keys(depois).filter((key) => (antes[key] ?? '') !== (depois[key] ?? ''))
                  return (
                    <tr key={row.id} className={row.revertido ? 'is-reverted' : undefined}>
                      <td>{formatDateTime(row.alterado_em)}</td>
                      <td>
                        <Link to={`/cadastros/${row.cadastro_id}/editar`} className="rel-txt-edit">
                          <strong>{row.nome_completo}</strong>
                        </Link>
                      </td>
                      <td>{row.alterado_por_nome || '—'}</td>
                      <td className="rel-bk-diffs">
                        {diffs.length ? (
                          <ul>
                            {diffs.map((key) => (
                              <li key={key}>
                                <em>{campoLabel(key)}</em>
                                {' '}
                                <span>{antes[key] || '—'}</span>
                                {' → '}
                                <strong>{depois[key] || '—'}</strong>
                              </li>
                            ))}
                          </ul>
                        ) : '—'}
                      </td>
                      <td>
                        <span className={`rel-bk-badge${row.revertido ? ' is-reverted' : ' is-active'}`}>
                          {row.revertido ? 'Revertido' : 'Ativo'}
                        </span>
                      </td>
                      <td>
                        {row.revertido ? (
                          <span className="rel-txt-empty">—</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            loading={reverting === row.id}
                            disabled={Boolean(reverting)}
                            onClick={() => void reverter(row.id)}
                          >
                            <RotateCcw size={14} /> Reverter
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
