import { compressImageForUpload } from './imageCompress'
import { supabase } from './supabase'
import type { Cadastro } from '../types'

export const VOTACAO_FOTOS_BUCKET = 'votacao-fotos'

export type VotacaoHit = Pick<
  Cadastro,
  | 'id'
  | 'nome_completo'
  | 'titulo'
  | 'zona'
  | 'secao'
  | 'nome_mae'
  | 'data_nascimento'
  | 'telefone'
  | 'coordenador'
  | 'lider'
  | 'votou'
  | 'voto_foto_path'
  | 'voto_em'
  | 'voto_por'
  | 'diretoria_id'
>

const SELECT_COLS =
  'id,nome_completo,titulo,zona,secao,nome_mae,data_nascimento,telefone,coordenador,lider,votou,voto_foto_path,voto_em,voto_por,diretoria_id'

export async function fetchAuxiliarLiderNomes(auxiliarId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('auxiliar_lideres')
    .select('lider_id, lideres(nome)')
    .eq('auxiliar_id', auxiliarId)
  if (error) throw new Error(error.message)
  const nomes = (data ?? [])
    .map((row) => {
      const lideres = (row as { lideres?: { nome?: string } | { nome?: string }[] | null }).lideres
      if (Array.isArray(lideres)) return lideres[0]?.nome ?? ''
      return lideres?.nome ?? ''
    })
    .map((n) => n.trim())
    .filter(Boolean)
  return [...new Set(nomes)]
}

export async function fetchAuxiliarLiderIds(auxiliarId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('auxiliar_lideres')
    .select('lider_id')
    .eq('auxiliar_id', auxiliarId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.lider_id as string)
}

export async function searchVotacaoFichas(opts: {
  query: string
  liderNomes?: string[]
  coordenadorNome?: string | null
  limit?: number
}): Promise<VotacaoHit[]> {
  const q = opts.query.trim()
  if (q.length < 2) return []

  let request = supabase
    .from('cadastros')
    .select(SELECT_COLS)
    .or(`nome_completo.ilike.%${q}%,titulo.ilike.%${q}%`)
    .order('nome_completo')
    .limit(opts.limit ?? 40)

  if (opts.liderNomes?.length) {
    request = request.in('lider', opts.liderNomes)
  }
  if (opts.coordenadorNome) {
    request = request.eq('coordenador', opts.coordenadorNome)
  }

  const { data, error } = await request
  if (error) throw new Error(error.message)
  return (data ?? []) as VotacaoHit[]
}

export async function getVotacaoFicha(id: string): Promise<VotacaoHit | null> {
  const { data, error } = await supabase
    .from('cadastros')
    .select(SELECT_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as VotacaoHit | null) ?? null
}

async function uploadVotoFoto(userId: string, file: File): Promise<string> {
  const prepared = await compressImageForUpload(file)
  const ext = prepared.type === 'image/jpeg'
    ? 'jpg'
    : (prepared.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'jpg'}`
  const { error } = await supabase.storage.from(VOTACAO_FOTOS_BUCKET).upload(path, prepared, {
    cacheControl: '86400',
    upsert: false,
    contentType: prepared.type || 'image/jpeg',
  })
  if (error) throw new Error(error.message)
  return path
}

export async function signVotoFoto(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(VOTACAO_FOTOS_BUCKET)
    .createSignedUrl(path, 60 * 60)
  if (error) return null
  return data?.signedUrl ?? null
}

export type VotacaoSaveInput = {
  cadastroId: string
  userId: string
  votou: boolean
  fotoFile?: File | null
  clearFoto?: boolean
  correcoes?: {
    nome_completo?: string
    titulo?: string
    zona?: string
    secao?: string
    nome_mae?: string
    data_nascimento?: string | null
  }
}

export async function salvarLancamentoVotacao(input: VotacaoSaveInput): Promise<VotacaoHit> {
  const patch: Record<string, unknown> = {
    votou: input.votou,
    voto_em: new Date().toISOString(),
    voto_por: input.userId,
  }

  if (input.correcoes) {
    const c = input.correcoes
    if (c.nome_completo != null) patch.nome_completo = c.nome_completo.trim()
    if (c.titulo != null) patch.titulo = c.titulo.trim()
    if (c.zona != null) patch.zona = c.zona.trim()
    if (c.secao != null) patch.secao = c.secao.trim()
    if (c.nome_mae != null) patch.nome_mae = c.nome_mae.trim()
    if (c.data_nascimento !== undefined) {
      patch.data_nascimento = c.data_nascimento?.trim() || null
    }
  }

  let newFotoPath: string | null = null
  if (input.fotoFile) {
    newFotoPath = await uploadVotoFoto(input.userId, input.fotoFile)
    patch.voto_foto_path = newFotoPath
  } else if (input.clearFoto) {
    patch.voto_foto_path = null
  }

  const { data, error } = await supabase
    .from('cadastros')
    .update(patch)
    .eq('id', input.cadastroId)
    .select(SELECT_COLS)
    .maybeSingle()

  if (error) {
    if (newFotoPath) {
      void supabase.storage.from(VOTACAO_FOTOS_BUCKET).remove([newFotoPath])
    }
    throw new Error(error.message)
  }
  if (!data) throw new Error('Ficha não encontrada ou sem permissão.')
  return data as VotacaoHit
}
