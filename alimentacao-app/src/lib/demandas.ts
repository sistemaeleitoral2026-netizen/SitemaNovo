import { supabase } from './supabase'
import type { Cadastro, Demanda, DemandaStatus, DemandaUrgencia } from '../types'

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
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'jpg'}`
  const { error } = await supabase.storage.from('demandas-fotos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  })
  if (error) throw new Error(error.message)
  return path
}

export async function getDemandaFotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from('demandas-fotos').createSignedUrl(path, 60 * 60)
  if (error) return null
  return data.signedUrl
}

async function getDemandaFotoUrls(paths: string[]): Promise<string[]> {
  const urls = await Promise.all(paths.map((p) => getDemandaFotoUrl(p)))
  return urls.filter((u): u is string => Boolean(u))
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
  page?: number
  pageSize?: number
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

  let query = supabase
    .from('demandas')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (status !== 'todas') query = query.eq('status', status)
  if (q) {
    const d = digits(q)
    query = query.or(
      d.length >= 3
        ? `nome.ilike.%${q}%,documento.ilike.%${q}%,telefone.ilike.%${d}%,descricao.ilike.%${q}%`
        : `nome.ilike.%${q}%,documento.ilike.%${q}%,descricao.ilike.%${q}%`,
    )
  }

  const from = page * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Demanda[]
  const userIds = [...new Set(rows.flatMap((r) => [r.created_by, r.resolved_by].filter(Boolean) as string[]))]
  const nomes = new Map<string, string>()
  if (userIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, nome').in('id', userIds)
    for (const p of profiles ?? []) nomes.set(p.id, p.nome)
  }

  const items: DemandaComAutor[] = await Promise.all(
    rows.map(async (r) => {
      const paths = resolveDemandaFotoPaths(r)
      const foto_urls = await getDemandaFotoUrls(paths)
      return {
        ...r,
        urgencia: r.urgencia ?? 'normal',
        foto_paths: paths,
        autor_nome: nomes.get(r.created_by) ?? '—',
        resolvedor_nome: r.resolved_by ? (nomes.get(r.resolved_by) ?? '—') : undefined,
        foto_urls,
        foto_url: foto_urls[0] ?? null,
      }
    }),
  )

  return { items, total: count ?? items.length }
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
