import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import {
  carregarFinanceiro,
  definirCompetencia,
  excluirLancamento,
  listarProposicoes,
  mudarStatusLancamento,
  salvarInfoEquipe,
  salvarLancamento,
  type FinLancamentoEntrada,
  type ProposicaoMandato,
} from '../lib/gabinete'
import {
  buscarFichasPorNome,
  carregarResumoFichas,
  chaveLider,
  listarLiderancasNerites,
  type FichaBusca,
  type LiderPainel,
  type ResumoFichas,
} from '../lib/mandatoResumo'
import { writeSite } from '../lib/sites'

const fmt = new Intl.NumberFormat('pt-BR')
const CHAVE_ATENDIDOS = 'alimentacao_mandato_atendidos'
const CHAVE_AGENDA = 'alimentacao_mandato_agenda'

type PainelWin = Window & {
  __MANDATO__?: Record<string, unknown>
  __mandatoApp?: { setState: (patch: Record<string, unknown>) => void; atualizarBusca?: () => void; flash?: (t: string) => void }
}

type FinMensagem = {
  type?: string
  lancamento?: FinLancamentoEntrada
  id?: string
  status?: string
  pagamento?: { empenho: string; num_pagamento: string; data: string; competencia: string | null }
  info?: { matricula: string; funcao_real?: string; telefone?: string; indicado_por?: string; observacao?: string }
}

type Feed = ReturnType<typeof montarFeed>

function statusCurto(andamento: string | null) {
  const texto = (andamento || '').trim()
  if (!texto) return 'Protocolado'
  if (/ordem do dia/i.test(texto)) return 'Em pauta'
  if (/sancion/i.test(texto)) return 'Sancionado'
  if (/aprovad/i.test(texto)) return 'Aprovado'
  return 'Em tramitação'
}

function hoje() {
  return new Intl.DateTimeFormat('pt-BR').format(new Date())
}

function lerJson<T>(chave: string, vazio: T): T {
  try {
    const bruto = localStorage.getItem(chave)
    return bruto ? JSON.parse(bruto) as T : vazio
  } catch {
    return vazio
  }
}

type AgendaEv = { id: string; h: string; t: string; l: string; tipo: string; bg: string; c: string }
type AgendaDia = { d: string; w: string; ev: AgendaEv[] }

function origemFicha(pessoa: FichaBusca) {
  if (pessoa.zona && pessoa.secao) return `Zona ${pessoa.zona} · Seção ${pessoa.secao}`
  return 'Ficha Nerites'
}

function tuplaCidadao(pessoa: FichaBusca) {
  return [pessoa.n, pessoa.telefone || '—', pessoa.bairro || '—', origemFicha(pessoa), pessoa.lider || '—', 0, 0, hoje(), pessoa.id]
}

function tuplaLider(lider: LiderPainel, fichas: number) {
  return [lider.nome, 'Liderança', lider.bairro || '—', fichas, 0, hoje(), lider.telefone || 'Nerites']
}

function normalizarAgenda(lista: unknown[]): AgendaDia[] {
  return lista.map((item, dia) => {
    const day = item as Partial<AgendaDia>
    const ev = (day.ev || []).map((compromisso, indice) => ({
      ...compromisso,
      id: compromisso.id || `ag-${dia}-${indice}-${compromisso.h || ''}`,
    }))
    return { d: day.d || '', w: day.w || '', ev }
  })
}

function compromissoDe(pessoa: { id?: string; n?: string; sub?: string }) {
  const data = new Date()
  const semana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  return {
    d: String(data.getDate()).padStart(2, '0'),
    w: semana[data.getDay()],
    ev: [{
      id: pessoa.id ? `ag-${pessoa.id}-${data.getTime()}` : `ag-${data.getTime()}`,
      h: data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      t: 'Atendimento',
      l: [pessoa.n, pessoa.sub].filter(Boolean).join(' · '),
      tipo: 'Comunidade',
      bg: '#E5F5EB',
      c: '#157A3E',
    }],
  }
}

