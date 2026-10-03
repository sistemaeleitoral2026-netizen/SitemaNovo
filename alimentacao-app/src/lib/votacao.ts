import { prepareImageForUpload } from './imageCompress'
import { sanitizeSearchTerm } from './search'
import { supabase } from './supabase'
import type { Cadastro } from '../types'

export const VOTACAO_FOTOS_BUCKET = 'votacao-fotos'

export type VotacaoHit = Pick<
  Cadastro,
  | 'id'
  | 'nome_completo'
  | 'titulo'
  | 'zona'
  | 'secao'
  | 'nome_mae'
  | 'data_nascimento'
  | 'telefone'
  | 'coordenador'
  | 'lider'
  | 'votou'
  | 'voto_foto_path'
  | 'voto_em'
  | 'voto_por'
  | 'diretoria_id'
>

export type VotacaoStatusFiltro = 'todos' | 'pendente' | 'votou' | 'nao'

export type VotacaoProgressoLider = {
  lider: string
  total: number
  pendente: number
  votou: number
  naoVotou: number
}

export type VotacaoProgresso = {
  coordenadorNome: string
  total: number
  pendente: number
  votou: number
  naoVotou: number
  porLider: VotacaoProgressoLider[]
}

const SELECT_COLS =
  'id,nome_completo,titulo,zona,secao,nome_mae,data_nascimento,telefone,coordenador,lider,votou,voto_foto_path,voto_em,voto_por,diretoria_id'

/** Sem colunas de voto — fallback se o SQL ainda não rodou. */
const SELECT_BASIC =
  'id,nome_completo,titulo,zona,secao,nome_mae,data_nascimento,telefone,coordenador,lider,diretoria_id'

const PAGE = 1000

function norm(s: string | null | undefined) {
  return (s ?? '').trim().toLowerCase()
}

/** Partículas que não entram no AND da busca por nome. */
const SEARCH_STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os'])

/** Tokens úteis da busca (nome em partes, zona/seção, etc.). */
function searchTokens(query: string): string[] {
  const raw = query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2)
  const meaningful = raw.filter((t) => !SEARCH_STOP.has(norm(t)))
  return meaningful.length ? meaningful : raw.slice(0, 1)
}

function searchableBlob(row: Pick<VotacaoHit, 'nome_completo' | 'nome_mae' | 'titulo' | 'lider' | 'zona' | 'secao'>) {
  return norm([row.nome_completo, row.nome_mae, row.titulo, row.lider, row.zona, row.secao].join(' '))
}

/** OR no PostgREST: cada token em nome, mãe, título, liderança, zona ou seção. */
function buildVotacaoSearchOr(query: string): { orFilter: string; tokens: string[]; digits: string } {
  const tokens = searchTokens(query)
  const digits = query.replace(/\D/g, '')
  const parts: string[] = []
  for (const t of tokens) {
    parts.push(
      `nome_completo.ilike.%${t}%`,
      `nome_mae.ilike.%${t}%`,
      `titulo.ilike.%${t}%`,
      `lider.ilike.%${t}%`,
      `zona.ilike.%${t}%`,
      `secao.ilike.%${t}%`,
    )
  }
  // Zona/seção/título só com números (ex.: 089, 229, pedaço do título).
  if (digits.length >= 2) {
    parts.push(`titulo.ilike.%${digits}%`, `zona.ilike.%${digits}%`, `secao.ilike.%${digits}%`)
  }
  // Fallback se sanitize deixou pouco conteúdo.
  if (!parts.length && query.length >= 2) {
    parts.push(`nome_completo.ilike.%${query}%`, `titulo.ilike.%${query}%`)
  }
  return { orFilter: parts.join(','), tokens, digits }
}

/** Exige que todos os tokens apareçam em algum dos campos (AND entre partes do nome). */
function matchesAllTokens(
  row: Pick<VotacaoHit, 'nome_completo' | 'nome_mae' | 'titulo' | 'lider' | 'zona' | 'secao'>,
  tokens: string[],
  digits: string,
) {
  const hay = searchableBlob(row)
  if (tokens.length) {
    return tokens.every((t) => hay.includes(norm(t)))
  }
  if (digits.length >= 2) {
    return hay.includes(digits)
  }
  return true
}

