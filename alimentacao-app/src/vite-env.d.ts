/// <reference types="vite/client" />

declare const __BUILD_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Chat Seguro: chave pública VAPID das notificações (a privada fica só na Vercel, sem VITE_). */
  readonly VITE_CHAT_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
