import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bike,
  Car,
  Clock3,
  Crown,
  Download,
  HelpCircle,
  History,
  Home,
  MapPin,
  MessageCircle,
  Pencil,
  RotateCcw,
  Search,
  Share2,
  UserCog,
  Users,
  ClipboardList,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import { FormigasFichaHistoricoDrawer } from '../components/FormigasFichaHistoricoDrawer'
import { FormigasFotoThumbButton } from '../components/FormigasFotoField'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import { formatPhone } from '../lib/format'
import {
  fetchAtivacaoKpis,
  fetchAtivacaoPainel,
  fetchAtivacaoTeamOptions,
  mapsUrlForPessoa,
  type AtivacaoListFilters,
  type AtivacaoPessoa,
  type AtivacaoTeamOptions,
} from '../lib/ativacao'

type EquipeChip = 'todos' | 'coordenadores' | 'lideres' | 'nerites' | 'eleitores'

function chipToTipo(chip: EquipeChip): AtivacaoListFilters['tipo'] {
  if (chip === 'todos') return 'todos'
  if (chip === 'coordenadores') return 'coordenador'
  if (chip === 'lideres') return 'lideranca'
  // Nerites e Eleitores: fichas (cadastros). Nerites enfatiza filtro por nerite.
  return 'eleitor'
}

function parseEquipeChip(raw: string | null, status?: AtivacaoListFilters['status']): EquipeChip {
  if (raw === 'formigas') return 'eleitores'
  if (raw && ['todos', 'coordenadores', 'lideres', 'nerites', 'eleitores'].includes(raw)) {
    return raw as EquipeChip
  }
  // Vindo do Dashboard (carros/casas/postagens): totais incluem lideranças e coordenadores.
  if (status && status !== 'todos') return 'todos'
  return 'eleitores'
}

function parseStatus(raw: string | null): AtivacaoListFilters['status'] {
  if (raw === 'carros' || raw === 'adesivo') return 'com_carro'
  if (raw === 'casa') return 'casa_sim'
  if (raw === 'casa_talvez' || raw === 'talvez') return 'casa_talvez'
  if (raw === 'postagens') return 'com_links'
  if (raw === 'pendente') return 'sem_ativacao'
  if (
    raw
    && [
      'todos',
      'com_ativacao',
      'sem_ativacao',
      'com_carro',
      'casa_sim',
      'casa_talvez',
      'com_links',
      'contato_sim',
      'contato_nao',
    ].includes(raw)
  ) {
    return raw as AtivacaoListFilters['status']
  }
  return 'todos'
}

function casaCsvLabel(p: AtivacaoPessoa) {
  if (p.adesivos_casa_status === 'talvez') return 'Talvez'
  if (p.adesivos_casa_status === 'sim' || p.adesivos_casa > 0) return 'Sim'
  return 'Nao'
}

function hasCasaAddr(p: AtivacaoPessoa) {
  return (
    p.adesivos_casa_status === 'sim'
    || p.adesivos_casa_status === 'talvez'
    || p.adesivos_casa > 0
  )
}

