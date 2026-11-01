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
