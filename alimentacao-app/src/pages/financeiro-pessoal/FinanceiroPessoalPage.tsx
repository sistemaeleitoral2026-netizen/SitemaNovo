import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { hasRole } from '../../lib/roles'
import { writeSite } from '../../lib/sites'
import { Spinner } from '../../components/ui/Spinner'

type FpMensagem = { type?: string }

/**
 * Controle Financeiro Pessoal — UI em public/sistemas/financeiro-pessoal/ carregada em iframe.
 * Por enquanto os dados ficam no navegador (localStorage do iframe); não há tabela no banco.
 */
export function FinanceiroPessoalPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [pronto, setPronto] = useState(false)
  const neritesAdmin = hasRole(profile, 'admin')
  const nome = profile?.nome || 'Usuário'

  function enviarUsuario() {
    frameRef.current?.contentWindow?.postMessage({ type: 'fp-user', nome, neritesAdmin }, window.location.origin)
  }

  useEffect(() => {
    function aoMensagem(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return
      if (ev.source !== frameRef.current?.contentWindow) return
      const dados = (ev.data ?? {}) as FpMensagem
      if (dados.type === 'fp-pronto') {
        setPronto(true)
        enviarUsuario()
        return
      }
      if (dados.type === 'fp-sair') {
        void signOut()
        return
      }
      if (dados.type === 'fp-nerites' && neritesAdmin) {
        writeSite('nerites')
        navigate('/')
      }
    }
    window.addEventListener('message', aoMensagem)
    enviarUsuario()
    return () => window.removeEventListener('message', aoMensagem)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, neritesAdmin, navigate, signOut])

  return (
    <div className="mr-demo">
      <div className="mr-demo-stage">
        {!pronto ? (
          <div className="mr-demo-loading" aria-live="polite">
            <Spinner size={36} />
            Carregando controle financeiro…
          </div>
        ) : null}
        <iframe
          ref={frameRef}
          className={`mr-demo-frame${pronto ? ' is-ready' : ''}`}
          title="Controle Financeiro Pessoal"
          src="/sistemas/financeiro-pessoal/index.html?v=2"
          onLoad={() => window.setTimeout(() => setPronto(true), 4000)}
        />
      </div>
    </div>
  )
}
