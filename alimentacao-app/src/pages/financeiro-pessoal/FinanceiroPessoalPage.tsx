import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { hasRole } from '../../lib/roles'
import { clearSite, isAdminNoSiteExterno } from '../../lib/sites'
import { Spinner } from '../../components/ui/Spinner'
import {
  baixarComprovante,
  carregarFinanceiroPessoal,
  enviarComprovante,
  salvarFinanceiroPessoal,
  type FpRows,
  type FpState,
} from '../../lib/financeiroPessoal'

type FpMensagem = {
  type?: string
  requestId?: string
  payload?: FpState
  file?: Blob
  name?: string
  entidadeId?: string
  nome?: string
  id?: string
}

/**
 * Gera um PNG da tela inteira do iframe (o print do navegador corta porque a rolagem é dentro do iframe).
 * Os ícones usam <use href="#i-…"> de um sprite; o html2canvas não resolve isso, então no clone
 * cada ícone recebe o desenho do símbolo direto.
 */
async function capturarTela(frame: HTMLIFrameElement, nome: string) {
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) throw new Error('A tela ainda não carregou.')
  const alvo = (doc.querySelector('#mainContent') as HTMLElement | null) || doc.body
  const { default: html2canvas } = await import('html2canvas')
  const fundo = win.getComputedStyle(doc.body).backgroundColor || '#f4f6fa'
  const canvas = await html2canvas(alvo, {
    backgroundColor: fundo,
    scale: 2,
    useCORS: true,
    logging: false,
    width: alvo.scrollWidth,
    height: alvo.scrollHeight,
    windowWidth: doc.documentElement.clientWidth,
    windowHeight: alvo.scrollHeight,
    scrollX: 0,
    scrollY: 0,
    onclone: (clone) => {
      // Os <link> de CSS são relativos ao iframe e não carregam no clone: embute o CSS já carregado
      const css = Array.from(doc.styleSheets)
        .map((sh) => {
          try { return Array.from(sh.cssRules).map((r) => r.cssText).join('\n') } catch { return '' }
        })
        .join('\n')
      clone.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove())
      const st = clone.createElement('style')
      st.textContent = css
      clone.head.appendChild(st)
      const cwin = clone.defaultView
      clone.querySelectorAll('svg').forEach((svg) => {
        const use = svg.querySelector('use')
        const ref = use?.getAttribute('href') || use?.getAttribute('xlink:href')
        if (!use || !ref?.startsWith('#')) return
        const sym = clone.getElementById(ref.slice(1))
        if (!sym) return
        const r = svg.getBoundingClientRect()
        const cor = cwin ? cwin.getComputedStyle(svg).color : ''
        svg.setAttribute('viewBox', sym.getAttribute('viewBox') || '0 0 256 256')
        svg.setAttribute('width', String(r.width || 16))
        svg.setAttribute('height', String(r.height || 16))
        if (cor) svg.setAttribute('fill', cor)
        svg.innerHTML = sym.innerHTML
      })
      // Botões flutuantes / menu do celular não entram na imagem
      clone.querySelectorAll<HTMLElement>('#headShotBtn, #headTxBtn, #periodNow, .fab, .tabbar').forEach((el) => { el.style.display = 'none' })
    },
  })
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
  if (!blob) throw new Error('Não foi possível gerar a imagem.')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nome.replace(/[\\/:*?"<>|]+/g, '-')}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function mensagemDe(e: unknown, padrao: string) {
  const o = e as { message?: string; error?: string } | null
  return (e instanceof Error && e.message) || o?.message || o?.error || padrao
}

/**
 * Controle Financeiro Pessoal — UI em public/sistemas/financeiro-pessoal/ carregada em iframe
 * (modo banco: ?remote=1). Os dados ficam nas tabelas fp_* do Nerites; esta página faz a ponte:
 *   iframe → fp-pronto / fp-persist / fp-file-put / fp-file-get / fp-sair / fp-trocar-sistema
 *   página → fp-user / fp-hydrate / fp-persist-ok|erro / fp-file-ok|data|erro
 */
export function FinanceiroPessoalPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [pronto, setPronto] = useState(false)
  const [erroSync, setErroSync] = useState('')
  const neritesAdmin = hasRole(profile, 'admin')
  // Admin aqui dentro (cria/edita/dispensa tarefas): admin do Nerites ou nível "admin" liberado em /admin.
  // Nível "editor" só dá baixa nas tarefas.
  const admin = neritesAdmin || isAdminNoSiteExterno(profile, 'financeiro-pessoal')
  const nome = profile?.nome || 'Usuário'
  const userId = profile?.id || ''

  const linhas = useRef<FpRows | null>(null) // último estado sincronizado com o banco
  const salvando = useRef(false)
  const pendente = useRef<{ payload: FpState; requestId?: string } | null>(null)
  const hidratou = useRef(false)

  function postar(msg: Record<string, unknown>) {
    frameRef.current?.contentWindow?.postMessage(msg, window.location.origin)
  }

  function enviarUsuario() {
    postar({ type: 'fp-user', nome, neritesAdmin, admin, userId })
  }

  async function hidratar() {
    if (salvando.current || pendente.current) return
    try {
      const { estado, linhas: l } = await carregarFinanceiroPessoal()
      if (salvando.current || pendente.current) return // chegou um salvamento no meio
      linhas.current = l
      setErroSync('')
      postar({ type: 'fp-hydrate', payload: estado })
    } catch (e) {
      setErroSync(mensagemDe(e, 'Falha ao carregar os dados do banco.'))
    } finally {
      if (!hidratou.current) {
        hidratou.current = true
        setPronto(true)
      }
    }
  }

  async function processarFila() {
    if (salvando.current) return
    const item = pendente.current
    if (!item) return
    pendente.current = null
    salvando.current = true
    let falhou = false
    try {
      if (!linhas.current) throw new Error('Os dados ainda não foram carregados do banco.')
      linhas.current = await salvarFinanceiroPessoal(linhas.current, item.payload, { userName: nome })
      setErroSync('')
      postar({ type: 'fp-persist-ok', requestId: item.requestId })
    } catch (e) {
      falhou = true
      const msg = mensagemDe(e, 'Falha ao salvar no banco.')
      console.error('[financeiro-pessoal] persist', e)
      setErroSync(msg)
      postar({ type: 'fp-persist-erro', requestId: item.requestId, erro: msg })
    } finally {
      salvando.current = false
    }
    if (falhou) {
      // Recarrega do banco para a tela mostrar o que realmente ficou salvo
      pendente.current = null
      void hidratar()
      return
    }
    if (pendente.current) void processarFila()
  }

  useEffect(() => {
    async function aoMensagem(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return
      if (ev.source !== frameRef.current?.contentWindow) return
      const dados = (ev.data ?? {}) as FpMensagem

      if (dados.type === 'fp-pronto') {
        enviarUsuario()
        void hidratar()
        return
      }
      if (dados.type === 'fp-capture') {
        try {
          if (!frameRef.current) throw new Error('A tela ainda não carregou.')
          await capturarTela(frameRef.current, dados.nome || 'Financeiro pessoal')
          postar({ type: 'fp-capture-done' })
        } catch (e) {
          console.error('[financeiro-pessoal] captura', e)
          postar({ type: 'fp-capture-done', erro: mensagemDe(e, 'Não foi possível salvar a imagem.') })
        }
        return
      }
      if (dados.type === 'fp-sair') {
        void signOut()
        return
      }
      if (dados.type === 'fp-trocar-sistema') {
        clearSite()
        navigate('/login')
        return
      }
      if (dados.type === 'fp-persist' && dados.payload) {
        if (!userId) {
          postar({ type: 'fp-persist-erro', requestId: dados.requestId, erro: 'Sessão expirada. Entre de novo.' })
          return
        }
        // Só o estado mais recente importa: substitui o que estiver esperando na fila
        pendente.current = { payload: dados.payload, requestId: dados.requestId }
        void processarFila()
        return
      }
      if (dados.type === 'fp-file-put' && dados.file && dados.requestId && dados.entidadeId) {
        try {
          const id = await enviarComprovante(dados.file, dados.name || 'comprovante', dados.entidadeId)
          postar({ type: 'fp-file-ok', requestId: dados.requestId, id })
        } catch (e) {
          postar({ type: 'fp-file-erro', requestId: dados.requestId, erro: mensagemDe(e, 'Falha no envio do comprovante.') })
        }
        return
      }
      if (dados.type === 'fp-file-get' && dados.id && dados.requestId) {
        try {
          const arq = await baixarComprovante(dados.id)
          postar({ type: 'fp-file-data', requestId: dados.requestId, blob: arq.blob, name: arq.nome, mime: arq.mime, size: arq.tamanho })
        } catch (e) {
          postar({ type: 'fp-file-erro', requestId: dados.requestId, erro: mensagemDe(e, 'Falha ao baixar o comprovante.') })
        }
      }
    }
    window.addEventListener('message', aoMensagem)
    enviarUsuario()
    return () => window.removeEventListener('message', aoMensagem)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, neritesAdmin, admin, userId, navigate, signOut])

  // Ao voltar para a aba, busca o que outras pessoas lançaram (sem atropelar salvamento em andamento)
  useEffect(() => {
    if (!pronto) return
    const sincronizar = () => {
      if (document.visibilityState === 'visible') void hidratar()
    }
    window.addEventListener('focus', sincronizar)
    document.addEventListener('visibilitychange', sincronizar)
    return () => {
      window.removeEventListener('focus', sincronizar)
      document.removeEventListener('visibilitychange', sincronizar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto])

  return (
    <div className="mr-demo">
      <div className="mr-demo-stage">
        {!pronto ? (
          <div className="mr-demo-loading" aria-live="polite">
            <Spinner size={36} />
            Carregando controle financeiro…
          </div>
        ) : null}
        {erroSync && pronto ? (
          <div
            role="alert"
            style={{
              position: 'absolute', right: 16, bottom: 16, zIndex: 3, maxWidth: 420,
              background: '#fdeceb', color: '#a3241d', border: '1px solid #f3c4c0', borderRadius: 8,
              padding: '10px 36px 10px 12px', fontSize: 13, lineHeight: 1.45, boxShadow: '0 6px 20px rgba(0,0,0,.12)',
            }}
          >
            {erroSync}
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setErroSync('')}
              style={{ position: 'absolute', top: 6, right: 8, border: 0, background: 'none', color: 'inherit', fontSize: 16, cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        ) : null}
        <iframe
          ref={frameRef}
          className={`mr-demo-frame${pronto ? ' is-ready' : ''}`}
          title="Controle Financeiro Pessoal"
          src="/sistemas/financeiro-pessoal/index.html?v=48&remote=1"
          onLoad={() => window.setTimeout(() => setPronto(true), 8000)}
        />
      </div>
    </div>
  )
}
