import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, UserRole } from '../types'

export type PresenceUser = {
  user_id: string
  nome: string
  role: UserRole
  extra_roles?: UserRole[] | null
  diretoria_id: string | null
}

function buildPayload(profile: Profile): PresenceUser {
  return {
    user_id: profile.id,
    nome: profile.nome,
    role: profile.role,
    extra_roles: profile.extra_roles ?? null,
    diretoria_id:
      profile.role === 'diretoria'
        ? profile.id
        : (profile.diretoria_id ?? null),
  }
}

/** Mantém o usuário no canal de presença enquanto a sessão está aberta. */
export function usePresence(profile: Profile | null): PresenceUser[] {
  const [online, setOnline] = useState<PresenceUser[]>([])

  const trackKey = profile
    ? [
        profile.id,
        profile.nome,
        profile.role,
        profile.diretoria_id ?? '',
        (profile.extra_roles ?? []).join(','),
      ].join('|')
    : ''

  useEffect(() => {
    if (!profile?.id || !trackKey) {
      setOnline([])
      return
    }

    const payload = buildPayload(profile)

    const channel = supabase.channel('online-users', {
      config: {
        presence: { key: profile.id },
      },
    })

    const syncList = () => {
      const state = channel.presenceState<PresenceUser>()
      const byId = new Map<string, PresenceUser>()
      for (const metas of Object.values(state)) {
        for (const meta of metas) {
          const id = meta?.user_id
          if (!id) continue
          byId.set(id, {
            user_id: id,
            nome: String(meta.nome ?? '').trim() || 'Usuário',
            role: (meta.role ?? 'operador') as UserRole,
            extra_roles: meta.extra_roles ?? null,
            diretoria_id: meta.diretoria_id ?? null,
          })
        }
      }
      setOnline(
        [...byId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      )
    }

    const trackNow = async () => {
      try {
        await channel.track(payload)
      } catch {
        // Realtime indisponível — não quebra o app
      }
    }

    channel
      .on('presence', { event: 'sync' }, syncList)
      .on('presence', { event: 'join' }, syncList)
      .on('presence', { event: 'leave' }, syncList)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await trackNow()
        }
      })

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void trackNow()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      void channel.untrack()
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey])

  return online
}
