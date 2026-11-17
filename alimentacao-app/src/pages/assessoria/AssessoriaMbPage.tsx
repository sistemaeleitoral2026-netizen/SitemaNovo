import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { hasRole } from '../../lib/roles'
import { canAccessAssessoriaMb, isAdminNoSiteExterno, isSiteId, siteById, writeSite } from '../../lib/sites'
import { Spinner } from '../../components/ui/Spinner'
import {
  baixarAnexoAssessoria,
  carregarEstadoAssessoria,
  salvarEstadoAssessoria,
  type MbDbPayload,
} from '../../lib/assessoriaMb'

type MbMensagem = {
  type?: string
  site?: string
  requestId?: string
  payload?: MbDbPayload
  path?: string
}

export function AssessoriaMbPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [pronto, setPronto] = useState(false)
  const [erroSync, setErroSync] = useState('')
  // Navegação cruzada pros outros sistemas a partir daqui: só admin do Nerites, como já era.
  const neritesAdmin = hasRole(profile, 'admin')
  const podeEditar = canAccessAssessoriaMb(profile)
  // Admin dentro deste painel (Configurações etc.): admin/diretoria do Nerites (como já era,
  // Configurações nunca teve essa trava antes) ou acesso "admin" cadastrado em /admin.
  const admin = hasRole(profile, ['admin', 'diretoria']) || isAdminNoSiteExterno(profile, 'assessoria-mb')
  const nome = profile?.nome || 'Usuário'
  const userId = profile?.id || ''
  const persistindo = useRef(false)

  function postar(msg: Record<string, unknown>) {
    frameRef.current?.contentWindow?.postMessage(msg, window.location.origin)
  }

  function enviarUsuario() {
    postar({ type: 'mb-user', nome, admin, userId })
  }

  async function hidratar() {
    if (!podeEditar) {
      setErroSync('Sem permissão para o financeiro corporativo (admin/diretoria).')
      return
    }
    try {
      const estado = await carregarEstadoAssessoria()
      setErroSync('')
      postar({ type: 'mb-hydrate', payload: estado })
    } catch (e) {
      setErroSync(e instanceof Error ? e.message : 'Falha ao carregar dados da Assessoria MB.')
    }
  }

  useEffect(() => {
    async function aoMensagem(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return
      if (ev.source !== frameRef.current?.contentWindow) return
      const dados = (ev.data ?? {}) as MbMensagem

      if (dados.type === 'mb-pronto') {
        setPronto(true)
        enviarUsuario()
        return
      }
      if (dados.type === 'mb-sair') {
        void signOut()
        return
      }
      if (dados.type === 'mb-nav' && neritesAdmin && isSiteId(dados.site) && dados.site !== 'assessoria-mb') {
        writeSite(dados.site)
        navigate(siteById(dados.site)?.home ?? '/')
        return
      }
      if (dados.type === 'mb-persist' && dados.payload) {
        if (!podeEditar || !userId) {
          postar({ type: 'mb-persist-erro', requestId: dados.requestId, erro: 'Sem permissão para salvar.' })
          return
        }
        if (persistindo.current) {
          postar({ type: 'mb-persist-erro', requestId: dados.requestId, erro: 'Já existe um salvamento em andamento.' })
          return
        }
        persistindo.current = true
        try {
          await salvarEstadoAssessoria(dados.payload, { userId, userName: nome })
          setErroSync('')
          // O iframe mantém o estado mais novo de forma otimista. Reenviar o snapshot
          // retornado aqui pode ressuscitar uma exclusão feita enquanto este save ainda
          // estava em andamento: a resposta antiga chega antes do próximo debounce e
          // substitui a lista local. O save já valida no banco se a exclusão ocorreu;
          // a hidratação completa fica restrita à carga inicial da página.
          postar({ type: 'mb-persist-ok', requestId: dados.requestId })
        } catch (e) {
          const o = e as { message?: string; error?: string } | null
          const msg =
            (e instanceof Error && e.message) ||
            o?.message ||
            o?.error ||
            'Falha ao salvar na nuvem.'
          console.error('[assessoria-mb] persist', e)
          setErroSync(msg)
          postar({ type: 'mb-persist-erro', requestId: dados.requestId, erro: msg })
        } finally {
          persistindo.current = false
        }
        return
      }
      if (dados.type === 'mb-file-get' && dados.path && dados.requestId) {
        try {
          const blob = await baixarAnexoAssessoria(dados.path)
          const buf = await blob.arrayBuffer()
          const bytes = new Uint8Array(buf)
          let bin = ''
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
          postar({
            type: 'mb-file-data',
            requestId: dados.requestId,
            path: dados.path,
            mime: blob.type || 'application/octet-stream',
            dataBase64: btoa(bin),
          })
        } catch (e) {
          postar({
            type: 'mb-file-erro',
            requestId: dados.requestId,
            erro: e instanceof Error ? e.message : 'Falha ao baixar arquivo.',
          })
        }
      }
    }
    window.addEventListener('message', aoMensagem)
    enviarUsuario()
    return () => window.removeEventListener('message', aoMensagem)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, neritesAdmin, nome, navigate, signOut, podeEditar, userId])

  useEffect(() => {
    if (!pronto || !podeEditar || !userId) return

    const sincronizar = () => {
      enviarUsuario()
      // Não hidratar no meio do save: o focus após o confirm de exclusão
      // trazia snapshot antigo e o lançamento “voltava” até o F5.
      if (persistindo.current) return
      void hidratar()
    }
    const aoVoltarParaAba = () => {
      if (document.visibilityState === 'visible') sincronizar()
    }

    // O iframe pode ficar pronto antes de o perfil. Sincronizar a partir deste
    // efeito garante a hidratação assim que os dois estiverem disponíveis.
    sincronizar()
    window.addEventListener('focus', sincronizar)
    document.addEventListener('visibilitychange', aoVoltarParaAba)
    return () => {
      window.removeEventListener('focus', sincronizar)
      document.removeEventListener('visibilitychange', aoVoltarParaAba)
    }
    // As funções usam os mesmos valores listados abaixo; incluí-las faria o
    // efeito reiniciar a cada renderização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, podeEditar, userId, nome, admin])

  return (
    <div className="mr-demo">
      <div className="mr-demo-stage">
        {!pronto ? (
          <div className="mr-demo-loading" aria-live="polite">
            <Spinner size={36} />
            Carregando financeiro…
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
          title="Financeiro Corporativo"
          src="/sistemas/assessoria-mb/index.html?v=modular-7"
          onLoad={() => window.setTimeout(() => setPronto(true), 4000)}
        />
      </div>
    </div>
  )
}
