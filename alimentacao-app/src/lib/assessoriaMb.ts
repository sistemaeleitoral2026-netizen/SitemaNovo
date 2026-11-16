import { supabase } from './supabase'

const BUCKET = 'mb-comprovantes'

export type MbAnexoMeta = {
  id: string
  name: string
  type?: string
  size?: number
  path?: string
  signedUrl?: string
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
  historyEdits: Record<string, Partial<MbHistoryRow>>
  prestacao: MbHistoryRow[]
  _files?: Record<string, { name: string; type: string; size: number; dataBase64: string }>
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
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
    .select('id,entidade,entidade_id,nome,mime,tamanho,storage_path')
  if (error) throw error
  return data || []
}

function anexosFor(
  rows: { id: string; entidade: string; entidade_id: string; nome: string; mime: string | null; tamanho: number | null; storage_path: string }[],
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
      path: a.storage_path,
      signedUrl: signed.get(a.storage_path),
    }))
}

export async function carregarEstadoAssessoria(): Promise<MbDbPayload> {
  const [
    empresas,
    bancos,
    centros,
    templates,
    equipe,
    lancamentos,
    tarefas,
    auditoria,
    prestacao,
    anexos,
  ] = await Promise.all([
    supabase.from('mb_empresas').select('codigo,nome,ordem').eq('ativo', true).order('ordem'),
    supabase.from('mb_bancos').select('nome,ordem').eq('ativo', true).order('ordem'),
    supabase.from('mb_centros_custo').select('codigo,nome,ordem').eq('ativo', true).order('ordem'),
    supabase.from('mb_templates_tarefa').select('titulo,ordem').eq('ativo', true).order('ordem'),
    supabase.from('mb_equipe').select('nome').eq('ativo', true).order('nome'),
    supabase.from('mb_lancamentos').select('*').order('data', { ascending: false }),
    supabase.from('mb_tarefas').select('*').order('created_at', { ascending: false }),
    supabase.from('mb_auditoria').select('*').order('at', { ascending: false }).limit(500),
    supabase.from('mb_prestacao_contas').select('*').order('data', { ascending: false }),
    listAnexos(),
  ])

  for (const r of [empresas, bancos, centros, templates, equipe, lancamentos, tarefas, auditoria, prestacao]) {
    if (r.error) throw r.error
  }

  const signed = await signPaths((anexos || []).map((a) => a.storage_path))
  const anexoRows = (anexos || []).map((a) => ({
    ...a,
    entidade_id: String(a.entidade_id),
  }))

  const finance: MbFinance[] = (lancamentos.data || []).map((r) => ({
    id: r.id as string,
    parceiro: (r.parceiro as string) || '',
    centro: (r.centro as string) || '',
    data: String(r.data || '').slice(0, 10),
    dataRecebida: r.data_recebida ? String(r.data_recebida).slice(0, 10) : '',
    empresaDepositante: (r.empresa_depositante as string) || '',
    demanda: (r.demanda as string) || '',
    sub: (r.empresa as string) || '',
    previsto: money(r.previsto),
    recebido: money(r.recebido),
    saida: money(r.saida),
    origem: (r.origem as string) || 'Cadastro manual',
    anexos: anexosFor(anexoRows, 'lancamento', r.id as string, signed),
  }))

  const tasks: MbTask[] = (tarefas.data || []).map((r) => ({
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
  }))

  const audit: MbAudit[] = (auditoria.data || []).map((r) => ({
    id: r.id as string,
    at: r.at as string,
    actor: (r.actor_nome as string) || '',
    action: (r.action as string) || '',
    detail: (r.detail as string) || '',
  }))

  const prestacaoRows: MbHistoryRow[] = (prestacao.data || []).map((r) => {
    const codigo = (r.codigo_origem as string) || (r.id as string)
    return {
      id: codigo,
      mes: (r.mes as string) || '',
      aba: (r.aba as string) || '',
      linha: (r.linha as number) || undefined,
      nome: (r.nome as string) || '',
      descricao: (r.descricao as string) || '',
      data: r.data ? String(r.data).slice(0, 10) : '',
      valor: money(r.valor),
      banco: (r.banco as string) || '',
      extrato: (r.extrato as string) || '',
      situacao: (r.situacao as string) || '',
      observacao: (r.observacao as string) || '',
      anexos: anexosFor(anexoRows, 'prestacao', r.id as string, signed),
      _uuid: r.id as string,
    } as MbHistoryRow & { _uuid?: string }
  })

  const historyEdits: Record<string, Partial<MbHistoryRow>> = {}
  for (const row of prestacaoRows) {
    if (row.anexos?.length) historyEdits[row.id] = { anexos: row.anexos }
  }

  void empresas

  return {
    finance,
    tasks,
    audit,
    banks: (bancos.data || []).map((b) => b.nome as string),
    templates: (templates.data || []).map((t) => t.titulo as string),
    staff: (equipe.data || []).map((e) => e.nome as string),
    centers: Object.fromEntries((centros.data || []).map((c) => [c.codigo as string, c.nome || c.codigo])),
    historyEdits,
    prestacao: prestacaoRows,
  }
}

