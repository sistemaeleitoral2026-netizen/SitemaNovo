import { compressImageForUpload } from './imageCompress'
import { setCachedSignedUrl, takeCachedSignedUrls } from './signedUrlCache'
import { supabase } from './supabase'
import type { Cadastro, Demanda, DemandaStatus, DemandaUrgencia } from '../types'

const DEMANDAS_FOTOS_BUCKET = 'demandas-fotos'

export const DEMANDA_MAX_FOTOS = 6

export type DemandaCadastroHit = {
  id: string
  nome: string
  documento: string
  telefone: string
  bairro: string
  zona: string
  tipo: 'cadastro' | 'lideranca' | 'coordenador'
  tipoLabel: string
}

export type DemandaCreateInput = {
  origem: 'cadastro' | 'avulso'
  cadastro_id?: string | null
  nome: string
  documento?: string
  telefone?: string
  telefone_extra?: string
  descricao: string
  urgencia?: DemandaUrgencia
  fotos?: File[]
}

const URGENCIA_LABEL: Record<DemandaUrgencia, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

function digits(value: string) {
  return value.replace(/\D/g, '')
}

export function protocoloDemanda(id: string) {
  return `#DEM-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

export function labelUrgencia(urgencia: DemandaUrgencia | null | undefined) {
  return URGENCIA_LABEL[urgencia ?? 'normal']
}

export function resolveDemandaFotoPaths(
  row: Pick<Demanda, 'foto_path' | 'foto_paths'> | { foto_path?: string | null; foto_paths?: string[] | null },
): string[] {
  const fromArr = (row.foto_paths ?? []).filter((p): p is string => Boolean(p))
  if (fromArr.length) return fromArr
  return row.foto_path ? [row.foto_path] : []
}

export async function searchCadastrosDemanda(term: string, limit = 12): Promise<DemandaCadastroHit[]> {
  const q = term.trim()
  if (q.length < 2) return []
  const d = digits(q)
  const digitSearch = d.length >= 4

  const cadOr = digitSearch
    ? `nome_completo.ilike.%${q}%,cpf.ilike.%${d}%,titulo.ilike.%${d}%,telefone.ilike.%${d}%`
    : `nome_completo.ilike.%${q}%`
  const liderOr = digitSearch
    ? `nome.ilike.%${q}%,telefone.ilike.%${d}%`
    : `nome.ilike.%${q}%`

  const [cadRes, lidRes, coordRes] = await Promise.all([
    supabase
      .from('cadastros')
      .select('id, nome_completo, cpf, titulo, telefone, bairro, zona')
      .or(cadOr)
      .order('nome_completo')
      .limit(limit),
    supabase
      .from('lideres')
      .select('id, nome, telefone')
      .eq('ativo', true)
      .or(liderOr)
      .order('nome')
      .limit(6),
    supabase
      .from('coordenadores')
      .select('id, nome')
      .eq('ativo', true)
      .ilike('nome', `%${q}%`)
      .order('nome')
      .limit(6),
  ])

  if (cadRes.error) throw new Error(cadRes.error.message)
  if (lidRes.error) throw new Error(lidRes.error.message)
  if (coordRes.error) throw new Error(coordRes.error.message)

  const hits: DemandaCadastroHit[] = [
    ...((cadRes.data ?? []) as Cadastro[]).map((c) => ({
      id: c.id,
      nome: c.nome_completo ?? '',
      documento: (c.cpf || c.titulo || '').trim(),
      telefone: (c.telefone ?? '').trim(),
      bairro: c.bairro ?? '',
      zona: c.zona ?? '',
      tipo: 'cadastro' as const,
      tipoLabel: 'Eleitor',
    })),
    ...((lidRes.data ?? []) as { id: string; nome: string; telefone?: string | null }[]).map((l) => ({
      id: l.id,
      nome: l.nome ?? '',
      documento: '',
      telefone: (l.telefone ?? '').trim(),
      bairro: '',
      zona: '',
      tipo: 'lideranca' as const,
      tipoLabel: 'Liderança',
    })),
    ...((coordRes.data ?? []) as { id: string; nome: string }[]).map((c) => ({
      id: c.id,
      nome: c.nome ?? '',
      documento: '',
      telefone: '',
      bairro: '',
      zona: '',
      tipo: 'coordenador' as const,
      tipoLabel: 'Coordenador',
    })),
  ]

  return hits.slice(0, limit)
}

async function uploadFoto(userId: string, file: File): Promise<string> {
  // Qualidade alta: só reprocessa arquivos muito grandes (~2 MB+).
  const prepared = await compressImageForUpload(file)
  const ext = prepared.type === 'image/jpeg'
    ? 'jpg'
    : (prepared.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'jpg'}`
  const { error } = await supabase.storage.from(DEMANDAS_FOTOS_BUCKET).upload(path, prepared, {
    cacheControl: '86400',
    upsert: false,
    contentType: prepared.type || 'image/jpeg',
  })
  if (error) throw new Error(error.message)
  return path
}

