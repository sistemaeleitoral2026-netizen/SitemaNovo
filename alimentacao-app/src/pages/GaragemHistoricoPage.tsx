import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Car, Filter, Pencil, Plus, RotateCcw, Search, Trash2, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import { formatDateTime, formatPhone } from '../lib/format'
import { deleteGaragemCarro, fetchGaragemCarros, garagemWhatsAppMessage } from '../lib/garagem'
import { supabase } from '../lib/supabase'
import type { Coordenador, GaragemCarro, Lider } from '../types'

type Col = 'indicacao' | 'coordenador' | 'pessoa' | 'telefone' | 'placa' | 'cor' | 'modelo' | 'data'
type Dir = 'asc' | 'desc'

const COLS: { key: Col; label: string }[] = [
  { key: 'indicacao', label: 'Liderança' },
  { key: 'coordenador', label: 'Coordenador' },
  { key: 'pessoa', label: 'Motorista' },
  { key: 'telefone', label: 'WhatsApp' },
  { key: 'placa', label: 'Placa' },
  { key: 'cor', label: 'Cor' },
  { key: 'modelo', label: 'Modelo' },
  { key: 'data', label: 'Lançado em' },
]

function cell(row: GaragemCarro, key: Col, phoneByLider: Map<string, string>): string {
  switch (key) {
    case 'indicacao':
      return row.lider_nome
    case 'coordenador':
      return row.coordenador_nome
    case 'pessoa':
      return row.pessoa_nome
    case 'telefone':
      return motoristaPhone(row, phoneByLider)
    case 'placa':
      return row.placa
    case 'cor':
      return row.cor
    case 'modelo':
      return row.modelo
    case 'data':
      return formatDateTime(row.created_at)
  }
}

function motoristaPhone(row: GaragemCarro, phoneByLider: Map<string, string>): string {
  const own = row.telefone?.trim() ?? ''
  if (own) return own
  if (row.lider_id) return phoneByLider.get(row.lider_id) ?? ''
  return ''
}

function compare(a: GaragemCarro, b: GaragemCarro, key: Col, dir: Dir, phoneByLider: Map<string, string>) {
  const av = key === 'data' ? a.created_at : cell(a, key, phoneByLider)
  const bv = key === 'data' ? b.created_at : cell(b, key, phoneByLider)
  const n = String(av).localeCompare(String(bv), 'pt-BR', { sensitivity: 'base', numeric: true })
  return dir === 'asc' ? n : -n
}

