import { supabase } from './supabase'

const BUCKET = 'mb-comprovantes'

export type MbAnexoMeta = {
  id: string
  name: string
  type?: string
  size?: number
  path?: string
  signedUrl?: string
  createdAt?: string
}

export type MbRecebimento = {
  id: string
  data: string
  valor: number
  actor?: string
  at?: string
}

export type MbFinance = {
  id: string
  tipoLancamento?: 'receita' | 'entrada_por_fora' | 'saida'
  parceiro: string
  centro: string
  data: string
  dataRecebida?: string
  empresaDepositante?: string
  /** Conta bancária (controle interno; não entra na prestação). */
  contaBancaria?: string
  demanda?: string
  sub?: string
  previsto: number
  recebido: number
  saida: number
  anexos?: MbAnexoMeta[]
  origem?: string
  observacao?: string
  /** Baixas/recebimentos parciais até concluir o lançamento. */
  recebimentos?: MbRecebimento[]
  /** Contatos de cobrança (ex.: "diz que paga segunda"). */
  contatos?: MbContato[]
  /** Quem criou (nome) — editora só exclui o que ela mesma lançou. */
  criadoPor?: string
  /** Quem criou (id do profile). */
  criadoPorId?: string
  /** Horário de criação do lançamento (ISO). */
  criadoEm?: string
  /** Tarefa à qual este lançamento foi vinculado (quita o valor dela). */
  tarefaId?: string | null
}

export type MbContato = {
  id: string
  data: string
  nota: string
  previsao?: string
  actor?: string
  at?: string
}

function parseContatos(raw: unknown): MbContato[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => x as Record<string, unknown>)
    .filter((x) => x && typeof x.nota === 'string' && x.nota.trim())
    .map((x) => ({
      id: String(x.id || crypto.randomUUID()),
      data: String(x.data || '').slice(0, 10),
      nota: String(x.nota),
      previsao: x.previsao ? String(x.previsao).slice(0, 10) : '',
      actor: x.actor ? String(x.actor) : '',
      at: x.at ? String(x.at) : '',
    }))
}

type LegacyFinanceMeta = {
  __mb_rx__?: unknown
  __mb_tipo__?: unknown
  __mb_obs__?: unknown
}

function parseLegacyFinanceMeta(observacao?: unknown): LegacyFinanceMeta {
  if (typeof observacao !== 'string' || !observacao.trim().startsWith('{')) return {}
  try {
    const value = JSON.parse(observacao) as LegacyFinanceMeta
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function parseRecebimentos(raw: unknown, observacao?: unknown): MbRecebimento[] {
  const legacy = parseLegacyFinanceMeta(observacao)
  const source = Array.isArray(raw) && raw.length ? raw : legacy.__mb_rx__
  if (Array.isArray(source)) {
    return source
      .map((x) => x as Record<string, unknown>)
      .filter((x) => x && (x.data != null || x.valor != null))
      .map((x) => ({
        id: String(x.id || crypto.randomUUID()),
        data: String(x.data || '').slice(0, 10),
        valor: money(x.valor),
        actor: x.actor ? String(x.actor) : '',
        at: x.at ? String(x.at) : '',
      }))
  }
  return []
}

function normalizeFinanceType(
  value: unknown,
  previsto: unknown,
  recebido: unknown,
  saida: unknown,
): 'receita' | 'entrada_por_fora' | 'saida' {
  if (value === 'receita' || value === 'entrada_por_fora' || value === 'saida') return value
  return money(saida) > 0 && !money(previsto) && !money(recebido) ? 'saida' : 'receita'
}

function encodeLegacyFinanceMeta(row: MbFinance, recebimentos: MbRecebimento[]): string | null {
  if (!recebimentos.length && !row.observacao && !row.tipoLancamento) return null
  return JSON.stringify({
    __mb_rx__: recebimentos,
    __mb_tipo__: normalizeFinanceType(row.tipoLancamento, row.previsto, row.recebido, row.saida),
    __mb_obs__: row.observacao || '',
  })
}

export type MbTask = {
  id: string
  titulo: string
  nome?: string
  dataExecucao?: string
  valor?: number
  nomeExtrato?: string
  situacaoRegistro?: string
  observacao?: string
  responsavel?: string
  demanda?: string
  sub?: string
  origemPagamento?: string
  prazo?: string
  status?: string
  descricao?: string
  anexos?: MbAnexoMeta[]
  /** Marca o "modelo" que se repete todo mês (gera uma cópia automática no mês atual). */
  recorrente?: boolean
  /** Preenchido só nas cópias geradas a partir de um modelo recorrente. */
  recorrenteOrigemId?: string | null
  criadoPor?: string
  criadoPorId?: string
  /** Quem marcou como concluída (nome) e quando. */
  concluidoPor?: string
  concluidoEm?: string
}

export type MbEquipeSistema = {
  id: string
  nome: string
  nivel: 'admin' | 'editor'
}

export type MbAudit = {
  id: string
  at: string
  actor: string
  action: string
  detail?: string
}

export type MbHistoryRow = {
  id: string
  mes: string
  aba?: string
  linha?: number
  nome?: string
  descricao?: string
  data?: string
  valor?: number
  banco?: string
  extrato?: string
  situacao?: string
  observacao?: string
  anexos?: MbAnexoMeta[]
}

export type MbDbPayload = {
  finance: MbFinance[]
  tasks: MbTask[]
  audit: MbAudit[]
  banks: string[]
  templates: string[]
  staff: string[]
  centers: Record<string, unknown>
  companies?: string[]
  historyEdits: Record<string, Partial<MbHistoryRow>>
  prestacao: MbHistoryRow[]
  _files?: Record<string, { name: string; type: string; size: number; dataBase64: string }>
  /** Operações pontuais pendentes. Evita substituir a base inteira com uma aba desatualizada. */
  _mutations?: MbMutations
  /** Quem tem acesso ao painel (admin/diretoria do Nerites + acesso extra cadastrado em /admin). */
  equipeSistema?: MbEquipeSistema[]
}

export type MbMutations = {
  financeUpserts?: string[]
  financeDeletes?: string[]
  taskUpserts?: string[]
  taskDeletes?: string[]
  auditUpserts?: string[]
  historyUpserts?: string[]
  settings?: Array<'banks' | 'templates' | 'staff' | 'centers' | 'companies'>
}

function isUuid(v: string) {
  // Aceita qualquer UUID canônico de 36 chars. Imports/legado às vezes
  // gravam hex sem nibble de versão RFC (1–5); se rejeitarmos, o save
  // gera outro id e duplica o lançamento no banco.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function asError(err: unknown, fallback = 'Falha ao salvar na nuvem.'): Error {
  if (err instanceof Error && err.message) return err
  if (err && typeof err === 'object') {
    const o = err as { message?: string; error?: string; details?: string; hint?: string }
    const msg = [o.message || o.error, o.details, o.hint].filter(Boolean).join(' — ')
    if (msg) return new Error(msg)
  }
  if (typeof err === 'string' && err.trim()) return new Error(err)
  return new Error(fallback)
}

function makeIdCache() {
  const cache = new Map<string, string>()
  return (id: string | undefined | null): string => {
    const raw = String(id || '')
    if (isUuid(raw)) return raw
    const key = raw || `new-${cache.size}`
    let v = cache.get(key)
    if (!v) {
      v = crypto.randomUUID()
      cache.set(key, v)
    }
    return v
  }
}

function money(n: unknown) {
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0
}

function emptyDate(v: unknown): string | null {
  const s = String(v || '').trim()
  return s ? s.slice(0, 10) : null
}

async function signPaths(paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))]
  const map = new Map<string, string>()
  await Promise.all(
    unique.map(async (path) => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
      if (data?.signedUrl) map.set(path, data.signedUrl)
    }),
  )
  return map
}

