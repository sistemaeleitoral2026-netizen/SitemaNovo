import { supabase } from './supabase'
import type { Cadastro, Coordenador, Lider, Profile } from '../types'

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
  telefone: string
  carros_adesivados: number
  adesivos_casa: number
  postagens: number
  postagem_links: string[]
  ativacao_notas: string
  ativacao_em: string | null
  contato_whatsapp: boolean
  diretoria_id: string | null
  coordenador: string
  lider: string
  operator_id: string | null
  coordenador_id: string | null
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

/** Só vale como Formigas se houve lançamento (ativacao_em). Evita lixo da antiga mobilização. */
function fromAtivacaoFields(row: {
  carros_adesivados?: unknown
  adesivos_casa?: unknown
  postagens?: unknown
  postagem_links?: unknown
  ativacao_notas?: unknown
  ativacao_em?: unknown
  contato_whatsapp?: unknown
}) {
  const ativacao_em = (row.ativacao_em as string | null | undefined) ?? null
  const launched = Boolean(ativacao_em)
  return {
    carros_adesivados: launched ? toQty(row.carros_adesivados) : 0,
    adesivos_casa: launched ? toQty(row.adesivos_casa) : 0,
    postagens: launched ? toQty(row.postagens) : 0,
    postagem_links: launched ? toLinks(row.postagem_links) : [],
    ativacao_notas: launched ? String(row.ativacao_notas ?? '') : '',
    ativacao_em,
    contato_whatsapp: launched ? Boolean(row.contato_whatsapp) : false,
  }
}

export function casaSim(value: unknown) {
  return toQty(value) > 0
}

function fromCadastro(c: Cadastro): AtivacaoPessoa {
  const ativ = fromAtivacaoFields(c)
  return {
    key: `eleitor:${c.id}`,
    id: c.id,
    tipo: 'eleitor',
    tipoLabel: 'Eleitor',
    nome: c.nome_completo ?? '',
    titulo: c.titulo ?? '',
    zona: c.zona ?? '',
    bairro: c.bairro ?? '',
    telefone: c.telefone ?? '',
    ...ativ,
    diretoria_id: c.diretoria_id ?? null,
    coordenador: (c.coordenador ?? '').trim(),
    lider: (c.lider ?? '').trim(),
    operator_id: c.operator_id ?? null,
    coordenador_id: null,
  }
}

function fromLider(l: Lider): AtivacaoPessoa {
  const ativ = fromAtivacaoFields(l)
  return {
    key: `lideranca:${l.id}`,
    id: l.id,
    tipo: 'lideranca',
    tipoLabel: 'Liderança',
    nome: l.nome ?? '',
    titulo: '',
    zona: '',
    bairro: '',
    telefone: l.telefone ?? '',
    ...ativ,
    diretoria_id: l.diretoria_id ?? null,
    coordenador: '',
    lider: l.nome ?? '',
    operator_id: null,
    coordenador_id: l.coordenador_id ?? null,
  }
}

function fromCoord(c: Coordenador): AtivacaoPessoa {
  const ativ = fromAtivacaoFields(c)
  return {
    key: `coordenador:${c.id}`,
    id: c.id,
    tipo: 'coordenador',
    tipoLabel: 'Coordenador',
    nome: c.nome ?? '',
    titulo: '',
    zona: '',
    bairro: '',
    telefone: '',
    ...ativ,
    diretoria_id: c.diretoria_id ?? null,
    coordenador: c.nome ?? '',
    lider: '',
    operator_id: null,
    coordenador_id: null,
  }
}

const CADASTRO_SELECT =
  'id, nome_completo, titulo, zona, bairro, telefone, carros_adesivados, adesivos_casa, postagens, postagem_links, ativacao_notas, ativacao_em, contato_whatsapp, diretoria_id, coordenador, lider, operator_id'

const LIDER_SELECT =
  'id, nome, telefone, carros_adesivados, adesivos_casa, postagens, postagem_links, ativacao_notas, ativacao_em, contato_whatsapp, diretoria_id, coordenador_id'

const COORD_SELECT =
  'id, nome, carros_adesivados, adesivos_casa, postagens, postagem_links, ativacao_notas, ativacao_em, contato_whatsapp, diretoria_id'

