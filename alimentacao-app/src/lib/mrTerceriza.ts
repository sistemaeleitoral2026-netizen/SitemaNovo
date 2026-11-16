import { supabase } from './supabase'

const BUCKET = 'mr-comprovantes'

export type MrAnexoMeta = {
  id: string
  name: string
  type?: string
  size?: number
  path?: string
  signedUrl?: string
  createdAt?: string
}

export type MrLancamento = {
  id: string
  empresa: string
  data: string
  tipo: 'entrada' | 'saida'
  descricao: string
  valor: number
  conta?: string
  formaPagamento?: string
  observacoes?: string
  anexos?: MrAnexoMeta[]
  criadoPor?: string
  criadoPorId?: string
}

export type MrAudit = {
  id: string
  at: string
  actor: string
  action: string
  detail?: string
  empresa?: string
}

export type MrDbPayload = {
  lancamentos: MrLancamento[]
  /** empresa (slug) -> nomes das contas bancárias, só inclusão (sem editar/excluir). */
  contas: Record<string, string[]>
  audit: MrAudit[]
  _files?: Record<string, { name: string; type: string; size: number; dataBase64: string }>
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
    .from('mr_anexos')
    .select('id,entidade,entidade_id,nome,mime,tamanho,storage_path,created_at')
  if (error) throw error
  return data || []
}

