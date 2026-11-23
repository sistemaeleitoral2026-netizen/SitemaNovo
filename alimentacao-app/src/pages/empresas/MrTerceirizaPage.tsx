import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { hasRole } from '../../lib/roles'
import { clearSite, isAdminNoSiteExterno } from '../../lib/sites'
import { Spinner } from '../../components/ui/Spinner'
import {
  carregarEstadoMrTerceriza,
  salvarEstadoMrTerceriza,
  type MrDbPayload,
} from '../../lib/mrTerceriza'
import demoHtml from './mr-terceiriza-demo.html?raw'

type MrMensagem = {
  type?: string
  requestId?: string
  payload?: MrDbPayload
}

function mensagemDe(e: unknown, padrao: string) {
  const o = e as { message?: string; error?: string } | null
  return (e instanceof Error && e.message) || o?.message || o?.error || padrao
}

export function MrTerceirizaPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [pronto, setPronto] = useState(false)
  const [erroSync, setErroSync] = useState('')
  // Navegação cruzada pro Nerites a partir daqui: só admin do Nerites, como já era.
  const neritesAdmin = hasRole(profile, 'admin')
  const admin = neritesAdmin || isAdminNoSiteExterno(profile, 'mr-terceiriza')
  const nome = profile?.nome || 'Usuário'
  const userId = profile?.id || ''
  const persistindo = useRef(false)
  const vistoEm = useRef('')

  const srcDoc = useMemo(() => {
    const user = JSON.stringify({ id: userId, nome, admin }).replace(/</g, '\\u003c')
    return demoHtml.replace('<!--MR_USER-->', `<script>window.MR_USER=${user}</script>`)
  }, [userId, nome, admin])

  function postar(msg: Record<string, unknown>) {
    // srcDoc: o documento do iframe tem origin opaco ("null"), não dá pra mirar
    // num origin específico — por isso '*' (conteúdo é gerado por nós mesmos).
    frameRef.current?.contentWindow?.postMessage(msg, '*')
  }

  async function hidratar() {
    try {
      const inicio = new Date().toISOString()
      const estado = await carregarEstadoMrTerceriza({ userId, admin })
      vistoEm.current = inicio
      setErroSync('')
      postar({ type: 'mr-hydrate', payload: estado })
    } catch (e) {
      setErroSync(e instanceof Error ? e.message : 'Falha ao carregar dados do Empresas.')
    }
  }

  useEffect(() => {
    async function aoMensagem(ev: MessageEvent) {
      // srcDoc: a origin do remetente é opaca ("null"), então a checagem de
      // segurança real é o source apontar exatamente pro nosso iframe.
      if (ev.source !== frameRef.current?.contentWindow) return
      const dados = (ev.data ?? {}) as MrMensagem

      if (dados.type === 'mr-pronto') {
        setPronto(true)
        void hidratar()
        return
      }
      if (dados.type === 'mr-sair') {
        void signOut()
        return
      }
      if (dados.type === 'mr-trocar-sistema') {
        clearSite()
        navigate('/login')
        return
      }
      if (dados.type === 'mr-persist' && dados.payload) {
        if (!userId) {
          postar({ type: 'mr-persist-erro', requestId: dados.requestId, erro: 'Sem permissão para salvar.' })
          return
        }
        if (persistindo.current) {
          postar({ type: 'mr-persist-erro', requestId: dados.requestId, erro: 'Já existe um salvamento em andamento.' })
          return
        }
        persistindo.current = true
        try {
          const inicio = new Date().toISOString()
          const estado = await salvarEstadoMrTerceriza(dados.payload, {
            userId,
            userName: nome,
            admin,
            vistoEm: vistoEm.current || undefined,
          })
          vistoEm.current = inicio
          setErroSync('')
          postar({ type: 'mr-persist-ok', requestId: dados.requestId, payload: estado })
        } catch (e) {
          const msg = mensagemDe(e, 'Falha ao salvar na nuvem.')
          console.error('[mr-terceiriza] persist', e)
          setErroSync(msg)
          postar({ type: 'mr-persist-erro', requestId: dados.requestId, erro: msg })
        } finally {
          persistindo.current = false
        }
        return
      }
    }
    window.addEventListener('message', aoMensagem)
    return () => window.removeEventListener('message', aoMensagem)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, neritesAdmin, nome, navigate, signOut, userId])

  return (
    <div className="mr-demo">
      <div className="mr-demo-stage">
        {!pronto ? (
          <div className="mr-demo-loading" aria-live="polite">
            <Spinner size={36} />
            Carregando Empresas…
          </div>
        ) : null}
        {erroSync ? (
          <div className="mr-demo-loading" role="alert" style={{ zIndex: 2 }}>
            {erroSync}
          </div>
        ) : null}
        <iframe
          ref={frameRef}
          className={`mr-demo-frame${pronto ? ' is-ready' : ''}`}
          title="Empresas"
          srcDoc={srcDoc}
          onLoad={() => window.setTimeout(() => setPronto(true), 4000)}
        />
      </div>
    </div>
  )
}
