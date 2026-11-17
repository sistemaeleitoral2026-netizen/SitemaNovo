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
  parceiro: string
  centro: string
  data: string
  dataRecebida?: string
  empresaDepositante?: string
  demanda?: string
  sub?: string
  previsto: number
  recebido: number
  saida: number
  anexos?: MbAnexoMeta[]
  origem?: string
  /** Baixas/recebimentos parciais até concluir o lançamento. */
  recebimentos?: MbRecebimento[]
  /** Quem criou (nome) — editora só exclui o que ela mesma lançou. */
  criadoPor?: string
  /** Quem criou (id do profile). */
  criadoPorId?: string
}

function parseRecebimentos(raw: unknown, observacao?: unknown): MbRecebimento[] {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => x as Record<string, unknown>)
      .filter((x) => x && x.data != null)
      .map((x) => ({
        id: String(x.id || crypto.randomUUID()),
        data: String(x.data || '').slice(0, 10),
        valor: money(x.valor),
        actor: x.actor ? String(x.actor) : '',
        at: x.at ? String(x.at) : '',
      }))
  }
  if (typeof observacao === 'string' && observacao.trim().startsWith('{')) {
    try {
      const o = JSON.parse(observacao) as { __mb_rx__?: unknown }
      return parseRecebimentos(o.__mb_rx__)
    } catch {
      return []
    }
  }
  return []
}