export async function getDemandaFotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const map = await signDemandaFotoPaths([path])
  return map.get(path) ?? null
}

/** Assina várias fotos em 1 request (em vez de N createSignedUrl) + cache de sessão. */
export async function signDemandaFotoPaths(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  const out = new Map<string, string>()
  if (!unique.length) return out

  const { hits, missing } = takeCachedSignedUrls(DEMANDAS_FOTOS_BUCKET, unique)
  for (const [path, url] of hits) out.set(path, url)
  if (!missing.length) return out

  const { data, error } = await supabase.storage
    .from(DEMANDAS_FOTOS_BUCKET)
    .createSignedUrls(missing, 60 * 60)

  if (!error && data?.length) {
    for (const row of data) {
      if (row.path && row.signedUrl && !row.error) {
        out.set(row.path, row.signedUrl)
        setCachedSignedUrl(DEMANDAS_FOTOS_BUCKET, row.path, row.signedUrl)
      }
    }
  }

  const stillMissing = missing.filter((p) => !out.has(p))
  if (stillMissing.length) {
    await Promise.all(
      stillMissing.map(async (path) => {
        const { data: one } = await supabase.storage
          .from(DEMANDAS_FOTOS_BUCKET)
          .createSignedUrl(path, 60 * 60)
        if (one?.signedUrl) {
          out.set(path, one.signedUrl)
          setCachedSignedUrl(DEMANDAS_FOTOS_BUCKET, path, one.signedUrl)
        }
      }),
    )
  }
  return out
}

/** Anexa URLs assinadas depois — lista aparece rápido, fotos entram em seguida. */
export async function attachDemandaFotoUrls(items: DemandaComAutor[]): Promise<DemandaComAutor[]> {
  const allPaths = items.flatMap((r) => resolveDemandaFotoPaths(r))
  if (!allPaths.length) return items
  const map = await signDemandaFotoPaths(allPaths)
  return items.map((r) => {
    const paths = resolveDemandaFotoPaths(r)
    const foto_urls = paths.map((p) => map.get(p)).filter((u): u is string => Boolean(u))
    return { ...r, foto_paths: paths, foto_urls, foto_url: foto_urls[0] ?? null }
  })
}

export async function createDemanda(userId: string, input: DemandaCreateInput): Promise<{ error: string | null; id?: string }> {
  const nome = input.nome.trim()
  const descricao = input.descricao.trim()
  if (!nome) return { error: 'Informe o nome.' }
  if (descricao.length < 5) return { error: 'Descreva a demanda com mais detalhes.' }

  const files = (input.fotos ?? []).slice(0, DEMANDA_MAX_FOTOS)
  let foto_paths: string[] = []
  if (files.length) {
    try {
      foto_paths = []
      for (const file of files) {
        foto_paths.push(await uploadFoto(userId, file))
      }
    } catch (err) {
      if (foto_paths.length) void supabase.storage.from('demandas-fotos').remove(foto_paths)
      return { error: err instanceof Error ? err.message : 'Falha ao enviar as fotos.' }
    }
  }

  const payload = {
    created_by: userId,
    cadastro_id: input.origem === 'cadastro' ? (input.cadastro_id || null) : null,
    origem: input.origem,
    nome,
    documento: (input.documento ?? '').trim() || null,
    telefone: digits(input.telefone ?? '') || null,
    telefone_extra: digits(input.telefone_extra ?? '') || null,
    descricao,
    urgencia: input.urgencia ?? 'normal',
    foto_path: foto_paths[0] ?? null,
    foto_paths,
    status: 'aberta' as const,
  }

  let { data, error } = await supabase.from('demandas').insert(payload).select('id').maybeSingle()
  if (error && /foto_paths/i.test(error.message)) {
    const { foto_paths: _fp, ...withoutPaths } = payload
    ;({ data, error } = await supabase.from('demandas').insert(withoutPaths).select('id').maybeSingle())
  }
  if (error && /urgencia/i.test(error.message)) {
    const { urgencia: _u, foto_paths: _fp, ...rest } = payload
    ;({ data, error } = await supabase.from('demandas').insert(rest).select('id').maybeSingle())
  }
  if (error) {
    if (foto_paths.length) void supabase.storage.from('demandas-fotos').remove(foto_paths)
    return { error: error.message }
  }
  return { error: null, id: data?.id }
}

