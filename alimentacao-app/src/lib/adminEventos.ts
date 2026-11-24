import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
  AdminDashboardResumo,
  AdminEvento,
  AdminEventoCategoria,
  AdminEventoFiltro,
  AdminEventosResultado,
  AdminSystemId,
} from './adminTypes'

type RawCentral = {
  id: string
  sistema: AdminSystemId
  categoria: AdminEventoCategoria
  acao: string
  entidade: string | null
  entidade_id: string | null
  titulo: string
  resumo: string | null
  actor_id: string | null
  actor_nome: string | null
  ocorrido_em: string
  metadata: Record<string, unknown> | null
  origem_url: string | null
  source_key: string
}

export const ADMIN_SYSTEMS: { id: AdminSystemId; nome: string; home: string; cor: string }[] = [
  { id: 'nerites', nome: 'Sistema Nerites', home: '/', cor: '#1f5b85' },
  { id: 'mr-terceiriza', nome: 'Empresas', home: '/mr-terceiriza', cor: '#6b4f8a' },
  { id: 'assessoria-mb', nome: 'Assessoria MB', home: '/assessoria-mb', cor: '#2f7a7a' },
  { id: 'painel-do-mandato', nome: 'Painel do Mandato', home: '/painel-do-mandato', cor: '#a86b1f' },
  { id: 'financeiro-pessoal', nome: 'Financeiro Pessoal', home: '/financeiro-pessoal', cor: '#3d7a4f' },
  { id: 'admin', nome: 'Administração', home: '/admin', cor: '#5d6876' },
]

export function adminSystem(id: AdminSystemId) {
  return ADMIN_SYSTEMS.find((item) => item.id === id) ?? ADMIN_SYSTEMS[5]
}

export function adminCategoriaLabel(categoria: AdminEventoCategoria) {
  return ({
    criacao: 'Criação', edicao: 'Edição', conclusao: 'Conclusão', exclusao: 'Exclusão',
    acesso: 'Acesso', atividade: 'Atividade',
  } as const)[categoria]
}

export function adminEventoSituacao(evento: AdminEvento) {
  const status = String(evento.metadata?.status || '').toLowerCase()
  if (status === 'paga') return 'Paga'
  if (status === 'cobrada') return 'Recebida'
  if (status === 'concluida') return 'Concluída'
  if (status === 'dispensada') return 'Dispensada'
  if (evento.categoria === 'conclusao') return 'Concluída'
  return adminCategoriaLabel(evento.categoria)
}

export function adminAcaoLabel(acao: string) {
  const cleaned = acao.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Atividade registrada'
}

export function categoriaDaAcao(acao: string): AdminEventoCategoria {
  const a = acao.toLowerCase()
  if (/(exclu|apag|remov)/.test(a)) return 'exclusao'
  if (/(conclu|baixa|paga|feito|status)/.test(a)) return 'conclusao'
  if (/(cri|novo|inclu|cadastr|import|lancar)/.test(a)) return 'criacao'
  if (/(edit|alter|atualiz|corrig|saldo)/.test(a)) return 'edicao'
  if (/(acesso|permiss|usuario|login)/.test(a)) return 'acesso'
  return 'atividade'
}

function centralToEvento(row: RawCentral): AdminEvento {
  return {
    id: row.id,
    sistema: row.sistema,
    categoria: row.categoria || categoriaDaAcao(row.acao),
    acao: row.acao,
    entidade: row.entidade,
    entidadeId: row.entidade_id,
    titulo: row.titulo || adminAcaoLabel(row.acao),
    resumo: row.resumo,
    actorId: row.actor_id,
    actorNome: row.actor_nome || 'Usuário',
    ocorridoEm: row.ocorrido_em,
    metadata: row.metadata || {},
    origemUrl: row.origem_url,
    sourceKey: row.source_key,
  }
}

