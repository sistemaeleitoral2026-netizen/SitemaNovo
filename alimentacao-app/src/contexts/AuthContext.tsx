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

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return
      setSession(s)
      if (s?.user) {
        fetchProfile(s.user.id).then((p) => {
          if (mounted) setProfile(p)
          if (mounted) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user) {
        fetchProfile(s.user.id).then((p) => setProfile(p))
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
  }) => {
    const { data: sessionData } = await supabase.auth.getSession()
    const adminSession = sessionData.session
    if (!adminSession) return { error: 'Sessão expirada.' }

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
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { error: payload.error || 'Não foi possível criar o usuário.' }
      }
      return { error: null }
    } catch {
      return { error: 'Falha de conexão ao criar o usuário.' }
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
