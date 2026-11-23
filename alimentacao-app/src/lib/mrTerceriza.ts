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
  contratoId?: string | null
}

export type MrContrato = {
  id: string
  empresa: string
  nome: string
  valorTotal: number
  centroCusto?: string
  /** YYYY-MM do primeiro mês previsto. */
  inicio: string
  meses: number
  observacoes?: string
  criadoPorId?: string
}

export type MrUsuario = {
  id: string
  nome: string
  nivel: 'admin' | 'editor'
  /** false = login "externo" sem acesso ao Empresas liberado no Admin. */
  podeAbrir: boolean
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
  contratos: MrContrato[]
  centrosCusto: string[]
  /** userId -> empresas liberadas. Admin recebe de todos; editor só o dele. */
  permissoes?: Record<string, string[]>
  /** Só vem pro admin (tela Usuários). */
  usuarios?: MrUsuario[]
  /** Empresas que o usuário atual vê; null = todas (admin). */
  minhasEmpresas?: string[] | null
  /** false = 20261117a_mr_contratos.sql ainda não rodou no banco. */
  estruturaOk?: boolean
  _files?: Record<string, { name: string; type: string; size: number; dataBase64: string }>
}

export type MrSessao = { userId: string; admin: boolean }

/** Tabela/função de 20261117a_mr_contratos.sql ainda não criada no banco. */
function semEstruturaNova(err: unknown) {
  const o = (err || {}) as { code?: string; message?: string }
  return o.code === 'PGRST205' || o.code === 'PGRST202' || o.code === '42P01' || o.code === '42883' ||
    /could not find|does not exist/i.test(o.message || '')
}

async function opcional<T>(q: PromiseLike<{ data: T | null; error: unknown }>, vazio: T) {
  const r = await q
  if (r.error && semEstruturaNova(r.error)) return { data: vazio, error: null, faltando: true }
  return { data: r.data, error: r.error, faltando: false }
}