function montarFeed(resumo: ResumoFichas, proposicoes: ProposicaoMandato[], lideres: LiderPainel[]) {
  const max = resumo.ranking[0]?.fichas || 1
  const bairros = resumo.ranking.map((bairro) => ({
    n: bairro.nome,
    reg: 'São Luís',
    v: bairro.fichas,
    res: Math.max(1, Math.round((bairro.fichas / max) * 100)),
    lid: bairro.liderancas,
  }))
  const linha = (item: ProposicaoMandato) => [
    item.identificacao,
    item.assunto,
    statusCurto(item.ultimo_andamento),
    item.ultimo_andamento || '',
  ]
  const pl = proposicoes.filter((item) => !item.tipo.toLowerCase().includes('requerimento')).map(linha)
  const req = proposicoes.filter((item) => item.tipo.toLowerCase().includes('requerimento')).map(linha)
  const props = proposicoes.slice(0, 4).map((item) => ({
    num: item.identificacao,
    ementa: item.assunto,
    status: statusCurto(item.ultimo_andamento),
  }))
  const atendidos = lerJson<FichaBusca[]>(CHAVE_ATENDIDOS, [])
  return {
    cidadaos: fmt.format(resumo.cidadaos),
    bairrosN: fmt.format(resumo.bairros),
    propsTotal: fmt.format(proposicoes.length),
    cidResumo: `${fmt.format(resumo.cidadaos)} cadastros · ${fmt.format(resumo.bairros)} bairros`,
    maxBairro: max,
    bairros,
    props,
    propsByTab: { pl, req, ind: [] as string[][] },
    propStats: [
      { v: fmt.format(pl.length), l: 'Projetos de Lei' },
      { v: '0', l: 'Indicações' },
      { v: fmt.format(req.length), l: 'Requerimentos' },
      { v: fmt.format(proposicoes.filter((item) => statusCurto(item.ultimo_andamento) === 'Sancionado').length), l: 'Leis sancionadas' },
    ],
    cidadoes: atendidos.map(tuplaCidadao),
    lideres: lideres.map((lider) => tuplaLider(lider, resumo.fichasPorLider[chaveLider(lider.nome)] || 0)),
    agenda: normalizarAgenda(lerJson<unknown[]>(CHAVE_AGENDA, [])),
    busca: [] as FichaBusca[],
  }
}