async function enriquecerEventosDeTarefa(eventos: AdminEvento[]) {
  const taskEvents = eventos.filter((e) => e.sistema === 'financeiro-pessoal' && e.entidade === 'fp_tarefas')
  const doneEvents = eventos.filter((e) => e.sistema === 'financeiro-pessoal' && e.entidade === 'fp_tarefas_baixas')
  const taskIds = [...new Set(taskEvents.map((e) => e.entidadeId).filter((id): id is string => Boolean(id)))]
  const doneIds = [...new Set(doneEvents.map((e) => e.entidadeId).filter((id): id is string => Boolean(id)))]
  const [tasksRes, doneRes] = await Promise.all([
    taskIds.length ? supabase.from('fp_tarefas').select('id,titulo,valor_previsto').in('id', taskIds) : Promise.resolve({ data: [] }),
    doneIds.length ? supabase.from('fp_tarefas_baixas').select('id,tarefa_id,status,valor,periodo').in('id', doneIds) : Promise.resolve({ data: [] }),
  ])
  const doneRows = (doneRes.data || []) as { id: string; tarefa_id: string; status: string; valor: number | null; periodo: string }[]
  const relatedTaskIds = doneRows.map((r) => r.tarefa_id).filter(Boolean)
  const relatedRes = relatedTaskIds.length
    ? await supabase.from('fp_tarefas').select('id,titulo,valor_previsto').in('id', relatedTaskIds)
    : { data: [] }
  const taskMap = new Map([...(tasksRes.data || []), ...(relatedRes.data || [])].map((r) => [String(r.id), r]))
  const doneMap = new Map(doneRows.map((r) => [String(r.id), r]))

  return eventos.map((evento) => {
    if (evento.sistema !== 'financeiro-pessoal') return evento
    if (evento.entidade === 'fp_tarefas') {
      const task = taskMap.get(String(evento.entidadeId))
      if (!task) return evento
      return {
        ...evento,
        resumo: evento.resumo || String(task.titulo || ''),
        metadata: { valor_previsto: task.valor_previsto, ...evento.metadata },
      }
    }
    if (evento.entidade === 'fp_tarefas_baixas') {
      const done = doneMap.get(String(evento.entidadeId))
      if (!done) return evento
      const task = taskMap.get(String(done.tarefa_id))
      const status = String(done.status || '')
      const title = status === 'paga' ? 'Tarefa paga'
        : status === 'cobrada' ? 'Cobrança recebida'
          : status === 'dispensada' ? 'Tarefa dispensada' : 'Tarefa concluída'
      return {
        ...evento,
        categoria: 'conclusao' as const,
        titulo: title,
        resumo: [task?.titulo, done.periodo].filter(Boolean).join(' · ') || evento.resumo,
        metadata: {
          valor_previsto: task?.valor_previsto,
          valor: done.valor,
          status,
          periodo: done.periodo,
          ...evento.metadata,
        },
      }
    }
    return evento
  })
}

function isMissingTable(error: PostgrestError | null) {
  return Boolean(error && (/admin_eventos/i.test(error.message) || error.code === '42P01' || error.code === 'PGRST205'))
}

function applyLocalFilters(rows: AdminEvento[], filtros: AdminEventoFiltro) {
  const busca = filtros.busca?.trim().toLocaleLowerCase('pt-BR') || ''
  return rows.filter((e) => {
    if (filtros.sistema && e.sistema !== filtros.sistema) return false
    if (filtros.categoria && e.categoria !== filtros.categoria) return false
    if (filtros.usuario && e.actorId !== filtros.usuario) return false
    if (filtros.inicio && e.ocorridoEm < `${filtros.inicio}T00:00:00`) return false
    if (filtros.fim && e.ocorridoEm > `${filtros.fim}T23:59:59.999`) return false
    if (busca) {
      const haystack = [e.actorNome, e.titulo, e.resumo, e.entidade, e.acao, adminSystem(e.sistema).nome]
        .filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
      if (!haystack.includes(busca)) return false
    }
    return true
  })
}