async function empresasDoUsuario(sessao: MrSessao): Promise<string[] | null> {
  if (sessao.admin) return null
  const r = await opcional(supabase.from('mr_permissoes').select('empresa').eq('user_id', sessao.userId), [])
  if (r.error) throw r.error
  // Sem a tabela de permissões ainda, vale a regra antiga (vê todas).
  if (r.faltando) return null
  return (r.data || []).map((x) => (x as { empresa: string }).empresa)
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

export async function carregarEstadoMrTerceriza(sessao: MrSessao): Promise<MrDbPayload> {
  const [lancamentos, contasRows, auditoria, anexos, contratosRows, centrosRows, permRows, usuariosRes] =
    await Promise.all([
      supabase.from('mr_lancamentos').select('*').order('data', { ascending: false }),
      supabase.from('mr_contas').select('empresa,nome,ordem').eq('ativo', true).order('ordem'),
      supabase.from('mr_auditoria').select('*').order('at', { ascending: false }).limit(500),
      listAnexos(),
      opcional(supabase.from('mr_contratos').select('*').order('inicio', { ascending: false }), []),
      opcional(supabase.from('mr_centros_custo').select('nome').eq('ativo', true).order('nome'), []),
      opcional(supabase.from('mr_permissoes').select('user_id,empresa'), []),
      sessao.admin
        ? opcional(supabase.rpc('list_mr_usuarios'), [])
        : Promise.resolve({ data: null, error: null, faltando: false }),
    ])

  for (const r of [lancamentos, contasRows, auditoria, contratosRows, centrosRows, permRows, usuariosRes]) {
    if (r.error) throw r.error
  }

  const permissoes: Record<string, string[]> = {}
  for (const p of permRows.data || []) {
    const uid = p.user_id as string
    if (!sessao.admin && uid !== sessao.userId) continue
    if (!permissoes[uid]) permissoes[uid] = []
    permissoes[uid].push(p.empresa as string)
  }
  // Sem a tabela de permissões ainda, vale a regra antiga (vê todas).
  const minhasEmpresas = sessao.admin || permRows.faltando ? null : permissoes[sessao.userId] || []
  const pode = (empresa: string) => minhasEmpresas === null || minhasEmpresas.includes(empresa)

  const lancVisiveis = (lancamentos.data || []).filter((r) => pode(r.empresa as string))
  const idsVisiveis = new Set(lancVisiveis.map((r) => r.id as string))
  const anexosVisiveis = (anexos || []).filter((a) => idsVisiveis.has(String(a.entidade_id)))

  const signed = await signPaths(anexosVisiveis.map((a) => a.storage_path))
  const anexoRows = anexosVisiveis.map((a) => ({ ...a, entidade_id: String(a.entidade_id) }))

  const creatorIds = [
    ...new Set(
      lancVisiveis
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

  const lancs: MrLancamento[] = lancVisiveis.map((r) => {
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
      contratoId: (r.contrato_id as string) || null,
    }
  })

  const contas: Record<string, string[]> = {}
  for (const row of contasRows.data || []) {
    const empresa = row.empresa as string
    if (!pode(empresa)) continue
    if (!contas[empresa]) contas[empresa] = []
    contas[empresa].push(row.nome as string)
  }

  const contratos: MrContrato[] = (contratosRows.data || [])
    .filter((r) => pode(r.empresa as string))
    .map((r) => ({
      id: r.id as string,
      empresa: r.empresa as string,
      nome: (r.nome as string) || '',
      valorTotal: money(r.valor_total),
      centroCusto: (r.centro_custo as string) || '',
      inicio: String(r.inicio || '').slice(0, 7),
      meses: Number(r.meses) || 1,
      observacoes: (r.observacoes as string) || '',
      criadoPorId: (r.created_by as string) || '',
    }))

  const centrosCusto = (centrosRows.data || []).map((r) => r.nome as string)

  const usuarios: MrUsuario[] | undefined = sessao.admin
    ? ((usuariosRes.data as { id: string; nome: string; nivel: string; pode_abrir?: boolean }[] | null) || []).map(
        (u) => ({
          id: u.id,
          nome: u.nome || '',
          nivel: u.nivel === 'admin' ? 'admin' : 'editor',
          podeAbrir: u.pode_abrir !== false,
        }),
      )
    : undefined

  const audit: MrAudit[] = (auditoria.data || [])
    .filter((r) => (r.empresa ? pode(r.empresa as string) : sessao.admin))
    .map((r) => ({
    id: r.id as string,
    at: r.at as string,
    actor: (r.actor_nome as string) || '',
    action: (r.action as string) || '',
    detail: (r.detail as string) || '',
    empresa: (r.empresa as string) || '',
  }))

  return {
    lancamentos: lancs,
    contas,
    audit,
    contratos,
    centrosCusto,
    permissoes,
    usuarios,
    minhasEmpresas,
    estruturaOk: !contratosRows.faltando && !permRows.faltando,
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

export async function salvarEstadoMrTerceriza(
  payload: MrDbPayload,
  opts: { userId: string; userName: string; admin: boolean; vistoEm?: string },
): Promise<MrDbPayload> {
  const sessao: MrSessao = { userId: opts.userId, admin: opts.admin }
  // Escopo vem do banco, não do iframe: editor só grava/apaga nas empresas liberadas.
  const minhas = await empresasDoUsuario(sessao).catch((e) => {
    throw asError(e)
  })
  const pode = (empresa: string | null | undefined) =>
    minhas === null || (!!empresa && minhas.includes(empresa))
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

  const contratos = (payload.contratos || [])
    .filter((c) => pode(c.empresa))
    .map((c) => ({ ...c, id: ensureUuid(c.id) }))
  const contratoIds = new Set(contratos.map((c) => c.id))
  const lancamentos = payload.lancamentos
    .filter((r) => pode(r.empresa))
    .map((r) => {
      const contratoId = r.contratoId ? ensureUuid(r.contratoId) : null
      return {
        ...r,
        id: ensureUuid(r.id),
        contratoId: contratoId && contratoIds.has(contratoId) ? contratoId : null,
        anexos: remapAnexos(r.anexos),
      }
    })
  const audit = payload.audit
    .slice(0, 500)
    .filter((a) => (a.empresa ? pode(a.empresa) : opts.admin))
    .map((a) => ({ ...a, id: ensureUuid(String(a.id)) }))

  try {
    // ---- contratos (antes dos lançamentos, por causa da FK contrato_id) ----
    const contrList = await opcional(supabase.from('mr_contratos').select('id,empresa,created_by'), [])
    if (contrList.error) throw asError(contrList.error)
    const temEstruturaNova = !contrList.faltando
    const remoteContr = (contrList.data || []) as { id: string; empresa: string; created_by: string | null }[]

    // ---- centros de custo: só inclusão ----
    const centrosWanted = [...new Set((payload.centrosCusto || []).map((n) => n.trim()).filter(Boolean))]
    if (temEstruturaNova && centrosWanted.length) {
      const { data: jaTem, error } = await supabase.from('mr_centros_custo').select('nome')
      if (error) throw asError(error)
      const vistos = new Set((jaTem || []).map((r) => r.nome as string))
      const novos = centrosWanted.filter((n) => !vistos.has(n)).map((nome) => ({ nome, created_by: opts.userId }))
      if (novos.length) {
        const { error: insErr } = await supabase.from('mr_centros_custo').insert(novos)
        if (insErr) throw asError(insErr, 'Falha ao gravar centro de custo.')
      }
    }

    const contrCreatedBy = new Map<string, string>()
    for (const r of remoteContr) {
      if (r.id && r.created_by) contrCreatedBy.set(r.id, r.created_by)
    }
    if (temEstruturaNova && contratos.length) {
      const rows = contratos.map((c) => ({
        id: c.id,
        empresa: c.empresa,
        nome: c.nome || 'Contrato',
        valor_total: money(c.valorTotal),
        centro_custo: c.centroCusto || null,
        inicio: `${/^\d{4}-\d{2}$/.test(c.inicio) ? c.inicio : new Date().toISOString().slice(0, 7)}-01`,
        meses: Math.min(240, Math.max(1, Math.round(Number(c.meses) || 1))),
        observacoes: c.observacoes || null,
        updated_at: new Date().toISOString(),
        updated_by: opts.userId,
        created_by: contrCreatedBy.get(c.id) || opts.userId,
      }))
      const { error } = await supabase.from('mr_contratos').upsert(rows, { onConflict: 'id' })
      if (error) throw asError(error, 'Falha ao gravar contratos.')
    }

    // ---- contas bancárias: só inclusão (o painel não edita/exclui conta) ----
    const contasExistentes = new Map<string, Set<string>>()
    for (const [empresa, nomes] of Object.entries(payload.contas || {})) {
      if (!pode(empresa)) continue
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

    // Mesmo antes da constraint da migração chegar ao ambiente, não permite
    // gravar uma conta que não pertença à empresa do lançamento.
    const { data: contasValidasRows, error: contasValidasErr } = await supabase
      .from('mr_contas')
      .select('empresa,nome')
      .eq('ativo', true)
    if (contasValidasErr) throw asError(contasValidasErr, 'Falha ao validar contas bancárias.')
    const contasValidas = new Set(
      (contasValidasRows || []).map((r) => `${r.empresa}\u0000${r.nome}`),
    )
    const lancamentoComContaInvalida = lancamentos.find(
      (r) => r.conta && !contasValidas.has(`${r.empresa}\u0000${r.conta}`),
    )
    if (lancamentoComContaInvalida) {
      throw new Error('A conta bancária selecionada não está vinculada à empresa do lançamento.')
    }

    // ---- lançamentos ----
    const { data: remoteLanc, error: lancListErr } = await supabase.from('mr_lancamentos').select('id,created_by,empresa,created_at')
    if (lancListErr) throw asError(lancListErr)
    const lancCreatedBy = new Map<string, string>()
    for (const r of remoteLanc || []) {
      if (r.id && r.created_by) lancCreatedBy.set(r.id as string, r.created_by as string)
    }
    const vistoEm = opts.vistoEm ? Date.parse(opts.vistoEm) : NaN
    const localLanc = new Set(lancamentos.map((l) => l.id))
    const delLanc = (remoteLanc || [])
      .filter((r) => pode(r.empresa as string))
      // Linha criada depois que esta tela carregou (outro usuário) não é exclusão daqui.
      .filter((r) => !Number.isFinite(vistoEm) || Date.parse(String(r.created_at || '')) <= vistoEm)
      .map((r) => r.id as string)
      .filter((id) => !localLanc.has(id))
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
        ...(temEstruturaNova ? { contrato_id: r.contratoId } : {}),
        updated_at: new Date().toISOString(),
        updated_by: opts.userId,
        // Preserva o autor original; só grava o usuário atual em registro novo.
        created_by: lancCreatedBy.get(r.id) || (isUuid(String(r.criadoPorId || '')) ? r.criadoPorId : opts.userId),
      }))
      const { error } = await supabase.from('mr_lancamentos').upsert(rows, { onConflict: 'id' })
      if (error) throw asError(error, 'Falha ao gravar lançamentos.')
    }

    const delContr = (remoteContr || [])
      .filter((r) => pode(r.empresa as string))
      .map((r) => r.id as string)
      .filter((id) => !contratoIds.has(id))
    if (delContr.length) {
      const { error } = await supabase.from('mr_contratos').delete().in('id', delContr)
      if (error) throw asError(error, 'Falha ao excluir contrato.')
    }

    // ---- permissões por empresa (só admin) ----
    if (temEstruturaNova && opts.admin && payload.permissoes) {
      const { data: permAtuais, error: permErr } = await supabase.from('mr_permissoes').select('user_id,empresa')
      if (permErr) throw asError(permErr)
      for (const [uid, empresasIn] of Object.entries(payload.permissoes)) {
        if (!isUuid(uid)) continue
        const wanted = new Set(empresasIn)
        const atuais = new Set((permAtuais || []).filter((p) => p.user_id === uid).map((p) => p.empresa as string))
        const remover = [...atuais].filter((e) => !wanted.has(e))
        const incluir = [...wanted].filter((e) => !atuais.has(e))
        if (remover.length) {
          const { error } = await supabase.from('mr_permissoes').delete().eq('user_id', uid).in('empresa', remover)
          if (error) throw asError(error, 'Falha ao atualizar permissões.')
        }
        if (incluir.length) {
          const { error } = await supabase
            .from('mr_permissoes')
            .insert(incluir.map((empresa) => ({ user_id: uid, empresa, created_by: opts.userId })))
          if (error) throw asError(error, 'Falha ao atualizar permissões.')
        }
      }
    }

    // ---- auditoria (substitui pelas 500 mais recentes do painel) ----
    const { data: remoteAudit, error: auditListErr } = await supabase.from('mr_auditoria').select('id,empresa')
    if (auditListErr) throw asError(auditListErr)
    const localAudit = new Set(audit.map((a) => a.id))
    const delAudit = (remoteAudit || [])
      .filter((r) => (r.empresa ? pode(r.empresa as string) : opts.admin))
      .map((r) => r.id as string)
      .filter((id) => !localAudit.has(id))
    if (delAudit.length) {
      const { error } = await supabase.from('mr_auditoria').delete().in('id', delAudit)
      if (error) throw asError(error)
    }
    // Registro de auditoria não muda depois de criado: só insere os novos
    // (assim não sobrescreve o actor_id de quem fez a ação original).
    const auditJaTem = new Set((remoteAudit || []).map((r) => r.id as string))
    const auditNovos = audit.filter((a) => !auditJaTem.has(a.id))
    if (auditNovos.length) {
      const rows = auditNovos.map((a) => ({
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

    return carregarEstadoMrTerceriza(sessao)
  } catch (e) {
    throw asError(e)
  }
}

