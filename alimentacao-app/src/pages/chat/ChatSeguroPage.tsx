import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { clearSite } from '../../lib/sites'
import { Spinner } from '../../components/ui/Spinner'
import { systemUrl } from '../../lib/buildVersion'

type ChatMensagem = { type?: string }

/**
 * Chat Seguro — UI em public/sistemas/chat-seguro/ carregada em iframe. Dados nas tabelas sc_* do Nerites.
 * Esta página só faz a ponte do LOGIN (o iframe não cria nem renova sessão, para não disputar o
 * refresh token com o resto do sistema):
 *   iframe → chat-pronto / chat-token / chat-sair / chat-trocar-sistema
 *   página → chat-config (url, chave pública, token, nome) / chat-token (token renovado) / chat-open-room
 * O conteúdo das conversas é cifrado de ponta a ponta dentro do iframe; esta página nunca o vê.
 */
export function ChatSeguroPage() {
  const { profile, session, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [pronto, setPronto] = useState(false)
  const room = new URLSearchParams(location.search).get('room')
  const src = systemUrl('/sistemas/chat-seguro/index.html', room ? { room } : {})

  function postar(msg: Record<string, unknown>) {
    frameRef.current?.contentWindow?.postMessage(msg, window.location.origin)
  }

  async function tokenAtual() {
    const { data } = await supabase.auth.getSession()   // o cliente do sistema renova sozinho quando precisa
    return data.session?.access_token || session?.access_token || ''
  }

  useEffect(() => {
    async function aoMensagem(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return
      if (ev.source !== frameRef.current?.contentWindow) return
      const dados = (ev.data ?? {}) as ChatMensagem
      if (dados.type === 'chat-pronto') {
        postar({
          type: 'chat-config',
          url: import.meta.env.VITE_SUPABASE_URL,
          anon: import.meta.env.VITE_SUPABASE_ANON_KEY,
          vapid: import.meta.env.VITE_CHAT_VAPID_PUBLIC_KEY || '',
          token: await tokenAtual(),
          email: profile?.email || session?.user?.email || '',
          nome: profile?.nome || 'Usuário',
          userId: profile?.id || session?.user?.id || '',
        })
        setPronto(true)
        return
      }
      if (dados.type === 'chat-token') {
        postar({ type: 'chat-token', token: await tokenAtual() })
        return
      }
      if (dados.type === 'chat-sair') {
        void signOut()
        return
      }
      if (dados.type === 'chat-trocar-sistema') {
        clearSite()
        navigate('/login')
      }
    }
    window.addEventListener('message', aoMensagem)
    return () => window.removeEventListener('message', aoMensagem)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.email, profile?.nome, navigate, signOut])

  // login renovado pelo sistema => repassa o token novo ao chat
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if ((evento === 'TOKEN_REFRESHED' || evento === 'SIGNED_IN') && s?.access_token) {
        postar({ type: 'chat-token', token: s.access_token })
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // toque na notificação com o /chat já aberto: o service worker pede para abrir a conversa
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const aoSw = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; room_id?: number } | null
      if (d?.type === 'chat-open-room' && d.room_id) postar({ type: 'chat-open-room', room_id: d.room_id })
    }
    navigator.serviceWorker.addEventListener('message', aoSw)
    return () => navigator.serviceWorker.removeEventListener('message', aoSw)
  }, [])

  return (
    <div className="mr-demo">
      <div className="mr-demo-stage">
        {!pronto ? (
          <div className="mr-demo-loading" aria-live="polite">
            <Spinner size={36} />
            Carregando Chat Seguro…
          </div>
        ) : null}
        <iframe
          ref={frameRef}
          className={`mr-demo-frame${pronto ? ' is-ready' : ''}`}
          title="Chat Seguro"
          src={src}
          allow="clipboard-write"
          onLoad={() => window.setTimeout(() => setPronto(true), 8000)}
        />
      </div>
    </div>
  )
}
