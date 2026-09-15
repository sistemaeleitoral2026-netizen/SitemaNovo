import { supabase } from './supabase'

export async function logAudit(
  acao: string,
  entidade?: string,
  entidadeId?: string,
  detalhes: Record<string, unknown> = {},
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('auditoria').insert({
    actor_id: user.id,
    acao,
    entidade: entidade ?? null,
    entidade_id: entidadeId ?? null,
    detalhes,
  })
}