function matchesStatus(row: Pick<VotacaoHit, 'votou'>, filtro: VotacaoStatusFiltro) {
  if (filtro === 'todos') return true
  if (filtro === 'pendente') return row.votou == null
  if (filtro === 'votou') return row.votou === true
  return row.votou === false
}

function asHit(row: Record<string, unknown>): VotacaoHit {
  return {
    id: String(row.id),
    nome_completo: (row.nome_completo as string) ?? '',
    titulo: (row.titulo as string) ?? '',
    zona: (row.zona as string) ?? '',
    secao: (row.secao as string) ?? '',
    nome_mae: (row.nome_mae as string) ?? '',
    data_nascimento: (row.data_nascimento as string) ?? null,
    telefone: (row.telefone as string) ?? '',
    coordenador: (row.coordenador as string) ?? '',
    lider: (row.lider as string) ?? '',
    votou: (row.votou as boolean | null | undefined) ?? null,
    voto_foto_path: (row.voto_foto_path as string | null | undefined) ?? null,
    voto_em: (row.voto_em as string | null | undefined) ?? null,
    voto_por: (row.voto_por as string | null | undefined) ?? null,
    diretoria_id: (row.diretoria_id as string) ?? null,
  }
}

export async function fetchAuxiliarLiderNomes(auxiliarId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('auxiliar_lideres')
    .select('lider_id, lideres(nome)')
    .eq('auxiliar_id', auxiliarId)
  if (error) throw new Error(error.message)
  const nomes = (data ?? [])
    .map((row) => {
      const lideres = (row as { lideres?: { nome?: string } | { nome?: string }[] | null }).lideres
      if (Array.isArray(lideres)) return lideres[0]?.nome ?? ''
      return lideres?.nome ?? ''
    })
    .map((n) => n.trim())
    .filter(Boolean)
  return [...new Set(nomes)]
}

export async function fetchAuxiliarLiderIds(auxiliarId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('auxiliar_lideres')
    .select('lider_id')
    .eq('auxiliar_id', auxiliarId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.lider_id as string)
}

export async function searchVotacaoFichas(opts: {
  query: string
  liderNomes?: string[]
  coordenadorNome?: string | null
  status?: VotacaoStatusFiltro
  limit?: number
}): Promise<VotacaoHit[]> {
  const q = sanitizeSearchTerm(opts.query)
  if (q.length < 2) return []
  const limit = opts.limit ?? 40
  // Busca a mais para filtrar partes do nome / liderança / status no client.
  const fetchLimit = Math.min(250, Math.max(limit * 5, 100))
  const { orFilter, tokens, digits } = buildVotacaoSearchOr(q)
  if (!orFilter) return []

  async function run(selectCols: string) {
    let request = supabase
      .from('cadastros')
      .select(selectCols)
      .or(orFilter)
      .order('nome_completo')
      .limit(fetchLimit)

    if (opts.coordenadorNome?.trim()) {
      request = request.ilike('coordenador', opts.coordenadorNome.trim())
    }

    return request
  }

  let { data, error } = await run(SELECT_COLS)
  if (error && /votou|voto_|column|schema/i.test(error.message)) {
    ;({ data, error } = await run(SELECT_BASIC))
  }
  if (error) throw new Error(error.message)

  let rows = (data ?? []).map((r) => asHit(r as unknown as Record<string, unknown>))

  // "ADALBERTO SILVA" → exige as duas partes (ordem livre, ignora de/da/do).
  rows = rows.filter((r) => matchesAllTokens(r, tokens, digits))

  if (opts.liderNomes?.length) {
    const allowed = new Set(opts.liderNomes.map(norm).filter(Boolean))
    rows = rows.filter((r) => allowed.has(norm(r.lider)))
  }

  const status = opts.status ?? 'todos'
  if (status !== 'todos') {
    rows = rows.filter((r) => matchesStatus(r, status))
  }

  return rows.slice(0, limit)
}

export async function getVotacaoFicha(id: string): Promise<VotacaoHit | null> {
  let { data, error } = await supabase
    .from('cadastros')
    .select(SELECT_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error && /votou|voto_|column|schema/i.test(error.message)) {
    ;({ data, error } = await supabase
      .from('cadastros')
      .select(SELECT_BASIC)
      .eq('id', id)
      .maybeSingle())
    if (!error && data) return asHit(data as unknown as Record<string, unknown>)
  }
  if (error) throw new Error(error.message)
  return data ? asHit(data as unknown as Record<string, unknown>) : null
}

