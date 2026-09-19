import { supabase } from './supabase'
import type { Cadastro, Coordenador, Lider } from '../types'

export type AtivacaoTipo = 'eleitor' | 'lideranca' | 'coordenador'

export type AtivacaoPessoa = {
  key: string
  id: string
  tipo: AtivacaoTipo
  tipoLabel: string
  nome: string
  titulo: string
  zona: string
  bairro: string
  carros_adesivados: number
  adesivos_casa: number
  postagens: number
  postagem_links: string[]
  ativacao_notas: string
  ativacao_em: string | null
}

function toQty(value: unknown) {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function toLinks(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? '').trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v ?? '').trim()).filter(Boolean)
      }
    } catch {
      return []
    }
  }
  return []
}

export function casaSim(value: unknown) {
  return toQty(value) > 0
}

function fromCadastro(c: Cadastro): AtivacaoPessoa {
  return {
    key: `eleitor:${c.id}`,
    id: c.id,
    tipo: 'eleitor',
    tipoLabel: 'Eleitor',
    nome: c.nome_completo ?? '',
    titulo: c.titulo ?? '',
    zona: c.zona ?? '',
    bairro: c.bairro ?? '',
    carros_adesivados: toQty(c.carros_adesivados),
    adesivos_casa: toQty(c.adesivos_casa),
    postagens: toQty(c.postagens),
    postagem_links: toLinks(c.postagem_links),
    ativacao_notas: c.ativacao_notas ?? '',
    ativacao_em: c.ativacao_em ?? null,
  }
}

function fromLider(l: Lider): AtivacaoPessoa {
  return {
    key: `lideranca:${l.id}`,
    id: l.id,
    tipo: 'lideranca',
    tipoLabel: 'Liderança',
    nome: l.nome ?? '',
    titulo: '',
    zona: '',
    bairro: '',
    carros_adesivados: toQty(l.carros_adesivados),
    adesivos_casa: toQty(l.adesivos_casa),
    postagens: toQty(l.postagens),
    postagem_links: toLinks(l.postagem_links),
    ativacao_notas: l.ativacao_notas ?? '',
    ativacao_em: l.ativacao_em ?? null,
  }
}

function fromCoord(c: Coordenador): AtivacaoPessoa {
  return {
    key: `coordenador:${c.id}`,
    id: c.id,
    tipo: 'coordenador',
    tipoLabel: 'Coordenador',
    nome: c.nome ?? '',
    titulo: '',
    zona: '',
    bairro: '',
    carros_adesivados: toQty(c.carros_adesivados),
    adesivos_casa: toQty(c.adesivos_casa),
    postagens: toQty(c.postagens),
    postagem_links: toLinks(c.postagem_links),
    ativacao_notas: c.ativacao_notas ?? '',
    ativacao_em: c.ativacao_em ?? null,
  }
}

const CADASTRO_SELECT =
  'id, nome_completo, titulo, zona, bairro, carros_adesivados, adesivos_casa, postagens, postagem_links, ativacao_notas, ativacao_em'

export async function searchAtivacaoPessoas(term: string, limit = 12): Promise<AtivacaoPessoa[]> {
  const q = term.trim()
  if (q.length < 2) return []

  const digits = q.replace(/\D/g, '')
  const [cadRes, lidRes, coordRes] = await Promise.all([
    supabase
      .from('cadastros')
      .select(CADASTRO_SELECT)
      .or(
        digits.length >= 4
          ? `nome_completo.ilike.%${q}%,titulo.ilike.%${digits}%`
          : `nome_completo.ilike.%${q}%`,
      )
      .order('nome_completo')
      .limit(limit),
    supabase
      .from('lideres')
      .select('id, nome, carros_adesivados, adesivos_casa, postagens, postagem_links, ativacao_notas, ativacao_em')
      .eq('ativo', true)
      .ilike('nome', `%${q}%`)
      .order('nome')
      .limit(8),
    supabase
      .from('coordenadores')
      .select('id, nome, carros_adesivados, adesivos_casa, postagens, postagem_links, ativacao_notas, ativacao_em')
      .eq('ativo', true)
      .ilike('nome', `%${q}%`)
      .order('nome')
      .limit(8),
  ])

  const rows: AtivacaoPessoa[] = [
    ...((cadRes.data ?? []) as Cadastro[]).map(fromCadastro),
    ...((lidRes.data ?? []) as Lider[]).map(fromLider),
    ...((coordRes.data ?? []) as Coordenador[]).map(fromCoord),
  ]
  return rows.slice(0, limit)
}

export async function fetchAtivacaoPessoa(
  tipo: AtivacaoTipo,
  id: string,
): Promise<AtivacaoPessoa | null> {
  if (tipo === 'eleitor') {
    const { data } = await supabase.from('cadastros').select(CADASTRO_SELECT).eq('id', id).maybeSingle()
    return data ? fromCadastro(data as Cadastro) : null
  }
  if (tipo === 'lideranca') {
    const { data } = await supabase
      .from('lideres')
      .select('id, nome, carros_adesivados, adesivos_casa, postagens, postagem_links, ativacao_notas, ativacao_em')
      .eq('id', id)
      .maybeSingle()
    return data ? fromLider(data as Lider) : null
  }
  const { data } = await supabase
    .from('coordenadores')
    .select('id, nome, carros_adesivados, adesivos_casa, postagens, postagem_links, ativacao_notas, ativacao_em')
    .eq('id', id)
    .maybeSingle()
  return data ? fromCoord(data as Coordenador) : null
}