export type DemandaListFilters = {
  status?: DemandaStatus | 'todas'
  search?: string
  urgencia?: DemandaUrgencia | 'todas'
  comFotos?: boolean
  page?: number
  pageSize?: number
  /** Se true, não assina URLs agora — use attachDemandaFotoUrls depois. */
  skipFotos?: boolean
}

export type DemandaComAutor = Demanda & {
  autor_nome?: string
  resolvedor_nome?: string
  foto_url?: string | null
  foto_urls?: string[]
}

export async function fetchDemandas(filters: DemandaListFilters = {}): Promise<{ items: DemandaComAutor[]; total: number }> {
  const page = filters.page ?? 0
  const pageSize = filters.pageSize ?? 20
  const status = filters.status ?? 'todas'
  const q = (filters.search ?? '').trim()

  function buildQuery(includeUrgencia: boolean) {
    let query = supabase
      .from('demandas')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (status !== 'todas') query = query.eq('status', status)
    if (includeUrgencia && filters.urgencia && filters.urgencia !== 'todas') {
      query = query.eq('urgencia', filters.urgencia)
    }
    if (filters.comFotos) query = query.not('foto_path', 'is', null)
    if (q) {
      const d = digits(q)
      query = query.or(
        d.length >= 3
          ? `nome.ilike.%${q}%,documento.ilike.%${q}%,telefone.ilike.%${d}%,descricao.ilike.%${q}%`
          : `nome.ilike.%${q}%,documento.ilike.%${q}%,descricao.ilike.%${q}%`,
      )
    }
    return query
  }

  const from = page * pageSize
  let { data, error, count } = await buildQuery(true).range(from, from + pageSize - 1)
  // Em bancos antigos, todas as demandas são tratadas como prioridade normal.
  if (error && /urgencia/i.test(error.message) && filters.urgencia && filters.urgencia !== 'todas') {
    if (filters.urgencia !== 'normal') return { items: [], total: 0 }
    ;({ data, error, count } = await buildQuery(false).range(from, from + pageSize - 1))
  }
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Demanda[]
  const userIds = [...new Set(rows.flatMap((r) => [r.created_by, r.resolved_by].filter(Boolean) as string[]))]
  const nomes = new Map<string, string>()
  if (userIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, nome').in('id', userIds)
    for (const p of profiles ?? []) nomes.set(p.id, p.nome)
  }

  let items: DemandaComAutor[] = rows.map((r) => {
    const paths = resolveDemandaFotoPaths(r)
    return {
      ...r,
      urgencia: r.urgencia ?? 'normal',
      foto_paths: paths,
      autor_nome: nomes.get(r.created_by) ?? '—',
      resolvedor_nome: r.resolved_by ? (nomes.get(r.resolved_by) ?? '—') : undefined,
      foto_urls: [],
      foto_url: null,
    }
  })

  if (!filters.skipFotos) {
    items = await attachDemandaFotoUrls(items)
  }

  return { items, total: count ?? items.length }
}

export async function fetchDemandaFilterCounts(status: DemandaStatus, search = '') {
  const rows = await Promise.all(
    (['todas', 'urgente', 'normal', 'fotos'] as const).map(async (kind) => {
      let query = supabase.from('demandas').select('id', { count: 'exact', head: true }).eq('status', status)
      if (kind === 'fotos') query = query.not('foto_path', 'is', null)
      else if (kind !== 'todas') query = query.eq('urgencia', kind)
      if (search.trim()) {
        const q = search.trim()
        const d = digits(q)
        query = query.or(d.length >= 3
          ? `nome.ilike.%${q}%,documento.ilike.%${q}%,telefone.ilike.%${d}%,descricao.ilike.%${q}%`
          : `nome.ilike.%${q}%,documento.ilike.%${q}%,descricao.ilike.%${q}%`)
      }
      const { count, error } = await query
      return { count: count ?? 0, error: error?.message ?? null }
    }),
  )
  const todas = rows[0].error ? 0 : rows[0].count
  return {
    todas,
    urgente: rows[1].error ? 0 : rows[1].count,
    normal: rows[2].error && /urgencia/i.test(rows[2].error) ? todas : (rows[2].error ? 0 : rows[2].count),
    fotos: rows[3].error ? 0 : rows[3].count,
  }
}

