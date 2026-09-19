import { supabase } from './supabase'

/** Auditoria em segundo plano — não deve atrasar o salvar da ficha. */
export function logAudit(
  acao: string,
  entidade?: string,
  entidadeId?: string,
  detalhes: Record<string, unknown> = {},
): void {
  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return

      await supabase.from('auditoria').insert({
        actor_id: userId,
        acao,
        entidade: entidade ?? null,
        entidade_id: entidadeId ?? null,
        detalhes,
      })
    } catch {
      // Auditoria nunca deve falhar o fluxo principal
    }
  })()
}
