import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import { isSiteId, siteById, writeSite } from '../lib/sites'
import { Spinner } from '../components/ui/Spinner'

type MbMensagem = { type?: string; site?: string }

export function AssessoriaMbPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [pronto, setPronto] = useState(false)
  const admin = hasRole(profile, 'admin')
  const nome = profile?.nome || 'Usuário'

  // O painel roda num iframe: avisa 'mb-pronto' quando desempacota, recebe o usuário
  // e devolve a navegação entre sistemas e o "Sair" por postMessage.
  useEffect(() => {
    function enviarUsuario() {
      frameRef.current?.contentWindow?.postMessage({ type: 'mb-user', nome, admin }, window.location.origin)
    }
    function aoMensagem(ev: MessageEvent) {
      if (ev.source !== frameRef.current?.contentWindow) return
      const dados = (ev.data ?? {}) as MbMensagem
      if (dados.type === 'mb-pronto') {
        setPronto(true)
        enviarUsuario()
      }
      if (dados.type === 'mb-sair') void signOut()
      if (dados.type === 'mb-nav' && admin && isSiteId(dados.site) && dados.site !== 'assessoria-mb') {
        writeSite(dados.site)
        navigate(siteById(dados.site)?.home ?? '/')
      }
    }
    window.addEventListener('message', aoMensagem)
    enviarUsuario()
    return () => window.removeEventListener('message', aoMensagem)
  }, [admin, nome, navigate, signOut])

  return (
    <div className="mr-demo">
      <div className="mr-demo-stage">
        {!pronto ? (
          <div className="mr-demo-loading" aria-live="polite">
            <Spinner size={36} />
            Carregando financeiro…
          </div>
        ) : null}
        <iframe
          ref={frameRef}
          className={`mr-demo-frame${pronto ? ' is-ready' : ''}`}
          title="Financeiro Corporativo"
          src="/assessoria-mb/index.html"
          onLoad={() => window.setTimeout(() => setPronto(true), 4000)}
        />
      </div>
    </div>
  )
}
