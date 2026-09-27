import { useEffect, useMemo, useState } from 'react'
import { Ban, MessageCircle, Pencil, Users } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import { formatPhone } from '../lib/format'
import {
  fetchFormigasWhatsappDashboard,
  updateWhatsappTelefone,
  type WhatsappDashboard,
  type WhatsappPessoa,
  type WhatsappStatus,
} from '../lib/formigasWhatsapp'

const PAGE_SIZE = 25

function statusLabel(status: WhatsappStatus) {
  return status === 'sim' ? 'Acionada' : 'Sem WhatsApp'
}

function initials(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'F'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function formigaValue(f: { id: string; nome: string }) {
  return f.id.startsWith('sem:') ? f.nome : f.id
}

export function FormigasWhatsappPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<WhatsappDashboard | null>(null)
  const [q, setQ] = useState('')
  const [formiga, setFormiga] = useState('')
  const [status, setStatus] = useState<'todos' | WhatsappStatus>('todos')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<WhatsappPessoa | null>(null)
  const [phoneDraft, setPhoneDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const next = await fetchFormigasWhatsappDashboard()
        if (!cancelled) setData(next)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar o WhatsApp.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const pessoasFiltradas = useMemo(() => {
    if (!data) return []
    const term = q.trim().toLowerCase()
    return data.pessoas.filter((p) => {
      if (formiga && (p.formigaId ?? p.formigaNome) !== formiga) return false
      if (status !== 'todos' && p.status !== status) return false
      if (!term) return true
      return (
        p.nome.toLowerCase().includes(term)
        || p.formigaNome.toLowerCase().includes(term)
        || p.coordenador.toLowerCase().includes(term)
        || p.lider.toLowerCase().includes(term)
        || p.telefone.includes(term)
      )
    })
  }, [data, q, formiga, status])

  useEffect(() => {
    setPage(0)
  }, [q, formiga, status])

  const totalPages = Math.max(1, Math.ceil(pessoasFiltradas.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages - 1)
  const pageRows = pessoasFiltradas.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)

  function toggleStatus(next: WhatsappStatus) {
    setStatus((atual) => (atual === next ? 'todos' : next))
  }

  function openEdit(pessoa: WhatsappPessoa) {
    setEditing(pessoa)
    setPhoneDraft(formatPhone(pessoa.telefone))
    setEditError(null)
  }

  async function saveTelefone() {
    if (!editing) return
    setSaving(true)
    setEditError(null)
    try {
      const saved = await updateWhatsappTelefone(editing.tipo, editing.id, phoneDraft)
      setData((current) => {
        if (!current) return current
        return {
          ...current,
          pessoas: current.pessoas.map((p) => (
            p.key === editing.key ? { ...p, telefone: saved } : p
          )),
        }
      })
      setEditing(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Não foi possível salvar o telefone.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        title="WhatsApp das formigas"
        description={error}
      />
    )
  }

  const dash = data ?? { pessoas: [], porFormiga: [], totais: { acionou: 0, semWhatsapp: 0, pessoas: 0, formigas: 0 } }
  const chartRows = dash.porFormiga.filter((f) => f.total > 0)
  const chartMax = Math.max(1, ...chartRows.map((f) => f.total))

  return (
    <div className="wa-page">
      <div className="page-header">
        <div>
          <h1>WhatsApp</h1>
          <p className="page-subtitle">Acionamentos e pessoas sem WhatsApp lançados pelas formigas.</p>
        </div>
      </div>

      <div className="wa-kpis">
        <button
          type="button"
          className={`wa-kpi is-ok${status === 'sim' ? ' is-on' : ''}`}
          onClick={() => toggleStatus('sim')}
        >
          <span className="wa-kpi-icon"><MessageCircle size={18} /></span>
          <em>Acionadas</em>
          <strong>{dash.totais.acionou}</strong>
          <small>Clique para filtrar</small>
        </button>
        <button
          type="button"
          className={`wa-kpi is-warn${status === 'sem' ? ' is-on' : ''}`}
          onClick={() => toggleStatus('sem')}
        >
          <span className="wa-kpi-icon"><Ban size={18} /></span>
          <em>Sem WhatsApp</em>
          <strong>{dash.totais.semWhatsapp}</strong>
          <small>Clique para filtrar</small>
        </button>
        <button
          type="button"
          className={`wa-kpi is-blue${status === 'todos' && !formiga ? ' is-on' : ''}`}
          onClick={() => { setStatus('todos'); setFormiga('') }}
        >
          <span className="wa-kpi-icon"><Users size={18} /></span>
          <em>Formigas</em>
          <strong>{dash.totais.formigas}</strong>
          <small>Ver todas</small>
        </button>
      </div>

      <Card>
        <div className="section-label-row">
          <h2 className="section-label">Por formiga</h2>
          {chartRows.length > 0 && (
            <div className="wa-legend" aria-hidden>
              <span className="wa-legend-item"><i className="ok" /> Acionou</span>
              <span className="wa-legend-item"><i className="sem" /> Sem WhatsApp</span>
            </div>
          )}
        </div>
        {chartRows.length === 0 ? (
          <EmptyState title="Sem lançamentos" description="Nenhuma formiga acionou ou sinalizou WhatsApp ainda." />
        ) : (
          <div className="wa-rank">
            {chartRows.map((f, index) => {
              const value = formigaValue(f)
              const active = formiga === value
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`wa-rank-row${active ? ' is-active' : ''}`}
                  onClick={() => setFormiga(active ? '' : value)}
                  title={`${f.nome}: ${f.acionou} acionou · ${f.semWhatsapp} sem WhatsApp`}
                >
                  <span className="wa-rank-n">{index + 1}</span>
                  <span className="wa-rank-avatar" aria-hidden>{initials(f.nome)}</span>
                  <span className="wa-rank-meta">
                    <strong>{f.nome}</strong>
                    <em>{f.acionou} acionou · {f.semWhatsapp} sem WhatsApp</em>
                    <span className="wa-rank-track">
                      <i className="ok" style={{ width: `${(f.acionou / chartMax) * 100}%` }} />
                      <i className="sem" style={{ width: `${(f.semWhatsapp / chartMax) * 100}%` }} />
                    </span>
                  </span>
                  <span className="wa-rank-total">
                    <b>{f.total}</b>
                    <small>total</small>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="section-label-row">
          <h2 className="section-label">
            {status === 'sim' ? 'Acionadas' : status === 'sem' ? 'Sem WhatsApp' : 'Pessoas'}
          </h2>
          <span className="wa-count">{pessoasFiltradas.length} registro{pessoasFiltradas.length === 1 ? '' : 's'}</span>
        </div>
        <div className="wa-filters">
          <Input
            placeholder="Buscar nome, formiga, coordenador…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            value={formiga}
            onChange={(e) => setFormiga(e.target.value)}
            options={[
              { value: '', label: 'Todas as formigas' },
              ...dash.porFormiga.map((f) => ({
                value: formigaValue(f),
                label: `${f.nome} (${f.total})`,
              })),
            ]}
          />
        </div>

        {!pageRows.length ? (
          <EmptyState title="Nenhuma pessoa" description="Ajuste os filtros ou aguarde novos lançamentos." />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Formiga</th>
                    <th>Contato</th>
                    <th>Coordenador</th>
                    <th>Liderança</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => (
                    <tr key={p.key}>
                      <td><strong>{p.nome}</strong></td>
                      <td>{p.tipoLabel}</td>
                      <td>
                        <span className={`wa-pill ${p.status === 'sim' ? 'ok' : 'sem'}`}>
                          {statusLabel(p.status)}
                        </span>
                      </td>
                      <td>{p.formigaNome}</td>
                      <td>
                        <span className="phone-cell">
                          {formatPhone(p.telefone) || '—'}
                          {p.telefone && p.status === 'sim' ? <WhatsAppLink phone={p.telefone} className="whatsapp-link-inline" /> : null}
                        </span>
                      </td>
                      <td>{p.coordenador || '—'}</td>
                      <td>{p.lider || '—'}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar telefone de ${p.nome}`}
                          onClick={() => openEdit(p)}
                        >
                          <Pencil size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pessoasFiltradas.length > PAGE_SIZE && (
              <Pagination
                page={pageSafe}
                totalPages={totalPages}
                totalItems={pessoasFiltradas.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                label="pessoas"
              />
            )}
          </>
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        title="Editar telefone"
        description={editing ? `${editing.nome} · ${editing.tipoLabel}` : undefined}
        onClose={() => { if (!saving) setEditing(null) }}
        onConfirm={() => { void saveTelefone() }}
        confirmLabel="Salvar na ficha"
        loading={saving}
      >
        <Input
          label="Telefone"
          value={phoneDraft}
          onChange={(e) => setPhoneDraft(formatPhone(e.target.value))}
          placeholder="(98) 99123-4567"
          inputMode="tel"
        />
        {phoneDraft ? (
          <p className="wa-edit-wa">
            <WhatsAppLink phone={phoneDraft} className="whatsapp-link-inline" />
            <span>Abre no WhatsApp com o número novo</span>
          </p>
        ) : null}
        {editError ? <p className="field-error">{editError}</p> : null}
        <p className="wa-edit-hint">A alteração grava na ficha oficial.</p>
      </Modal>
    </div>
  )
}
