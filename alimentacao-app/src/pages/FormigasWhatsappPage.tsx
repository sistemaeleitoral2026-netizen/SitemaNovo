import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Ban, Car, Home, MessageCircle, Pencil, Share2, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import { FormigasFotoThumbButton } from '../components/FormigasFotoField'
import { formatPhone } from '../lib/format'
import {
  fetchFormigasVisaoDashboard,
  fetchFormigasWhatsappDashboard,
  updateWhatsappTelefone,
  type FormigasAtivacaoPessoa,
  type FormigasVisaoDashboard,
  type FormigasVisaoFiltro,
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

type RankRow = {
  id: string
  nome: string
  primary: number
  secondary: number
  total: number
  detail: string
}

type SortDir = 'asc' | 'desc'

function SortTh({
  label,
  col,
  active,
  dir,
  onSort,
  align = 'left',
}: {
  label: string
  col: string
  active: boolean
  dir: SortDir
  onSort: (col: string) => void
  align?: 'left' | 'center' | 'right'
}) {
  return (
    <th className={`wa-sort-th is-${align}${active ? ' is-active' : ''}`}>
      <button type="button" onClick={() => onSort(col)} title={`Ordenar por ${label}`}>
        <span>{label}</span>
        {active ? (dir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />) : (
          <ArrowDown size={12} className="wa-sort-ghost" />
        )}
      </button>
    </th>
  )
}

function cmpText(a: string, b: string, dir: SortDir) {
  const r = (a || '').localeCompare(b || '', 'pt-BR', { sensitivity: 'base' })
  return dir === 'asc' ? r : -r
}

function cmpNum(a: number, b: number, dir: SortDir) {
  const r = a - b
  return dir === 'asc' ? r : -r
}

export function FormigasWhatsappPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [waData, setWaData] = useState<WhatsappDashboard | null>(null)
  const [visao, setVisao] = useState<FormigasVisaoDashboard | null>(null)

  const [q, setQ] = useState('')
  const [formiga, setFormiga] = useState('')
  const [waStatus, setWaStatus] = useState<'todos' | WhatsappStatus>('todos')
  const [filtro, setFiltro] = useState<FormigasVisaoFiltro>(isAdmin ? 'todos' : 'whatsapp')
  const [page, setPage] = useState(0)
  const [sortCol, setSortCol] = useState('nome')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [rankSortCol, setRankSortCol] = useState('total')
  const [rankSortDir, setRankSortDir] = useState<SortDir>('desc')

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
        if (isAdmin) {
          const next = await fetchFormigasVisaoDashboard()
          if (!cancelled) {
            setVisao(next)
            setWaData(next.whatsapp)
          }
        } else {
          const next = await fetchFormigasWhatsappDashboard()
          if (!cancelled) setWaData(next)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Não foi possível carregar o dashboard.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  const dash = waData ?? {
    pessoas: [],
    porFormiga: [],
    totais: { acionou: 0, semWhatsapp: 0, pessoas: 0, formigas: 0 },
  }
  const ativ = visao?.ativacao

  const rankRows: RankRow[] = useMemo(() => {
    let rows: RankRow[] = []
    if (!isAdmin || filtro === 'whatsapp') {
      rows = dash.porFormiga
        .filter((f) => f.total > 0)
        .map((f) => ({
          id: formigaValue(f),
          nome: f.nome,
          primary: f.acionou,
          secondary: f.semWhatsapp,
          total: f.total,
          detail: `${f.acionou} acionou · ${f.semWhatsapp} sem WhatsApp`,
        }))
    } else if (ativ) {
      rows = ativ.porFormiga
        .filter((f) => {
          if (filtro === 'carros') return f.veiculosPessoas > 0
          if (filtro === 'casas') return f.casasPessoas > 0
          if (filtro === 'postagens') return f.postagensPessoas > 0
          return f.total > 0
        })
        .map((f) => {
          if (filtro === 'carros') {
            return {
              id: formigaValue(f),
              nome: f.nome,
              primary: f.carros + f.motos,
              secondary: f.veiculosPessoas,
              total: f.veiculosPessoas,
              detail: `${f.carros} carros · ${f.motos} motos · ${f.veiculosPessoas} pessoas`,
            }
          }
          if (filtro === 'casas') {
            return {
              id: formigaValue(f),
              nome: f.nome,
              primary: f.casas,
              secondary: f.casasPessoas,
              total: f.casasPessoas,
              detail: `${f.casas} adesivos · ${f.casasPessoas} casas`,
            }
          }
          if (filtro === 'postagens') {
            return {
              id: formigaValue(f),
              nome: f.nome,
              primary: f.postagens,
              secondary: f.postagensPessoas,
              total: f.postagensPessoas,
              detail: `${f.postagens} postagens · ${f.postagensPessoas} pessoas`,
            }
          }
          return {
            id: formigaValue(f),
            nome: f.nome,
            primary: f.veiculosPessoas + f.casasPessoas + f.postagensPessoas,
            secondary: f.carros + f.casas + f.postagens,
            total: f.total,
            detail: `${f.veiculosPessoas} veíc. · ${f.casasPessoas} casas · ${f.postagensPessoas} posts`,
          }
        })
    }

    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (rankSortCol === 'nome') return cmpText(a.nome, b.nome, rankSortDir)
      if (rankSortCol === 'primary') return cmpNum(a.primary, b.primary, rankSortDir)
      return cmpNum(a.total, b.total, rankSortDir)
    })
    return sorted
  }, [isAdmin, filtro, dash.porFormiga, ativ, rankSortCol, rankSortDir])

  const chartMax = Math.max(1, ...rankRows.map((f) => f.total))

  const waFiltradas = useMemo(() => {
    const term = q.trim().toLowerCase()
    const filtered = dash.pessoas.filter((p) => {
      if (formiga && (p.formigaId ?? p.formigaNome) !== formiga) return false
      if (waStatus !== 'todos' && p.status !== waStatus) return false
      if (!term) return true
      return (
        p.nome.toLowerCase().includes(term)
        || p.formigaNome.toLowerCase().includes(term)
        || p.coordenador.toLowerCase().includes(term)
        || p.lider.toLowerCase().includes(term)
        || p.telefone.includes(term)
      )
    })
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sortCol === 'tipo') return cmpText(a.tipoLabel, b.tipoLabel, sortDir)
      if (sortCol === 'status') return cmpText(a.status, b.status, sortDir)
      if (sortCol === 'formiga') return cmpText(a.formigaNome, b.formigaNome, sortDir)
      if (sortCol === 'coordenador') return cmpText(a.coordenador, b.coordenador, sortDir)
      if (sortCol === 'lider') return cmpText(a.lider, b.lider, sortDir)
      return cmpText(a.nome, b.nome, sortDir)
    })
    return sorted
  }, [dash.pessoas, q, formiga, waStatus, sortCol, sortDir])

  const ativFiltradas = useMemo(() => {
    if (!ativ) return [] as FormigasAtivacaoPessoa[]
    const term = q.trim().toLowerCase()
    const filtered = ativ.pessoas.filter((p) => {
      if (filtro === 'carros' && !(p.carros > 0 || p.motos > 0)) return false
      if (filtro === 'casas' && !(p.casa > 0 || p.casaStatus === 'sim' || p.casaStatus === 'talvez')) return false
      if (filtro === 'postagens' && !(p.postagens > 0)) return false

      const formigaIds = [p.formigaCarrosId, p.formigaCasaId, p.formigaLinksId].filter(Boolean)
      const formigaNomes = [p.formigaCarrosNome, p.formigaCasaNome, p.formigaLinksNome]
      if (formiga) {
        const hit =
          formigaIds.includes(formiga)
          || formigaNomes.includes(formiga)
        if (!hit) return false
      }
      if (!term) return true
      return (
        p.nome.toLowerCase().includes(term)
        || formigaNomes.some((n) => n.toLowerCase().includes(term))
        || p.coordenador.toLowerCase().includes(term)
        || p.lider.toLowerCase().includes(term)
      )
    })
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sortCol === 'tipo') return cmpText(a.tipoLabel, b.tipoLabel, sortDir)
      if (sortCol === 'carros') return cmpNum(a.carros, b.carros, sortDir)
      if (sortCol === 'motos') return cmpNum(a.motos, b.motos, sortDir)
      if (sortCol === 'casa') {
        const av = a.casaStatus === 'sim' ? 2 : a.casaStatus === 'talvez' ? 1 : a.casa > 0 ? 1 : 0
        const bv = b.casaStatus === 'sim' ? 2 : b.casaStatus === 'talvez' ? 1 : b.casa > 0 ? 1 : 0
        const r = cmpNum(av, bv, sortDir)
        return r !== 0 ? r : cmpNum(a.casa, b.casa, sortDir)
      }
      if (sortCol === 'posts') return cmpNum(a.postagens, b.postagens, sortDir)
      if (sortCol === 'fotos') {
        return cmpNum(
          a.fotoVeiculoPaths.length + a.fotoCasaPaths.length,
          b.fotoVeiculoPaths.length + b.fotoCasaPaths.length,
          sortDir,
        )
      }
      if (sortCol === 'formiga') {
        const an =
          filtro === 'casas'
            ? a.formigaCasaNome
            : filtro === 'postagens'
              ? a.formigaLinksNome
              : a.formigaCarrosNome
        const bn =
          filtro === 'casas'
            ? b.formigaCasaNome
            : filtro === 'postagens'
              ? b.formigaLinksNome
              : b.formigaCarrosNome
        return cmpText(an, bn, sortDir)
      }
      if (sortCol === 'coordenador') return cmpText(a.coordenador, b.coordenador, sortDir)
      return cmpText(a.nome, b.nome, sortDir)
    })
    return sorted
  }, [ativ, q, formiga, filtro, sortCol, sortDir])

  const showWaList = !isAdmin || filtro === 'whatsapp' || (filtro === 'todos' && waStatus !== 'todos')
  const listCount = showWaList ? waFiltradas.length : ativFiltradas.length
  const totalPages = Math.max(1, Math.ceil(listCount / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages - 1)
  const waPage = waFiltradas.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)
  const ativPage = ativFiltradas.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)

  useEffect(() => {
    setPage(0)
  }, [q, formiga, waStatus, filtro, sortCol, sortDir])

  function toggleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  function toggleRankSort(col: string) {
    if (rankSortCol === col) {
      setRankSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setRankSortCol(col)
      setRankSortDir('desc')
    }
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
      setWaData((current) => {
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
        title={isAdmin ? 'Formigas' : 'WhatsApp das formigas'}
        description={error}
      />
    )
  }

  return (
    <div className="wa-page">
      <div className="page-header">
        <div>
          <h1>{isAdmin ? 'Formigas' : 'WhatsApp'}</h1>
          <p className="page-subtitle">
            {isAdmin
              ? 'Visão geral: WhatsApp, adesivos de carro/moto, casas e postagens por formiga.'
              : 'Acionamentos e pessoas sem WhatsApp lançados pelas formigas.'}
          </p>
        </div>
      </div>

      <div className={`wa-kpis${isAdmin ? ' wa-kpis-wide' : ''}`}>
        <button
          type="button"
          className={`wa-kpi is-ok${filtro === 'whatsapp' && waStatus === 'sim' ? ' is-on' : ''}`}
          onClick={() => {
            setFiltro('whatsapp')
            setWaStatus((s) => (filtro === 'whatsapp' && s === 'sim' ? 'todos' : 'sim'))
          }}
        >
          <span className="wa-kpi-icon"><MessageCircle size={18} /></span>
          <em>WhatsApp</em>
          <strong>{dash.totais.acionou}</strong>
          <small>Acionadas</small>
        </button>
        <button
          type="button"
          className={`wa-kpi is-warn${filtro === 'whatsapp' && waStatus === 'sem' ? ' is-on' : ''}`}
          onClick={() => {
            setFiltro('whatsapp')
            setWaStatus((s) => (filtro === 'whatsapp' && s === 'sem' ? 'todos' : 'sem'))
          }}
        >
          <span className="wa-kpi-icon"><Ban size={18} /></span>
          <em>Sem WhatsApp</em>
          <strong>{dash.totais.semWhatsapp}</strong>
          <small>Sinalizados</small>
        </button>

        {isAdmin ? (
          <>
            <button
              type="button"
              className={`wa-kpi is-car${filtro === 'carros' ? ' is-on' : ''}`}
              onClick={() => {
                setFiltro((f) => (f === 'carros' ? 'todos' : 'carros'))
                setWaStatus('todos')
              }}
            >
              <span className="wa-kpi-icon"><Car size={18} /></span>
              <em>Veículos</em>
              <strong>{(ativ?.totais.carros ?? 0) + (ativ?.totais.motos ?? 0)}</strong>
              <small>
                {ativ?.totais.carros ?? 0} carros · {ativ?.totais.motos ?? 0} motos
              </small>
            </button>
            <button
              type="button"
              className={`wa-kpi is-home${filtro === 'casas' ? ' is-on' : ''}`}
              onClick={() => {
                setFiltro((f) => (f === 'casas' ? 'todos' : 'casas'))
                setWaStatus('todos')
              }}
            >
              <span className="wa-kpi-icon"><Home size={18} /></span>
              <em>Casas</em>
              <strong>{ativ?.totais.casasPessoas ?? 0}</strong>
              <small>{ativ?.totais.casas ?? 0} adesivos casa</small>
            </button>
            <button
              type="button"
              className={`wa-kpi is-post${filtro === 'postagens' ? ' is-on' : ''}`}
              onClick={() => {
                setFiltro((f) => (f === 'postagens' ? 'todos' : 'postagens'))
                setWaStatus('todos')
              }}
            >
              <span className="wa-kpi-icon"><Share2 size={18} /></span>
              <em>Postagens</em>
              <strong>{ativ?.totais.postagens ?? 0}</strong>
              <small>{ativ?.totais.postagensPessoas ?? 0} pessoas</small>
            </button>
          </>
        ) : null}

        <button
          type="button"
          className={`wa-kpi is-blue${filtro === 'todos' && !formiga && waStatus === 'todos' ? ' is-on' : ''}`}
          onClick={() => {
            setFiltro(isAdmin ? 'todos' : 'whatsapp')
            setFormiga('')
            setWaStatus('todos')
          }}
        >
          <span className="wa-kpi-icon"><Users size={18} /></span>
          <em>Formigas</em>
          <strong>
            {isAdmin
              ? Math.max(dash.totais.formigas, ativ?.totais.formigas ?? 0)
              : dash.totais.formigas}
          </strong>
          <small>Ver todas</small>
        </button>
      </div>

      <Card>
        <div className="section-label-row">
          <h2 className="section-label">Por formiga</h2>
          {rankRows.length > 0 && filtro === 'whatsapp' ? (
            <div className="wa-legend" aria-hidden>
              <span className="wa-legend-item"><i className="ok" /> Acionou</span>
              <span className="wa-legend-item"><i className="sem" /> Sem WhatsApp</span>
            </div>
          ) : null}
        </div>
        {rankRows.length === 0 ? (
          <EmptyState title="Sem lançamentos" description="Nenhuma formiga lançou nesta visão ainda." />
        ) : (
          <>
            <div className="wa-rank-head" role="row">
              <button
                type="button"
                className={`wa-rank-head-btn${rankSortCol === 'nome' ? ' is-active' : ''}`}
                onClick={() => toggleRankSort('nome')}
              >
                Formiga
                {rankSortCol === 'nome'
                  ? (rankSortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />)
                  : <ArrowDown size={12} className="wa-sort-ghost" />}
              </button>
              <button
                type="button"
                className={`wa-rank-head-btn is-right${rankSortCol === 'total' ? ' is-active' : ''}`}
                onClick={() => toggleRankSort('total')}
              >
                Total
                {rankSortCol === 'total'
                  ? (rankSortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />)
                  : <ArrowDown size={12} className="wa-sort-ghost" />}
              </button>
            </div>
            <div className="wa-rank">
              {rankRows.map((f, index) => {
                const active = formiga === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`wa-rank-row${active ? ' is-active' : ''}`}
                    onClick={() => setFormiga(active ? '' : f.id)}
                    title={f.detail}
                  >
                    <span className="wa-rank-n">{index + 1}</span>
                    <span className="wa-rank-avatar" aria-hidden>{initials(f.nome)}</span>
                    <span className="wa-rank-meta">
                      <strong>{f.nome}</strong>
                      <em>{f.detail}</em>
                      <span className="wa-rank-track">
                        <i className="ok" style={{ width: `${(f.primary / chartMax) * 100}%` }} />
                        {filtro === 'whatsapp' ? (
                          <i className="sem" style={{ width: `${(f.secondary / chartMax) * 100}%` }} />
                        ) : null}
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
          </>
        )}
      </Card>

      <Card>
        <div className="section-label-row">
          <h2 className="section-label">
            {filtro === 'carros'
              ? 'Veículos adesivados'
              : filtro === 'casas'
                ? 'Adesivos de casa'
                : filtro === 'postagens'
                  ? 'Postagens'
                  : waStatus === 'sim'
                    ? 'Acionadas'
                    : waStatus === 'sem'
                      ? 'Sem WhatsApp'
                      : isAdmin
                        ? 'Lançamentos'
                        : 'Pessoas'}
          </h2>
          <span className="wa-count">{listCount} registro{listCount === 1 ? '' : 's'}</span>
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
              ...rankRows.map((f) => ({
                value: f.id,
                label: `${f.nome} (${f.total})`,
              })),
            ]}
          />
        </div>

        {!listCount ? (
          <EmptyState title="Nenhum registro" description="Ajuste os filtros ou aguarde novos lançamentos." />
        ) : showWaList ? (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortTh label="Pessoa" col="nome" active={sortCol === 'nome'} dir={sortDir} onSort={toggleSort} />
                    <SortTh label="Tipo" col="tipo" active={sortCol === 'tipo'} dir={sortDir} onSort={toggleSort} />
                    <SortTh label="Status" col="status" active={sortCol === 'status'} dir={sortDir} onSort={toggleSort} />
                    <SortTh label="Formiga" col="formiga" active={sortCol === 'formiga'} dir={sortDir} onSort={toggleSort} />
                    <th>Contato</th>
                    <SortTh label="Coordenador" col="coordenador" active={sortCol === 'coordenador'} dir={sortDir} onSort={toggleSort} />
                    <SortTh label="Liderança" col="lider" active={sortCol === 'lider'} dir={sortDir} onSort={toggleSort} />
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {waPage.map((p) => (
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
                          {p.telefone && p.status === 'sim' ? (
                            <WhatsAppLink phone={p.telefone} className="whatsapp-link-inline" />
                          ) : null}
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
            {waFiltradas.length > PAGE_SIZE && (
              <Pagination
                page={pageSafe}
                totalPages={totalPages}
                totalItems={waFiltradas.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                label="pessoas"
              />
            )}
          </>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortTh label="Pessoa" col="nome" active={sortCol === 'nome'} dir={sortDir} onSort={toggleSort} />
                    <SortTh label="Tipo" col="tipo" active={sortCol === 'tipo'} dir={sortDir} onSort={toggleSort} />
                    <SortTh label="Carros" col="carros" active={sortCol === 'carros'} dir={sortDir} onSort={toggleSort} align="center" />
                    <SortTh label="Motos" col="motos" active={sortCol === 'motos'} dir={sortDir} onSort={toggleSort} align="center" />
                    <SortTh label="Casa" col="casa" active={sortCol === 'casa'} dir={sortDir} onSort={toggleSort} align="center" />
                    <SortTh label="Posts" col="posts" active={sortCol === 'posts'} dir={sortDir} onSort={toggleSort} align="center" />
                    <SortTh label="Fotos" col="fotos" active={sortCol === 'fotos'} dir={sortDir} onSort={toggleSort} align="center" />
                    <SortTh label="Formiga" col="formiga" active={sortCol === 'formiga'} dir={sortDir} onSort={toggleSort} />
                    <SortTh label="Coordenador" col="coordenador" active={sortCol === 'coordenador'} dir={sortDir} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {ativPage.map((p) => {
                    const formigaNome =
                      filtro === 'casas'
                        ? p.formigaCasaNome
                        : filtro === 'postagens'
                          ? p.formigaLinksNome
                          : p.formigaCarrosNome !== '—'
                            ? p.formigaCarrosNome
                            : p.formigaCasaNome !== '—'
                              ? p.formigaCasaNome
                              : p.formigaLinksNome
                    const hasVeiculoFoto = p.fotoVeiculoPaths.length > 0
                    const hasCasaFoto = p.fotoCasaPaths.length > 0
                    return (
                      <tr key={p.key}>
                        <td><strong>{p.nome}</strong></td>
                        <td>{p.tipoLabel}</td>
                        <td className="tabular-nums">{p.carros || '—'}</td>
                        <td className="tabular-nums">{p.motos || '—'}</td>
                        <td>
                          {p.casaStatus === 'sim'
                            ? `Sim${p.casa ? ` (${p.casa})` : ''}`
                            : p.casaStatus === 'talvez'
                              ? 'Talvez'
                              : p.casa > 0
                                ? String(p.casa)
                                : '—'}
                        </td>
                        <td className="tabular-nums">{p.postagens || '—'}</td>
                        <td>
                          {hasVeiculoFoto || hasCasaFoto ? (
                            <span className="wa-fotos-cell">
                              {hasVeiculoFoto ? (
                                <FormigasFotoThumbButton
                                  paths={p.fotoVeiculoPaths}
                                  title={`Veículo — ${p.nome}`}
                                  subtitle={p.tipoLabel}
                                  preview
                                />
                              ) : null}
                              {hasCasaFoto ? (
                                <FormigasFotoThumbButton
                                  paths={p.fotoCasaPaths}
                                  title={`Casa — ${p.nome}`}
                                  subtitle={p.tipoLabel}
                                  preview
                                />
                              ) : null}
                            </span>
                          ) : (
                            <span className="ativacao-mapa-empty">—</span>
                          )}
                        </td>
                        <td>{formigaNome || '—'}</td>
                        <td>{p.coordenador || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {ativFiltradas.length > PAGE_SIZE && (
              <Pagination
                page={pageSafe}
                totalPages={totalPages}
                totalItems={ativFiltradas.length}
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