async function fallbackEventos(): Promise<AdminEvento[]> {
  const [core, mr, mb, fp, profiles] = await Promise.all([
    supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('mr_auditoria').select('*').order('at', { ascending: false }).limit(500),
    supabase.from('mb_auditoria').select('*').order('at', { ascending: false }).limit(500),
    supabase.from('fp_auditoria').select('*').order('at', { ascending: false }).limit(500),
    supabase.from('profiles').select('id,nome'),
  ])
  const names = new Map((profiles.data || []).map((p) => [String(p.id), String(p.nome || 'Usuário')]))
  const out: AdminEvento[] = []
  for (const r of core.data || []) {
    const acao = String(r.acao || 'atividade')
    out.push({
      id: `nerites:${r.id}`, sistema: 'nerites', categoria: categoriaDaAcao(acao), acao,
      entidade: r.entidade || null, entidadeId: r.entidade_id || null, titulo: adminAcaoLabel(acao),
      resumo: [r.entidade, r.detalhes?.nome, r.detalhes?.descricao].filter(Boolean).join(' · ') || null,
      actorId: r.actor_id || null, actorNome: names.get(String(r.actor_id)) || 'Usuário',
      ocorridoEm: r.created_at, metadata: r.detalhes || {},
      origemUrl: r.entidade === 'cadastros' && r.entidade_id ? `/cadastros/${r.entidade_id}/editar` : '/',
      sourceKey: `nerites:${r.id}`,
    })
  }
  for (const [result, sistema, home] of [
    [mr, 'mr-terceiriza', '/mr-terceiriza'],
    [mb, 'assessoria-mb', '/assessoria-mb'],
  ] as const) {
    for (const r of result.data || []) {
      const acao = String(r.action || 'atividade')
      out.push({
        id: `${sistema}:${r.id}`, sistema, categoria: categoriaDaAcao(acao), acao,
        entidade: 'atividade', entidadeId: String(r.id), titulo: adminAcaoLabel(acao), resumo: r.detail || null,
        actorId: r.actor_id || null, actorNome: r.actor_nome || names.get(String(r.actor_id)) || 'Usuário',
        ocorridoEm: r.at || r.created_at, metadata: sistema === 'mr-terceiriza' && r.empresa ? { empresa: r.empresa } : {},
        origemUrl: home, sourceKey: `${sistema}:${r.id}`,
      })
    }
  }
  for (const r of fp.data || []) {
    const acao = String(r.acao || 'atividade')
    const detalhes = (r.detalhes || {}) as Record<string, unknown>
    out.push({
      id: `financeiro-pessoal:${r.id}`, sistema: 'financeiro-pessoal', categoria: categoriaDaAcao(acao), acao,
      entidade: r.entidade || null, entidadeId: r.entidade_id || null, titulo: adminAcaoLabel(acao),
      resumo: [detalhes.nome, detalhes.titulo, detalhes.descricao].filter(Boolean).join(' · ') || null,
      actorId: r.actor_id || null, actorNome: r.actor_nome || names.get(String(r.actor_id)) || 'Usuário',
      ocorridoEm: r.at, metadata: detalhes, origemUrl: '/financeiro-pessoal', sourceKey: `financeiro-pessoal:${r.id}`,
    })
  }
  return out.sort((a, b) => b.ocorridoEm.localeCompare(a.ocorridoEm))
}