function anexosFor(
  rows: { id: string; entidade: string; entidade_id: string; nome: string; mime: string | null; tamanho: number | null; storage_path: string; created_at?: string }[],
  entidadeId: string,
  signed: Map<string, string>,
): MrAnexoMeta[] {
  return rows
    .filter((a) => a.entidade === 'lancamento' && a.entidade_id === entidadeId)
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

export async function carregarEstadoMrTerceriza(): Promise<MrDbPayload> {
  const [lancamentos, contasRows, auditoria, anexos] = await Promise.all([
    supabase.from('mr_lancamentos').select('*').order('data', { ascending: false }),
    supabase.from('mr_contas').select('empresa,nome,ordem').eq('ativo', true).order('ordem'),
    supabase.from('mr_auditoria').select('*').order('at', { ascending: false }).limit(500),
    listAnexos(),
  ])

  for (const r of [lancamentos, contasRows, auditoria]) {
    if (r.error) throw r.error
  }

  const signed = await signPaths((anexos || []).map((a) => a.storage_path))
  const anexoRows = (anexos || []).map((a) => ({ ...a, entidade_id: String(a.entidade_id) }))

  const creatorIds = [
    ...new Set(
      (lancamentos.data || [])
        .map((r) => r.created_by as string | null | undefined)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const nomePorId = new Map<string, string>()
  if (creatorIds.length) {
    const { data: creators } = await supabase.from('profiles').select('id,nome').in('id', creatorIds)
    for (const p of creators || []) {
      if (p.id && p.nome) nomePorId.set(p.id as string, p.nome as string)
    }
  }

  const lancs: MrLancamento[] = (lancamentos.data || []).map((r) => {
    const criadoPorId = (r.created_by as string) || ''
    return {
      id: r.id as string,
      empresa: (r.empresa as string) || '',
      data: String(r.data || '').slice(0, 10),
      tipo: (r.tipo as 'entrada' | 'saida') || 'entrada',
      descricao: (r.descricao as string) || '',
      valor: money(r.valor),
      conta: (r.conta as string) || '',
      formaPagamento: (r.forma_pagamento as string) || '',
      observacoes: (r.observacoes as string) || '',
      anexos: anexosFor(anexoRows, r.id as string, signed),
      criadoPorId,
      criadoPor: criadoPorId ? nomePorId.get(criadoPorId) || '' : '',
    }
  })

  const contas: Record<string, string[]> = {}
  for (const row of contasRows.data || []) {
    const empresa = row.empresa as string
    if (!contas[empresa]) contas[empresa] = []
    contas[empresa].push(row.nome as string)
  }

  const audit: MrAudit[] = (auditoria.data || []).map((r) => ({
    id: r.id as string,
    at: r.at as string,
    actor: (r.actor_nome as string) || '',
    action: (r.action as string) || '',
    detail: (r.detail as string) || '',
    empresa: (r.empresa as string) || '',
  }))

  return { lancamentos: lancs, contas, audit }
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

export async function salvarEstadoMrTerceriza(
  payload: MrDbPayload,
  opts: { userId: string; userName: string },
): Promise<MrDbPayload> {
  const filesIn = payload._files || {}
  const files: Record<string, { name: string; type: string; size: number; dataBase64: string }> = { ...filesIn }
  const ensureUuid = makeIdCache()

  function remapAnexos(list: MrAnexoMeta[] | undefined) {
    return (list || []).map((a) => {
      const newId = ensureUuid(a.id)
      if (filesIn[a.id] && a.id !== newId) files[newId] = filesIn[a.id]
      return { ...a, id: newId }
    })
  }

  const lancamentos = payload.lancamentos.map((r) => ({
    ...r,
    id: ensureUuid(r.id),
    anexos: remapAnexos(r.anexos),
  }))
  const audit = payload.audit.slice(0, 500).map((a) => ({ ...a, id: ensureUuid(String(a.id)) }))

  try {
    // ---- contas bancárias: só inclusão (o painel não edita/exclui conta) ----
    const contasExistentes = new Map<string, Set<string>>()
    for (const [empresa, nomes] of Object.entries(payload.contas || {})) {
      for (const nome of nomes) {
        if (!contasExistentes.has(empresa)) contasExistentes.set(empresa, new Set())
        contasExistentes.get(empresa)!.add(nome)
      }
    }
    if (contasExistentes.size) {
      const { data: jaTem, error: contasErr } = await supabase.from('mr_contas').select('empresa,nome')
      if (contasErr) throw asError(contasErr)
      const vistos = new Set((jaTem || []).map((r) => `${r.empresa}\u0000${r.nome}`))
      const novas: { empresa: string; nome: string; ordem: number }[] = []
      for (const [empresa, nomes] of contasExistentes) {
        let ordem = 0
        for (const nome of nomes) {
          if (!vistos.has(`${empresa}\u0000${nome}`)) {
            novas.push({ empresa, nome, ordem })
          }
          ordem++
        }
      }
      if (novas.length) {
        const { error: insErr } = await supabase.from('mr_contas').insert(novas)
        if (insErr) throw asError(insErr, 'Falha ao gravar conta bancária.')
      }
    }

    // ---- lançamentos ----
    const { data: remoteLanc, error: lancListErr } = await supabase.from('mr_lancamentos').select('id,created_by')
    if (lancListErr) throw asError(lancListErr)
    const lancCreatedBy = new Map<string, string>()
    for (const r of remoteLanc || []) {
      if (r.id && r.created_by) lancCreatedBy.set(r.id as string, r.created_by as string)
    }
    const localLanc = new Set(lancamentos.map((l) => l.id))
    const delLanc = (remoteLanc || []).map((r) => r.id as string).filter((id) => !localLanc.has(id))
    if (delLanc.length) {
      await supabase.from('mr_anexos').delete().eq('entidade', 'lancamento').in('entidade_id', delLanc)
      const { error } = await supabase.from('mr_lancamentos').delete().in('id', delLanc)
      if (error) throw asError(error)
    }
    if (lancamentos.length) {
      const rows = lancamentos.map((r) => ({
        id: r.id,
        empresa: r.empresa,
        data: r.data,
        tipo: r.tipo,
        descricao: r.descricao || '',
        valor: money(r.valor),
        conta: r.conta || null,
        forma_pagamento: r.formaPagamento || null,
        observacoes: r.observacoes || null,
        updated_at: new Date().toISOString(),
        updated_by: opts.userId,
        // Preserva o autor original; só grava o usuário atual em registro novo.
        created_by: lancCreatedBy.get(r.id) || (isUuid(String(r.criadoPorId || '')) ? r.criadoPorId : opts.userId),
      }))
      const { error } = await supabase.from('mr_lancamentos').upsert(rows, { onConflict: 'id' })
      if (error) throw asError(error, 'Falha ao gravar lançamentos.')
    }

    // ---- auditoria (substitui pelas 500 mais recentes do painel) ----
    const { data: remoteAudit, error: auditListErr } = await supabase.from('mr_auditoria').select('id')
    if (auditListErr) throw asError(auditListErr)
    const localAudit = new Set(audit.map((a) => a.id))
    const delAudit = (remoteAudit || []).map((r) => r.id as string).filter((id) => !localAudit.has(id))
    if (delAudit.length) {
      const { error } = await supabase.from('mr_auditoria').delete().in('id', delAudit)
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
        empresa: a.empresa || null,
      }))
      const { error } = await supabase.from('mr_auditoria').upsert(rows, { onConflict: 'id' })
      if (error) throw asError(error, 'Falha ao gravar auditoria.')
    }

    // ---- anexos ----
    async function syncAnexos(entidadeId: string, list: MrAnexoMeta[] | undefined) {
      const wanted = list || []
      const { data: existing, error } = await supabase
        .from('mr_anexos')
        .select('id,storage_path')
        .eq('entidade', 'lancamento')
        .eq('entidade_id', entidadeId)
      if (error) throw asError(error, 'Falha ao ler anexos.')
      const keepIds = new Set(wanted.map((a) => a.id))
      const toRemove = (existing || []).filter((a) => !keepIds.has(a.id as string))
      if (toRemove.length) {
        const paths = toRemove.map((a) => a.storage_path as string).filter(Boolean)
        if (paths.length) void supabase.storage.from(BUCKET).remove(paths)
        const { error: delErr } = await supabase.from('mr_anexos').delete().in(
          'id',
          toRemove.map((a) => a.id as string),
        )
        if (delErr) throw asError(delErr, 'Falha ao remover anexo.')
      }
      for (const a of wanted) {
        const anexoId = ensureUuid(a.id)
        let path = a.path
        const pending = files[a.id] || files[anexoId]
        if (pending?.dataBase64) {
          path = await uploadBytes(opts.userId, anexoId, pending)
        }
        if (!path) continue
        const { error: upErr } = await supabase.from('mr_anexos').upsert(
          {
            id: anexoId,
            entidade: 'lancamento',
            entidade_id: entidadeId,
            nome: a.name || pending?.name || 'arquivo',
            mime: a.type || pending?.type || null,
            tamanho: a.size || pending?.size || null,
            storage_path: path,
            created_by: opts.userId,
          },
          { onConflict: 'id' },
        )
        if (upErr) throw asError(upErr, 'Falha ao gravar metadados do comprovante.')
      }
    }

    for (const r of lancamentos) await syncAnexos(r.id, r.anexos)

    return carregarEstadoMrTerceriza()
  } catch (e) {
    throw asError(e)
  }
}

