import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  History,
  Info,
  Layers,
  MapPin,
  Pencil,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Pagination } from '../components/ui/Pagination'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { formatDate, formatDateTime } from '../lib/format'
import { formatCpf, normalizeCpf, normalizeSecao, normalizeTitulo } from '../lib/normalize'
import { hasRole } from '../lib/roles'
import {
  formatMapsUrl,
  mapsLinkError,
  parseGoogleMapsUrl,
  TITULO_MAPEAR_URL,
} from '../lib/mapsLink'
import {
  canEditarTitulo,
  documentoTitulo,
  editarFichaTitulo,
  fetchTituloLinhas,
  labelTituloStatus,
  manterFichaTitulo,
  marcarTitulo,
  pegarFichaTitulo,
  posseTravaOutros,
  salvarMapaTitulo,
  soltarFichaTitulo,
  type TituloLinha,
} from '../lib/tituloFerramentas'

type ConfirmKind = 'validado' | 'com_problema' | 'salvar'

function birthInput(value: string | null | undefined) {
  if (!value) return ''
  return value.slice(0, 10)
}

function isToday(iso: string | undefined) {
  if (!iso) return false
  const d = new Date(iso)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

function recordCode(id: string) {
  return `REG-${id.replace(/-/g, '').slice(0, 5).toUpperCase()}`
}

function formatInt(n: number) {
  return n.toLocaleString('pt-BR')
}

async function copyText(value: string) {
  const text = value.trim()
  if (!text || text === '—') return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* ignore */
  }
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  return (
    <button type="button" className="ft-copy" title={`Copiar ${label}`} onClick={() => void copyText(value)}>
      <Copy size={14} />
    </button>
  )
}