export async function fetchAdminEventos(filtros: AdminEventoFiltro = {}): Promise<AdminEventosResultado> {
  const page = Math.max(0, filtros.page || 0)
  const pageSize = Math.max(1, Math.min(500, filtros.pageSize || 30))
  let query = supabase.from('admin_eventos').select('*', { count: 'exact' })
  if (filtros.sistema) query = query.eq('sistema', filtros.sistema)
  if (filtros.categoria) query = query.eq('categoria', filtros.categoria)
  if (filtros.usuario) query = query.eq('actor_id', filtros.usuario)
  if (filtros.inicio) query = query.gte('ocorrido_em', `${filtros.inicio}T00:00:00`)
  if (filtros.fim) query = query.lte('ocorrido_em', `${filtros.fim}T23:59:59.999`)
  if (filtros.busca?.trim()) {
    const safe = filtros.busca.trim().replace(/[%(),]/g, ' ').slice(0, 80)
    query = query.or(`titulo.ilike.%${safe}%,resumo.ilike.%${safe}%,actor_nome.ilike.%${safe}%,entidade.ilike.%${safe}%`)
  }
  const { data, error, count } = await query
    .order('ocorrido_em', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)

  if (!error) return { eventos: await enriquecerEventosDeTarefa((data as RawCentral[]).map(centralToEvento)), total: count || 0, centralizado: true }
  if (!isMissingTable(error)) throw new Error(error.message)

  const filtered = applyLocalFilters(await enriquecerEventosDeTarefa(await fallbackEventos()), filtros)
  return {
    eventos: filtered.slice(page * pageSize, page * pageSize + pageSize),
    total: filtered.length,
    centralizado: false,
  }
}

function startOfTodaySaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return new Date(`${parts}T00:00:00-03:00`).getTime()
}

export function resumoDosEventos(eventos: AdminEvento[]): AdminDashboardResumo {
  const now = Date.now()
  const last7 = now - 7 * 86400000
  const last24 = now - 86400000
  const recentes = eventos.filter((e) => new Date(e.ocorridoEm).getTime() >= last7)
  return {
    movimentacoesHoje: eventos.filter((e) => new Date(e.ocorridoEm).getTime() >= startOfTodaySaoPaulo()).length,
    usuariosAtivos: new Set(recentes.map((e) => e.actorId || e.actorNome)).size,
    sistemasAtivos: new Set(eventos.filter((e) => new Date(e.ocorridoEm).getTime() >= last24).map((e) => e.sistema)).size,
    totalPeriodo: recentes.length,
  }
}

export async function fetchAdminResumo(eventosFallback?: AdminEvento[]): Promise<AdminDashboardResumo> {
  const { data, error } = await supabase.rpc('admin_dashboard_resumo', { p_dias: 7 })
  if (!error && data) {
    const d = data as Record<string, number>
    return {
      movimentacoesHoje: Number(d.movimentacoesHoje || 0),
      usuariosAtivos: Number(d.usuariosAtivos || 0),
      sistemasAtivos: Number(d.sistemasAtivos || 0),
      totalPeriodo: Number(d.totalPeriodo || 0),
    }
  }
  return resumoDosEventos(eventosFallback || (await fallbackEventos()))
}

export function subscribeAdminEventos(onChange: () => void) {
  const channel = supabase.channel('admin-eventos-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_eventos' }, onChange)
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export function formatAdminDate(iso: string, withDate = true) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    ...(withDate ? { day: '2-digit', month: 'short', year: 'numeric' } : {}),
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export function adminMetadataEntries(metadata: Record<string, unknown>) {
  return Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined && value !== '')
}

const MONEY_KEYS = new Set([
  'valor', 'valor_total', 'valor_previsto', 'saldo', 'saldo_inicial', 'salario',
  'amount', 'balance', 'expected', 'initial',
])

/** Retorna somente um valor realmente presente no evento; nunca estima quantias. */
export function adminEventoValor(evento: AdminEvento): string | null {
  for (const [key, raw] of Object.entries(evento.metadata || {})) {
    if (!MONEY_KEYS.has(key.toLowerCase()) || raw === null || raw === undefined || raw === '') continue
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(raw)
    }
    const text = String(raw).trim()
    if (/^R\$\s*/i.test(text)) return text
    const plainNumber = /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN
    const normalized = Number.isFinite(plainNumber)
      ? plainNumber
      : Number(text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, ''))
    if (Number.isFinite(normalized)) {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(normalized)
    }
  }
  const existingCurrency = `${evento.resumo || ''} ${evento.titulo || ''}`.match(/R\$\s*[\d.]+(?:,\d{2})?/i)
  return existingCurrency?.[0] || null
}