function encodeRecebimentos(list: MbRecebimento[] | undefined): string | null {
  if (!list?.length) return null
  return JSON.stringify({ __mb_rx__: list })
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
  /** Quem tem acesso ao painel (admin/diretoria do Nerites + acesso extra cadastrado em /admin). */
  equipeSistema?: MbEquipeSistema[]
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
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
    const recebimentos = parseRecebimentos(r.recebimentos, r.observacao)
    const recebidoCalc = recebimentos.length
      ? recebimentos.reduce((s, x) => s + money(x.valor), 0)
      : money(r.recebido)
    return {
      id: r.id as string,
      parceiro: (r.parceiro as string) || '',
      centro: (r.centro as string) || '',
      data: String(r.data || '').slice(0, 10),
      dataRecebida: r.data_recebida ? String(r.data_recebida).slice(0, 10) : '',
      empresaDepositante: (r.empresa_depositante as string) || '',
      demanda: (r.demanda as string) || '',
      sub: (r.empresa as string) || '',
      previsto: money(r.previsto),
      recebido: recebidoCalc,
      saida: money(r.saida),
      origem: (r.origem as string) || 'Cadastro manual',
      recebimentos,
      anexos: anexosFor(anexoRows, 'lancamento', r.id as string, signed),
      criadoPorId,
      criadoPor: criadoPorId ? nomePorId.get(criadoPorId) || '' : '',
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

  const audit: MbAudit[] = (auditoria.data || []).map((r) => ({
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
): Promise<MbDbPayload> {
  const filesIn = payload._files || {}
  const files: Record<string, { name: string; type: string; size: number; dataBase64: string }> = { ...filesIn }
  const ensureUuid = makeIdCache()

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
    const { data: remoteFin, error: finListErr } = await supabase.from('mb_lancamentos').select('id,created_by')
    if (finListErr) throw asError(finListErr)
    const finCreatedBy = new Map<string, string>()
    for (const r of remoteFin || []) {
      if (r.id && r.created_by) finCreatedBy.set(r.id as string, r.created_by as string)
    }
    const localFin = new Set(finance.map((f) => f.id))
    const delFin = (remoteFin || []).map((r) => r.id as string).filter((id) => !localFin.has(id))
    // Exclusão, upsert dos mantidos e sync de anexos mexem em ids disjuntos
    // (entidade_id sem FK — ver 20261116_assessoria_mb.sql) e podem correr
    // juntos, em vez de um esperar o outro à toa.
    await Promise.all([
      delFin.length
        ? (async () => {
            await supabase.from('mb_anexos').delete().eq('entidade', 'lancamento').in('entidade_id', delFin)
            const { error } = await supabase.from('mb_lancamentos').delete().in('id', delFin)
            if (error) throw asError(error)
          })()
        : Promise.resolve(),
      finance.length
        ? (async () => {
            const rows = finance.map((r) => {
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
                demanda: r.demanda || null,
                empresa: r.sub || null,
                previsto: money(r.previsto),
                recebido,
                saida: money(r.saida),
                origem: r.origem || 'Cadastro manual',
                observacao: encodeRecebimentos(recebimentos),
                updated_at: new Date().toISOString(),
                updated_by: opts.userId,
                // Preserva o autor original; só grava o usuário atual em registro novo.
                created_by: finCreatedBy.get(r.id) || (isUuid(String(r.criadoPorId || '')) ? r.criadoPorId : opts.userId),
              }
            })
            const { error } = await supabase.from('mb_lancamentos').upsert(rows, { onConflict: 'id' })
            if (error) throw asError(error, 'Falha ao gravar lançamentos.')
          })()
        : Promise.resolve(),
      syncAnexosLote('lancamento', finance),
    ])
  }

  // ---- tarefas ----
  async function syncTarefas() {
    const { data: remoteTasks, error: taskListErr } = await supabase.from('mb_tarefas').select('id,created_by')
    if (taskListErr) throw asError(taskListErr)
    const taskCreatedBy = new Map<string, string>()
    for (const r of remoteTasks || []) {
      if (r.id && r.created_by) taskCreatedBy.set(r.id as string, r.created_by as string)
    }
    const localTasks = new Set(tasks.map((t) => t.id))
    const delTasks = (remoteTasks || []).map((r) => r.id as string).filter((id) => !localTasks.has(id))
    await Promise.all([
      delTasks.length
        ? (async () => {
            await supabase.from('mb_anexos').delete().eq('entidade', 'tarefa').in('entidade_id', delTasks)
            const { error } = await supabase.from('mb_tarefas').delete().in('id', delTasks)
            if (error) throw asError(error)
          })()
        : Promise.resolve(),
      tasks.length
        ? (async () => {
            const rows = tasks.map((r) => ({
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
              updated_at: new Date().toISOString(),
              updated_by: opts.userId,
              created_by: taskCreatedBy.get(r.id) || (isUuid(String(r.criadoPorId || '')) ? r.criadoPorId : opts.userId),
            }))
            const { error } = await supabase.from('mb_tarefas').upsert(rows, { onConflict: 'id' })
            if (error) throw asError(error, 'Falha ao gravar tarefas.')
          })()
        : Promise.resolve(),
      syncAnexosLote('tarefa', tasks),
    ])
  }

  // ---- auditoria (substitui pelas 500 mais recentes do painel) ----
  async function syncAuditoria() {
    const { data: remoteAudit, error: auditListErr } = await supabase.from('mb_auditoria').select('id')
    if (auditListErr) throw asError(auditListErr)
    const localAudit = new Set(audit.map((a) => a.id))
    const delAudit = (remoteAudit || []).map((r) => r.id as string).filter((id) => !localAudit.has(id))
    if (delAudit.length) {
      const { error } = await supabase.from('mb_auditoria').delete().in('id', delAudit)
      if (error) throw asError(error)
    }
    if (audit.length) {
      const rows = audit.map((a) => ({
        id: a.id,
        at: a.at || new Date().toISOString(),
        actor_id: opts.userId,
        actor_nome: a.actor || opts.userName,
        action: a.action || '',
        detail: a.detail || null,
      }))
      const { error } = await supabase.from('mb_auditoria').upsert(rows, { onConflict: 'id' })
      if (error) throw asError(error, 'Falha ao gravar auditoria.')
    }
  }

  // ---- prestação: só edições do usuário (não reenvia a planilha embutida inteira) ----
  const prestacaoMap = new Map<string, MbHistoryRow>()
  for (const [codigo, edit] of Object.entries(payload.historyEdits || {})) {
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
    replaceAuxList('mb_bancos', 'nome', payload.banks || []),
    replaceAuxList('mb_templates_tarefa', 'titulo', payload.templates || []),
    replaceAuxList('mb_equipe', 'nome', payload.staff || []),
    payload.centers && Object.keys(payload.centers).length ? syncCentros(payload.centers) : Promise.resolve(),
    Array.isArray(payload.companies) && payload.companies.length ? syncEmpresas(payload.companies) : Promise.resolve(),
    syncLancamentos(),
    syncTarefas(),
    syncAuditoria(),
    syncPrestacao(),
  ])

  return carregarEstadoAssessoria()
  } catch (e) {
    throw asError(e)
  }
}

export async function baixarAnexoAssessoria(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw error || new Error('Arquivo não encontrado')
  return data
}