export function AtivacaoPainelPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = hasRole(profile, 'admin')
  const isDiretoria = hasRole(profile, 'diretoria')
  const isMobilizador = hasRole(profile, 'mobilizador')
  const canPickDiretoria = isAdmin || isMobilizador
  const scopeDiretoriaId = isDiretoria ? profile?.id : null

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AtivacaoPessoa[]>([])
  const [total, setTotal] = useState(0)
  const [fichasCount, setFichasCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [team, setTeam] = useState<AtivacaoTeamOptions>({
    diretorias: [],
    coordenadores: [],
    lideres: [],
    nerites: [],
  })

  const [equipeChip, setEquipeChip] = useState<EquipeChip>(() =>
    parseEquipeChip(searchParams.get('equipe'), parseStatus(searchParams.get('status'))),
  )
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [status, setStatus] = useState<AtivacaoListFilters['status']>(() =>
    parseStatus(searchParams.get('status')),
  )
  const [diretoriaId, setDiretoriaId] = useState(
    scopeDiretoriaId || searchParams.get('diretoria') || '',
  )
  const [coordenador, setCoordenador] = useState(searchParams.get('coordenador') ?? '')
  const [lider, setLider] = useState(searchParams.get('lider') ?? '')
  const [operatorId, setOperatorId] = useState(searchParams.get('nerite') ?? '')
  const [page, setPage] = useState(Number(searchParams.get('page') || 0) || 0)
  const [pageSize, setPageSize] = useState(25)
  const [kpis, setKpis] = useState({
    carros: 0,
    casas: 0,
    casasTalvez: 0,
    postagens: 0,
    whatsapp: 0,
    pendentes: 0,
  })
  const [histTarget, setHistTarget] = useState<AtivacaoPessoa | null>(null)

  useEffect(() => {
    if (scopeDiretoriaId) setDiretoriaId(scopeDiretoriaId)
  }, [scopeDiretoriaId])

  // Deep link / navegação externa → estado (cards, Dashboard, refresh)
  useEffect(() => {
    const nextStatus = parseStatus(searchParams.get('status'))
    const nextEquipe = parseEquipeChip(searchParams.get('equipe'), nextStatus)
    const nextSearch = searchParams.get('q') ?? ''
    const nextDir = scopeDiretoriaId || searchParams.get('diretoria') || ''
    const nextCoord = searchParams.get('coordenador') ?? ''
    const nextLider = searchParams.get('lider') ?? ''
    const nextNerite = searchParams.get('nerite') ?? ''
    const nextPage = Number(searchParams.get('page') || 0) || 0
    setStatus((cur) => (cur === nextStatus ? cur : nextStatus))
    setEquipeChip((cur) => (cur === nextEquipe ? cur : nextEquipe))
    setSearch((cur) => (cur === nextSearch ? cur : nextSearch))
    if (!scopeDiretoriaId) {
      setDiretoriaId((cur) => (cur === nextDir ? cur : nextDir))
    }
    setCoordenador((cur) => (cur === nextCoord ? cur : nextCoord))
    setLider((cur) => (cur === nextLider ? cur : nextLider))
    setOperatorId((cur) => (cur === nextNerite ? cur : nextNerite))
    setPage((cur) => (cur === nextPage ? cur : nextPage))
  }, [searchParams, scopeDiretoriaId])

  useEffect(() => {
    const dir = diretoriaId || scopeDiretoriaId || undefined
    void fetchAtivacaoKpis({
      tipo: 'todos',
      diretoria_id: dir,
    }).then(setKpis).catch(() => undefined)
  }, [diretoriaId, scopeDiretoriaId])

  useEffect(() => {
    const scope = isDiretoria ? scopeDiretoriaId : (diretoriaId || null)
    void fetchAtivacaoTeamOptions(scope).then(setTeam).catch(() => undefined)
  }, [isDiretoria, diretoriaId, scopeDiretoriaId])

  useEffect(() => {
    let cancelled = false
    void fetchAtivacaoPainel({
      tipo: 'eleitor',
      page: 0,
      pageSize: 1,
      diretoria_id: diretoriaId || undefined,
    }).then((res) => {
      if (!cancelled) setFichasCount(res.total)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [diretoriaId])

  const lideresOpts = useMemo(() => {
    if (!coordenador) return team.lideres
    return team.lideres.filter((l) => !l.coordenador_id || l.coordenador_id === coordenador)
  }, [team, coordenador])

  const neritesOpts = useMemo(() => {
    let rows = team.nerites
    if (coordenador) {
      rows = rows.filter((n) => !n.coordenador_id || n.coordenador_id === coordenador)
    }
    if (lider) {
      rows = rows.filter((n) => !n.lider_id || n.lider_id === lider)
    }
    return rows
  }, [team, coordenador, lider])

  const coordenadorNome = useMemo(
    () => team.coordenadores.find((c) => c.id === coordenador)?.nome ?? '',
    [team.coordenadores, coordenador],
  )
  const liderNome = useMemo(
    () => team.lideres.find((l) => l.id === lider)?.nome ?? '',
    [team.lideres, lider],
  )

  const tipo = chipToTipo(equipeChip)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const teamFilters =
      equipeChip === 'todos'
        ? {}
        : {
            coordenador: coordenadorNome || undefined,
            coordenador_id: coordenador || undefined,
            lider: liderNome || undefined,
            lider_id: lider || undefined,
            operator_id: operatorId || undefined,
          }
    void fetchAtivacaoPainel({
      search,
      tipo,
      status,
      page,
      pageSize,
      diretoria_id: diretoriaId || undefined,
      ...teamFilters,
    })
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
  }, [search, tipo, status, page, pageSize, diretoriaId, coordenador, lider, operatorId, coordenadorNome, liderNome, equipeChip])

  useEffect(() => {
    const next = new URLSearchParams()
    if (search) next.set('q', search)
    if (status && status !== 'todos') next.set('status', status)
    if (diretoriaId && canPickDiretoria) next.set('diretoria', diretoriaId)
    if (coordenador) next.set('coordenador', coordenador)
    if (lider) next.set('lider', lider)
    if (operatorId) next.set('nerite', operatorId)
    if (equipeChip !== 'eleitores') next.set('equipe', equipeChip)
    if (page > 0) next.set('page', String(page))
    setSearchParams(next, { replace: true })
  }, [search, status, diretoriaId, coordenador, lider, operatorId, equipeChip, page, canPickDiretoria, setSearchParams])

  function clearFilters() {
    setSearch('')
    setStatus('todos')
    setEquipeChip('eleitores')
    if (canPickDiretoria) setDiretoriaId('')
    setCoordenador('')
    setLider('')
    setOperatorId('')
    setPage(0)
  }

  function exportCsv() {
    const header = [
      'Tipo', 'Nome', 'Titulo', 'Zona', 'Bairro', 'Telefone',
      'Coordenador', 'Lideranca', 'Carros', 'Motos', 'Casa', 'Endereco', 'Numero', 'CEP', 'Mapa',
      'Postagens', 'Contato WA', 'Links', 'Notas',
    ]
    const rows = items.map((p) => [
      p.tipoLabel,
      p.nome,
      p.titulo,
      p.zona,
      p.bairro,
      p.telefone,
      p.coordenador,
      p.lider,
      String(p.carros_adesivados),
      String(p.motos_adesivadas),
      casaCsvLabel(p),
      hasCasaAddr(p) ? p.endereco : '',
      hasCasaAddr(p) ? p.numero : '',
      hasCasaAddr(p) ? p.cep : '',
      hasCasaAddr(p) ? (mapsUrlForPessoa(p) ?? '') : '',
      String(p.postagem_links.length || p.postagens),
      p.contato_whatsapp_status === 'sim'
        ? 'Ja acionada'
        : p.contato_whatsapp_status === 'sem'
          ? 'Nao tem WhatsApp'
          : 'Nao acionada',
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
    a.download = 'formigas-painel.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const diretoraLabel = team.diretorias.find((d) => d.id === diretoriaId)?.nome

  return (
    <div className="ativacao-page nv-dash">
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel — Formigas</h1>
          <p className="page-subtitle">
            {fichasCount.toLocaleString('pt-BR')} eleitor{fichasCount === 1 ? '' : 'es'}
            {diretoriaId && diretoraLabel ? ` · ${diretoraLabel}` : ''}
          </p>
        </div>
        <div className="page-header-actions">
          <Button onClick={() => navigate('/ativacao/lancar')}>+ Fazer lançamento</Button>
        </div>
      </div>

      <div className="fl-stats fl-stats-painel">
        {(
          [
            {
              key: 'carros',
              label: 'Veículos',
              value: kpis.carros,
              Icon: Car,
              tone: 'blue',
              statusKey: 'com_carro' as const,
            },
            {
              key: 'casas',
              label: 'Casas',
              value: kpis.casas,
              Icon: Home,
              tone: 'teal',
              statusKey: 'casa_sim' as const,
            },
            {
              key: 'casasTalvez',
              label: 'Talvez',
              value: kpis.casasTalvez,
              Icon: HelpCircle,
              tone: 'amber',
              statusKey: 'casa_talvez' as const,
            },
            {
              key: 'postagens',
              label: 'Postagens',
              value: kpis.postagens,
              Icon: Share2,
              tone: 'violet',
              statusKey: 'com_links' as const,
            },
            {
              key: 'whatsapp',
              label: 'WhatsApp',
              value: kpis.whatsapp,
              Icon: MessageCircle,
              tone: 'wa',
              statusKey: 'contato_sim' as const,
            },
            {
              key: 'pendentes',
              label: 'Pendentes',
              value: kpis.pendentes,
              Icon: Clock3,
              tone: 'amber',
              statusKey: 'sem_ativacao' as const,
            },
          ] as const
        ).map(({ key, label, value, Icon, tone, statusKey }) => {
          const active = status === statusKey
          return (
            <button
              key={key}
              type="button"
              className={`fl-stat fl-stat-card tone-${tone}${active ? ' is-filter-active' : ''}`}
              aria-pressed={active}
              onClick={() => {
                setEquipeChip('todos')
                setStatus(statusKey)
                setPage(0)
              }}
            >
              <div className="fl-stat-top">
                <span>{label}</span>
                <div className="fl-stat-icon" aria-hidden>
                  <Icon size={18} strokeWidth={2.25} />
                </div>
              </div>
              <strong>{value.toLocaleString('pt-BR')}</strong>
              <em className="fl-stat-cta">{active ? 'Filtro ativo' : 'Filtrar →'}</em>
            </button>
          )
        })}
      </div>

      {canPickDiretoria && (
        <div className="filters-grid" style={{ marginBottom: '.85rem', maxWidth: 340 }}>
          <Select
            value={diretoriaId}
            onChange={(e) => {
              setDiretoriaId(e.target.value)
              setCoordenador('')
              setLider('')
              setOperatorId('')
              setPage(0)
            }}
            placeholder="Todas as diretoras"
            options={team.diretorias.map((d) => ({ value: d.id, label: d.nome }))}
            aria-label="Diretora"
          />
        </div>
      )}

      <div className="views-row">
        {(
          [
            { key: 'todos' as const, label: 'Todos', Icon: ClipboardList, count: null as number | null },
            { key: 'coordenadores' as const, label: 'Coordenadores', Icon: UserCog, count: team.coordenadores.length },
            { key: 'lideres' as const, label: 'Lideranças', Icon: Crown, count: lideresOpts.length },
            { key: 'nerites' as const, label: 'Nerites', Icon: Users, count: neritesOpts.length },
            { key: 'eleitores' as const, label: 'Eleitores', Icon: ClipboardList, count: fichasCount },
          ]
        ).map(({ key, label, Icon, count }) => (
          <button
            key={key}
            type="button"
            className={`view-chip${equipeChip === key ? ' active' : ''}`}
            onClick={() => {
              setEquipeChip(key)
              setPage(0)
            }}
          >
            <Icon size={14} /> {label}
            {count != null && <em className="view-chip-count">{count}</em>}
          </button>
        ))}
      </div>

      {diretoriaId && diretoraLabel && (
        <div className="ficha-setup-banner" style={{ marginBottom: '0.85rem' }}>
          <strong>Diretora: {diretoraLabel}</strong>
          <span>
            {equipeChip === 'todos' && 'Exibindo coordenadores, lideranças e eleitores desta diretora.'}
            {equipeChip === 'coordenadores' && 'Exibindo coordenadores desta diretora.'}
            {equipeChip === 'lideres' && 'Exibindo lideranças desta diretora.'}
            {equipeChip === 'nerites' && 'Exibindo fichas das nerites desta diretora.'}
            {equipeChip === 'eleitores' && 'Exibindo eleitores (fichas) desta diretora.'}
          </span>
        </div>
      )}

      <div className="ativacao-filters">
        <div className="ativacao-search painel">
          <Search size={16} aria-hidden />
          <input
            className="ui-input"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            placeholder="Buscar..."
          />
        </div>

        {equipeChip !== 'coordenadores' && equipeChip !== 'todos' && (
          <Select
            value={coordenador}
            onChange={(e) => {
              setCoordenador(e.target.value)
              setLider('')
              setOperatorId('')
              setPage(0)
            }}
            placeholder="Todos os coordenadores"
            options={team.coordenadores.map((c) => ({ value: c.id, label: c.nome }))}
            aria-label="Coordenador"
          />
        )}

        {(equipeChip === 'nerites' || equipeChip === 'eleitores') && (
          <Select
            value={lider}
            onChange={(e) => {
              setLider(e.target.value)
              setOperatorId('')
              setPage(0)
            }}
            placeholder="Todas as lideranças"
            options={lideresOpts.map((l) => ({ value: l.id, label: l.nome }))}
            aria-label="Liderança"
          />
        )}

        {(equipeChip === 'nerites' || equipeChip === 'eleitores') && (
          <Select
            value={operatorId}
            onChange={(e) => { setOperatorId(e.target.value); setPage(0) }}
            placeholder="Todas as nerites"
            options={neritesOpts.map((n) => ({ value: n.id, label: n.nome }))}
            aria-label="Nerite"
          />
        )}

        <Select
          value={status ?? 'todos'}
          onChange={(e) => { setStatus(e.target.value as AtivacaoListFilters['status']); setPage(0) }}
          options={[
            { value: 'todos', label: 'Todos os status' },
            { value: 'com_ativacao', label: 'Com algum lançamento' },
            { value: 'sem_ativacao', label: 'Sem lançamento' },
            { value: 'com_carro', label: 'Com veículo adesivado' },
            { value: 'casa_sim', label: 'Com casa adesivada' },
            { value: 'casa_talvez', label: 'Casa: Talvez' },
            { value: 'com_links', label: 'Com links de rede' },
            { value: 'contato_sim', label: 'WhatsApp: Já acionada' },
            { value: 'contato_nao', label: 'WhatsApp: Não acionada' },
          ]}
        />

        <Button variant="secondary" onClick={exportCsv}>
          <Download size={16} /> Exportar página
        </Button>
        <button type="button" className="clear-filters" onClick={clearFilters} style={{ color: '#2f6fed' }}>
          <RotateCcw size={13} /> Limpar
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Spinner size={36} />
        </div>
      ) : !items.length ? (
        <EmptyState
          title="Nenhum registro localizado"
          description="Escolha uma diretora e um dos botões acima, ou revise a busca."
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
                  <th>Equipe</th>
                  <th>Veículos</th>
                  <th>Casa</th>
                  <th>Postagens</th>
                  <th>WhatsApp</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.key}>
                    <td>
                      <strong>{p.nome}</strong>
                      {(p.titulo || p.telefone || p.bairro) && (
                        <span className="ativacao-sub">
                          {[
                            p.titulo && `Título ${p.titulo}`,
                            p.telefone && formatPhone(p.telefone),
                            p.bairro,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td><span className="mob-tipo">{p.tipoLabel}</span></td>
                    <td>
                      <span className="ativacao-sub" style={{ display: 'block', margin: 0 }}>
                        {[p.coordenador && `Coord. ${p.coordenador}`, p.lider && `Lid. ${p.lider}`]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </td>
                    <td>
                      {(p.carros_adesivados > 0 || p.motos_adesivadas > 0) ? (
                        <span className="ativacao-veiculo-cell">
                          {p.carros_adesivados > 0 && (
                            <span className="ativacao-veiculo-chip">
                              <Car size={12} /> {p.carros_adesivados}
                            </span>
                          )}
                          {p.motos_adesivadas > 0 && (
                            <span className="ativacao-veiculo-chip">
                              <Bike size={12} /> {p.motos_adesivadas}
                            </span>
                          )}
                          <FormigasFotoThumbButton
                            paths={p.foto_veiculo_paths}
                            title={`Veículo — ${p.nome}`}
                            subtitle={p.tipoLabel}
                          />
                        </span>
                      ) : (
                        <span className="ativacao-mapa-empty">—</span>
                      )}
                    </td>
                    <td>
                      {hasCasaAddr(p) ? (
                        <span className="ativacao-casa-cell">
                          {p.adesivos_casa_status === 'talvez' && (
                            <span className="fl-pill warn" style={{ marginRight: 6 }}>Talvez</span>
                          )}
                          {(() => {
                            const url = mapsUrlForPessoa(p)
                            return url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ativacao-mapa-link"
                                title={[p.endereco, p.numero && `nº ${p.numero}`, p.cep].filter(Boolean).join(', ') || 'Abrir no mapa'}
                                aria-label={`Mapa de ${p.nome}`}
                              >
                                <MapPin size={16} strokeWidth={2.25} />
                                <span>Mapa</span>
                              </a>
                            ) : (
                              <span className="ativacao-mapa-missing" title="Sem coordenadas ou endereço">
                                <MapPin size={16} />
                                <span>Sem local</span>
                              </span>
                            )
                          })()}
                          {p.adesivos_casa_status === 'sim' || p.adesivos_casa > 0 ? (
                            <FormigasFotoThumbButton
                              paths={p.foto_casa_paths}
                              title={`Casa — ${p.nome}`}
                              subtitle={p.tipoLabel}
                            />
                          ) : null}
                        </span>
                      ) : (
                        <span className="ativacao-mapa-empty">—</span>
                      )}
                    </td>
                    <td className="tabular-nums">{p.postagem_links.length || p.postagens}</td>
                    <td>
                      <div className="ativacao-wa-cell">
                        <WhatsAppLink phone={p.telefone} className="whatsapp-link-inline" />
                        <div className="ativacao-wa-meta">
                          <span>
                            {p.contato_whatsapp_status === 'sim'
                              ? 'Já acionada'
                              : p.contato_whatsapp_status === 'sem'
                                ? 'Sem WhatsApp'
                                : 'Não acionada'}
                          </span>
                          {p.formigas_wa_by ? (
                            <em className="ativacao-wa-by" title="Formiga que registrou o WhatsApp">
                              {p.formigas_wa_by_nome?.trim() || 'Formiga'}
                            </em>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="ativacao-acoes">
                        <button
                          type="button"
                          className="ativacao-hist-btn"
                          title={ownersTooltip(p)}
                          aria-label={`Histórico de ${p.nome}`}
                          onClick={() => setHistTarget(p)}
                        >
                          <History size={16} />
                        </button>
                        <Link
                          to={`/ativacao/lancar?tipo=${p.tipo}&id=${p.id}`}
                          aria-label={`Editar lançamento de ${p.nome}`}
                        >
                          <Button variant="ghost" size="sm"><Pencil size={16} /></Button>
                        </Link>
                      </div>
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

      {histTarget && (
        <FormigasFichaHistoricoDrawer
          open
          onClose={() => setHistTarget(null)}
          tipo={histTarget.tipo}
          pessoaId={histTarget.id}
          pessoaNome={histTarget.nome}
        />
      )}
    </div>
  )
}

function ownersTooltip(p: AtivacaoPessoa): string {
  const parts: string[] = []
  if (p.formigas_wa_by) parts.push(`WA: ${p.formigas_wa_by_nome || 'Formiga'}`)
  if (p.formigas_carros_by) parts.push(`Carros: ${p.formigas_carros_by_nome || 'Formiga'}`)
  if (p.formigas_casa_by) parts.push(`Casa: ${p.formigas_casa_by_nome || 'Formiga'}`)
  if (p.formigas_links_by) parts.push(`Links: ${p.formigas_links_by_nome || 'Formiga'}`)
  return parts.length ? parts.join(' · ') : 'Histórico desta ficha'
}