async function uploadVotoFoto(userId: string, file: File): Promise<string> {
  const prepared = await prepareImageForUpload(file)
  const ext = prepared.type === 'image/png'
    ? 'png'
    : prepared.type === 'image/webp'
      ? 'webp'
      : prepared.type === 'image/gif'
        ? 'gif'
        : 'jpg'
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(VOTACAO_FOTOS_BUCKET).upload(path, prepared, {
    cacheControl: '86400',
    upsert: false,
    contentType: prepared.type || 'image/jpeg',
  })
  if (error) {
    if (/bucket|not found|mime|allowed/i.test(error.message)) {
      throw new Error(
        `${error.message} — confira o bucket votacao-fotos (SQL coordenador_auxiliar_votacao_run.sql).`,
      )
    }
    throw new Error(error.message)
  }
  return path
}

export async function signVotoFoto(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(VOTACAO_FOTOS_BUCKET)
    .createSignedUrl(path, 60 * 60)
  if (error) throw new Error(error.message || 'Não foi possível abrir o anexo.')
  return data?.signedUrl ?? null
}

export type VotacaoSaveInput = {
  cadastroId: string
  userId: string
  votou: boolean
  fotoFile?: File | null
  clearFoto?: boolean
  correcoes?: {
    nome_completo?: string
    titulo?: string
    zona?: string
    secao?: string
    nome_mae?: string
    data_nascimento?: string | null
  }
}

export async function salvarLancamentoVotacao(input: VotacaoSaveInput): Promise<VotacaoHit> {
  const patch: Record<string, unknown> = {
    votou: input.votou,
    voto_em: new Date().toISOString(),
    voto_por: input.userId,
  }

  if (input.correcoes) {
    const c = input.correcoes
    if (c.nome_completo != null) patch.nome_completo = c.nome_completo.trim()
    if (c.titulo != null) patch.titulo = c.titulo.trim()
    if (c.zona != null) patch.zona = c.zona.trim()
    if (c.secao != null) patch.secao = c.secao.trim()
    if (c.nome_mae != null) patch.nome_mae = c.nome_mae.trim()
    if (c.data_nascimento !== undefined) {
      patch.data_nascimento = c.data_nascimento?.trim() || null
    }
  }

  let newFotoPath: string | null = null
  if (input.fotoFile) {
    newFotoPath = await uploadVotoFoto(input.userId, input.fotoFile)
    patch.voto_foto_path = newFotoPath
  } else if (input.clearFoto) {
    patch.voto_foto_path = null
  }

  const { data, error } = await supabase
    .from('cadastros')
    .update(patch)
    .eq('id', input.cadastroId)
    .select(SELECT_COLS)
    .maybeSingle()

  if (error) {
    if (newFotoPath) {
      void supabase.storage.from(VOTACAO_FOTOS_BUCKET).remove([newFotoPath])
    }
    if (/unique|duplicate|titulo/i.test(error.message)) {
      throw new Error('Este título de eleitor já existe em outra ficha. Confira o número e tente de novo.')
    }
    if (/permission|policy|row-level|RLS/i.test(error.message)) {
      throw new Error('Sem permissão nesta ficha. Confira se a liderança está liberada para você.')
    }
    throw new Error(error.message)
  }
  if (!data) throw new Error('Ficha não encontrada ou sem permissão para salvar.')
  return asHit(data as unknown as Record<string, unknown>)
}