async function listAnexos() {
  const { data, error } = await supabase
    .from('mb_anexos')
    .select('id,entidade,entidade_id,nome,mime,tamanho,storage_path,created_at')
  if (error) throw error
  return data || []
}

function anexosFor(
  rows: { id: string; entidade: string; entidade_id: string; nome: string; mime: string | null; tamanho: number | null; storage_path: string; created_at?: string }[],
  entidade: string,
  entidadeId: string,
  signed: Map<string, string>,
): MbAnexoMeta[] {
  return rows
    .filter((a) => a.entidade === entidade && a.entidade_id === entidadeId)
    .map((a) => ({
      id: a.id,
      name: a.nome,
      type: a.mime || undefined,
      size: a.tamanho || undefined,
      createdAt: a.created_at || undefined,
      path: a.storage_path,
      signedUrl: signed.get(a.storage_path),
    }))
}

function mesAtualISO(): string {
  return new Date().toISOString().slice(0, 7)
}

/** Lista quem tem acesso ao painel (RPC security definer — não expõe e-mail nem outros dados). */
async function listarEquipeSistema(): Promise<MbEquipeSistema[]> {
  const { data, error } = await supabase.rpc('list_assessoria_mb_equipe')
  if (error) {
    console.error('[assessoria-mb] list_assessoria_mb_equipe', error)
    return []
  }
  return ((data ?? []) as { id: string; nome: string; nivel: string | null }[])
    .filter((r) => r.nivel === 'admin' || r.nivel === 'editor')
    .map((r) => ({ id: r.id, nome: r.nome, nivel: r.nivel as 'admin' | 'editor' }))
}

/**
 * Tarefa recorrente (recorrente=true) é um "modelo": se ainda não existe uma
 * cópia dele com prazo no mês atual, gera uma (mesmo dia do mês, status
 * "Pendente", sem valor/execução — isso é por instância). Roda a cada
 * carregamento do painel; se falhar (rede/RLS), só não gera agora.
 */
async function gerarTarefasRecorrentes(tasks: MbTask[], userId: string): Promise<MbTask[]> {
  const modelos = tasks.filter((t) => t.recorrente)
  if (!modelos.length) return tasks

  const mesAtual = mesAtualISO()
  const geradas: MbTask[] = []

  for (const modelo of modelos) {
    const jaTem = tasks.some((t) => t.recorrenteOrigemId === modelo.id && (t.prazo || '').slice(0, 7) === mesAtual)
    if (jaTem) continue

    const hoje = new Date()
    const diaBase = modelo.prazo ? Number(modelo.prazo.slice(8, 10)) || hoje.getDate() : hoje.getDate()
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
    const dia = Math.min(Math.max(diaBase, 1), ultimoDia)
    const prazo = `${mesAtual}-${String(dia).padStart(2, '0')}`
    const novaId = crypto.randomUUID()

    const { error } = await supabase.from('mb_tarefas').insert({
      id: novaId,
      titulo: modelo.titulo || '',
      nome: modelo.nome || null,
      responsavel: modelo.responsavel || null,
      prazo,
      status: 'Pendente',
      descricao: modelo.descricao || null,
      valor: 0,
      origem_pagamento: modelo.origemPagamento || null,
      demanda: modelo.demanda || null,
      empresa: modelo.sub || null,
      recorrente: false,
      recorrente_origem_id: modelo.id,
      created_by: userId,
      updated_by: userId,
    })
    if (error) {
      console.error('[assessoria-mb] gerar tarefa recorrente', error)
      continue
    }

    geradas.push({
      id: novaId,
      titulo: modelo.titulo || '',
      nome: modelo.nome || '',
      responsavel: modelo.responsavel || '',
      prazo,
      status: 'Pendente',
      descricao: modelo.descricao || '',
      valor: 0,
      origemPagamento: modelo.origemPagamento || '',
      demanda: modelo.demanda || '',
      sub: modelo.sub || '',
      recorrente: false,
      recorrenteOrigemId: modelo.id,
      anexos: [],
      criadoPorId: userId,
    })
  }

  return geradas.length ? [...tasks, ...geradas] : tasks
}