export function FerramentasTituloPage() {
  const { profile } = useAuth()
  const historico = useLocation().pathname.endsWith('/historico')
  const staff = hasRole(profile, ['admin', 'diretoria'])
  const diretoriaScope = profile?.role === 'diretoria' ? profile.id : null

  const [linhas, setLinhas] = useState<TituloLinha[]>([])
  const [atual, setAtual] = useState<TituloLinha | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [busy, setBusy] = useState(false)
  const [editRow, setEditRow] = useState<TituloLinha | null>(null)
  const [editForm, setEditForm] = useState({
    nome_completo: '',
    nome_mae: '',
    data_nascimento: '',
    titulo: '',
    cpf: '',
    zona: '',
    secao: '',
  })
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; row: TituloLinha } | null>(null)
  const [mapsLink, setMapsLink] = useState('')
  const [mapsErr, setMapsErr] = useState<string | null>(null)

  const load = useCallback(async (keepId?: string | null, soltarId?: string | null) => {
    setLoading(true)
    setError(null)
    try {
      if (soltarId && soltarId !== keepId) {
        await soltarFichaTitulo(soltarId).catch(() => undefined)
      }
      const claimedId = historico ? keepId ?? null : await pegarFichaTitulo(keepId, soltarId)
      const rows = await fetchTituloLinhas(diretoriaScope)
      setLinhas(rows)
      setAtual(claimedId ? rows.find((row) => row.id === claimedId) ?? null : null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível carregar as fichas.'
      setError(
        /cadastro_titulo_consultas|cadastro_titulo_posse|titulo_pegar|schema cache|does not exist/i.test(msg)
          ? 'Falta aplicar o SQL de Ferramentas Título no Supabase (inclua o arquivo de posse).'
          : msg,
      )
    } finally {
      setLoading(false)
    }
  }, [diretoriaScope, historico])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(0)
  }, [historico, busca, statusFiltro, pageSize])

  const fila = useMemo(
    () => linhas.filter((row) => !row.consulta && !posseTravaOutros(row.posse, profile?.id)),
    [linhas, profile?.id],
  )
  const consultadas = useMemo(() => linhas.filter((row) => row.consulta), [linhas])
  const processadasHoje = useMemo(
    () => consultadas.filter((row) => isToday(row.consulta?.consultado_em)).length,
    [consultadas],
  )
  const validadas = consultadas.filter((row) => row.consulta?.status === 'validado').length
  const acuracia = consultadas.length ? Math.round((validadas / consultadas.length) * 100) : null

  const q = busca.trim().toLowerCase()
  const historicoVisivel = useMemo(() => {
    return consultadas.filter((row) => {
      if (statusFiltro && row.consulta?.status !== statusFiltro && !(statusFiltro === 'com_problema' && row.consulta?.status === 'nao_validado')) {
        return false
      }
      if (!q) return true
      const doc = documentoTitulo(row)
      return [
        row.nome_completo,
        row.nome_mae,
        row.titulo,
        row.cpf,
        row.zona,
        row.secao,
        row.coordenador,
        row.nerite,
        doc.valor,
        row.consulta?.consultado_por_nome,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [consultadas, statusFiltro, q])

  const totalPages = Math.max(1, Math.ceil(historicoVisivel.length / pageSize))
  const pageItems = historicoVisivel.slice(page * pageSize, page * pageSize + pageSize)

  function abrirEdicao(row: TituloLinha) {
    setOk(null)
    setEditRow(row)
    setEditForm({
      nome_completo: row.nome_completo,
      nome_mae: row.nome_mae,
      data_nascimento: birthInput(row.data_nascimento),
      titulo: row.titulo,
      cpf: row.cpf ?? '',
      zona: row.zona,
      secao: row.secao,
    })
  }

  function proximo() {
    setOk(null)
    void load(null, atual?.id)
  }

  useEffect(() => {
    if (!atual) {
      setMapsLink('')
      setMapsErr(null)
      return
    }
    if (atual.lat != null && atual.lng != null) {
      setMapsLink(formatMapsUrl(atual.lat, atual.lng))
    } else {
      setMapsLink('')
    }
    setMapsErr(null)
  }, [atual?.id])

  useEffect(() => {
    if (historico || !atual) return
    void manterFichaTitulo(atual.id)
    const timer = window.setInterval(() => {
      void manterFichaTitulo(atual.id)
    }, 20_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [atual?.id, historico])

  useEffect(() => {
    if (historico) return
    const onLeave = () => {
      if (atual) void soltarFichaTitulo(atual.id)
    }
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      if (atual) void soltarFichaTitulo(atual.id)
    }
  }, [atual?.id, historico])

  async function confirmarAcao() {
    if (!confirm) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      if (confirm.kind === 'salvar') {
        await editarFichaTitulo({ id: confirm.row.id, ...editForm })
        setOk('Alterações salvas. Escolha Título Validado ou Com Inconsistência para consultar.')
        setEditRow(null)
        setConfirm(null)
        await load(confirm.row.id)
        return
      }
      const ponto = parseGoogleMapsUrl(mapsLink)
      if (!ponto) {
        setMapsErr(mapsLinkError(mapsLink) ?? 'Cole o link do Google Maps.')
        setConfirm(null)
        return
      }
      await salvarMapaTitulo(confirm.row.id, ponto.lat, ponto.lng)
      await marcarTitulo(confirm.row.id, confirm.kind === 'com_problema' ? 'nao_validado' : confirm.kind)
      setOk(
        confirm.kind === 'validado'
          ? 'Título registrado como validado. Essa ficha não aparece mais para outra pessoa.'
          : 'Inconsistência registrada. Essa ficha não aparece mais para outra pessoa.',
      )
      setConfirm(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ft-page">
      <div className="ft-top">
        <div>
          <p className="ft-kicker">Ferramentas</p>
          <h1>{historico ? 'Histórico de Títulos' : 'Validação de Títulos'}</h1>
          <p className="ft-lead">
            {historico
              ? 'Histórico de cadastros analisados. A edição é restrita ao responsável pela consulta, administradores e diretoria.'
              : "Exibição de cadastros para verificação. Selecione o status do título para salvar ou utilize 'Próximo' para avançar sem alterar."}
          </p>
        </div>
        <Link to={historico ? '/ferramentas/titulo' : '/ferramentas/titulo/historico'} className="ft-hist-btn">
          {historico ? <ArrowLeft size={16} /> : <History size={16} />}
          {historico ? 'Voltar para Validação' : 'Histórico de Consultas'}
        </Link>
      </div>

      {!historico ? (
        <div className="ft-kpis">
          <article className="ft-kpi">
            <header>
              <span>Pendentes na Fila</span>
              <Layers size={16} />
            </header>
            <div>
              <strong>{formatInt(fila.length)}</strong>
              <em className="ft-chip ft-chip-amber">Em lote</em>
            </div>
          </article>
          <article className="ft-kpi">
            <header>
              <span>Processadas Hoje</span>
              <CheckCircle2 size={16} />
            </header>
            <div>
              <strong>{formatInt(processadasHoje)}</strong>
              <em className="ft-chip ft-chip-green">Sessão atual</em>
            </div>
          </article>
          <article className="ft-kpi">
            <header>
              <span>Acurácia de Cadastros</span>
              <ShieldCheck size={16} />
            </header>
            <div>
              <strong>{acuracia == null ? '—' : `${acuracia}%`}</strong>
              <em className="ft-chip ft-chip-blue">{acuracia == null ? 'Sem consultas' : 'Consultadas'}</em>
            </div>
          </article>
        </div>
      ) : (
        <div className="ft-kpis ft-kpis-2">
          <article className="ft-kpi">
            <header>
              <span>Na fila de análise</span>
            </header>
            <div>
              <strong>{formatInt(fila.length)}</strong>
            </div>
          </article>
          <article className="ft-kpi">
            <header>
              <span>Total Consultado</span>
            </header>
            <div>
              <strong>{formatInt(consultadas.length)}</strong>
            </div>
          </article>
        </div>
      )}

      {error ? <p className="rel-txt-error">{error}</p> : null}
      {ok ? <p className="rel-txt-ok">{ok}</p> : null}

      {historico ? (
        <HistoricoView
          busca={busca}
          statusFiltro={statusFiltro}
          onBusca={setBusca}
          onStatus={setStatusFiltro}
          loading={loading}
          rows={historicoVisivel}
          pageItems={pageItems}
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
          profileId={profile?.id}
          staff={staff}
          busy={busy}
          onEdit={abrirEdicao}
          onMarcar={(kind, row) => setConfirm({ kind, row })}
        />
      ) : loading ? (
        <div className="gg-loading">
          <Spinner size={32} />
        </div>
      ) : !atual ? (
        <EmptyState
          title="Nenhum registro encontrado"
          description="Só entram fichas com data de nascimento. As já consultadas ficam no Histórico de Consultas."
        />
      ) : (
        <FichaCard
          row={atual}
          restantes={fila.length}
          busy={busy}
          mapsLink={mapsLink}
          mapsErr={mapsErr}
          onMapsLink={(value) => {
            setMapsLink(value)
            setMapsErr(value.trim() ? mapsLinkError(value) : null)
          }}
          onEdit={() => abrirEdicao(atual)}
          onValidado={() => {
            const err = mapsLinkError(mapsLink)
            if (err) {
              setMapsErr(err)
              return
            }
            setConfirm({ kind: 'validado', row: atual })
          }}
          onProblema={() => {
            const err = mapsLinkError(mapsLink)
            if (err) {
              setMapsErr(err)
              return
            }
            setConfirm({ kind: 'com_problema', row: atual })
          }}
          onProximo={proximo}
        />
      )}

      <Modal
        open={Boolean(editRow) && confirm?.kind !== 'salvar'}
        title="Editar Dados da Ficha"
        description="Corrija zona, seção ou outro dado desta ficha."
        onClose={() => setEditRow(null)}
        onConfirm={() => editRow && setConfirm({ kind: 'salvar', row: editRow })}
        confirmLabel="Salvar Alterações"
        loading={busy}
      >
        <div className="ft-edit">
          <Input
            label="Nome Completo"
            value={editForm.nome_completo}
            onChange={(e) => setEditForm((f) => ({ ...f, nome_completo: e.target.value }))}
          />
          <div className="ft-edit-2">
            <Input
              label="Nome da Mãe"
              value={editForm.nome_mae}
              onChange={(e) => setEditForm((f) => ({ ...f, nome_mae: e.target.value }))}
            />
            <Input
              label="Data Nasc."
              type="date"
              value={editForm.data_nascimento}
              onChange={(e) => setEditForm((f) => ({ ...f, data_nascimento: e.target.value }))}
            />
          </div>
          <div className="ft-edit-3">
            <Input
              label="Título"
              value={editForm.titulo}
              onChange={(e) => setEditForm((f) => ({ ...f, titulo: normalizeTitulo(e.target.value) }))}
              inputMode="numeric"
            />
            <Input
              label="Zona"
              value={editForm.zona}
              onChange={(e) => setEditForm((f) => ({ ...f, zona: e.target.value }))}
            />
            <Input
              label="Seção"
              value={editForm.secao}
              onChange={(e) => setEditForm((f) => ({ ...f, secao: normalizeSecao(e.target.value) }))}
              inputMode="numeric"
            />
          </div>
          <Input
            label="CPF"
            value={formatCpf(editForm.cpf) || editForm.cpf}
            onChange={(e) => setEditForm((f) => ({ ...f, cpf: normalizeCpf(e.target.value) }))}
            inputMode="numeric"
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(confirm)}
        title={
          confirm?.kind === 'salvar'
            ? 'Salvar Alterações'
            : confirm?.kind === 'validado'
              ? 'Título Validado'
              : 'Com Inconsistência'
        }
        description={
          confirm?.kind === 'salvar'
            ? 'Deseja mesmo salvar essa edição?'
            : confirm?.kind === 'validado'
              ? `Registrar o título de ${confirm.row.nome_completo || 'esta ficha'} como validado? Depois ela some da fila.`
              : `Registrar inconsistência no título de ${confirm?.row.nome_completo || 'esta ficha'}? Depois ela some da fila.`
        }
        onClose={() => setConfirm(null)}
        onConfirm={() => void confirmarAcao()}
        confirmLabel={confirm?.kind === 'salvar' ? 'Sim, salvar' : 'Sim, confirmar'}
        confirmVariant={confirm?.kind === 'com_problema' ? 'danger' : 'primary'}
        loading={busy}
      />
    </div>
  )
}

function FichaCard({
  row,
  restantes,
  busy,
  mapsLink,
  mapsErr,
  onMapsLink,
  onEdit,
  onValidado,
  onProblema,
  onProximo,
}: {
  row: TituloLinha
  restantes: number
  busy: boolean
  mapsLink: string
  mapsErr: string | null
  onMapsLink: (value: string) => void
  onEdit: () => void
  onValidado: () => void
  onProblema: () => void
  onProximo: () => void
}) {
  const ponto = parseGoogleMapsUrl(mapsLink)
  const nome = (row.nome_completo || '—').toUpperCase()
  const mae = (row.nome_mae || '—').toUpperCase()
  const titulo = row.titulo.trim() || '—'
  const nasc = formatDate(row.data_nascimento)
  const zona = row.zona || '—'
  const secao = row.secao || '—'
  const nerite = (row.nerite || '—').toUpperCase()
  const coord = (row.coordenador || '—').toUpperCase()

  return (
    <section className="ft-sheet" aria-label="Ficha cadastral">
      <header className="ft-sheet-bar">
        <div>
          <span>Ficha Cadastral</span>
          <i>•</i>
          <code>{recordCode(row.id)}</code>
        </div>
        <em className="ft-queue-pill">
          <b />
          {formatInt(restantes)} na fila
        </em>
      </header>

      <div className="ft-sheet-body">
        <div className="ft-nome">
          <span>Nome Completo</span>
          <div>
            <h2>{nome}</h2>
            <CopyBtn value={nome} label="nome" />
          </div>
        </div>

        <hr />

        <div className="ft-fields">
          <div className="ft-col">
            <div className="ft-field">
              <span>Nome da Mãe</span>
              <div>
                <strong>{mae}</strong>
                <CopyBtn value={mae} label="nome da mãe" />
              </div>
            </div>
            <div className="ft-field">
              <span>Título de Eleitor</span>
              <div>
                <strong className="ft-mono">{titulo}</strong>
                <CopyBtn value={titulo} label="título de eleitor" />
              </div>
            </div>
            <div className="ft-field">
              <span>Seção</span>
              <strong>{secao}</strong>
            </div>
            <div className="ft-field">
              <span>Coordenação</span>
              <strong>{coord}</strong>
            </div>
          </div>
          <div className="ft-col">
            <div className="ft-field">
              <span>Data de Nascimento</span>
              <div>
                <strong>{nasc}</strong>
                <CopyBtn value={nasc} label="data de nascimento" />
              </div>
            </div>
            <div className="ft-field">
              <span>Zona</span>
              <strong>{zona}</strong>
            </div>
            <div className="ft-field">
              <span>Operador Responsável (Nerite)</span>
              <strong>{nerite}</strong>
            </div>
          </div>
        </div>

        <div className="ft-maps">
          <div className="ft-maps-head">
            <span>Link do mapa *</span>
            <a
              className="ft-edit-btn"
              href={TITULO_MAPEAR_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin size={16} />
              Mapear
            </a>
          </div>
          <Input
            value={mapsLink}
            onChange={(e) => onMapsLink(e.target.value)}
            placeholder="Cole aqui o link do Google Maps"
            error={mapsErr ?? undefined}
            required
            aria-label="Link do mapa"
          />
          {ponto ? (
            <p className="ft-maps-ok">
              Ponto: {ponto.lat}, {ponto.lng}
            </p>
          ) : null}
        </div>

        <div className="ft-info">
          <Info size={16} />
          <span>
            Clique em <strong>Mapear</strong>, copie o link do Google Maps e cole no campo. Sem esse link não dá para
            validar. <strong>Próximo Registro</strong> só troca a ficha.
          </span>
        </div>

        <div className="ft-decisions">
          <button type="button" className="ft-btn ft-btn-ok" onClick={onValidado} disabled={busy}>
            <CheckCircle2 size={20} />
            Título Validado
          </button>
          <button type="button" className="ft-btn ft-btn-bad" onClick={onProblema} disabled={busy}>
            <AlertTriangle size={20} />
            Com Inconsistência
          </button>
          <button type="button" className="ft-btn ft-btn-next" onClick={onProximo} disabled={busy || restantes <= 1}>
            Próximo Registro
            <ArrowRight size={20} />
          </button>
        </div>

        <div className="ft-aux">
          <button type="button" className="ft-edit-btn" onClick={onEdit} disabled={busy}>
            <Pencil size={16} />
            Editar Cadastro
          </button>
        </div>
      </div>
    </section>
  )
}

function HistoricoView({
  busca,
  statusFiltro,
  onBusca,
  onStatus,
  loading,
  rows,
  pageItems,
  page,
  totalPages,
  pageSize,
  onPage,
  onPageSize,
  profileId,
  staff,
  busy,
  onEdit,
  onMarcar,
}: {
  busca: string
  statusFiltro: string
  onBusca: (value: string) => void
  onStatus: (value: string) => void
  loading: boolean
  rows: TituloLinha[]
  pageItems: TituloLinha[]
  page: number
  totalPages: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  profileId?: string
  staff: boolean
  busy: boolean
  onEdit: (row: TituloLinha) => void
  onMarcar: (kind: ConfirmKind, row: TituloLinha) => void
}) {
  return (
    <>
      <div className="ft-filters">
        <Input
          type="search"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar por nome, mãe, título, CPF ou Nerite..."
          aria-label="Buscar"
        />
        <Select
          value={statusFiltro}
          onChange={(e) => onStatus(e.target.value)}
          options={[
            { value: 'validado', label: 'Status: Validados' },
            { value: 'com_problema', label: 'Status: Com Inconsistência' },
          ]}
          placeholder="Status: Todos"
          aria-label="Filtro de consulta"
        />
      </div>
      <p className="ft-filter-count">
        {rows.length} {rows.length === 1 ? 'ficha consultada' : 'fichas consultadas'}
      </p>

      {loading ? (
        <div className="gg-loading">
          <Spinner size={32} />
        </div>
      ) : !rows.length ? (
        <EmptyState
          title="Nenhum registro encontrado"
          description="Os títulos analisados e validados pela equipe serão listados e consolidados nesta área."
        />
      ) : (
        <>
          <div className="table-wrapper ft-hist-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cidadão / Nome</th>
                  <th>Título / Zona / Seção</th>
                  <th>Mãe / Nascimento</th>
                  <th>Operador (Nerite)</th>
                  <th>Status</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => {
                  const doc = documentoTitulo(row)
                  const canEdit = canEditarTitulo(row.consulta, profileId, staff)
                  const problema = row.consulta?.status === 'com_problema' || row.consulta?.status === 'nao_validado'
                  return (
                    <tr key={row.id}>
                      <td><strong>{row.nome_completo || '—'}</strong></td>
                      <td>
                        <span className="mono-cell">{doc.valor}</span>
                        <small className="ft-sub">{row.zona || '—'} / {row.secao || '—'}</small>
                      </td>
                      <td>
                        {row.nome_mae || '—'}
                        <small className="ft-sub">{formatDate(row.data_nascimento)}</small>
                      </td>
                      <td>{row.nerite}</td>
                      <td>
                        {row.consulta ? (
                          <div className="ft-consulta">
                            <span className={`badge ${problema ? 'badge-danger' : 'badge-success'}`}>
                              {labelTituloStatus(row.consulta.status)}
                            </span>
                            <small>
                              {row.consulta.consultado_por_nome}
                              <br />
                              {formatDateTime(row.consulta.consultado_em)}
                            </small>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="sticky-actions-cell">
                        {canEdit ? (
                          <div className="ft-actions">
                            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(row)} disabled={busy}>
                              <Pencil size={14} />
                              Editar
                            </Button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => onMarcar('validado', row)} disabled={busy}>
                              Validado
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => onMarcar('com_problema', row)} disabled={busy}>
                              Inconsistência
                            </Button>
                          </div>
                        ) : (
                          <span className="ft-locked">Só quem consultou</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={rows.length}
            pageSize={pageSize}
            onPageChange={onPage}
            onPageSizeChange={onPageSize}
          />
        </>
      )}
    </>
  )
}
