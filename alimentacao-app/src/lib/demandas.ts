import { supabase } from './supabase'
import type { Cadastro, Demanda, DemandaStatus, DemandaUrgencia } from '../types'

export type DemandaCadastroHit = {
  id: string
  nome: string
  documento: string
  telefone: string
  bairro: string
  zona: string
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
  foto?: File | null
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

export async function searchCadastrosDemanda(term: string, limit = 12): Promise<DemandaCadastroHit[]> {
  const q = term.trim()
  if (q.length < 2) return []
  const d = digits(q)

  let query = supabase
    .from('cadastros')
    .select('id, nome_completo, cpf, titulo, telefone, bairro, zona')
    .order('nome_completo')
    .limit(limit)

  if (d.length >= 4) {
    query = query.or(
      `nome_completo.ilike.%${q}%,cpf.ilike.%${d}%,titulo.ilike.%${d}%,telefone.ilike.%${d}%`,
    )
  } else {
    query = query.ilike('nome_completo', `%${q}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return ((data ?? []) as Cadastro[]).map((c) => ({
    id: c.id,
    nome: c.nome_completo ?? '',
    documento: (c.cpf || c.titulo || '').trim(),
    telefone: (c.telefone ?? '').trim(),
    bairro: c.bairro ?? '',
    zona: c.zona ?? '',
  }))
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

export async function createDemanda(userId: string, input: DemandaCreateInput): Promise<{ error: string | null; id?: string }> {
  const nome = input.nome.trim()
  const descricao = input.descricao.trim()
  if (!nome) return { error: 'Informe o nome.' }
  if (descricao.length < 5) return { error: 'Descreva a demanda com mais detalhes.' }

  let foto_path: string | null = null
  if (input.foto) {
    try {
      foto_path = await uploadFoto(userId, input.foto)
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Falha ao enviar a foto.' }
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
    foto_path,
    status: 'aberta' as const,
  }

  let { data, error } = await supabase.from('demandas').insert(payload).select('id').maybeSingle()
  if (error && /urgencia/i.test(error.message)) {
    const { urgencia: _u, ...withoutUrgencia } = payload
    ;({ data, error } = await supabase.from('demandas').insert(withoutUrgencia).select('id').maybeSingle())
  }
  if (error) return { error: error.message }
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
    rows.map(async (r) => ({
      ...r,
      urgencia: r.urgencia ?? 'normal',
      autor_nome: nomes.get(r.created_by) ?? '—',
      resolvedor_nome: r.resolved_by ? (nomes.get(r.resolved_by) ?? '—') : undefined,
      foto_url: await getDemandaFotoUrl(r.foto_path),
    })),
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
  foto?: File | null
  removeFoto?: boolean
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
    .select('foto_path, status')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return { error: fetchErr.message }
  if (!current) return { error: 'Demanda não encontrada.' }

  let foto_path: string | null | undefined = undefined
  if (input.foto) {
    try {
      foto_path = await uploadFoto(userId, input.foto)
      if (current.foto_path) {
        void supabase.storage.from('demandas-fotos').remove([current.foto_path])
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Falha ao enviar a foto.' }
    }
  } else if (input.removeFoto) {
    foto_path = null
    if (current.foto_path) {
      void supabase.storage.from('demandas-fotos').remove([current.foto_path])
    }
  }

  const payload: Record<string, unknown> = {
    nome,
    documento: (input.documento ?? '').trim() || null,
    telefone: digits(input.telefone ?? '') || null,
    telefone_extra: digits(input.telefone_extra ?? '') || null,
    descricao,
    urgencia: input.urgencia ?? 'normal',
  }
  if (foto_path !== undefined) payload.foto_path = foto_path

  let { error } = await supabase.from('demandas').update(payload).eq('id', id)
  if (error && /urgencia/i.test(error.message)) {
    const { urgencia: _u, ...rest } = payload
    ;({ error } = await supabase.from('demandas').update(rest).eq('id', id))
  }
  return { error: error?.message ?? null }
}

export async function deleteDemanda(id: string): Promise<{ error: string | null }> {
  const { data: current } = await supabase
    .from('demandas')
    .select('foto_path')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('demandas').delete().eq('id', id)
  if (error) return { error: error.message }

  if (current?.foto_path) {
    void supabase.storage.from('demandas-fotos').remove([current.foto_path])
  }
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
