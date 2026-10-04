import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, UserRole } from '../types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
  createNerite: (input: {
    nome: string
    email: string
    password: string
    role?: UserRole
    extra_roles?: UserRole[]
    diretoria_id?: string | null
    coordenador_id?: string | null
    lider_id?: string | null
    lider_ids?: string[]
  }) => Promise<{ error: string | null }>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data as Profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setProfile(null)
      return
    }
    const p = await fetchProfile(user.id)
    setProfile(p)
  }, [])

  useEffect(() => {
    let mounted = true

    // .finally garante que o spinner sai mesmo se a rede do celular falhar
    // no getSession (sem isso o app ficava preso carregando).
    supabase.auth.getSession()
      .then(async ({ data: { session: s } }) => {
        if (!mounted) return
        setSession(s)
        if (s?.user) {
          const p = await fetchProfile(s.user.id)
          if (mounted) setProfile(p)
        }
      })
      .catch(() => {
        // Sessão indisponível (offline/token): segue como deslogado.
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return
      setSession(s)
      if (s?.user) {
        fetchProfile(s.user.id)
          .then((p) => { if (mounted) setProfile(p) })
          .catch(() => { /* mantém o perfil atual se a rede oscilar */ })
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) return { error: error.message }
    return { error: null }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { error: error.message }
    return { error: null }
  }, [])

  const createNerite = useCallback(async (input: {
    nome: string
    email: string
    password: string
    role?: UserRole
    extra_roles?: UserRole[]
    diretoria_id?: string | null
    coordenador_id?: string | null
    lider_id?: string | null
    lider_ids?: string[]
  }) => {
    // Renova o token antes de chamar a API (evita "Sessão inválida" com JWT expirado).
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
    const adminSession = refreshed.session
      ?? (await supabase.auth.getSession()).data.session
    if (!adminSession?.access_token) {
      return {
        error: refreshError?.message
          ? `Sessão expirada (${refreshError.message}). Saia e entre novamente.`
          : 'Sessão expirada. Saia e entre novamente.',
      }
    }

    try {
      const res = await fetch('/api/create-nerite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSession.access_token}`,
        },
        body: JSON.stringify({
          nome: input.nome.trim(),
          email: input.email.trim().toLowerCase(),
          password: input.password,
          role: input.role ?? 'operador',
          extra_roles: input.extra_roles ?? [],
          diretoria_id: input.diretoria_id ?? null,
          coordenador_id: input.coordenador_id ?? null,
          lider_id: input.lider_id ?? null,
          lider_ids: input.lider_ids ?? [],
        }),
      })

      const contentType = res.headers.get('content-type') || ''
      const raw = await res.text()
      let payload: { error?: string; ok?: boolean; warning?: string } = {}
      if (contentType.includes('application/json') || raw.trim().startsWith('{')) {
        try {
          payload = JSON.parse(raw) as { error?: string; ok?: boolean; warning?: string }
        } catch {
          payload = {}
        }
      } else {
        // Vite/local ou rewrite SPA devolveu HTML — a função /api não está no ar
        return {
          error:
            `API de login indisponível (HTTP ${res.status}). `
            + 'No Vercel, confira se a pasta /api está no deploy e se SUPABASE_SERVICE_ROLE_KEY está nas variáveis.',
        }
      }

      if (!res.ok) {
        return { error: payload.error || `Não foi possível criar o usuário (HTTP ${res.status}).` }
      }
      // warning = vínculo secundário (lideranças); o login já foi criado.
      return { error: null }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      const localHint = /Failed to fetch|NetworkError|Load failed/i.test(detail)
        ? ' Se estiver no preview local (Vite), o login só funciona no site publicado no Vercel.'
        : ''
      return { error: `Falha de conexão ao criar o usuário (${detail}).${localHint}` }
    }
  }, [])

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      signIn,
      signOut,
      resetPassword,
      updatePassword,
      createNerite,
      refreshProfile,
    }),
    [session, profile, loading, signIn, signOut, resetPassword, updatePassword, createNerite, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
