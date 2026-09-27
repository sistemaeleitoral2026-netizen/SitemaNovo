import { supabase } from './supabase'
import { formatCpf } from './format'
import { normalizeCpf, normalizeSecao, normalizeTitulo, normalizeZona } from './normalize'

export type TituloStatus = 'validado' | 'nao_validado' | 'com_problema'

export function temNascimento(value: string | null | undefined) {
  return Boolean(value && String(value).trim())
}

export function labelTituloStatus(status: TituloStatus | null | undefined) {
  if (status === 'validado') return 'Título validado'
  if (status === 'com_problema' || status === 'nao_validado') return 'Com inconsistência'
  return '—'
}

export type TituloConsulta = {
  cadastro_id: string
  status: TituloStatus
  consultado_por: string
  consultado_por_nome: string
  consultado_em: string
}

export type TituloFicha = {
  id: string
  nome_completo: string
  nome_mae: string
  data_nascimento: string | null
  titulo: string
  cpf: string | null
  zona: string
  secao: string
  coordenador: string
  operator_id: string | null
  diretoria_id: string | null
  lat: number | null
  lng: number | null
  created_at: string
}

export type TituloPosse = {
  cadastro_id: string
  user_id: string
  heartbeat_em: string
  editou: boolean
}

export type TituloLinha = TituloFicha & {
  nerite: string
  consulta: TituloConsulta | null
  posse: TituloPosse | null
}

const POSSE_MS = 2 * 60 * 1000

export function posseTravaOutros(posse: TituloPosse | null, userId?: string) {
  if (!posse || posse.user_id === userId) return false
  if (posse.editou) return true
  return Date.now() - new Date(posse.heartbeat_em).getTime() < POSSE_MS
}

const PAGE = 1000

const FICHA_COLS =
  'id,nome_completo,nome_mae,data_nascimento,titulo,cpf,zona,secao,coordenador,operator_id,diretoria_id,lat,lng,created_at'

async function fetchAllPaged<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await run(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as T[]
    all.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return all
}

function sanitizeFicha(row: TituloFicha): TituloFicha {
  return {
    ...row,
    nome_completo: row.nome_completo ?? '',
    nome_mae: row.nome_mae ?? '',
    titulo: row.titulo ?? '',
    cpf: row.cpf || null,
    zona: row.zona ?? '',
    secao: row.secao ?? '',
    coordenador: row.coordenador ?? '',
    data_nascimento: row.data_nascimento || null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
  }
}

export function documentoTitulo(row: Pick<TituloFicha, 'titulo' | 'cpf'>): { valor: string; tipo: 'Título' | 'CPF' | '' } {
  const titulo = String(row.titulo ?? '').trim()
  if (titulo) return { valor: titulo, tipo: 'Título' }
  const cpf = formatCpf(row.cpf)
  if (cpf) return { valor: cpf, tipo: 'CPF' }
  return { valor: '—', tipo: '' }
}

export function canEditarTitulo(
  consulta: TituloConsulta | null,
  userId: string | undefined,
  staff: boolean,
): boolean {
  if (staff) return true
  if (!userId) return false
  if (!consulta) return true
  return consulta.consultado_por === userId
}

export async function fetchTituloLinhas(diretoriaId?: string | null): Promise<TituloLinha[]> {
  const [fichas, consultas, posses, ops] = await Promise.all([
    fetchAllPaged<TituloFicha>((from, to) =>
      supabase
        .from('cadastros')
        .select(FICHA_COLS)
        .not('data_nascimento', 'is', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    ),
    fetchAllPaged<TituloConsulta>((from, to) =>
      supabase
        .from('cadastro_titulo_consultas')
        .select('cadastro_id,status,consultado_por,consultado_por_nome,consultado_em')
        .order('consultado_em', { ascending: false })
        .range(from, to),
    ),
    fetchAllPaged<TituloPosse>((from, to) =>
      supabase
        .from('cadastro_titulo_posse')
        .select('cadastro_id,user_id,heartbeat_em,editou')
        .range(from, to),
    ).catch(() => [] as TituloPosse[]),
    supabase.rpc('list_cadastro_operadores'),
  ])

  if (ops.error) throw new Error(ops.error.message)

  const neriteById = new Map<string, { nome: string; diretoria_id: string | null }>()
  for (const item of (ops.data ?? []) as Array<{ id: string; nome: string; diretoria_id: string | null }>) {
    neriteById.set(item.id, { nome: item.nome, diretoria_id: item.diretoria_id })
  }

  const consultaById = new Map(consultas.map((c) => [c.cadastro_id, c]))
  const posseById = new Map(posses.map((p) => [p.cadastro_id, p]))

  return fichas
    .map(sanitizeFicha)
    .filter((ficha) => temNascimento(ficha.data_nascimento))
    .filter((ficha) => {
      if (!diretoriaId) return true
      if (ficha.diretoria_id === diretoriaId) return true
      const nerite = ficha.operator_id ? neriteById.get(ficha.operator_id) : null
      return nerite?.diretoria_id === diretoriaId
    })
    .map((ficha) => ({
      ...ficha,
      nerite: (ficha.operator_id && neriteById.get(ficha.operator_id)?.nome) || '—',
      consulta: consultaById.get(ficha.id) ?? null,
      posse: posseById.get(ficha.id) ?? null,
    }))
}

export async function pegarFichaTitulo(atualId?: string | null, pularId?: string | null): Promise<string | null> {
  const { data, error } = await supabase.rpc('titulo_pegar', {
    p_atual: atualId ?? null,
    p_pular: pularId ?? null,
  })
  if (error) throw new Error(error.message)
  return (data as string | null) ?? null
}

export async function manterFichaTitulo(cadastroId: string): Promise<void> {
  await supabase.rpc('titulo_manter', { p_cadastro_id: cadastroId })
}

export async function soltarFichaTitulo(cadastroId: string): Promise<void> {
  await supabase.rpc('titulo_soltar', { p_cadastro_id: cadastroId })
}

export async function salvarMapaTitulo(cadastroId: string, lat: number, lng: number): Promise<void> {
  const { error } = await supabase.rpc('titulo_salvar_mapa', {
    p_cadastro_id: cadastroId,
    p_lat: lat,
    p_lng: lng,
  })
  if (error) {
    throw new Error(
      /titulo_salvar_mapa|schema cache|does not exist/i.test(error.message)
        ? 'Falta aplicar o SQL do mapa no Título (arquivo titulo_mapa_run.sql).'
        : error.message,
    )
  }
}

export async function marcarTitulo(cadastroId: string, status: TituloStatus): Promise<void> {
  const { error } = await supabase.rpc('titulo_marcar', {
    p_cadastro_id: cadastroId,
    p_status: status,
  })
  if (error) throw new Error(error.message)
}

export async function editarFichaTitulo(input: {
  id: string
  nome_completo: string
  nome_mae: string
  data_nascimento: string
  titulo: string
  cpf: string
  zona: string
  secao: string
}): Promise<void> {
  const { error } = await supabase.rpc('titulo_editar_ficha', {
    p_cadastro_id: input.id,
    p_nome_completo: input.nome_completo.trim(),
    p_nome_mae: input.nome_mae.trim(),
    p_data_nascimento: input.data_nascimento.trim(),
    p_titulo: normalizeTitulo(input.titulo),
    p_cpf: normalizeCpf(input.cpf),
    p_zona: normalizeZona(input.zona),
    p_secao: normalizeSecao(input.secao),
  })
  if (error) throw new Error(error.message)
  await supabase.rpc('titulo_marcar_editou', { p_cadastro_id: input.id })
}
