import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleDashed, Crown, Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { META_LIDERANCA_FICHAS } from '../lib/meta'
import { formatPhone } from '../lib/normalize'
import { fetchCadastroFichaStats } from '../lib/cadastros'
import { supabase } from '../lib/supabase'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import type { Coordenador, Lider } from '../types'

type StatusView = 'todos' | 'finalizadas' | 'andamento'

type LiderancaRow = {
  id: string
  nome: string
  telefone: string | null
  coordenador: string
  fichas: number
  meta: number
  restante: number
  pct: number
  finalizou: boolean
}

function nameKey(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

export function LiderancaPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const diretoriaScope = profile?.role === 'diretoria' ? profile.id : null

  const [lideres, setLideres] = useState<Lider[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [fichasByLider, setFichasByLider] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<StatusView>('todos')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        let coordsQuery = supabase.from('coordenadores').select('*').eq('ativo', true).order('nome')
        let lideresQuery = supabase.from('lideres').select('*').eq('ativo', true).order('nome')

        if (diretoriaScope) {
          coordsQuery = coordsQuery.eq('diretoria_id', diretoriaScope)
          lideresQuery = lideresQuery.eq('diretoria_id', diretoriaScope)
        }

        const [coordsRes, lideresRes, fRows] = await Promise.all([
          coordsQuery,
          lideresQuery,
          fetchCadastroFichaStats(),
        ])

        if (coordsRes.error) throw new Error(coordsRes.error.message)
        if (lideresRes.error) throw new Error(lideresRes.error.message)

        const liderRows = (lideresRes.data ?? []) as Lider[]
        const coordRows = (coordsRes.data ?? []) as Coordenador[]
        setLideres(liderRows)
        setCoordenadores(coordRows)

        const byLider: Record<string, number> = {}
        const scopeLiderKeys = new Set(liderRows.map((l) => nameKey(l.nome)))

        fRows.forEach((row) => {
          const key = nameKey(row.lider)
          if (!key) return
          if (diretoriaScope) {
            if (row.diretoria_id === diretoriaScope || scopeLiderKeys.has(key)) {
              byLider[key] = (byLider[key] ?? 0) + 1
            }
            return
          }
          byLider[key] = (byLider[key] ?? 0) + 1
        })

        setFichasByLider(byLider)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível carregar as lideranças.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [diretoriaScope])

  const rows = useMemo((): LiderancaRow[] => {
    const coordById = new Map(coordenadores.map((c) => [c.id, c.nome]))
    const meta = META_LIDERANCA_FICHAS

    return lideres
      .map((l) => {
        const fichas = fichasByLider[nameKey(l.nome)] ?? 0
        const finalizou = fichas >= meta
        const pct = Math.min(100, Math.round((fichas / meta) * 100))
        return {
          id: l.id,
          nome: l.nome,
          telefone: l.telefone ?? null,
          coordenador: l.coordenador_id
            ? (coordById.get(l.coordenador_id) ?? '—')
            : '—',
          fichas,
          meta,
          restante: Math.max(0, meta - fichas),
          pct,
          finalizou,
        }
      })
      .sort((a, b) => {
        if (a.finalizou !== b.finalizou) return a.finalizou ? -1 : 1
        if (b.fichas !== a.fichas) return b.fichas - a.fichas
        return a.nome.localeCompare(b.nome, 'pt-BR')
      })
  }, [lideres, coordenadores, fichasByLider])

  const counts = useMemo(() => {
    let finalizadas = 0
    let andamento = 0
    let totalFichas = 0
    rows.forEach((r) => {
      totalFichas += r.fichas
      if (r.finalizou) finalizadas += 1
      else andamento += 1
    })
    return { total: rows.length, finalizadas, andamento, totalFichas }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (view === 'finalizadas' && !r.finalizou) return false
      if (view === 'andamento' && r.finalizou) return false
      if (!q) return true
      return (
        r.nome.toLowerCase().includes(q)
        || r.coordenador.toLowerCase().includes(q)
      )
    })
  }, [rows, view, search])

  useEffect(() => {
    setPage(0)
  }, [view, search, pageSize])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div className="lideranca-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Liderança</h1>
          <p className="page-subtitle">
            Cada liderança tem meta de {META_LIDERANCA_FICHAS} fichas
            {isAdmin ? ' — visão de todas as diretorias' : ''}.
          </p>
        </div>
      </div>

      <div className="lideranca-kpi-grid">
        <button
          type="button"
          className={`lideranca-kpi${view === 'todos' ? ' active' : ''}`}
          onClick={() => setView('todos')}
        >
          <span className="lideranca-kpi-icon"><Crown size={18} /></span>
          <div>
            <span>Lideranças</span>
            <strong className="tabular-nums">{counts.total.toLocaleString('pt-BR')}</strong>
          </div>
        </button>
        <button
          type="button"
          className={`lideranca-kpi${view === 'finalizadas' ? ' active' : ''}`}
          onClick={() => setView(view === 'finalizadas' ? 'todos' : 'finalizadas')}
        >
          <span className="lideranca-kpi-icon done"><CheckCircle2 size={18} /></span>
          <div>
            <span>Finalizaram a lista</span>
            <strong className="tabular-nums">{counts.finalizadas.toLocaleString('pt-BR')}</strong>
          </div>
        </button>
        <button
          type="button"
          className={`lideranca-kpi${view === 'andamento' ? ' active' : ''}`}
          onClick={() => setView(view === 'andamento' ? 'todos' : 'andamento')}
        >
          <span className="lideranca-kpi-icon pending"><CircleDashed size={18} /></span>
          <div>
            <span>Em andamento</span>
            <strong className="tabular-nums">{counts.andamento.toLocaleString('pt-BR')}</strong>
          </div>
        </button>
      </div>

      <Card>
        <div className="filters-grid filters-grid-nerites" style={{ marginBottom: '1rem' }}>
          <div className="search-field">
            <Search size={16} />
            <Input
              placeholder="Buscar liderança ou coordenador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {!filtered.length ? (
          <EmptyState
            title="Nenhuma liderança encontrada"
            description="Cadastre lideranças na Equipe ou ajuste o filtro."
          />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    <th>Liderança</th>
                    <th>Contato</th>
                    <th>Coordenador</th>
                    <th>Fichas</th>
                    <th>Progresso</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((row, idx) => (
                    <tr key={row.id}>
                      <td className="tabular-nums">{page * pageSize + idx + 1}</td>
                      <td>
                        <strong>{row.nome}</strong>
                      </td>
                      <td>
                        <span className="phone-cell">
                          {formatPhone(row.telefone) || '—'}
                          {row.telefone ? (
                            <WhatsAppLink phone={row.telefone} className="whatsapp-link-inline" />
                          ) : null}
                        </span>
                      </td>
                      <td>
                        <span className="lideranca-coord">{row.coordenador}</span>
                      </td>
                      <td>
                        <span className="tabular-nums lideranca-fichas">
                          {row.fichas}/{row.meta}
                        </span>
                        {!row.finalizou && (
                          <span className="lideranca-restante">
                            {' '}faltam {row.restante}
                          </span>
                        )}
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <div className="lideranca-progress" aria-hidden>
                          <i
                            style={{ width: `${row.pct}%` }}
                            className={row.finalizou ? 'done' : undefined}
                          />
                        </div>
                        <span className="lideranca-pct tabular-nums">{row.pct}%</span>
                      </td>
                      <td>
                        <span className={`lideranca-status${row.finalizou ? ' done' : ' pending'}`}>
                          {row.finalizou ? 'Finalizou' : 'Em andamento'}
                        </span>
                      </td>
                      <td>
                        <Link
                          to={`/cadastros?lider=${encodeURIComponent(row.nome)}`}
                          className="lideranca-link"
                        >
                          Ver fichas
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
