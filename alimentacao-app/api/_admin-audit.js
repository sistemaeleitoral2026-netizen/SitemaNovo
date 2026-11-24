const { randomUUID } = require('crypto')

/**
 * Auditoria administrativa best-effort. A operação principal não falha quando
 * a migration ainda não foi aplicada; o erro continua visível nos logs.
 */
async function logAdminEvent(input) {
  const url = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false
  const sourceKey = input.sourceKey || `${input.sistema}:${input.entidade || 'atividade'}:${input.entidadeId || randomUUID()}:${Date.now()}`
  try {
    const response = await fetch(`${url}/rest/v1/admin_eventos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({
        sistema: input.sistema,
        categoria: input.categoria || 'atividade',
        acao: input.acao,
        entidade: input.entidade || null,
        entidade_id: input.entidadeId || null,
        titulo: input.titulo,
        resumo: input.resumo || null,
        actor_id: input.actorId || null,
        actor_nome: input.actorNome || 'Usuário',
        ocorrido_em: new Date().toISOString(),
        metadata: input.metadata || {},
        origem_url: input.origemUrl || null,
        source_key: sourceKey,
      }),
    })
    if (!response.ok && response.status !== 404) {
      console.warn('[admin-eventos]', response.status, await response.text())
    }
    return response.ok
  } catch (error) {
    console.warn('[admin-eventos]', error)
    return false
  }
}

module.exports = { logAdminEvent }