export async function fetchDemandaCounts(): Promise<{ abertas: number; feitas: number }> {
  const [a, f] = await Promise.all([
    supabase.from('demandas').select('id', { count: 'exact', head: true }).eq('status', 'aberta'),
    supabase.from('demandas').select('id', { count: 'exact', head: true }).eq('status', 'feita'),
  ])
  return { abertas: a.count ?? 0, feitas: f.count ?? 0 }
}

export async function marcarDemandaFeita(
  id: string,
  adminId: string,
  note?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('demandas')
    .update({
      status: 'feita',
      resolved_at: new Date().toISOString(),
      resolved_by: adminId,
      resolved_note: note?.trim() || null,
    })
    .eq('id', id)
    .eq('status', 'aberta')
  return { error: error?.message ?? null }
}

export type DemandaUpdateInput = {
  nome: string
  documento?: string
  telefone?: string
  telefone_extra?: string
  descricao: string
  urgencia?: DemandaUrgencia
  keepPaths?: string[]
  fotos?: File[]
}

export async function updateDemanda(
  id: string,
  userId: string,
  input: DemandaUpdateInput,
): Promise<{ error: string | null }> {
  const nome = input.nome.trim()
  const descricao = input.descricao.trim()
  if (!nome) return { error: 'Informe o nome.' }
  if (descricao.length < 5) return { error: 'Descreva a demanda com mais detalhes.' }

  const { data: current, error: fetchErr } = await supabase
    .from('demandas')
    .select('foto_path, foto_paths, status')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return { error: fetchErr.message }
  if (!current) return { error: 'Demanda não encontrada.' }

  const previous = resolveDemandaFotoPaths(current as Demanda)
  const keep = (input.keepPaths ?? previous).filter((p) => previous.includes(p))
  const slots = Math.max(0, DEMANDA_MAX_FOTOS - keep.length)
  const files = (input.fotos ?? []).slice(0, slots)

  let uploaded: string[] = []
  if (files.length) {
    try {
      for (const file of files) {
        uploaded.push(await uploadFoto(userId, file))
      }
    } catch (err) {
      if (uploaded.length) void supabase.storage.from('demandas-fotos').remove(uploaded)
      return { error: err instanceof Error ? err.message : 'Falha ao enviar as fotos.' }
    }
  }

  const nextPaths = [...keep, ...uploaded]
  const removed = previous.filter((p) => !nextPaths.includes(p))
  if (removed.length) void supabase.storage.from('demandas-fotos').remove(removed)

  const payload: Record<string, unknown> = {
    nome,
    documento: (input.documento ?? '').trim() || null,
    telefone: digits(input.telefone ?? '') || null,
    telefone_extra: digits(input.telefone_extra ?? '') || null,
    descricao,
    urgencia: input.urgencia ?? 'normal',
    foto_path: nextPaths[0] ?? null,
    foto_paths: nextPaths,
  }

  let { error } = await supabase.from('demandas').update(payload).eq('id', id)
  if (error && /foto_paths/i.test(error.message)) {
    const { foto_paths: _fp, ...rest } = payload
    ;({ error } = await supabase.from('demandas').update(rest).eq('id', id))
  }
  if (error && /urgencia/i.test(error.message)) {
    const { urgencia: _u, foto_paths: _fp, ...rest } = payload
    ;({ error } = await supabase.from('demandas').update(rest).eq('id', id))
  }
  if (error) {
    if (uploaded.length) void supabase.storage.from('demandas-fotos').remove(uploaded)
    return { error: error.message }
  }
  return { error: null }
}

export async function deleteDemanda(id: string): Promise<{ error: string | null }> {
  const { data: current } = await supabase
    .from('demandas')
    .select('foto_path, foto_paths')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('demandas').delete().eq('id', id)
  if (error) return { error: error.message }

  const paths = resolveDemandaFotoPaths((current ?? {}) as Demanda)
  if (paths.length) void supabase.storage.from('demandas-fotos').remove(paths)
  return { error: null }
}

export function canManageDemanda(
  demanda: Pick<Demanda, 'created_by' | 'status'>,
  userId: string | undefined,
  role: string | undefined,
): boolean {
  if (!userId) return false
  if (role === 'admin') return true
  return demanda.created_by === userId && demanda.status === 'aberta'
}