export function GaragemHistoricoPage() {
  const { profile } = useAuth()
  const diretoriaScope = profile?.role === 'diretoria' ? profile.id : null

  const [rows, setRows] = useState<GaragemCarro[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [coordenadorId, setCoordenadorId] = useState('')
  const [liderId, setLiderId] = useState('')
  const [sortKey, setSortKey] = useState<Col>('data')
  const [sortDir, setSortDir] = useState<Dir>('desc')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let coordsQuery = supabase.from('coordenadores').select('*').eq('ativo', true).order('nome')
      let lidsQuery = supabase.from('lideres').select('*').eq('ativo', true).order('nome')
      if (diretoriaScope) {
        coordsQuery = coordsQuery.eq('diretoria_id', diretoriaScope)
        lidsQuery = lidsQuery.eq('diretoria_id', diretoriaScope)
      }

      const [cars, coordsRes, lidsRes] = await Promise.all([
        fetchGaragemCarros(diretoriaScope),
        coordsQuery,
        lidsQuery,
      ])
      if (coordsRes.error) throw new Error(coordsRes.error.message)
      if (lidsRes.error) throw new Error(lidsRes.error.message)

      setRows(cars)
      setCoordenadores((coordsRes.data ?? []) as Coordenador[])
      setLideres((lidsRes.data ?? []) as Lider[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o histórico.')
    } finally {
      setLoading(false)
    }
  }, [diretoriaScope])

  useEffect(() => {
    void load()
  }, [load])

  const phoneByLider = useMemo(() => {
    const map = new Map<string, string>()
    for (const lider of lideres) {
      if (lider.telefone) map.set(lider.id, lider.telefone)
    }
    return map
  }, [lideres])

  const lideresFiltrados = useMemo(() => {
    if (!coordenadorId) return []
    return lideres.filter((l) => l.coordenador_id === coordenadorId)
  }, [lideres, coordenadorId])

  const counts = useMemo(() => {
    const coords = new Set(rows.map((r) => r.coordenador_id).filter(Boolean))
    const lids = new Set(rows.map((r) => r.lider_id).filter(Boolean))
    const comZap = rows.filter((r) => motoristaPhone(r, phoneByLider)).length
    return { total: rows.length, coordenações: coords.size, indicacoes: lids.size, comZap }
  }, [rows, phoneByLider])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const next = rows.filter((row) => {
      if (coordenadorId && row.coordenador_id !== coordenadorId) return false
      if (liderId && row.lider_id !== liderId) return false
      if (!q) return true
      const phone = motoristaPhone(row, phoneByLider)
      return [
        row.lider_nome,
        row.coordenador_nome,
        row.pessoa_nome,
        row.placa,
        row.cor,
        row.modelo,
        phone,
        formatPhone(phone),
      ].some((v) => String(v).toLowerCase().includes(q))
    })
    next.sort((a, b) => compare(a, b, sortKey, sortDir, phoneByLider))
    return next
  }, [rows, search, coordenadorId, liderId, sortKey, sortDir, phoneByLider])

  const hasFilters = Boolean(search || coordenadorId || liderId)
  const deleteItem = rows.find((r) => r.id === deleteId) ?? null

  function toggleSort(key: Col) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'data' ? 'desc' : 'asc')
  }

  function clearFilters() {
    setSearch('')
    setCoordenadorId('')
    setLiderId('')
  }

  async function confirmDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await deleteGaragemCarro(deleteId)
      setRows((prev) => prev.filter((r) => r.id !== deleteId))
      setDeleteId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="gg-page cadastros-page">
      <header className="gg-header">
        <div>
          <p className="gg-kicker">Garagem</p>
          <h1>Histórico</h1>
          <p className="gg-sub">
            Pesquisa rápida, filtro por coordenação e liderança. WhatsApp abre a conversa com o motorista.
          </p>
        </div>
        <Link to="/garagem/lancar" className="gg-btn primary">
          <Plus size={15} />
          Novo lançamento
        </Link>
      </header>

      <div className="gg-kpi-grid">
        <div className="lideranca-kpi">
          <span className="lideranca-kpi-icon"><Car size={18} /></span>
          <div>
            <span>Veículos cadastrados</span>
            <strong className="tabular-nums">{counts.total.toLocaleString('pt-BR')}</strong>
          </div>
        </div>
        <div className="lideranca-kpi">
          <span className="lideranca-kpi-icon"><Users size={18} /></span>
          <div>
            <span>Coordenações</span>
            <strong className="tabular-nums">{counts.coordenações.toLocaleString('pt-BR')}</strong>
          </div>
        </div>
        <div className="lideranca-kpi">
          <span className="lideranca-kpi-icon pending"><Users size={18} /></span>
          <div>
            <span>Lideranças</span>
            <strong className="tabular-nums">{counts.indicacoes.toLocaleString('pt-BR')}</strong>
          </div>
        </div>
        <div className="lideranca-kpi">
          <span className="lideranca-kpi-icon done"><Car size={18} /></span>
          <div>
            <span>Com WhatsApp</span>
            <strong className="tabular-nums">{counts.comZap.toLocaleString('pt-BR')}</strong>
          </div>
        </div>
      </div>

      <div className="filter-panel cadastros-filter-panel">
        <div className="filter-panel-heading">
          <div>
            <Filter size={17} />
            <strong>Pesquisa rápida</strong>
            <span>Escolha a coordenação e depois a liderança para ver todos os veículos</span>
          </div>
          <button type="button" className="clear-filters" onClick={clearFilters} style={{ color: '#2f6fed' }}>
            <RotateCcw size={13} /> Limpar
          </button>
        </div>

        <div className="filters-grid filters-grid-cadastros gg-filters gg-filters-quick">
          <div className="search-field">
            <Search size={16} />
            <Input
              placeholder="Busca rápida: motorista, placa, modelo, telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Pesquisa rápida"
            />
          </div>
          <Select
            value={coordenadorId}
            onChange={(e) => {
              setCoordenadorId(e.target.value)
              setLiderId('')
            }}
            options={coordenadores.map((c) => ({ value: c.id, label: c.nome }))}
            placeholder="Todas as coordenações"
            aria-label="Coordenação"
          />
          <Select
            value={liderId}
            onChange={(e) => setLiderId(e.target.value)}
            options={lideresFiltrados.map((l) => ({ value: l.id, label: l.nome }))}
            placeholder={coordenadorId ? 'Todas as lideranças' : 'Selecione a coordenação'}
            aria-label="Liderança"
            disabled={!coordenadorId}
          />
        </div>

        <div className="filter-results">
          <span>
            <strong>{filtered.length}</strong> veículo{filtered.length === 1 ? '' : 's'}
            {hasFilters ? ` de ${rows.length}` : ' cadastrados'}
          </span>
        </div>
      </div>

      <section className="cadastros-table-card">
        {error && (
          <div className="alert alert-error" style={{ margin: '1rem' }}>
            {error}
          </div>
        )}

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                {COLS.map((col) => {
                  const active = sortKey === col.key
                  return (
                    <th
                      key={col.key}
                      aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                    >
                      <button
                        type="button"
                        className={`sort-th-btn${active ? ' is-active' : ''}`}
                        onClick={() => toggleSort(col.key)}
                      >
                        <span>{col.label}</span>
                        <span className="sort-th-icon" aria-hidden>
                          {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
                        </span>
                      </button>
                    </th>
                  )
                })}
                <th className="sticky-actions-head">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>
                    <div className="gg-loading">
                      <Spinner size={32} />
                    </div>
                  </td>
                </tr>
              ) : !filtered.length ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-card">
                      <strong>{hasFilters ? 'Nenhum veículo com essa pesquisa' : 'Nenhum veículo cadastrado'}</strong>
                      <span>
                        {hasFilters
                          ? 'Troque a coordenação, a liderança ou limpe a busca.'
                          : 'Use Lançar para registrar o primeiro carro.'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const phone = motoristaPhone(row, phoneByLider)
                  return (
                    <tr key={row.id}>
                      <td><strong style={{ fontWeight: 600, fontSize: '.8rem' }}>{row.lider_nome || '—'}</strong></td>
                      <td><span style={{ color: '#6c788d' }}>{row.coordenador_nome || '—'}</span></td>
                      <td>{row.pessoa_nome || '—'}</td>
                      <td>
                        <span className="phone-cell">
                          {formatPhone(phone) || '—'}
                          {phone ? (
                            <WhatsAppLink
                              phone={phone}
                              message={garagemWhatsAppMessage(row)}
                              label="Mandar mensagem ao motorista"
                              className="whatsapp-link-inline"
                            />
                          ) : null}
                        </span>
                      </td>
                      <td>
                        {row.placa ? <span className="gg-placa-chip">{row.placa}</span> : '—'}
                      </td>
                      <td>{row.cor || '—'}</td>
                      <td>{row.modelo || '—'}</td>
                      <td className="gg-muted">{formatDateTime(row.created_at)}</td>
                      <td>
                        <div className="gg-row-actions">
                          <WhatsAppLink
                            phone={phone}
                            message={garagemWhatsAppMessage(row)}
                            label="Mandar mensagem ao motorista"
                          />
                          <Link to={`/garagem/lancar?id=${row.id}`} className="gg-icon-btn" aria-label="Editar">
                            <Pencil size={14} />
                          </Link>
                          <button
                            type="button"
                            className="gg-icon-btn danger"
                            onClick={() => setDeleteId(row.id)}
                            aria-label="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={Boolean(deleteId)}
        title="Excluir carro"
        description={
          deleteItem
            ? `Remover ${deleteItem.placa || 'este registro'} da coordenação ${deleteItem.coordenador_nome}?`
            : 'Remover este registro da Garagem?'
        }
        confirmLabel="Excluir"
        confirmVariant="danger"
        loading={deleting}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