export async function searchAtivacaoPessoas(term: string, limit = 12): Promise<AtivacaoPessoa[]> {
  const q = term.trim()
  if (q.length < 2) return []

  const digits = q.replace(/\D/g, '')
  const digitSearch = digits.length >= 4
  const cadOr = digitSearch
    ? `nome_completo.ilike.%${q}%,cpf.ilike.%${digits}%,titulo.ilike.%${digits}%,telefone.ilike.%${digits}%`
    : `nome_completo.ilike.%${q}%`
  const liderOr = digitSearch
    ? `nome.ilike.%${q}%,telefone.ilike.%${digits}%`
    : `nome.ilike.%${q}%`

  const [cadRes, lidRes, coordRes] = await Promise.all([
    supabase
      .from('cadastros')
      .select(CADASTRO_SELECT)
      .or(cadOr)
      .order('nome_completo')
      .limit(limit),
    supabase
      .from('lideres')
      .select(LIDER_SELECT)
      .eq('ativo', true)
      .or(liderOr)
      .order('nome')
      .limit(8),
    supabase
      .from('coordenadores')
      .select(COORD_SELECT)
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
    const { data } = await supabase.from('lideres').select(LIDER_SELECT).eq('id', id).maybeSingle()
    return data ? fromLider(data as Lider) : null
  }
  const { data } = await supabase.from('coordenadores').select(COORD_SELECT).eq('id', id).maybeSingle()
  return data ? fromCoord(data as Coordenador) : null
}

export type AtivacaoSaveInput = {
  carros_adesivados: number
  casa: boolean
  links: string[]
  notas: string
  contato_whatsapp: boolean
}

export async function saveAtivacao(
  tipo: AtivacaoTipo,
  id: string,
  input: AtivacaoSaveInput,
): Promise<{ error: string | null }> {
  const links = input.links.map((l) => l.trim()).filter(Boolean)
  const carros = Math.max(0, Math.floor(Number(input.carros_adesivados) || 0))
  const casa = input.casa ? 1 : 0
  const notas = input.notas.trim() || null
  const contato = Boolean(input.contato_whatsapp)
  const hasLaunch = carros > 0 || casa > 0 || links.length > 0 || Boolean(notas) || contato
  const payload = {
    carros_adesivados: carros,
    adesivos_casa: casa,
    postagem_links: links,
    postagens: links.length,
    ativacao_notas: notas,
    ativacao_em: hasLaunch ? new Date().toISOString() : null,
    contato_whatsapp: contato,
  }

  const table = tipo === 'eleitor' ? 'cadastros' : tipo === 'lideranca' ? 'lideres' : 'coordenadores'
  const { error } = await supabase.from(table).update(payload).eq('id', id)
  if (!error) {
    await releaseAtivacaoClaim(tipo, id)
  }
  return { error: error?.message ?? null }
}

/** Reserva a próxima pessoa pendente (aleatória) e evita conflito entre formigas. */
export async function claimNextAtivacao(diretoriaId?: string | null): Promise<{
  pessoa: AtivacaoPessoa | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('claim_next_ativacao', {
    p_diretoria_id: diretoriaId || null,
  })
  if (error) {
    return { pessoa: null, error: error.message }
  }
  const row = Array.isArray(data) ? data[0] : data
  const tipo = (row?.out_tipo ?? row?.tipo) as AtivacaoTipo | undefined
  const id = (row?.out_pessoa_id ?? row?.pessoa_id) as string | undefined
  if (!tipo || !id) {
    return { pessoa: null, error: null }
  }
  const pessoa = await fetchAtivacaoPessoa(tipo, id)
  if (!pessoa) {
    return { pessoa: null, error: 'Pessoa não encontrada após o claim.' }
  }
  return { pessoa, error: null }
}

export async function releaseAtivacaoClaim(tipo: AtivacaoTipo, id: string): Promise<void> {
  await supabase.rpc('release_ativacao_claim', {
    p_tipo: tipo,
    p_pessoa_id: id,
  })
}

export type AtivacaoListFilters = {
  search?: string
  tipo?: 'todos' | AtivacaoTipo
  status?:
    | 'todos'
    | 'com_ativacao'
    | 'sem_ativacao'
    | 'com_carro'
    | 'casa_sim'
    | 'com_links'
    | 'contato_sim'
    | 'contato_nao'
  page?: number
  pageSize?: number
  diretoria_id?: string
  coordenador?: string
  coordenador_id?: string
  lider?: string
  lider_id?: string
  operator_id?: string
}

export type AtivacaoListResult = {
  items: AtivacaoPessoa[]
  total: number
}

export type AtivacaoTeamOptions = {
  diretorias: Profile[]
  coordenadores: Coordenador[]
  lideres: Lider[]
  nerites: Profile[]
}

export async function fetchAtivacaoTeamOptions(scopeDiretoriaId?: string | null): Promise<AtivacaoTeamOptions> {
  const [diretorias, coordenadores, lideres, nerites] = await Promise.all([
    fetchAllPaged<Profile>((from, to) => {
      let q = supabase.from('profiles').select('*').eq('role', 'diretoria').eq('ativo', true).order('nome')
      return q.range(from, to)
    }),
    fetchAllPaged<Coordenador>((from, to) => {
      let q = supabase.from('coordenadores').select('*').eq('ativo', true).order('nome')
      if (scopeDiretoriaId) q = q.eq('diretoria_id', scopeDiretoriaId)
      return q.range(from, to)
    }),
    fetchAllPaged<Lider>((from, to) => {
      let q = supabase.from('lideres').select('*').eq('ativo', true).order('nome')
      if (scopeDiretoriaId) q = q.eq('diretoria_id', scopeDiretoriaId)
      return q.range(from, to)
    }),
    fetchAllPaged<Profile>((from, to) => {
      let q = supabase.from('profiles').select('*').eq('role', 'operador').eq('ativo', true).order('nome')
      if (scopeDiretoriaId) q = q.eq('diretoria_id', scopeDiretoriaId)
      return q.range(from, to)
    }),
  ])

  return { diretorias, coordenadores, lideres, nerites }
}

function matchesStatus(p: AtivacaoPessoa, status: AtivacaoListFilters['status']) {
  if (!status || status === 'todos') return true
  const hasAny =
    p.carros_adesivados > 0
    || p.adesivos_casa > 0
    || p.postagem_links.length > 0
    || p.contato_whatsapp
  if (status === 'com_ativacao') return hasAny
  if (status === 'sem_ativacao') return !hasAny
  if (status === 'com_carro') return p.carros_adesivados > 0
  if (status === 'casa_sim') return p.adesivos_casa > 0
  if (status === 'com_links') return p.postagem_links.length > 0
  if (status === 'contato_sim') return p.contato_whatsapp
  if (status === 'contato_nao') return !p.contato_whatsapp
  return true
}

function matchesTeam(
  p: AtivacaoPessoa,
  filters: AtivacaoListFilters,
  coordById: Map<string, Coordenador>,
) {
  if (filters.diretoria_id && p.diretoria_id !== filters.diretoria_id) return false

  if (filters.coordenador_id || filters.coordenador) {
    const nome = (filters.coordenador ?? '').trim().toLowerCase()
    const id = filters.coordenador_id
    if (p.tipo === 'coordenador') {
      if (id && p.id !== id) return false
      if (!id && nome && p.nome.toLowerCase() !== nome) return false
    } else {
      const coordNome = p.coordenador.toLowerCase()
      const fromId = p.coordenador_id ? (coordById.get(p.coordenador_id)?.nome ?? '').toLowerCase() : ''
      const ok =
        (id && (p.coordenador_id === id || coordNome === nome || fromId === nome))
        || (!id && nome && (coordNome === nome || fromId === nome))
      if (!ok) return false
    }
  }

  if (filters.lider_id || filters.lider) {
    const nome = (filters.lider ?? '').trim().toLowerCase()
    const id = filters.lider_id
    if (p.tipo === 'lideranca') {
      if (id && p.id !== id) return false
      if (!id && nome && p.nome.toLowerCase() !== nome) return false
    } else if (p.tipo === 'coordenador') {
      return false
    } else {
      // Cadastros só guardam o nome da liderança — precisa do nome resolvido.
      if (!nome) return true
      if (p.lider.toLowerCase() !== nome) return false
    }
  }

  if (filters.operator_id) {
    if (p.tipo !== 'eleitor' || p.operator_id !== filters.operator_id) return false
  }

  return true
}

/** Supabase/PostgREST limita ~1000 linhas por request — pagina até esgotar. */
async function fetchAllPaged<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await run(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as T[]
    all.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return all
}

/** Lista unificada para o Painel (eleitores + equipe). Filtra em memória após fetch completo (paginado). */
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
        const rows = await fetchAllPaged<Cadastro>((from, to) => {
          let query = supabase.from('cadastros').select(CADASTRO_SELECT).order('nome_completo')
          if (filters.diretoria_id) query = query.eq('diretoria_id', filters.diretoria_id)
          if (filters.operator_id) query = query.eq('operator_id', filters.operator_id)
          return query.range(from, to)
        })
        return rows.map(fromCadastro)
      })(),
    )
  }
  if (tipo === 'todos' || tipo === 'lideranca') {
    loads.push(
      (async () => {
        const rows = await fetchAllPaged<Lider>((from, to) => {
          let query = supabase.from('lideres').select(LIDER_SELECT).eq('ativo', true).order('nome')
          if (filters.diretoria_id) query = query.eq('diretoria_id', filters.diretoria_id)
          return query.range(from, to)
        })
        return rows.map(fromLider)
      })(),
    )
  }
  if (tipo === 'todos' || tipo === 'coordenador') {
    loads.push(
      (async () => {
        const rows = await fetchAllPaged<Coordenador>((from, to) => {
          let query = supabase.from('coordenadores').select(COORD_SELECT).eq('ativo', true).order('nome')
          if (filters.diretoria_id) query = query.eq('diretoria_id', filters.diretoria_id)
          return query.range(from, to)
        })
        return rows.map(fromCoord)
      })(),
    )
  }

  const [chunks, coordsAll] = await Promise.all([
    Promise.all(loads),
    fetchAllPaged<Coordenador>((from, to) =>
      supabase.from('coordenadores').select('id, nome, diretoria_id, ativo').range(from, to),
    ),
  ])
  let items = chunks.flat()
  const coordById = new Map(coordsAll.map((c) => [c.id, c]))

  items = items.map((p) => {
    if (p.tipo !== 'lideranca' || !p.coordenador_id) return p
    const coord = coordById.get(p.coordenador_id)
    if (!coord) return p
    return { ...p, coordenador: coord.nome }
  })

  if (q) {
    items = items.filter((p) => {
      const nome = p.nome.toLowerCase()
      const titulo = p.titulo.toLowerCase()
      const bairro = p.bairro.toLowerCase()
      const telefone = (p.telefone ?? '').replace(/\D/g, '')
      return (
        nome.includes(q)
        || bairro.includes(q)
        || (digits && titulo.includes(digits))
        || titulo.includes(q)
        || (digits && telefone.includes(digits))
      )
    })
  }

  items = items.filter((p) => matchesStatus(p, filters.status))
  items = items.filter((p) => matchesTeam(p, filters, coordById))
  items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const total = items.length
  const start = page * pageSize
  return { items: items.slice(start, start + pageSize), total }
}

export async function fetchAtivacaoKpis(filters: AtivacaoListFilters = {}) {
  // Conta pessoas (não soma quantidades) para bater com os filtros do Painel.
  const { items } = await fetchAtivacaoPainel({
    ...filters,
    status: 'todos',
    page: 0,
    pageSize: 1_000_000,
  })
  let carros = 0
  let casas = 0
  let postagens = 0
  let whatsapp = 0
  let comAtivacao = 0
  for (const p of items) {
    if (p.carros_adesivados > 0) carros += 1
    if (p.adesivos_casa > 0) casas += 1
    if (p.postagem_links.length > 0 || p.postagens > 0) postagens += 1
    if (p.contato_whatsapp) whatsapp += 1
    if (
      p.carros_adesivados > 0
      || p.adesivos_casa > 0
      || p.postagem_links.length > 0
      || p.contato_whatsapp
    ) {
      comAtivacao += 1
    }
  }
  return {
    totalPessoas: items.length,
    carros,
    casas,
    postagens,
    whatsapp,
    comAtivacao,
    pendentes: Math.max(0, items.length - comAtivacao),
  }
}