async function uploadBytes(userId: string, fileId: string, meta: { name: string; type: string; dataBase64: string }) {
  const raw = meta.dataBase64.includes(',') ? meta.dataBase64.split(',')[1] : meta.dataBase64
  const bin = atob(raw)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const safe = meta.name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'arquivo'
  const path = `${userId}/${fileId}-${safe}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    upsert: true,
    contentType: meta.type || 'application/octet-stream',
  })
  if (error) throw error
  return path
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

  await replaceAuxList('mb_bancos', 'nome', payload.banks || [])
  await replaceAuxList('mb_templates_tarefa', 'titulo', payload.templates || [])
  await replaceAuxList('mb_equipe', 'nome', payload.staff || [])

  // ---- lançamentos ----
  const { data: remoteFin, error: finListErr } = await supabase.from('mb_lancamentos').select('id')
  if (finListErr) throw finListErr
  const localFin = new Set(finance.map((f) => f.id))
  const delFin = (remoteFin || []).map((r) => r.id as string).filter((id) => !localFin.has(id))
  if (delFin.length) {
    await supabase.from('mb_anexos').delete().eq('entidade', 'lancamento').in('entidade_id', delFin)
    const { error } = await supabase.from('mb_lancamentos').delete().in('id', delFin)
    if (error) throw error
  }
  if (finance.length) {
    const rows = finance.map((r) => ({
      id: r.id,
      parceiro: r.parceiro || '',
      centro: r.centro || null,
      data: emptyDate(r.data) || new Date().toISOString().slice(0, 10),
      data_recebida: emptyDate(r.dataRecebida),
      empresa_depositante: r.empresaDepositante || null,
      demanda: r.demanda || null,
      empresa: r.sub || null,
      previsto: money(r.previsto),
      recebido: money(r.recebido),
      saida: money(r.saida),
      origem: r.origem || 'Cadastro manual',
      updated_at: new Date().toISOString(),
      updated_by: opts.userId,
      created_by: opts.userId,
    }))
    const { error } = await supabase.from('mb_lancamentos').upsert(rows, { onConflict: 'id' })
    if (error) throw error
  }

  // ---- tarefas ----
  const { data: remoteTasks, error: taskListErr } = await supabase.from('mb_tarefas').select('id')
  if (taskListErr) throw taskListErr
  const localTasks = new Set(tasks.map((t) => t.id))
  const delTasks = (remoteTasks || []).map((r) => r.id as string).filter((id) => !localTasks.has(id))
  if (delTasks.length) {
    await supabase.from('mb_anexos').delete().eq('entidade', 'tarefa').in('entidade_id', delTasks)
    const { error } = await supabase.from('mb_tarefas').delete().in('id', delTasks)
    if (error) throw error
  }
  if (tasks.length) {
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
      updated_at: new Date().toISOString(),
      updated_by: opts.userId,
      created_by: opts.userId,
    }))
    const { error } = await supabase.from('mb_tarefas').upsert(rows, { onConflict: 'id' })
    if (error) throw error
  }

  // ---- auditoria (substitui pelas 500 mais recentes do painel) ----
  const { data: remoteAudit, error: auditListErr } = await supabase.from('mb_auditoria').select('id')
  if (auditListErr) throw auditListErr
  const localAudit = new Set(audit.map((a) => a.id))
  const delAudit = (remoteAudit || []).map((r) => r.id as string).filter((id) => !localAudit.has(id))
  if (delAudit.length) {
    const { error } = await supabase.from('mb_auditoria').delete().in('id', delAudit)
    if (error) throw error
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
    if (error) throw error
  }

  // ---- prestação (seed embutido + edições) ----
  const prestacaoMap = new Map<string, MbHistoryRow>()
  for (const row of payload.prestacao || []) prestacaoMap.set(row.id, { ...row })
  for (const [codigo, edit] of Object.entries(payload.historyEdits || {})) {
    const base = prestacaoMap.get(codigo) || ({ id: codigo, mes: String(edit.data || '').slice(0, 7) } as MbHistoryRow)
    prestacaoMap.set(codigo, {
      ...base,
      ...edit,
      id: codigo,
      anexos: remapAnexos(edit.anexos || base.anexos),
    })
  }

  const { data: remotePrest, error: prestListErr } = await supabase
    .from('mb_prestacao_contas')
    .select('id,codigo_origem')
  if (prestListErr) throw prestListErr
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
    if (error) throw error
  }

  // ---- anexos ----
  async function syncAnexos(
    entidade: 'lancamento' | 'tarefa' | 'prestacao',
    entidadeId: string,
    list: MbAnexoMeta[] | undefined,
  ) {
    const wanted = list || []
    const { data: existing, error } = await supabase
      .from('mb_anexos')
      .select('id,storage_path')
      .eq('entidade', entidade)
      .eq('entidade_id', entidadeId)
    if (error) throw error
    const keepIds = new Set(wanted.map((a) => a.id))
    const toRemove = (existing || []).filter((a) => !keepIds.has(a.id as string))
    if (toRemove.length) {
      const paths = toRemove.map((a) => a.storage_path as string).filter(Boolean)
      if (paths.length) void supabase.storage.from(BUCKET).remove(paths)
      await supabase.from('mb_anexos').delete().in(
        'id',
        toRemove.map((a) => a.id as string),
      )
    }
    for (const a of wanted) {
      const anexoId = ensureUuid(a.id)
      let path = a.path
      // arquivos novos ainda vêm com a chave original do painel (_files)
      const pending = files[a.id] || files[anexoId] || Object.values(files).find((f) => f.name === a.name)
      if (pending?.dataBase64) {
        path = await uploadBytes(opts.userId, anexoId, pending)
      }
      if (!path) continue
      const { error: upErr } = await supabase.from('mb_anexos').upsert(
        {
          id: anexoId,
          entidade,
          entidade_id: entidadeId,
          nome: a.name || pending?.name || 'arquivo',
          mime: a.type || pending?.type || null,
          tamanho: a.size || pending?.size || null,
          storage_path: path,
          created_by: opts.userId,
        },
        { onConflict: 'id' },
      )
      if (upErr) throw upErr
    }
  }

  for (const f of finance) await syncAnexos('lancamento', f.id, f.anexos)
  for (const t of tasks) await syncAnexos('tarefa', t.id, t.anexos)
  for (const [codigo, row] of prestacaoMap) {
    const uuid = codigoToUuid.get(codigo)
    if (!uuid) continue
    const anexos = row.anexos || payload.historyEdits?.[codigo]?.anexos
    await syncAnexos('prestacao', uuid, anexos)
  }

  return carregarEstadoAssessoria()
}

export async function baixarAnexoAssessoria(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw error || new Error('Arquivo não encontrado')
  return data
}