/** Mesmo texto usado no painel (app.js → DUP_IGNORE_ACTION). */
const MB_DUP_IGNORE_ACTION = 'Lançamentos marcados como não duplicados'

export async function carregarEstadoAssessoria(): Promise<MbDbPayload> {
  // auth.getUser() só é usado mais abaixo (gerarTarefasRecorrentes) — não
  // precisa esperar ele pra disparar as outras consultas, que não dependem
  // disso (a visibilidade já é garantida pelo RLS).
  const [
    { data: { user } },
    empresas,
    bancos,
    centros,
    templates,
    equipe,
    lancamentos,
    tarefas,
    auditoria,
    auditoriaDuplicados,
    anexos,
    equipeSistema,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('mb_empresas').select('codigo,nome,ordem').eq('ativo', true).order('ordem'),
    supabase.from('mb_bancos').select('nome,ordem').eq('ativo', true).order('ordem'),
    supabase.from('mb_centros_custo').select('codigo,nome,ordem').eq('ativo', true).order('ordem'),
    supabase.from('mb_templates_tarefa').select('titulo,ordem').eq('ativo', true).order('ordem'),
    supabase.from('mb_equipe').select('nome').eq('ativo', true).order('nome'),
    supabase.from('mb_lancamentos').select('*').order('data', { ascending: false }),
    supabase.from('mb_tarefas').select('*').order('created_at', { ascending: false }),
    supabase.from('mb_auditoria').select('*').order('at', { ascending: false }).limit(500),
    // Marcações "não é duplicado" (menu temporário) não podem cair fora do limite acima.
    supabase.from('mb_auditoria').select('*').eq('action', MB_DUP_IGNORE_ACTION).limit(2000),
    listAnexos(),
    listarEquipeSistema(),
  ])

  for (const r of [empresas, bancos, centros, templates, equipe, lancamentos, tarefas, auditoria]) {
    if (r.error) throw r.error
  }

  const signed = await signPaths((anexos || []).map((a) => a.storage_path))
  const anexoRows = (anexos || []).map((a) => ({
    ...a,
    entidade_id: String(a.entidade_id),
  }))

  const creatorIds = [
    ...new Set(
      [...(lancamentos.data || []), ...(tarefas.data || [])]
        .map((r) => r.created_by as string | null | undefined)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const nomePorId = new Map<string, string>()
  for (const p of equipeSistema) nomePorId.set(p.id, p.nome)
  if (creatorIds.length) {
    const { data: creators } = await supabase.from('profiles').select('id,nome').in('id', creatorIds)
    for (const p of creators || []) {
      if (p.id && p.nome) nomePorId.set(p.id as string, p.nome as string)
    }
  }

  const finance: MbFinance[] = (lancamentos.data || []).map((r) => {
    const criadoPorId = (r.created_by as string) || ''
    const legacyMeta = parseLegacyFinanceMeta(r.observacao)
    const recebimentos = parseRecebimentos(r.recebimentos, r.observacao)
    const recebidoCalc = recebimentos.length
      ? recebimentos.reduce((s, x) => s + money(x.valor), 0)
      : money(r.recebido)
    const tipoLancamento = normalizeFinanceType(
      r.tipo_lancamento || legacyMeta.__mb_tipo__,
      r.previsto,
      recebidoCalc,
      r.saida,
    )
    const observacao =
      typeof legacyMeta.__mb_obs__ === 'string'
        ? legacyMeta.__mb_obs__
        : legacyMeta.__mb_rx__
          ? ''
          : (r.observacao as string) || ''
    return {
      id: r.id as string,
      tipoLancamento,
      parceiro: (r.parceiro as string) || '',
      centro: (r.centro as string) || '',
      data: String(r.data || '').slice(0, 10),
      dataRecebida: r.data_recebida ? String(r.data_recebida).slice(0, 10) : '',
      empresaDepositante: (r.empresa_depositante as string) || '',
      contaBancaria: (r.conta_bancaria as string) || '',
      demanda: (r.demanda as string) || '',
      sub: (r.empresa as string) || '',
      previsto: money(r.previsto),
      recebido: recebidoCalc,
      saida: money(r.saida),
      origem: (r.origem as string) || 'Cadastro manual',
      observacao,
      recebimentos,
      contatos: parseContatos(r.contatos),
      anexos: anexosFor(anexoRows, 'lancamento', r.id as string, signed),
      criadoPorId,
      criadoPor: criadoPorId ? nomePorId.get(criadoPorId) || '' : '',
      criadoEm: r.created_at ? String(r.created_at) : '',
      tarefaId: (r.tarefa_id as string) || null,
    }
  })

  let tasks: MbTask[] = (tarefas.data || []).map((r) => {
    const criadoPorId = (r.created_by as string) || ''
    return {
      id: r.id as string,
      titulo: (r.titulo as string) || '',
      nome: (r.nome as string) || '',
      dataExecucao: r.data_execucao ? String(r.data_execucao).slice(0, 10) : '',
      valor: money(r.valor),
      nomeExtrato: (r.nome_extrato as string) || '',
      situacaoRegistro: (r.situacao_registro as string) || '',
      observacao: (r.observacao as string) || '',
      responsavel: (r.responsavel as string) || '',
      demanda: (r.demanda as string) || '',
      sub: (r.empresa as string) || '',
      origemPagamento: (r.origem_pagamento as string) || '',
      prazo: r.prazo ? String(r.prazo).slice(0, 10) : '',
      status: (r.status as string) || 'Pendente',
      descricao: (r.descricao as string) || '',
      anexos: anexosFor(anexoRows, 'tarefa', r.id as string, signed),
      recorrente: Boolean(r.recorrente),
      recorrenteOrigemId: (r.recorrente_origem_id as string) || null,
      concluidoPor: (r.concluido_por as string) || '',
      concluidoEm: r.concluido_em ? String(r.concluido_em) : '',
      criadoPorId,
      criadoPor: criadoPorId ? nomePorId.get(criadoPorId) || '' : '',
    }
  })

  if (user?.id) {
    tasks = await gerarTarefasRecorrentes(tasks, user.id)
  }

  const nomesEquipeSistema = equipeSistema.map((p) => p.nome).filter(Boolean)
  const staffCatalogo = (equipe.data || []).map((e) => e.nome as string)
  const staff = [...new Set([...nomesEquipeSistema, ...staffCatalogo])]

  const auditRows = [...(auditoria.data || [])]
  const auditIds = new Set(auditRows.map((r) => r.id))
  for (const r of auditoriaDuplicados.error ? [] : auditoriaDuplicados.data || []) {
    if (!auditIds.has(r.id)) auditRows.push(r)
  }
  const audit: MbAudit[] = auditRows.map((r) => ({
    id: r.id as string,
    at: r.at as string,
    actor: (r.actor_nome as string) || '',
    action: (r.action as string) || '',
    detail: (r.detail as string) || '',
  }))

  // Prestação de contas: planilha antiga removida da UI. Não reidrata registros legados.
  const historyEdits: Record<string, Partial<MbHistoryRow>> = {}

  return {
    finance,
    tasks,
    audit,
    banks: (bancos.data || []).map((b) => b.nome as string),
    templates: (templates.data || []).map((t) => t.titulo as string),
    staff,
    centers: Object.fromEntries((centros.data || []).map((c) => [c.codigo as string, (c.nome as string) || ''])),
    companies: (empresas.data || []).map((e) => (e.codigo as string) || (e.nome as string)).filter(Boolean),
    historyEdits,
    prestacao: [],
    equipeSistema,
  }
}

async function uploadBytes(userId: string, fileId: string, meta: { name: string; type: string; dataBase64: string }) {
  try {
    const raw = meta.dataBase64.includes(',') ? meta.dataBase64.split(',')[1] : meta.dataBase64
    const bin = atob(raw)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const mime = meta.type || 'application/octet-stream'
    const blob = new Blob([bytes], { type: mime })
    const safe = meta.name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'arquivo'
    const path = `${userId}/${fileId}-${safe}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      upsert: true,
      contentType: mime,
    })
    if (error) throw asError(error, 'Falha no upload do comprovante.')
    return path
  } catch (e) {
    throw asError(e, 'Falha no upload do comprovante.')
  }
}

async function replaceAuxList(
  table: 'mb_bancos' | 'mb_templates_tarefa' | 'mb_equipe',
  column: 'nome' | 'titulo',
  values: string[],
) {
  const clean = [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))]
  const { data: existing, error } = await supabase.from(table).select(`id,${column}`)
  if (error) throw error
  const byName = new Map((existing || []).map((r) => [String((r as Record<string, unknown>)[column]), r.id as string]))
  const keep = new Set(clean)
  const toDelete = (existing || []).filter((r) => !keep.has(String((r as Record<string, unknown>)[column]))).map((r) => r.id as string)
  if (toDelete.length) {
    const { error: delErr } = await supabase.from(table).delete().in('id', toDelete)
    if (delErr) throw delErr
  }
  const missing = clean.filter((name) => !byName.has(name))
  if (!missing.length) return
  if (table === 'mb_templates_tarefa') {
    const { error: insErr } = await supabase
      .from(table)
      .insert(missing.map((titulo, i) => ({ titulo, ordem: i + 1 })))
    if (insErr) throw insErr
    return
  }
  if (table === 'mb_equipe') {
    const { error: insErr } = await supabase.from(table).insert(missing.map((nome) => ({ nome })))
    if (insErr) throw insErr
    return
  }
  const { error: insErr } = await supabase
    .from(table)
    .insert(missing.map((nome, i) => ({ nome, ordem: i + 1 })))
  if (insErr) throw insErr
}

async function syncCentros(centers: Record<string, unknown>) {
  const entries = Object.entries(centers || {})
    .map(([codigo, nome]) => ({
      codigo: String(codigo || '')
        .trim()
        .toUpperCase(),
      nome: String(nome || '').trim(),
    }))
    .filter((r) => r.codigo)
  const { data: existing, error } = await supabase.from('mb_centros_custo').select('id,codigo,nome,ordem,ativo')
  if (error) throw error
  const byCode = new Map((existing || []).map((r) => [String(r.codigo), r]))
  const keep = new Set(entries.map((e) => e.codigo))
  const toDelete = (existing || []).filter((r) => !keep.has(String(r.codigo))).map((r) => r.id as string)
  if (toDelete.length) {
    const { error: delErr } = await supabase.from('mb_centros_custo').delete().in('id', toDelete)
    if (delErr) throw delErr
  }
  // Só escreve quem realmente mudou (nome/ordem/ativo) — reescrever tudo a
  // cada salvamento, mesmo sem mudança, é o que deixava excluir um
  // lançamento lento (N PATCHes em série por causa disso).
  const toUpsert: Record<string, unknown>[] = []
  const toInsert: Record<string, unknown>[] = []
  entries.forEach((row, i) => {
    const nome = row.nome || row.codigo
    const ordem = i + 1
    const current = byCode.get(row.codigo)
    if (current) {
      if (current.nome !== nome || current.ordem !== ordem || current.ativo !== true) {
        toUpsert.push({ id: current.id, codigo: row.codigo, nome, ordem, ativo: true })
      }
    } else {
      toInsert.push({ codigo: row.codigo, nome, ordem, ativo: true })
    }
  })
  if (toUpsert.length) {
    const { error: upErr } = await supabase.from('mb_centros_custo').upsert(toUpsert, { onConflict: 'id' })
    if (upErr) throw upErr
  }
  if (toInsert.length) {
    const { error: insErr } = await supabase.from('mb_centros_custo').insert(toInsert)
    if (insErr) throw insErr
  }
}

async function syncEmpresas(companies: string[]) {
  const clean = [...new Set((companies || []).map((c) => String(c || '').trim()).filter(Boolean))]
  const { data: existing, error } = await supabase.from('mb_empresas').select('id,codigo,nome,ordem,ativo')
  if (error) throw error
  const byCode = new Map((existing || []).map((r) => [String(r.codigo), r]))
  const keep = new Set(clean)
  const toDelete = (existing || []).filter((r) => !keep.has(String(r.codigo))).map((r) => r.id as string)
  if (toDelete.length) {
    const { error: delErr } = await supabase.from('mb_empresas').delete().in('id', toDelete)
    if (delErr) throw delErr
  }
  // Mesma ideia do syncCentros: só escreve quem mudou, num lote só.
  const toUpsert: Record<string, unknown>[] = []
  const toInsert: Record<string, unknown>[] = []
  clean.forEach((codigo, i) => {
    const ordem = i + 1
    const current = byCode.get(codigo)
    if (current) {
      if (current.nome !== codigo || current.ordem !== ordem || current.ativo !== true) {
        toUpsert.push({ id: current.id, codigo, nome: codigo, ordem, ativo: true })
      }
    } else {
      toInsert.push({ codigo, nome: codigo, ordem, ativo: true })
    }
  })
  if (toUpsert.length) {
    const { error: upErr } = await supabase.from('mb_empresas').upsert(toUpsert, { onConflict: 'id' })
    if (upErr) throw upErr
  }
  if (toInsert.length) {
    const { error: insErr } = await supabase.from('mb_empresas').insert(toInsert)
    if (insErr) throw insErr
  }
}

export async function salvarEstadoAssessoria(
  payload: MbDbPayload,
  opts: { userId: string; userName: string },
): Promise<void> {
  const filesIn = payload._files || {}
  const files: Record<string, { name: string; type: string; size: number; dataBase64: string }> = { ...filesIn }
  const ensureUuid = makeIdCache()
  const mutations = payload._mutations
  if (!mutations) {
    throw new Error('Versão antiga da tela detectada. Atualize a página antes de salvar novamente.')
  }

  const remapIds = (ids: string[] | undefined) => [...new Set((ids || []).map((id) => ensureUuid(id)))]
  // Exclusão NUNCA pode trocar o id por um UUID novo: isso apaga 0 linhas,
  // o sync “passa”, a fila local limpa e no refresh o lançamento volta
  // (parecia cache). Só aceita id já canônico.
  const requireDeleteUuid = (id: string, label: string) => {
    const raw = String(id || '').trim()
    if (isUuid(raw)) return raw
    throw new Error(
      `${label}: id inválido (${raw || 'vazio'}). Atualize a página (Ctrl+F5) e exclua de novo.`,
    )
  }
  const deleteIds = (ids: string[] | undefined, label: string) =>
    [...new Set((ids || []).map((id) => requireDeleteUuid(id, label)))]
  const financeUpsertIds = remapIds(mutations.financeUpserts)
  const financeDeleteIds = deleteIds(mutations.financeDeletes, 'Exclusão de lançamento')
  const taskUpsertIds = remapIds(mutations.taskUpserts)
  const taskDeleteIds = deleteIds(mutations.taskDeletes, 'Exclusão de tarefa')
  const auditUpsertIds = remapIds(mutations.auditUpserts)
  const historyUpsertIds = new Set(mutations.historyUpserts || [])
  const settings = new Set(mutations.settings || [])

  function remapAnexos(list: MbAnexoMeta[] | undefined) {
    return (list || []).map((a) => {
      const newId = ensureUuid(a.id)
      if (filesIn[a.id] && a.id !== newId) files[newId] = filesIn[a.id]
      return { ...a, id: newId }
    })
  }

  // Garante UUIDs estáveis nos registros do painel (mesmo em sync vindo do localStorage)
  const finance = payload.finance.map((r) => ({
    ...r,
    id: ensureUuid(r.id),
    anexos: remapAnexos(r.anexos),
  }))
  const tasks = payload.tasks.map((r) => ({
    ...r,
    id: ensureUuid(r.id),
    anexos: remapAnexos(r.anexos),
  }))
  const audit = payload.audit.slice(0, 500).map((r) => ({ ...r, id: ensureUuid(String(r.id)) }))

  try {
  // ---- lançamentos ----
  async function syncLancamentos() {
    const financeById = new Map(finance.map((row) => [row.id, row]))
    const rowsToUpsert = financeUpsertIds.flatMap((id) => {
      const row = financeById.get(id)
      return row ? [row] : []
    })
    const { data: remoteFin, error: finListErr } = rowsToUpsert.length
      ? await supabase.from('mb_lancamentos').select('id,created_by').in('id', rowsToUpsert.map((row) => row.id))
      : { data: [], error: null }
    if (finListErr) throw asError(finListErr)
    const finCreatedBy = new Map<string, string>()
    for (const r of remoteFin || []) {
      if (r.id && r.created_by) finCreatedBy.set(r.id as string, r.created_by as string)
    }
    const delFin = financeDeleteIds
    const { data: existingFinDeletes, error: finDeleteListErr } = delFin.length
      ? await supabase.from('mb_lancamentos').select('id').in('id', delFin)
      : { data: [], error: null }
    if (finDeleteListErr) throw asError(finDeleteListErr)
    // Exclusão, upsert dos mantidos e sync de anexos mexem em ids disjuntos
    // (entidade_id sem FK — ver 20261116_assessoria_mb.sql) e podem correr
    // juntos, em vez de um esperar o outro à toa.
    await Promise.all([
      delFin.length
        ? (async () => {
            // PostgREST DELETE sem .select() devolve 204 mesmo com 0 linhas (RLS).
            // Sem checar, o sync "passa" e no refresh o lançamento volta.
            const { error: anexErr } = await supabase
              .from('mb_anexos')
              .delete()
              .eq('entidade', 'lancamento')
              .in('entidade_id', delFin)
            if (anexErr) throw asError(anexErr)
            const { data: deletedFin, error } = await supabase
              .from('mb_lancamentos')
              .delete()
              .in('id', delFin)
              .select('id')
            if (error) throw asError(error)
            if ((deletedFin?.length || 0) < (existingFinDeletes?.length || 0)) {
              throw asError(
                new Error(
                  'O banco recusou a exclusão do lançamento. Confirme o acesso ao financeiro e que a migration 20261120_assessoria_mb_finance_delete_all.sql foi aplicada.',
                ),
              )
            }
          })()
        : Promise.resolve(),
      rowsToUpsert.length
        ? (async () => {
            const rows = rowsToUpsert.map((r) => {
              const recebimentos = Array.isArray(r.recebimentos) ? r.recebimentos : []
              const recebido = recebimentos.length
                ? recebimentos.reduce((s, x) => s + money(x.valor), 0)
                : money(r.recebido)
              return {
                id: r.id,
                parceiro: r.parceiro || '',
                centro: r.centro || null,
                data: emptyDate(r.data) || new Date().toISOString().slice(0, 10),
                data_recebida: emptyDate(r.dataRecebida),
                empresa_depositante: r.empresaDepositante || null,
                conta_bancaria: r.contaBancaria || null,
                demanda: r.demanda || null,
                empresa: r.sub || null,
                previsto: money(r.previsto),
                recebido,
                saida: money(r.saida),
                tipo_lancamento: normalizeFinanceType(r.tipoLancamento, r.previsto, recebido, r.saida),
                recebimentos,
                contatos: parseContatos(r.contatos),
                origem: r.origem || 'Cadastro manual',
                observacao: r.observacao || null,
                tarefa_id: r.tarefaId || null,
                updated_at: new Date().toISOString(),
                updated_by: opts.userId,
                // Preserva o autor original; só grava o usuário atual em registro novo.
                created_by: finCreatedBy.get(r.id) || (isUuid(String(r.criadoPorId || '')) ? r.criadoPorId : opts.userId),
              }
            })
            let { error } = await supabase.from('mb_lancamentos').upsert(rows, { onConflict: 'id' })
            if (error && /contatos/i.test(String(error.message || error))) {
              // Migration 20261124_assessoria_mb_contatos.sql ainda não aplicada:
              // grava o resto sem perder o lançamento.
              console.warn('mb_lancamentos.contatos ausente — aplique 20261124_assessoria_mb_contatos.sql')
              for (const row of rows) delete (row as { contatos?: unknown }).contatos
              ;({ error } = await supabase.from('mb_lancamentos').upsert(rows, { onConflict: 'id' }))
            }
            if (error && /tipo_lancamento|recebimentos|conta_bancaria|schema cache|column/i.test(String(error.message || error))) {
              const originalById = new Map(rowsToUpsert.map((r) => [r.id, r]))
              const legacyRows = rows.map((row) => {
                const {
                  tipo_lancamento: _tipo,
                  recebimentos: rx,
                  conta_bancaria: _conta,
                  ...legacy
                } = row
                const original = originalById.get(row.id)
                return {
                  ...legacy,
                  observacao: original ? encodeLegacyFinanceMeta(original, rx) : null,
                }
              })
              ;({ error } = await supabase.from('mb_lancamentos').upsert(legacyRows, { onConflict: 'id' }))
            }
            if (error) throw asError(error, 'Falha ao gravar lançamentos.')
          })()
        : Promise.resolve(),
      syncAnexosLote('lancamento', rowsToUpsert),
    ])
  }

  // ---- tarefas ----
  async function syncTarefas() {
    const tasksById = new Map(tasks.map((row) => [row.id, row]))
    const rowsToUpsert = taskUpsertIds.flatMap((id) => {
      const row = tasksById.get(id)
      return row ? [row] : []
    })
    const { data: remoteTasks, error: taskListErr } = rowsToUpsert.length
      ? await supabase.from('mb_tarefas').select('*').in('id', rowsToUpsert.map((row) => row.id))
      : { data: [], error: null }
    if (taskListErr) throw asError(taskListErr)
    const taskCreatedBy = new Map<string, string>()
    for (const r of remoteTasks || []) {
      if (r.id && r.created_by) taskCreatedBy.set(r.id as string, r.created_by as string)
    }
    const existingTaskIds = new Set((remoteTasks || []).map((r) => String(r.id)))
    const remoteTaskById = new Map((remoteTasks || []).map((r) => [String(r.id), r]))
    const delTasks = taskDeleteIds
    const { data: existingTaskDeletes, error: taskDeleteListErr } = delTasks.length
      ? await supabase.from('mb_tarefas').select('id').in('id', delTasks)
      : { data: [], error: null }
    if (taskDeleteListErr) throw asError(taskDeleteListErr)
    await Promise.all([
      delTasks.length
        ? (async () => {
            const { error: anexErr } = await supabase
              .from('mb_anexos')
              .delete()
              .eq('entidade', 'tarefa')
              .in('entidade_id', delTasks)
            if (anexErr) throw asError(anexErr)
            const { data: deletedTasks, error } = await supabase
              .from('mb_tarefas')
              .delete()
              .in('id', delTasks)
              .select('id')
            if (error) throw asError(error)
            if ((deletedTasks?.length || 0) < (existingTaskDeletes?.length || 0)) {
              throw asError(
                new Error(
                  'O banco recusou a exclusão. Confirme que você é o autor ou admin e que a migration 20261118_assessoria_mb_owner_delete.sql foi aplicada.',
                ),
              )
            }
          })()
        : Promise.resolve(),
      rowsToUpsert.length
        ? (async () => {
            const rows = rowsToUpsert.map((r) => ({
              id: r.id,
              titulo: r.titulo || '',
              nome: r.nome || null,
              responsavel: r.responsavel || null,
              prazo: emptyDate(r.prazo),
              data_execucao: emptyDate(r.dataExecucao),
              status: ['Pendente', 'Em andamento', 'Concluída'].includes(String(r.status)) ? r.status : 'Pendente',
              descricao: r.descricao || null,
              valor: money(r.valor),
              origem_pagamento: r.origemPagamento || null,
              nome_extrato: r.nomeExtrato || null,
              situacao_registro: r.situacaoRegistro || null,
              observacao: r.observacao || null,
              demanda: r.demanda || null,
              empresa: r.sub || null,
              recorrente: Boolean(r.recorrente),
              recorrente_origem_id: r.recorrenteOrigemId || null,
              concluido_por: r.concluidoPor || null,
              concluido_em: r.concluidoEm || null,
              updated_at: new Date().toISOString(),
              updated_by: opts.userId,
              created_by: taskCreatedBy.get(r.id) || (isUuid(String(r.criadoPorId || '')) ? r.criadoPorId : opts.userId),
            }))
            const taskValue = (value: unknown) => value == null || value === '' ? '' : String(value)
            const taskChanged = (row: (typeof rows)[number]) => {
              const remote = remoteTaskById.get(row.id)
              if (!remote) return true
              const textColumns = [
                'titulo', 'nome', 'responsavel', 'prazo', 'data_execucao', 'status',
                'descricao', 'origem_pagamento', 'nome_extrato', 'situacao_registro',
                'observacao', 'demanda', 'empresa', 'recorrente_origem_id',
                'concluido_por', 'concluido_em',
              ] as const
              if (textColumns.some((column) => taskValue(row[column]) !== taskValue(remote[column]))) {
                return true
              }
              if (Number(row.valor || 0) !== Number(remote.valor || 0)) return true
              return Boolean(row.recorrente) !== Boolean(remote.recorrente)
            }
            const existingRows = rows.filter((row) => existingTaskIds.has(row.id) && taskChanged(row))
            const newRows = rows.filter((row) => !existingTaskIds.has(row.id))

            // Não use upsert nas tarefas existentes: INSERT ... ON CONFLICT
            // também passa pela policy de INSERT. Desde a migration de
            // conclusão, só admin pode criar tarefa, enquanto o responsável
            // (Editor) pode atualizar/concluir a própria. O upsert fazia o
            // simples anexo de um documento falhar com RLS em mb_tarefas.
            // Se apenas a lista de anexos mudou, nem envia UPDATE na tarefa:
            // grava somente Storage + mb_anexos, inclusive em lotes maiores.
            const results = await Promise.all([
              ...existingRows.map((row) =>
                supabase.from('mb_tarefas').update(row).eq('id', row.id),
              ),
              newRows.length
                ? supabase.from('mb_tarefas').insert(newRows)
                : Promise.resolve({ error: null }),
            ])
            const failed = results.find((result) => result.error)
            if (failed?.error) throw asError(failed.error, 'Falha ao gravar tarefas.')
          })()
        : Promise.resolve(),
      syncAnexosLote('tarefa', rowsToUpsert),
    ])
  }

  // ---- auditoria: somente os eventos novos desta operação ----
  async function syncAuditoria() {
    const wanted = new Set(auditUpsertIds)
    const rows = audit
      .filter((a) => wanted.has(a.id))
      .map((a) => ({
        id: a.id,
        at: a.at || new Date().toISOString(),
        actor_id: opts.userId,
        actor_nome: a.actor || opts.userName,
        action: a.action || '',
        detail: a.detail || null,
      }))
    if (rows.length) {
      const { error } = await supabase.from('mb_auditoria').upsert(rows, { onConflict: 'id' })
      if (error) throw asError(error, 'Falha ao gravar auditoria.')
    }
  }

  // ---- prestação: só edições do usuário (não reenvia a planilha embutida inteira) ----
  const prestacaoMap = new Map<string, MbHistoryRow>()
  for (const [codigo, edit] of Object.entries(payload.historyEdits || {})) {
    if (!historyUpsertIds.has(codigo)) continue
    prestacaoMap.set(codigo, {
      id: codigo,
      mes: String(edit.mes || edit.data || '').slice(0, 7) || new Date().toISOString().slice(0, 7),
      ...edit,
      anexos: remapAnexos(edit.anexos),
    })
  }

  async function syncPrestacao() {
    const { data: remotePrest, error: prestListErr } = await supabase
      .from('mb_prestacao_contas')
      .select('id,codigo_origem')
    if (prestListErr) throw asError(prestListErr)
    const codigoToUuid = new Map<string, string>()
    for (const r of remotePrest || []) {
      const codigo = (r.codigo_origem as string) || (r.id as string)
      codigoToUuid.set(codigo, r.id as string)
    }

    for (const row of prestacaoMap.values()) {
      const id = codigoToUuid.get(row.id) || (isUuid(row.id) ? row.id : crypto.randomUUID())
      codigoToUuid.set(row.id, id)
      const mes = row.mes || String(row.data || '').slice(0, 7) || new Date().toISOString().slice(0, 7)
      const { error } = await supabase.from('mb_prestacao_contas').upsert(
        {
          id,
          codigo_origem: row.id,
          mes,
          aba: row.aba || null,
          linha: row.linha ?? null,
          nome: row.nome || null,
          descricao: row.descricao || null,
          data: emptyDate(row.data),
          valor: money(row.valor),
          banco: row.banco || null,
          extrato: row.extrato || null,
          situacao: row.situacao || null,
          observacao: row.observacao || null,
          updated_at: new Date().toISOString(),
          updated_by: opts.userId,
        },
        { onConflict: 'id' },
      )
      if (error) throw asError(error, 'Falha ao gravar prestação de contas.')
    }

    const prestacaoItems = [...prestacaoMap.entries()]
      .map(([codigo, row]) => ({ id: codigoToUuid.get(codigo) || '', anexos: row.anexos }))
      .filter((r) => r.id && r.anexos?.length)
    await syncAnexosLote('prestacao', prestacaoItems)
  }

  // ---- anexos ----
  // Busca os anexos de TODAS as entidades de um tipo numa query só (em vez de
  // uma query por lançamento/tarefa) e só mexe em quem realmente mudou —
  // senão cada salvamento reescrevia o metadado de todo mundo, sempre, e
  // ficava mais lento quanto mais lançamentos existissem.
  async function syncAnexosLote(
    entidade: 'lancamento' | 'tarefa' | 'prestacao',
    items: { id: string; anexos?: MbAnexoMeta[] }[],
  ) {
    if (!items.length) return
    const { data: existing, error } = await supabase
      .from('mb_anexos')
      .select('id,entidade_id,storage_path')
      .eq('entidade', entidade)
      .in('entidade_id', items.map((i) => i.id))
    if (error) throw asError(error, 'Falha ao ler anexos.')
    const porEntidade = new Map<string, { id: string; storage_path: string }[]>()
    for (const row of existing || []) {
      const key = String(row.entidade_id)
      const lista = porEntidade.get(key)
      const linha = { id: row.id as string, storage_path: row.storage_path as string }
      if (lista) lista.push(linha)
      else porEntidade.set(key, [linha])
    }
    const toRemoveIds: string[] = []
    const toRemovePaths: string[] = []
    const toUpsert: Record<string, unknown>[] = []
    for (const item of items) {
      const wanted = item.anexos || []
      const current = porEntidade.get(item.id) || []
      const keepIds = new Set(wanted.map((a) => a.id))
      for (const c of current) {
        if (!keepIds.has(c.id)) {
          toRemoveIds.push(c.id)
          if (c.storage_path) toRemovePaths.push(c.storage_path)
        }
      }
      for (const a of wanted) {
        const anexoId = ensureUuid(a.id)
        const pending = files[a.id] || files[anexoId]
        const jaEsta = current.find((c) => c.id === anexoId)
        let path = a.path
        if (pending?.dataBase64) {
          path = await uploadBytes(opts.userId, anexoId, pending)
        } else if (jaEsta && jaEsta.storage_path === a.path) {
          continue // mesmo arquivo de antes, nada a regravar
        }
        if (!path) continue // sem arquivo no payload (refresh/IndexedDB vazio): segue sem derrubar o save
        toUpsert.push({
          id: anexoId,
          entidade,
          entidade_id: item.id,
          nome: a.name || pending?.name || 'arquivo',
          mime: a.type || pending?.type || null,
          tamanho: a.size || pending?.size || null,
          storage_path: path,
          created_by: opts.userId,
        })
      }
    }
    if (toRemoveIds.length) {
      if (toRemovePaths.length) void supabase.storage.from(BUCKET).remove(toRemovePaths)
      const { error: delErr } = await supabase.from('mb_anexos').delete().in('id', toRemoveIds)
      if (delErr) throw asError(delErr, 'Falha ao remover anexo.')
    }
    if (toUpsert.length) {
      const { error: upErr } = await supabase.from('mb_anexos').upsert(toUpsert, { onConflict: 'id' })
      if (upErr) throw asError(upErr, 'Falha ao gravar metadados do comprovante.')
    }
  }

  // Tabelas independentes — tudo em paralelo. Isso é o que fazia excluir 1
  // lançamento demorar vários segundos: cada uma dessas seções (bancos,
  // empresas, centros de custo, tarefas, auditoria, prestação de contas)
  // conferia e regravava sua lista inteira em série, mesmo quando a mudança
  // real era só 1 lançamento.
  await Promise.all([
    settings.has('banks') ? replaceAuxList('mb_bancos', 'nome', payload.banks || []) : Promise.resolve(),
    settings.has('templates') ? replaceAuxList('mb_templates_tarefa', 'titulo', payload.templates || []) : Promise.resolve(),
    settings.has('staff') ? replaceAuxList('mb_equipe', 'nome', payload.staff || []) : Promise.resolve(),
    settings.has('centers') && payload.centers ? syncCentros(payload.centers) : Promise.resolve(),
    settings.has('companies') && Array.isArray(payload.companies) ? syncEmpresas(payload.companies) : Promise.resolve(),
    syncLancamentos(),
    syncTarefas(),
    syncAuditoria(),
    syncPrestacao(),
  ])

  return
  } catch (e) {
    throw asError(e)
  }
}

export async function baixarAnexoAssessoria(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw error || new Error('Arquivo não encontrado')
  return data
}
