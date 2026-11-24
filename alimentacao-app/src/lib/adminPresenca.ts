import { supabase } from './supabase'
import type { AdminPresenca } from './adminTypes'

const ONLINE_WINDOW_MS = 2 * 60 * 1000

export async function touchAdminPresence(userId: string, currentPath: string) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('admin_presenca').upsert({
    user_id: userId,
    current_path: currentPath.slice(0, 240),
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: 'user_id' })
  // A presença é progressiva: não interrompe o aplicativo antes da migration.
  if (error && !/admin_presenca|PGRST205|42P01/i.test(error.message)) {
    console.warn('[admin-presenca]', error.message)
  }
}

type RawPresence = {
  user_id: string
  current_path: string | null
  first_seen_at: string
  last_seen_at: string
  profiles?: { nome?: string; email?: string; role?: string } | { nome?: string; email?: string; role?: string }[] | null
}

export async function fetchAdminPresencas(): Promise<AdminPresenca[]> {
  const { data, error } = await supabase
    .from('admin_presenca')
    .select('user_id,current_path,first_seen_at,last_seen_at,profiles!admin_presenca_user_id_fkey(nome,email,role)')
    .order('last_seen_at', { ascending: false })
    .limit(200)
  if (error) {
    if (/admin_presenca|PGRST205|42P01/i.test(error.message)) return []
    throw new Error(error.message)
  }
  const now = Date.now()
  return ((data || []) as unknown as RawPresence[]).map((row) => {
    const raw = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      userId: row.user_id,
      nome: raw?.nome || 'Usuário',
      email: raw?.email || null,
      role: raw?.role || null,
      currentPath: row.current_path,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      online: now - new Date(row.last_seen_at).getTime() <= ONLINE_WINDOW_MS,
    }
  })
}

export function subscribeAdminPresencas(onChange: () => void) {
  const channel = supabase.channel('admin-presenca-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_presenca' }, onChange)
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export function presenceSystemLabel(path: string | null) {
  if (!path) return '—'
  if (path.startsWith('/admin')) return 'Administração'
  if (path.startsWith('/mr-terceiriza')) return 'Empresas'
  if (path.startsWith('/assessoria-mb')) return 'Assessoria MB'
  if (path.startsWith('/painel-do-mandato')) return 'Painel do Mandato'
  if (path.startsWith('/financeiro-pessoal')) return 'Financeiro Pessoal'
  if (path.startsWith('/chat')) return 'Chat Seguro'
  return 'Sistema Nerites'
}