export type AtivacaoSaveInput = {
  carros_adesivados: number
  casa: boolean
  links: string[]
  notas: string
}

export async function saveAtivacao(
  tipo: AtivacaoTipo,
  id: string,
  input: AtivacaoSaveInput,
): Promise<{ error: string | null }> {
  const links = input.links.map((l) => l.trim()).filter(Boolean)
  const payload = {
    carros_adesivados: Math.max(0, Math.floor(Number(input.carros_adesivados) || 0)),
    adesivos_casa: input.casa ? 1 : 0,
    postagem_links: links,
    postagens: links.length,
    ativacao_notas: input.notas.trim() || null,
    ativacao_em: new Date().toISOString(),
  }

  const table = tipo === 'eleitor' ? 'cadastros' : tipo === 'lideranca' ? 'lideres' : 'coordenadores'
  const { error } = await supabase.from(table).update(payload).eq('id', id)
  return { error: error?.message ?? null }
}

export type AtivacaoListFilters = {
  search?: string
  tipo?: 'todos' | AtivacaoTipo
  status?: 'todos' | 'com_ativacao' | 'sem_ativacao' | 'com_carro' | 'casa_sim' | 'com_links'
  page?: number
  pageSize?: number
}

export type AtivacaoListResult = {
  items: AtivacaoPessoa[]
  total: number
}

function matchesStatus(p: AtivacaoPessoa, status: AtivacaoListFilters['status']) {
  if (!status || status === 'todos') return true
  const hasAny = p.carros_adesivados > 0 || p.adesivos_casa > 0 || p.postagem_links.length > 0
  if (status === 'com_ativacao') return hasAny
  if (status === 'sem_ativacao') return !hasAny
  if (status === 'com_carro') return p.carros_adesivados > 0
  if (status === 'casa_sim') return p.adesivos_casa > 0
  if (status === 'com_links') return p.postagem_links.length > 0
  return true
}

/** Lista unificada para o Painel (eleitores + equipe). Filtra em memória após fetch enxuto. */
export async function fetchAtivacaoPainel(filters: AtivacaoListFilters = {}): Promise<AtivacaoListResult> {
  const page = filters.page ?? 0
  const pageSize = filters.pageSize ?? 25
  const tipo = filters.tipo ?? 'todos'
  const q = (filters.search ?? '').trim().toLowerCase()
  const digits = q.replace(/\D/g, '')

  const loads: Promise<AtivacaoPessoa[]>[] = []

  if (tipo === 'todos' || tipo === 'eleitor') {
    loads.push(
      (async () => {
        const { data } = await supabase.from('cadastros').select(CADASTRO_SELECT).order('nome_completo')
        return ((data ?? []) as Cadastro[]).map(fromCadastro)
      })(),
    )
  }
  if (tipo === 'todos' || tipo === 'lideranca') {
    loads.push(
      (async () => {
        const { data } = await supabase
          .from('lideres')
          .select('id, nome, carros_adesivados, adesivos_casa, postagens, postagem_links, ativacao_notas, ativacao_em')
          .eq('ativo', true)
          .order('nome')
        return ((data ?? []) as Lider[]).map(fromLider)
      })(),
    )
  }
  if (tipo === 'todos' || tipo === 'coordenador') {
    loads.push(
      (async () => {
        const { data } = await supabase
          .from('coordenadores')
          .select('id, nome, carros_adesivados, adesivos_casa, postagens, postagem_links, ativacao_notas, ativacao_em')
          .eq('ativo', true)
          .order('nome')
        return ((data ?? []) as Coordenador[]).map(fromCoord)
      })(),
    )
  }

  const chunks = await Promise.all(loads)
  let items = chunks.flat()

  if (q) {
    items = items.filter((p) => {
      const nome = p.nome.toLowerCase()
      const titulo = p.titulo.toLowerCase()
      const bairro = p.bairro.toLowerCase()
      return (
        nome.includes(q)
        || bairro.includes(q)
        || (digits && titulo.includes(digits))
        || titulo.includes(q)
      )
    })
  }

  items = items.filter((p) => matchesStatus(p, filters.status))
  items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const total = items.length
  const start = page * pageSize
  return { items: items.slice(start, start + pageSize), total }
}

export async function fetchAtivacaoKpis() {
  const { items } = await fetchAtivacaoPainel({ page: 0, pageSize: 100000 })
  let carros = 0
  let casas = 0
  let postagens = 0
  let comAtivacao = 0
  for (const p of items) {
    carros += p.carros_adesivados
    if (p.adesivos_casa > 0) casas += 1
    postagens += p.postagem_links.length || p.postagens
    if (p.carros_adesivados > 0 || p.adesivos_casa > 0 || p.postagem_links.length > 0) comAtivacao += 1
  }
  return {
    totalPessoas: items.length,
    carros,
    casas,
    postagens,
    comAtivacao,
    pendentes: Math.max(0, items.length - comAtivacao),
  }
}