/** Fichas de uma liderança (Progresso — ver status e anexo). */
export async function fetchVotacaoFichasLider(
  coordenadorNome: string,
  liderNome: string,
): Promise<VotacaoHit[]> {
  const coord = coordenadorNome.trim()
  const lider = liderNome.trim()
  if (!coord || !lider) return []
  const semLider = lider === 'Sem liderança'

  const all: VotacaoHit[] = []
  let from = 0
  for (;;) {
    async function run(cols: string) {
      let q = supabase
        .from('cadastros')
        .select(cols)
        .ilike('coordenador', coord)
        .order('nome_completo')
        .range(from, from + PAGE - 1)
      if (!semLider) q = q.ilike('lider', lider)
      return q
    }

    let { data, error } = await run(SELECT_COLS)
    if (error && /votou|voto_|column|schema/i.test(error.message)) {
      ;({ data, error } = await run(SELECT_BASIC))
    }
    if (error) throw new Error(error.message)
    const chunk = (data ?? []).map((r) => asHit(r as unknown as Record<string, unknown>))
    const exact = chunk.filter((r) =>
      semLider ? !norm(r.lider) : norm(r.lider) === norm(lider),
    )
    all.push(...exact)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return all
}

async function fetchAllCadastrosCoord(coordenadorNome: string): Promise<Pick<VotacaoHit, 'lider' | 'votou'>[]> {
  const all: Pick<VotacaoHit, 'lider' | 'votou'>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('cadastros')
      .select('lider,votou')
      .ilike('coordenador', coordenadorNome.trim())
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as Pick<VotacaoHit, 'lider' | 'votou'>[]
    all.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return all
}

/** Lançamentos recentes (voto_em preenchido) — Histórico. */
export async function fetchVotacaoHistorico(opts: {
  coordenadorNome?: string | null
  /** Auxiliar: só fichas dessas lideranças. */
  liderNomes?: string[]
  query?: string
  limit?: number
}): Promise<VotacaoHit[]> {
  const limit = opts.limit ?? 60
  const q = sanitizeSearchTerm(opts.query ?? '')
  const liderNomes = (opts.liderNomes ?? []).map((n) => n.trim()).filter(Boolean)
  // Auxiliar precisa puxar mais linhas antes do filtro de liderança no client.
  const fetchLimit = liderNomes.length
    ? Math.min(400, Math.max(limit * 6, 120))
    : Math.min(200, limit * 3)

  async function run(cols: string) {
    let request = supabase
      .from('cadastros')
      .select(cols)
      .not('voto_em', 'is', null)
      .order('voto_em', { ascending: false })
      .limit(fetchLimit)

    if (opts.coordenadorNome?.trim()) {
      request = request.ilike('coordenador', opts.coordenadorNome.trim())
    }
    if (liderNomes.length === 1) {
      request = request.ilike('lider', liderNomes[0])
    } else if (liderNomes.length > 1) {
      request = request.or(liderNomes.map((n) => `lider.ilike.${n}`).join(','))
    }
    if (q.length >= 2) {
      const { orFilter } = buildVotacaoSearchOr(q)
      if (orFilter) request = request.or(orFilter)
    }
    return request
  }

  let { data, error } = await run(SELECT_COLS)
  if (error && /votou|voto_|column|schema/i.test(error.message)) {
    throw new Error(`${error.message} — rode o SQL coordenador_auxiliar_votacao_run.sql no Supabase.`)
  }
  if (error) throw new Error(error.message)
  let rows = (data ?? []).map((r) => asHit(r as unknown as Record<string, unknown>))
  if (liderNomes.length) {
    const allowed = new Set(liderNomes.map(norm))
    rows = rows.filter((r) => allowed.has(norm(r.lider)))
  }
  if (q.length >= 2) {
    const { tokens, digits } = buildVotacaoSearchOr(q)
    rows = rows.filter((r) => matchesAllTokens(r, tokens, digits))
  }
  return rows.slice(0, limit)
}

export async function fetchVotacaoProgresso(coordenadorNome: string): Promise<VotacaoProgresso> {
  const nome = coordenadorNome.trim()
  if (!nome) {
    return { coordenadorNome: '', total: 0, pendente: 0, votou: 0, naoVotou: 0, porLider: [] }
  }

  const rows = await fetchAllCadastrosCoord(nome)
  const byLider = new Map<string, VotacaoProgressoLider>()

  let pendente = 0
  let votou = 0
  let naoVotou = 0

  for (const r of rows) {
    const lider = (r.lider ?? '').trim() || 'Sem liderança'
    const cur = byLider.get(lider) ?? {
      lider,
      total: 0,
      pendente: 0,
      votou: 0,
      naoVotou: 0,
    }
    cur.total += 1
    if (r.votou === true) {
      cur.votou += 1
      votou += 1
    } else if (r.votou === false) {
      cur.naoVotou += 1
      naoVotou += 1
    } else {
      cur.pendente += 1
      pendente += 1
    }
    byLider.set(lider, cur)
  }

  const porLider = [...byLider.values()].sort((a, b) => {
    if (b.pendente !== a.pendente) return b.pendente - a.pendente
    return a.lider.localeCompare(b.lider, 'pt-BR')
  })

  return {
    coordenadorNome: nome,
    total: rows.length,
    pendente,
    votou,
    naoVotou,
    porLider,
  }
}