export function PainelMandatoPage() {
  const { profile, signOut } = useAuth()
  const admin = hasRole(profile, 'admin')
  const frame = useRef<HTMLIFrameElement>(null)
  const feed = useRef<Feed | null>(null)
  const limpouDemo = useRef(false)
  const financeiro = useRef<Record<string, unknown> | null>(null)
  const finErro = useRef<string>('')

  function avisar(texto: string) {
    const janela = frame.current?.contentWindow as PainelWin | null
    janela?.__mandatoApp?.flash?.(texto)
  }

  async function recarregarFinanceiro() {
    try {
      financeiro.current = await carregarFinanceiro()
      finErro.current = ''
    } catch (e) {
      finErro.current = e instanceof Error ? e.message : 'Falha ao carregar o financeiro.'
    }
    publicar()
  }

  function publicar() {
    const janela = frame.current?.contentWindow as PainelWin | null
    if (!janela) return
    janela.__MANDATO__ = feed.current ?? {
      cidadoes: [],
      lideres: [],
      agenda: [],
      bairros: [],
      props: [],
      propsByTab: { pl: [], req: [], ind: [] },
      busca: [],
      cidadaos: '…',
      bairrosN: '…',
      propsTotal: '…',
      cidResumo: 'carregando fichas…',
    }
    janela.__MANDATO__.fin = financeiro.current
    janela.__MANDATO__.finErro = finErro.current
    const patch: Record<string, unknown> = { real: Date.now() }
    if (!limpouDemo.current) {
      patch.dem = []
      limpouDemo.current = true
    }
    janela.__mandatoApp?.setState(patch)
    janela.__mandatoApp?.atualizarBusca?.()
  }

  useEffect(() => {
    let vivo = true
    Promise.all([carregarResumoFichas(), listarProposicoes(), listarLiderancasNerites()])
      .then(([resumo, lista, lideres]) => {
        if (!vivo) return
        feed.current = montarFeed(resumo, lista.proposicoes, lideres)
        publicar()
      })
      .catch(() => {
        /* o layout continua; as listas inventadas não voltam */
      })
    void recarregarFinanceiro()
    return () => { vivo = false }
  }, [])

  // Mensagens do menu Financeiro (iframe -> página): grava pela ponte e recarrega
  useEffect(() => {
    async function aoMensagemFin(evento: MessageEvent) {
      if (evento.origin !== window.location.origin) return
      const d = evento.data as FinMensagem
      if (!d?.type || !d.type.startsWith('mandato-fin-')) return
      try {
        if (d.type === 'mandato-fin-salvar' && d.lancamento) {
          await salvarLancamento(d.lancamento)
          avisar(d.lancamento.id ? 'Lançamento atualizado' : 'Despesa lançada')
        } else if (d.type === 'mandato-fin-excluir' && d.id) {
          await excluirLancamento(d.id)
          avisar('Lançamento excluído')
        } else if (d.type === 'mandato-fin-status' && d.id && d.status) {
          await mudarStatusLancamento(d.id, d.status)
          avisar('Situação atualizada')
        } else if (d.type === 'mandato-fin-competencia' && d.pagamento) {
          await definirCompetencia(d.pagamento)
          avisar('Reembolso vinculado ao mês')
        } else if (d.type === 'mandato-fin-equipe' && d.info?.matricula) {
          await salvarInfoEquipe(d.info)
          avisar('Dados da pessoa salvos')
        } else if (d.type === 'mandato-fin-recarregar') {
          avisar('Atualizando…')
        } else {
          return
        }
        await recarregarFinanceiro()
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'Não foi possível salvar.')
      }
    }
    window.addEventListener('message', aoMensagemFin)
    return () => window.removeEventListener('message', aoMensagemFin)
  }, [])

  useEffect(() => {
    function aoMensagem(evento: MessageEvent) {
      if (evento.origin !== window.location.origin) return
      const data = evento.data as { type?: string; q?: string; pessoa?: FichaBusca; alvo?: string; id?: string }
      if (!data?.type) return
      const painel = feed.current
      if (data.type !== 'mandato-buscar' && !painel) return
      if (data.type === 'mandato-buscar') {
        buscarFichasPorNome(String(data.q || ''))
          .then((lista) => {
            if (!feed.current) return
            feed.current.busca = lista
            publicar()
          })
          .catch(() => undefined)
        return
      }
      if (data.type === 'mandato-vincular' && data.pessoa?.id) {
        const atual = lerJson<FichaBusca[]>(CHAVE_ATENDIDOS, [])
        if (!atual.some((item) => item.id === data.pessoa?.id)) atual.unshift(data.pessoa)
        localStorage.setItem(CHAVE_ATENDIDOS, JSON.stringify(atual.slice(0, 200)))
        if (!painel) return
        painel.cidadoes = atual.slice(0, 200).map(tuplaCidadao)
        painel.busca = []
        publicar()
        return
      }
      if (data.type === 'mandato-excluir' && data.id) {
        if (!painel) return
        if (data.alvo === 'cidadao') {
          const atual = lerJson<FichaBusca[]>(CHAVE_ATENDIDOS, []).filter((item) => item.id !== data.id)
          localStorage.setItem(CHAVE_ATENDIDOS, JSON.stringify(atual))
          painel.cidadoes = atual.map(tuplaCidadao)
        }
        if (data.alvo === 'agenda') {
          const agenda = (painel.agenda as AgendaDia[])
            .map((dia) => ({ ...dia, ev: dia.ev.filter((ev) => ev.id !== data.id) }))
            .filter((dia) => dia.ev.length > 0)
          localStorage.setItem(CHAVE_AGENDA, JSON.stringify(agenda))
          painel.agenda = agenda
        }
        publicar()
        return
      }
      if (data.type === 'mandato-agenda' && data.pessoa?.n) {
        if (!painel) return
        const agenda = normalizarAgenda(lerJson<unknown[]>(CHAVE_AGENDA, []))
        agenda.unshift(compromissoDe(data.pessoa))
        localStorage.setItem(CHAVE_AGENDA, JSON.stringify(agenda.slice(0, 60)))
        painel.agenda = agenda.slice(0, 60)
        painel.busca = []
        publicar()
      }
    }
    window.addEventListener('message', aoMensagem)
    return () => window.removeEventListener('message', aoMensagem)
  }, [])

  return (
    <div className="mr-demo">
      <header className="mr-demo-bar">
        <span>Painel do Mandato</span>
        <div className="mr-demo-actions">
          {admin ? (
            <>
              <Link to="/" onClick={() => writeSite('nerites')}>Sistema Nerites</Link>
              <Link to="/mr-terceiriza" onClick={() => writeSite('mr-terceiriza')}>Empresas</Link>
              <Link to="/assessoria-mb" onClick={() => writeSite('assessoria-mb')}>Assessoria MB</Link>
            </>
          ) : null}
          <button type="button" onClick={() => void signOut()}>Sair</button>
        </div>
      </header>
      <iframe
        ref={frame}
        className="mr-demo-frame"
        title="Painel do Mandato"
        src="/painel-do-mandato/index.html"
        onLoad={publicar}
      />
    </div>
  )
}
