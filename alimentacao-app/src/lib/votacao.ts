import { prepareImageForUpload } from './imageCompress'
import { uniqueLiderNomes } from './liderFichas'
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
  | 'adicionado_por_auxiliar'
  | 'criado_por'
>

export type VotacaoStatusFiltro = 'todos' | 'pendente' | 'votou' | 'nao'

export type VotacaoProgressoLider = {
  lider: string
  /** Preenchido na visão “todas as coordenações” (admin/diretoria). */
  coordenador?: string
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
  'id,nome_completo,titulo,zona,secao,nome_mae,data_nascimento,telefone,coordenador,lider,votou,voto_foto_path,voto_em,voto_por,diretoria_id,adicionado_por_auxiliar,criado_por'

/** Com voto, sem colunas de “adicionado pelo auxiliar”. */
const SELECT_VOTO =
  'id,nome_completo,titulo,zona,secao,nome_mae,data_nascimento,telefone,coordenador,lider,votou,voto_foto_path,voto_em,voto_por,diretoria_id'

/** Sem colunas de voto — fallback se o SQL ainda não rodou. */
const SELECT_BASIC =
  'id,nome_completo,titulo,zona,secao,nome_mae,data_nascimento,telefone,coordenador,lider,diretoria_id'

const PAGE = 1000

function norm(s: string | null | undefined) {
  return (s ?? '').trim().toLowerCase()
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/** uuid no cliente (idempotência do "Adicionar novo"); com fallback p/ WebView antigo. */
function novoId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto
    if (c?.randomUUID) return c.randomUUID()
  } catch {
    /* fallback abaixo */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Falha transitória (rede do celular caiu, timeout, servidor ocupado) — vale repetir. */
function isTransient(msg: string | null | undefined): boolean {
  return /failed to fetch|fetch|networkerror|load failed|timeout|timed out|connection|socket|temporarily|unavailable|too many|rate limit|\b429\b|\b50[234]\b/i.test(
    String(msg ?? ''),
  )
}

type SupaResult<T> = { data: T; error: { message: string } | null }

/** Repete a operação Supabase só em erro transitório (backoff 0,5s / 1,2s). */
async function comRetry<T>(
  op: () => PromiseLike<SupaResult<T>>,
  tries = 3,
): Promise<SupaResult<T>> {
  let res: SupaResult<T>
  try {
    res = await op()
  } catch (e) {
    res = { data: null as T, error: { message: e instanceof Error ? e.message : String(e) } }
  }
  for (let i = 1; i < tries && res.error && isTransient(res.error.message); i++) {
    await sleep(i === 1 ? 500 : 1200)
    try {
      res = await op()
    } catch (e) {
      res = { data: null as T, error: { message: e instanceof Error ? e.message : String(e) } }
    }
  }
  return res
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
    adicionado_por_auxiliar: Boolean(row.adicionado_por_auxiliar),
    criado_por: (row.criado_por as string | null | undefined) ?? null,
  }
}

/** Select com fallback se colunas novas ainda não existirem no Supabase. */
async function selectCadastro(id: string) {
  let { data, error } = await supabase.from('cadastros').select(SELECT_COLS).eq('id', id).maybeSingle()
  if (error && /adicionado_por_auxiliar|criado_por|column|schema/i.test(error.message)) {
    ;({ data, error } = await supabase.from('cadastros').select(SELECT_VOTO).eq('id', id).maybeSingle())
  }
  if (error && /votou|voto_|column|schema/i.test(error.message)) {
    ;({ data, error } = await supabase.from('cadastros').select(SELECT_BASIC).eq('id', id).maybeSingle())
  }
  if (error) throw new Error(error.message)
  return data ? asHit(data as unknown as Record<string, unknown>) : null
}

export async function fetchAuxiliarLiderNomes(auxiliarId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('auxiliar_lideres')
    .select('lider_id, lideres(nome)')
    .eq('auxiliar_id', auxiliarId)
  if (error) throw new Error(error.message)
  const nomes = (data ?? []).map((row) => {
    const lideres = (row as { lideres?: { nome?: string } | { nome?: string }[] | null }).lideres
    if (Array.isArray(lideres)) return lideres[0]?.nome ?? ''
    return lideres?.nome ?? ''
  })
  // Case/espaço: "Maria" e "maria " contam como a mesma liderança.
  return uniqueLiderNomes(nomes)
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
  if (error && /adicionado_por_auxiliar|criado_por|column|schema/i.test(error.message)) {
    ;({ data, error } = await run(SELECT_VOTO))
  }
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
  return selectCadastro(id)
}

async function uploadVotoFoto(userId: string, file: File): Promise<string> {
  if (!userId) throw new Error('Usuário não identificado para enviar o anexo.')
  let prepared: File
  try {
    prepared = await prepareImageForUpload(file)
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Não foi possível preparar a foto do comprovante.')
  }
  const ext = prepared.type === 'image/png'
    ? 'png'
    : prepared.type === 'image/webp'
      ? 'webp'
      : prepared.type === 'image/gif'
        ? 'gif'
        : 'jpg'
  // Pasta = auth user id (exigido pelas policies do bucket votacao-fotos).
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  // upsert:true + path fixo = reenvio seguro se a rede cair no meio (não duplica).
  const { error } = await comRetry(() =>
    supabase.storage.from(VOTACAO_FOTOS_BUCKET).upload(path, prepared, {
      cacheControl: '86400',
      upsert: true,
      contentType: prepared.type || 'image/jpeg',
    }),
  )
  if (error) {
    if (/bucket|not found|mime|allowed/i.test(error.message)) {
      throw new Error(
        `${error.message} — confira o bucket votacao-fotos (SQL coordenador_auxiliar_votacao_run.sql).`,
      )
    }
    if (/permission|policy|row-level|RLS|not allowed/i.test(error.message)) {
      throw new Error('Sem permissão para enviar o anexo. Entre novamente e tente de novo.')
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

  async function runUpdate(cols: string) {
    return supabase
      .from('cadastros')
      .update(patch)
      .eq('id', input.cadastroId)
      .select(cols)
      .maybeSingle()
  }

  let { data, error } = await comRetry(() => runUpdate(SELECT_COLS))
  if (error && /adicionado_por_auxiliar|criado_por|column|schema/i.test(error.message)) {
    ;({ data, error } = await comRetry(() => runUpdate(SELECT_VOTO)))
  }
  if (error && /votou|voto_|column|schema/i.test(error.message)) {
    // Colunas de voto ausentes: ainda tenta gravar sem select tipado.
    const bare = await comRetry(() =>
      supabase.from('cadastros').update(patch).eq('id', input.cadastroId),
    )
    error = bare.error
    data = null
  }

  // Rede caiu depois de salvar? Confirma no banco antes de dar erro ao auxiliar.
  if (error && isTransient(error.message)) {
    try {
      const check = await selectCadastro(input.cadastroId)
      const salvoAgora =
        check
        && check.votou === input.votou
        && check.voto_por === input.userId
        && check.voto_em
        && Date.now() - Date.parse(check.voto_em) < 120_000
      if (salvoAgora && check) return check
    } catch {
      /* mantém o erro original abaixo */
    }
  }

  if (error) {
    // Só descarta a foto em falha definitiva; em erro transitório a gravação
    // pode ter ocorrido e apagar o anexo quebraria a ficha salva.
    if (newFotoPath && !isTransient(error.message)) {
      void supabase.storage.from(VOTACAO_FOTOS_BUCKET).remove([newFotoPath])
    }
    if (/unique|duplicate|titulo/i.test(error.message)) {
      throw new Error('Este título de eleitor já existe em outra ficha. Confira o número e tente de novo.')
    }
    if (/outra nerite/i.test(error.message)) {
      throw new Error(
        'Bloqueio do banco (trigger). Peça à diretoria para rodar no Supabase o SQL auxiliar_coord_edita_ficha_lideranca_run.sql e tente de novo.',
      )
    }
    if (/permission|policy|row-level|RLS/i.test(error.message)) {
      throw new Error(
        'Sem permissão nesta ficha. Confira se a liderança está liberada em Equipe → Auxiliares e se o nome da liderança na ficha bate com o cadastro.',
      )
    }
    throw new Error(error.message)
  }
  if (data) return asHit(data as unknown as Record<string, unknown>)

  // Update ok sem linha no select (RLS/RETURNING) — tenta reload; se falhar, snapshot mínimo.
  try {
    const saved = await selectCadastro(input.cadastroId)
    if (saved) return saved
  } catch {
    /* fallback abaixo */
  }
  const c = input.correcoes
  return {
    id: input.cadastroId,
    nome_completo: c?.nome_completo?.trim() ?? '',
    titulo: c?.titulo?.trim() ?? '',
    zona: c?.zona?.trim() ?? '',
    secao: c?.secao?.trim() ?? '',
    nome_mae: c?.nome_mae?.trim() ?? '',
    data_nascimento: c?.data_nascimento ?? null,
    telefone: '',
    coordenador: '',
    lider: '',
    votou: input.votou,
    // Sem path no retorno: a tela preserva o path anterior via merge.
    voto_foto_path: newFotoPath,
    voto_em: String(patch.voto_em),
    voto_por: input.userId,
    diretoria_id: null,
    adicionado_por_auxiliar: false,
    criado_por: null,
  }
}

export type VotacaoNovoCadastroInput = {
  userId: string
  diretoriaId: string | null
  coordenadorNome: string
  liderNome: string
  nomeCompleto: string
  titulo?: string
  zona?: string
  secao?: string
  nomeMae?: string
  dataNascimento?: string | null
  votou: boolean
  fotoFile?: File | null
  /** true = auxiliar (badge específico); false = coord/diretoria/admin */
  porAuxiliar?: boolean
}

/** Cria ficha no Lançar já vinculada à coordenação/liderança e registra o voto. */
export async function criarCadastroLancamentoVotacao(
  input: VotacaoNovoCadastroInput,
): Promise<VotacaoHit> {
  const nome = input.nomeCompleto.trim()
  const coord = input.coordenadorNome.trim()
  const lider = input.liderNome.trim()
  const porAuxiliar = Boolean(input.porAuxiliar)
  if (!nome || nome.split(/\s+/).filter(Boolean).length < 2) {
    throw new Error('Informe nome e sobrenome.')
  }
  if (!coord) throw new Error('Selecione a coordenação antes de adicionar.')
  if (!lider) throw new Error('Selecione a liderança antes de adicionar.')

  let fotoPath: string | null = null
  if (input.fotoFile) {
    fotoPath = await uploadVotoFoto(input.userId, input.fotoFile)
  }

  // id gerado no cliente = insert idempotente: se o auxiliar reenviar após a
  // rede cair, cai no mesmo id e nunca cria uma segunda ficha.
  const novoCadastroId = novoId()
  const basePayload: Record<string, unknown> = {
    id: novoCadastroId,
    nome_completo: nome,
    titulo: (input.titulo ?? '').trim() || null,
    zona: (input.zona ?? '').trim(),
    secao: (input.secao ?? '').trim(),
    nome_mae: (input.nomeMae ?? '').trim(),
    data_nascimento: input.dataNascimento?.trim() || null,
    telefone: '',
    coordenador: coord,
    lider,
    diretoria_id: input.diretoriaId,
    operator_id: null,
    votou: input.votou,
    voto_em: new Date().toISOString(),
    voto_por: input.userId,
    voto_foto_path: fotoPath,
  }
  // Colunas de marcação (opcionais) — se o SQL ainda não rodou, tenta de novo sem elas.
  const fullPayload: Record<string, unknown> = {
    ...basePayload,
    adicionado_por_auxiliar: porAuxiliar,
    criado_por: input.userId,
  }

  async function tryInsert(payload: Record<string, unknown>) {
    return supabase.from('cadastros').insert(payload).select('id').maybeSingle()
  }

  let { data, error } = await comRetry(() => tryInsert(fullPayload))
  if (error && /adicionado_por_auxiliar|criado_por|column|schema/i.test(error.message)) {
    ;({ data, error } = await comRetry(() => tryInsert(basePayload)))
  }

  // Erro transitório (rede caiu) ou conflito do nosso próprio id (o 1º envio
  // gravou e o 2º bateu na PK): confirma pelo id e devolve a ficha já criada —
  // idempotente, jamais duplica. Conflito de título não bate no nosso id.
  if (error && (isTransient(error.message) || /duplicate|unique|already exists|conflict/i.test(error.message))) {
    let jaCriada: VotacaoHit | null = null
    try {
      jaCriada = await selectCadastro(novoCadastroId)
    } catch {
      jaCriada = null
    }
    if (jaCriada && norm(jaCriada.nome_completo) === norm(nome)) {
      return {
        ...jaCriada,
        adicionado_por_auxiliar: porAuxiliar || Boolean(jaCriada.adicionado_por_auxiliar),
        criado_por: jaCriada.criado_por ?? input.userId,
      }
    }
  }

  if (error) {
    // Foto só é descartada em falha definitiva (ver salvarLancamentoVotacao).
    if (fotoPath && !isTransient(error.message)) {
      void supabase.storage.from(VOTACAO_FOTOS_BUCKET).remove([fotoPath])
    }
    if (/adicionado_por_auxiliar|criado_por|column|schema/i.test(error.message)) {
      throw new Error(
        `${error.message} — rode o SQL auxiliar_adicionar_ficha_votacao_run.sql no Supabase.`,
      )
    }
    if (/unique|duplicate|titulo/i.test(error.message)) {
      throw new Error('Este título de eleitor já existe em outra ficha. Confira o número e tente de novo.')
    }
    if (/outra nerite/i.test(error.message)) {
      throw new Error(
        'Bloqueio do banco (trigger). Rode o SQL auxiliar_coord_edita_ficha_lideranca_run.sql no Supabase.',
      )
    }
    if (/permission|policy|row-level|RLS/i.test(error.message)) {
      throw new Error(
        'Sem permissão para adicionar ficha. Confira coordenação/liderança e rode o SQL auxiliar_adicionar_ficha_votacao_run.sql.',
      )
    }
    throw new Error(error.message)
  }
  if (!data?.id) throw new Error('Não foi possível criar a ficha.')
  const id = String(data.id)
  try {
    const saved = await selectCadastro(id)
    if (saved) {
      return {
        ...saved,
        adicionado_por_auxiliar: porAuxiliar || Boolean(saved.adicionado_por_auxiliar),
        criado_por: saved.criado_por ?? input.userId,
      }
    }
  } catch {
    /* ficha já criada — devolve snapshot mínimo */
  }
  return {
    id,
    nome_completo: nome,
    titulo: String(basePayload.titulo ?? ''),
    zona: String(basePayload.zona ?? ''),
    secao: String(basePayload.secao ?? ''),
    nome_mae: String(basePayload.nome_mae ?? ''),
    data_nascimento: (basePayload.data_nascimento as string | null) ?? null,
    telefone: '',
    coordenador: coord,
    lider,
    votou: input.votou,
    voto_foto_path: fotoPath,
    voto_em: String(basePayload.voto_em),
    voto_por: input.userId,
    diretoria_id: input.diretoriaId,
    adicionado_por_auxiliar: porAuxiliar,
    criado_por: input.userId,
  }
}

/** @deprecated use criarCadastroLancamentoVotacao */
export async function criarCadastroLancamentoAuxiliar(
  input: VotacaoNovoCadastroInput,
): Promise<VotacaoHit> {
  return criarCadastroLancamentoVotacao({ ...input, porAuxiliar: true })
}

export function labelAdicionadoNoLancamento(hit: Pick<VotacaoHit, 'adicionado_por_auxiliar' | 'criado_por'>) {
  if (hit.adicionado_por_auxiliar) return 'Adicionado pelo auxiliar'
  if (hit.criado_por) return 'Adicionado no lançamento'
  return null
}

export type ExcluirLancamentoResult = {
  /** `deleted` = ficha criada no Lançar pelo auxiliar; `reverted` = só limpa o voto. */
  mode: 'deleted' | 'reverted'
}

/**
 * Remove lançamento do Histórico (admin / diretoria / coordenador).
 * - Ficha `adicionado_por_auxiliar`: apaga o cadastro.
 * - Demais: zera votou/voto_em/voto_por/voto_foto_path (volta a pendente).
 */
export async function excluirLancamentoVotacao(
  hit: Pick<VotacaoHit, 'id' | 'adicionado_por_auxiliar' | 'voto_foto_path'>,
): Promise<ExcluirLancamentoResult> {
  const fotoPath = hit.voto_foto_path?.trim() || null
  const apagarFicha = Boolean(hit.adicionado_por_auxiliar)

  if (apagarFicha) {
    const { error } = await supabase.from('cadastros').delete().eq('id', hit.id)
    if (error) {
      if (/permission|policy|row-level|RLS/i.test(error.message)) {
        throw new Error(
          'Sem permissão para excluir esta ficha. Rode o SQL excluir_lancamento_votacao_run.sql no Supabase.',
        )
      }
      throw new Error(error.message)
    }
  } else {
    const patch = {
      votou: null,
      voto_em: null,
      voto_por: null,
      voto_foto_path: null,
    }
    const { error } = await supabase.from('cadastros').update(patch).eq('id', hit.id)
    if (error) {
      if (/permission|policy|row-level|RLS/i.test(error.message)) {
        throw new Error('Sem permissão para remover este lançamento.')
      }
      if (/votou|voto_|column|schema/i.test(error.message)) {
        throw new Error(
          `${error.message} — rode o SQL coordenador_auxiliar_votacao_run.sql no Supabase.`,
        )
      }
      throw new Error(error.message)
    }
  }

  if (fotoPath) {
    void supabase.storage.from(VOTACAO_FOTOS_BUCKET).remove([fotoPath])
  }

  return { mode: apagarFicha ? 'deleted' : 'reverted' }
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
    if (error && /adicionado_por_auxiliar|criado_por|column|schema/i.test(error.message)) {
      ;({ data, error } = await run(SELECT_VOTO))
    }
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

/** Lista fichas só pela liderança (Lançar do auxiliar). */
export async function fetchVotacaoFichasPorLiderNome(liderNome: string): Promise<VotacaoHit[]> {
  const lider = liderNome.trim()
  if (!lider) return []
  const all: VotacaoHit[] = []
  let from = 0
  for (;;) {
    async function run(cols: string) {
      return supabase
        .from('cadastros')
        .select(cols)
        .ilike('lider', lider)
        .order('nome_completo')
        .range(from, from + PAGE - 1)
    }
    let { data, error } = await run(SELECT_COLS)
    if (error && /adicionado_por_auxiliar|criado_por|column|schema/i.test(error.message)) {
      ;({ data, error } = await run(SELECT_VOTO))
    }
    if (error && /votou|voto_|column|schema/i.test(error.message)) {
      ;({ data, error } = await run(SELECT_BASIC))
    }
    if (error) throw new Error(error.message)
    const chunk = (data ?? []).map((r) => asHit(r as unknown as Record<string, unknown>))
    all.push(...chunk.filter((r) => norm(r.lider) === norm(lider)))
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

/** Lançamentos (voto_em preenchido) — Histórico, paginado. */
export async function fetchVotacaoHistorico(opts: {
  coordenadorNome?: string | null
  /** Auxiliar: só fichas dessas lideranças. */
  liderNomes?: string[]
  query?: string
  page?: number
  pageSize?: number
}): Promise<{ rows: VotacaoHit[]; total: number }> {
  const page = Math.max(0, opts.page ?? 0)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 25))
  const from = page * pageSize
  const to = from + pageSize - 1
  const q = sanitizeSearchTerm(opts.query ?? '')
  const liderNomes = (opts.liderNomes ?? []).map((n) => n.trim()).filter(Boolean)

  async function run(cols: string) {
    let request = supabase
      .from('cadastros')
      .select(cols, { count: 'exact' })
      .not('voto_em', 'is', null)
      .order('voto_em', { ascending: false })
      .range(from, to)

    if (opts.coordenadorNome?.trim()) {
      request = request.ilike('coordenador', opts.coordenadorNome.trim())
    }
    if (liderNomes.length === 1) {
      request = request.ilike('lider', liderNomes[0])
    } else if (liderNomes.length > 1) {
      // PostgREST: valores com espaço/vírgula precisam de aspas.
      request = request.or(
        liderNomes.map((n) => `lider.ilike."${n.replace(/"/g, '')}"`).join(','),
      )
    }
    if (q.length >= 2) {
      const { orFilter } = buildVotacaoSearchOr(q)
      if (orFilter) request = request.or(orFilter)
    }
    return request
  }

  let { data, error, count } = await run(SELECT_COLS)
  if (error && /adicionado_por_auxiliar|criado_por|column|schema/i.test(error.message)) {
    ;({ data, error, count } = await run(SELECT_VOTO))
  }
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
  return {
    rows,
    total: typeof count === 'number' ? count : rows.length,
  }
}

type ProgressoAggRow = {
  coordenador: string
  lider: string
  total: number | string
  pendente: number | string
  votou: number | string
  nao_votou: number | string
}

function nAgg(v: number | string | null | undefined) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

function sortPorLider(a: VotacaoProgressoLider, b: VotacaoProgressoLider) {
  if (b.pendente !== a.pendente) return b.pendente - a.pendente
  const ca = (a.coordenador ?? '').localeCompare(b.coordenador ?? '', 'pt-BR')
  if (ca !== 0) return ca
  return a.lider.localeCompare(b.lider, 'pt-BR')
}

/** Agregação no Postgres (votacao_progresso_agg_run.sql). null = função ainda não existe. */
async function fetchProgressoViaRpc(opts: {
  coordenadores?: string[] | null
  lideres?: string[] | null
  label: string
  includeCoordOnLider?: boolean
}): Promise<VotacaoProgresso | null> {
  const coords = (opts.coordenadores ?? []).map((n) => n.trim()).filter(Boolean)
  const liders = (opts.lideres ?? []).map((n) => n.trim()).filter(Boolean)
  const { data, error } = await supabase.rpc('votacao_progresso_agg', {
    p_coordenadores: coords.length ? coords : null,
    p_lideres: liders.length ? liders : null,
  })
  if (error) {
    if (/votacao_progresso_agg|function|schema|pgrst|404|does not exist/i.test(error.message)) {
      return null
    }
    throw new Error(error.message)
  }
  const rows = (data ?? []) as ProgressoAggRow[]
  const wantCoords = coords.length ? new Set(coords.map(norm)) : null
  const wantLiders = liders.length ? new Set(liders.map(norm)) : null
  const multiCoord = opts.includeCoordOnLider || (coords.length > 1)

  let total = 0
  let pendente = 0
  let votou = 0
  let naoVotou = 0
  const porLider: VotacaoProgressoLider[] = []

  for (const r of rows) {
    const coordNome = (r.coordenador ?? '').trim() || 'Sem coordenação'
    const liderNome = (r.lider ?? '').trim() || 'Sem liderança'
    if (wantCoords && !wantCoords.has(norm(coordNome))) continue
    if (wantLiders && !wantLiders.has(norm(liderNome))) continue
    const item: VotacaoProgressoLider = {
      lider: liderNome,
      ...(multiCoord ? { coordenador: coordNome } : {}),
      total: nAgg(r.total),
      pendente: nAgg(r.pendente),
      votou: nAgg(r.votou),
      naoVotou: nAgg(r.nao_votou),
    }
    total += item.total
    pendente += item.pendente
    votou += item.votou
    naoVotou += item.naoVotou
    porLider.push(item)
  }
  porLider.sort(sortPorLider)
  return {
    coordenadorNome: opts.label,
    total,
    pendente,
    votou,
    naoVotou,
    porLider,
  }
}

function aggregateRowsClient(
  rows: Pick<VotacaoHit, 'lider' | 'votou'>[],
  opts: { coordenadorNome?: string; label: string },
): VotacaoProgresso {
  const byLider = new Map<string, VotacaoProgressoLider>()
  let pendente = 0
  let votou = 0
  let naoVotou = 0
  for (const r of rows) {
    const lider = (r.lider ?? '').trim() || 'Sem liderança'
    const cur = byLider.get(lider) ?? {
      lider,
      ...(opts.coordenadorNome ? { coordenador: opts.coordenadorNome } : {}),
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
  return {
    coordenadorNome: opts.label,
    total: rows.length,
    pendente,
    votou,
    naoVotou,
    porLider: [...byLider.values()].sort(sortPorLider),
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
}

export async function fetchVotacaoProgresso(coordenadorNome: string): Promise<VotacaoProgresso> {
  const nome = coordenadorNome.trim()
  if (!nome) {
    return { coordenadorNome: '', total: 0, pendente: 0, votou: 0, naoVotou: 0, porLider: [] }
  }

  const viaRpc = await fetchProgressoViaRpc({
    coordenadores: [nome],
    label: nome,
    includeCoordOnLider: false,
  })
  if (viaRpc) return viaRpc

  const rows = await fetchAllCadastrosCoord(nome)
  return aggregateRowsClient(rows, { label: nome })
}

/** Progresso agregado de várias coordenações (admin / diretoria — “Todas”). */
export async function fetchVotacaoProgressoVarios(
  coordenadorNomes: string[],
): Promise<VotacaoProgresso> {
  const nomes = [...new Set(coordenadorNomes.map((n) => n.trim()).filter(Boolean))]
  if (!nomes.length) {
    return {
      coordenadorNome: 'Todas as coordenações',
      total: 0,
      pendente: 0,
      votou: 0,
      naoVotou: 0,
      porLider: [],
    }
  }
  if (nomes.length === 1) return fetchVotacaoProgresso(nomes[0])

  const viaRpc = await fetchProgressoViaRpc({
    coordenadores: nomes,
    label: 'Todas as coordenações',
    includeCoordOnLider: true,
  })
  if (viaRpc) return viaRpc

  // Fallback: baixa por coordenação em paralelo (limitado) e agrega.
  const parts = await mapPool(nomes, 3, async (coord) => {
    const rows = await fetchAllCadastrosCoord(coord)
    return aggregateRowsClient(rows, { coordenadorNome: coord, label: coord })
  })

  const byKey = new Map<string, VotacaoProgressoLider>()
  let total = 0
  let pendente = 0
  let votou = 0
  let naoVotou = 0
  for (const part of parts) {
    total += part.total
    pendente += part.pendente
    votou += part.votou
    naoVotou += part.naoVotou
    for (const l of part.porLider) {
      const key = `${norm(l.coordenador)}\u001f${norm(l.lider)}`
      const cur = byKey.get(key)
      if (!cur) {
        byKey.set(key, { ...l })
        continue
      }
      cur.total += l.total
      cur.pendente += l.pendente
      cur.votou += l.votou
      cur.naoVotou += l.naoVotou
    }
  }

  return {
    coordenadorNome: 'Todas as coordenações',
    total,
    pendente,
    votou,
    naoVotou,
    porLider: [...byKey.values()].sort(sortPorLider),
  }
}

/**
 * Totais de fichas / votaram por nome de liderança (Equipe → popup do auxiliar).
 * Se passar coordenador, limita a essa coordenação.
 */
export async function fetchVotacaoStatsPorLideres(opts: {
  liderNomes: string[]
  coordenadorNome?: string | null
}): Promise<Record<string, VotacaoProgressoLider>> {
  const nomes = [...new Set(opts.liderNomes.map((n) => n.trim()).filter(Boolean))]
  const empty: Record<string, VotacaoProgressoLider> = {}
  for (const lider of nomes) {
    empty[lider] = { lider, total: 0, pendente: 0, votou: 0, naoVotou: 0 }
  }
  if (!nomes.length) return empty

  const coord = opts.coordenadorNome?.trim() ?? ''
  const viaRpc = await fetchProgressoViaRpc({
    coordenadores: coord ? [coord] : null,
    lideres: nomes,
    label: coord || '—',
    includeCoordOnLider: false,
  })
  if (viaRpc) {
    for (const l of viaRpc.porLider) {
      const key = norm(l.lider)
      const original = nomes.find((n) => norm(n) === key)
      if (!original) continue
      empty[original] = {
        lider: original,
        total: l.total,
        pendente: l.pendente,
        votou: l.votou,
        naoVotou: l.naoVotou,
      }
    }
    return empty
  }

  const byKey = new Map(nomes.map((n) => [norm(n), empty[n]!]))

  if (coord) {
    const rows = await fetchAllCadastrosCoord(coord)
    for (const r of rows) {
      const key = norm(r.lider)
      const cur = byKey.get(key)
      if (!cur) continue
      cur.total += 1
      if (r.votou === true) cur.votou += 1
      else if (r.votou === false) cur.naoVotou += 1
      else cur.pendente += 1
    }
    return empty
  }

  await mapPool(nomes, 4, async (lider) => {
    let from = 0
    const cur = empty[lider]!
    for (;;) {
      const { data, error } = await supabase
        .from('cadastros')
        .select('votou')
        .ilike('lider', lider)
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      const chunk = data ?? []
      for (const r of chunk) {
        cur.total += 1
        if (r.votou === true) cur.votou += 1
        else if (r.votou === false) cur.naoVotou += 1
        else cur.pendente += 1
      }
      if (chunk.length < PAGE) break
      from += PAGE
    }
  })
  return empty
}

/** Página de fichas de uma liderança (Progresso — não baixa tudo de uma vez). */
export async function fetchVotacaoFichasLiderPage(opts: {
  coordenadorNome: string
  liderNome: string
  page?: number
  pageSize?: number
  status?: 'votou' | 'nao' | 'pendente' | null
}): Promise<{ rows: VotacaoHit[]; total: number }> {
  const coord = opts.coordenadorNome.trim()
  const lider = opts.liderNome.trim()
  const page = Math.max(0, opts.page ?? 0)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 25))
  if (!coord || !lider) return { rows: [], total: 0 }
  const semLider = lider === 'Sem liderança'
  const from = page * pageSize
  const to = from + pageSize - 1

  async function run(cols: string) {
    let q = supabase
      .from('cadastros')
      .select(cols, { count: 'exact' })
      .ilike('coordenador', coord)
      .order('nome_completo')
      .range(from, to)
    if (!semLider) q = q.ilike('lider', lider)
    else q = q.or('lider.is.null,lider.eq.')
    if (opts.status === 'votou') q = q.eq('votou', true)
    else if (opts.status === 'nao') q = q.eq('votou', false)
    else if (opts.status === 'pendente') q = q.is('votou', null)
    return q
  }

  let { data, error, count } = await run(SELECT_COLS)
  if (error && /adicionado_por_auxiliar|criado_por|column|schema/i.test(error.message)) {
    ;({ data, error, count } = await run(SELECT_VOTO))
  }
  if (error && /votou|voto_|column|schema/i.test(error.message)) {
    ;({ data, error, count } = await run(SELECT_BASIC))
  }
  if (error) throw new Error(error.message)

  let rows = (data ?? []).map((r) => asHit(r as unknown as Record<string, unknown>))
  rows = rows.filter((r) =>
    semLider ? !norm(r.lider) : norm(r.lider) === norm(lider),
  )
  return { rows, total: typeof count === 'number' ? count : rows.length }
}
