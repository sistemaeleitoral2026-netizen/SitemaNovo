import { supabase } from './supabase'

export type VotacaoNotif = {
  id: string
  cadastro_id: string
  auxiliar_id: string
  auxiliar_nome: string
  eleitor_nome: string
  lider: string
  coordenador: string
  votou: boolean
  diretoria_id: string | null
  created_at: string
}

/** Best-effort: só Votou, só auxiliar. Falha não bloqueia o lançamento. */
export async function criarNotifVotacaoAuxiliar(input: {
  cadastroId: string
  auxiliarId: string
  auxiliarNome: string
  eleitorNome: string
  lider?: string | null
  coordenador?: string | null
  diretoriaId?: string | null
  votou: boolean
}): Promise<void> {
  if (!input.votou) return
  if (!input.cadastroId || !input.auxiliarId) return
  const eleitor = (input.eleitorNome ?? '').trim()
  if (!eleitor) return
  try {
    const { error } = await supabase.from('votacao_notif').insert({
      cadastro_id: input.cadastroId,
      auxiliar_id: input.auxiliarId,
      auxiliar_nome: (input.auxiliarNome ?? '').trim() || 'Auxiliar',
      eleitor_nome: eleitor,
      lider: (input.lider ?? '').trim(),
      coordenador: (input.coordenador ?? '').trim(),
      votou: true,
      diretoria_id: input.diretoriaId || null,
    })
    if (error && !/votacao_notif|schema|relation|does not exist/i.test(error.message)) {
      console.warn('[votacao_notif]', error.message)
    }
  } catch {
    /* ignore */
  }
}

export type FetchNotifResult = {
  rows: VotacaoNotif[]
  /** true = tabela/coluna ainda não existe no Supabase */
  missingSchema?: boolean
}

export async function fetchNotifVotacao(opts: {
  diretoriaId?: string | null
  isAdmin?: boolean
  limit?: number
}): Promise<FetchNotifResult> {
  const limit = Math.min(40, Math.max(5, opts.limit ?? 20))
  let q = supabase
    .from('votacao_notif')
    .select(
      'id,cadastro_id,auxiliar_id,auxiliar_nome,eleitor_nome,lider,coordenador,votou,diretoria_id,created_at',
    )
    .eq('votou', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!opts.isAdmin && opts.diretoriaId) {
    q = q.eq('diretoria_id', opts.diretoriaId)
  }

  const { data, error } = await q
  if (error) {
    if (/votacao_notif|schema|relation|does not exist|column/i.test(error.message)) {
      return { rows: [], missingSchema: true }
    }
    throw new Error(error.message)
  }
  return { rows: (data ?? []) as VotacaoNotif[] }
}

export async function countNotifVotacaoNaoLidas(opts: {
  vistoEm?: string | null
  diretoriaId?: string | null
  isAdmin?: boolean
}): Promise<number> {
  let q = supabase
    .from('votacao_notif')
    .select('id', { count: 'exact', head: true })
    .eq('votou', true)

  if (opts.vistoEm) {
    q = q.gt('created_at', opts.vistoEm)
  }
  if (!opts.isAdmin && opts.diretoriaId) {
    q = q.eq('diretoria_id', opts.diretoriaId)
  }

  const { count, error } = await q
  if (error) {
    if (/votacao_notif|schema|relation|does not exist|column|visto/i.test(error.message)) return 0
    throw new Error(error.message)
  }
  return typeof count === 'number' ? count : 0
}

export async function fetchVotacaoNotifVistoEm(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('votacao_notif_visto_em')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    if (/votacao_notif_visto_em|column|schema/i.test(error.message)) return null
    throw new Error(error.message)
  }
  return (data as { votacao_notif_visto_em?: string | null } | null)?.votacao_notif_visto_em ?? null
}

export async function marcarVotacaoNotifVisto(userId: string): Promise<string> {
  const agora = new Date().toISOString()
  const { error } = await supabase
    .from('profiles')
    .update({ votacao_notif_visto_em: agora })
    .eq('id', userId)
  if (error && !/votacao_notif_visto_em|column|schema/i.test(error.message)) {
    throw new Error(error.message)
  }
  return agora
}
