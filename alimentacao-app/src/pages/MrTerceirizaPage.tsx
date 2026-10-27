import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import { writeSite } from '../lib/sites'
import demoHtml from './mr-terceiriza-demo.html?raw'

export function MrTerceirizaPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const admin = hasRole(profile, 'admin')

  // O painel roda num iframe; o nome do usuário entra no HTML e as ações do menu voltam por postMessage.
  const srcDoc = useMemo(() => {
    const user = JSON.stringify({ nome: profile?.nome || 'Usuário', admin }).replace(/</g, '\\u003c')
    return demoHtml.replace('<!--MR_USER-->', `<script>window.MR_USER=${user}</script>`)
  }, [profile?.nome, admin])

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== frameRef.current?.contentWindow) return
      const type = (ev.data as { type?: string } | null)?.type
      if (type === 'mr-sair') void signOut()
      if (type === 'mr-nerites' && admin) {
        writeSite('nerites')
        navigate('/')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [admin, navigate, signOut])

  return (
    <div className="mr-demo">
      <iframe ref={frameRef} className="mr-demo-frame" title="Sistema Financeiro" srcDoc={srcDoc} />
    </div>
  )
}
