import { supabase } from './supabase'

export type PessoaNerites = {
  nerites_id: string
  tipo: 'cidadao' | 'lideranca'
  nome: string
  telefone: string | null
  bairro: string | null
  lider: string | null
}

async function ponte(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão inválida. Entre de novo.')
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Falha na ponte com o Gabinete.')
  return body
}

/** Busca no Nerites (banco pago). Não grava nada no Gabinete. */
export function buscarNoNerites(tipo: 'cidadaos' | 'liderancas', q: string) {
  const params = new URLSearchParams({ recurso: tipo, q })
  return ponte(`/api/gabinete?${params}`) as Promise<{ pessoas: PessoaNerites[] }>
}

export type ProposicaoMandato = {
  id: number
  identificacao: string
  tipo: string
  assunto: string
  url: string
  ultimo_andamento: string | null
  data_ultimo_andamento: string | null
  autores: { nome: string; partido?: string | null }[]
  documentos: { titulo: string; url: string }[]
  tramitacoes: { data: string; andamento: string }[]
}

function normalizarProposicao(row: Record<string, unknown>): ProposicaoMandato {
  const trams = (row.tramitacoes || row.proposicoes_tramitacoes || []) as Record<string, unknown>[]
  const docs = (row.documentos || row.proposicoes_documentos || []) as Record<string, unknown>[]
  const autores = (row.autores || row.proposicoes_autores || []) as Record<string, unknown>[]
  return {
    id: Number(row.id),
    identificacao: String(row.identificacao || ''),
    tipo: String(row.tipo || ''),
    assunto: String(row.assunto || ''),
    url: String(row.url || ''),
    ultimo_andamento: row.ultimo_andamento ? String(row.ultimo_andamento) : null,
    data_ultimo_andamento: row.data_ultimo_andamento ? String(row.data_ultimo_andamento) : null,
    autores: autores.map((a) => ({ nome: String(a.nome || ''), partido: a.partido ? String(a.partido) : null })),
    documentos: docs.map((d) => ({
      titulo: String(d.titulo || 'Documento'),
      url: String(d.url || d.download_url || ''),
    })),
    tramitacoes: trams.map((t) => ({
      data: String(t.data || t.data_andamento || ''),
      andamento: String(t.andamento || ''),
    })),
  }
}

async function lerProposicoesGabinete(): Promise<ProposicaoMandato[]> {
  const url = String(import.meta.env.VITE_GABINETE_URL || '').replace(/\/$/, '')
  const key = String(import.meta.env.VITE_GABINETE_ANON_KEY || '')
  if (!url || !key) return []
  const select = 'id,identificacao,tipo,assunto,url,ultimo_andamento,data_ultimo_andamento,proposicoes_autores(nome,partido),proposicoes_documentos(titulo,url),proposicoes_tramitacoes(ordem,data_andamento,andamento)'
  const res = await fetch(`${url}/rest/v1/proposicoes?select=${encodeURIComponent(select)}&order=ano.desc,identificacao.desc&limit=200`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data.map((row) => normalizarProposicao(row as Record<string, unknown>)) : []
}

/** Proposições do vereador. Usa o Gabinete quando houver linhas; senão o arquivo da pasta. */
export async function listarProposicoes(): Promise<{ fonte: string; proposicoes: ProposicaoMandato[] }> {
  try {
    const body = await ponte('/api/gabinete?recurso=proposicoes') as { fonte?: string; proposicoes?: Record<string, unknown>[] }
    const rows = Array.isArray(body.proposicoes) ? body.proposicoes.map(normalizarProposicao) : []
    if (rows.length) return { fonte: body.fonte || 'gabinete', proposicoes: rows }
  } catch {
    /* o Vite local não publica /api */
  }
  try {
    const diretas = await lerProposicoesGabinete()
    if (diretas.length) return { fonte: 'gabinete', proposicoes: diretas }
  } catch {
    /* leitura direta fechada: usa o arquivo já extraído */
  }
  const res = await fetch('/data/proposicoes-mandato.json')
  if (!res.ok) throw new Error('Não foi possível carregar as proposições.')
  const data = await res.json()
  const lista = Array.isArray(data) ? data : []
  return { fonte: 'arquivo', proposicoes: lista.map((row) => normalizarProposicao(row as Record<string, unknown>)) }
}

/** Grava no Gabinete só esta pessoa, com o id do Nerites. */
export function vincularPessoa(pessoa: PessoaNerites) {
  return ponte('/api/gabinete', {
    method: 'POST',
    body: JSON.stringify({ recurso: 'vincular', ...pessoa }),
  })
}

// ===================== FINANCEIRO DO MANDATO =====================
// Tudo passa pela ponte /api/gabinete (o navegador não usa a chave do projeto GABINETE).

export type FinLancamentoEntrada = {
  id?: string
  data: string
  competencia: string
  origem: 'VIEP' | 'PROPRIO' | 'OUTRO'
  categoria: string
  descricao: string
  fornecedor?: string
  documento?: string
  valor: number | string
  status?: string
  observacao?: string
}

/** Resumo completo do financeiro (meses, lançamentos, pagamentos da Câmara, equipe). */
export function carregarFinanceiro() {
  return ponte('/api/gabinete?recurso=financeiro') as Promise<Record<string, unknown>>
}

/** Puxa folha e despesas dos portais oficiais para o Gabinete (até 4 meses por chamada). */
export function sincronizarFinanceiro(forcar = false) {
  return postFin('financeiro-sincronizar', { forcar: forcar ? 1 : 0 }) as Promise<{
    ok?: boolean
    folha?: { status?: string; meses?: string[]; faltam?: number; erro?: string }
    despesas?: { status?: string; erro?: string; empenhos?: number; novosPagamentos?: number }
  }>
}

/**
 * Se ainda não houver meses no resumo, roda a carga inicial em loop
 * (a API grava no máximo 4 meses por execução). Só admin/diretoria sincronizam.
 */
export async function garantirCargaFinanceiro() {
  let resumo = await carregarFinanceiro()
  const qtdMeses = () => (Array.isArray(resumo.meses) ? resumo.meses.length : 0)
  if (qtdMeses() > 0) return resumo
  if (!resumo.podeEditar) return resumo

  for (let i = 0; i < 12; i++) {
    const r = await sincronizarFinanceiro(false)
    if (r.folha?.erro) throw new Error(r.folha.erro)
    if (r.despesas?.erro) throw new Error(r.despesas.erro)
    const faltam = Number(r.folha?.faltam)
    if (Number.isFinite(faltam) && faltam <= 0) break
    if (!r.folha?.meses?.length && !String(r.folha?.status || '').includes('gravada')) break
  }
  resumo = await carregarFinanceiro()
  return resumo
}

function postFin(recurso: string, dados: Record<string, unknown>) {
  return ponte('/api/gabinete', { method: 'POST', body: JSON.stringify({ recurso, ...dados }) })
}

export const salvarLancamento = (l: FinLancamentoEntrada) => postFin('financeiro-lancamento', l)
export const excluirLancamento = (id: string) => postFin('financeiro-excluir', { id })
export const mudarStatusLancamento = (id: string, status: string) => postFin('financeiro-status', { id, status })
export const definirCompetencia = (p: { empenho: string; num_pagamento: string; data: string; competencia: string | null }) =>
  postFin('financeiro-competencia', p)
export const salvarInfoEquipe = (i: { matricula: string; funcao_real?: string; telefone?: string; indicado_por?: string; observacao?: string }) =>
  postFin('financeiro-equipe', i)
