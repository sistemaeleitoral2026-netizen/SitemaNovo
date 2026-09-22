import { compressImageForUpload } from './imageCompress'
import { setCachedSignedUrl, takeCachedSignedUrls } from './signedUrlCache'
import { supabase } from './supabase'
import type { Cadastro, Coordenador, Lider, Profile } from '../types'

export type AtivacaoTipo = 'eleitor' | 'lideranca' | 'coordenador'
export type ContatoWhatsappStatus = 'nao' | 'sim' | 'sem'
/** Adesivo residencial: confirmado (sim), sem, ou talvez (endereço coletado). */
export type AdesivosCasaStatus = 'nao' | 'sim' | 'talvez'

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
  cep: string
  endereco: string
  numero: string
  lat: number | null
  lng: number | null
  carros_adesivados: number
  motos_adesivadas: number
  adesivos_casa: number
  /** nao | sim | talvez — legado sem coluna cai em sim se adesivos_casa > 0 */
  adesivos_casa_status: AdesivosCasaStatus
  foto_veiculo_paths: string[]
  foto_casa_paths: string[]
  postagens: number
  postagem_links: string[]
  ativacao_notas: string
  ativacao_em: string | null
  /** true quando status === 'sim' (legado / KPI) */
  contato_whatsapp: boolean
  contato_whatsapp_status: ContatoWhatsappStatus
  formigas_wa_by: string | null
  formigas_carros_by: string | null
  formigas_casa_by: string | null
  formigas_links_by: string | null
  formigas_wa_by_nome: string | null
  formigas_carros_by_nome: string | null
  formigas_casa_by_nome: string | null
  formigas_links_by_nome: string | null
  diretoria_id: string | null
  coordenador: string
  lider: string
  operator_id: string | null
  coordenador_id: string | null
}

export const FORMIGAS_MAX_FOTOS = 3
const FORMIGAS_FOTOS_BUCKET = 'formigas-fotos'

function toContatoStatus(row: {
  contato_whatsapp_status?: unknown
  contato_whatsapp?: unknown
}): ContatoWhatsappStatus {
  const raw = String(row.contato_whatsapp_status ?? '').trim().toLowerCase()
  if (raw === 'sim' || raw === 'sem' || raw === 'nao') return raw
  return row.contato_whatsapp ? 'sim' : 'nao'
}

function toCasaStatus(row: {
  adesivos_casa_status?: unknown
  adesivos_casa?: unknown
}): AdesivosCasaStatus {
  const raw = String(row.adesivos_casa_status ?? '').trim().toLowerCase()
  if (raw === 'sim' || raw === 'talvez' || raw === 'nao') return raw
  return toQty(row.adesivos_casa) > 0 ? 'sim' : 'nao'
}

function casaStatusLabel(status: AdesivosCasaStatus) {
  if (status === 'sim') return 'Com adesivo'
  if (status === 'talvez') return 'Talvez'
  return 'Sem adesivo'
}

export { casaStatusLabel }

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

function toPaths(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? '').trim()).filter(Boolean)
  }
  return []
}

/** Só vale como Formigas se houve lançamento (ativacao_em). Evita lixo da antiga mobilização. */
function fromAtivacaoFields(row: {
  carros_adesivados?: unknown
  motos_adesivadas?: unknown
  adesivos_casa?: unknown
  adesivos_casa_status?: unknown
  foto_veiculo_paths?: unknown
  foto_casa_paths?: unknown
  postagens?: unknown
  postagem_links?: unknown
  ativacao_notas?: unknown
  ativacao_em?: unknown
  contato_whatsapp?: unknown
  contato_whatsapp_status?: unknown
  formigas_wa_by?: unknown
  formigas_carros_by?: unknown
  formigas_casa_by?: unknown
  formigas_links_by?: unknown
}) {
  const ativacao_em = (row.ativacao_em as string | null | undefined) ?? null
  const launched = Boolean(ativacao_em)
  const status = launched ? toContatoStatus(row) : 'nao'
  const casaStatus = launched ? toCasaStatus(row) : 'nao'
  return {
    carros_adesivados: launched ? toQty(row.carros_adesivados) : 0,
    motos_adesivadas: launched ? toQty(row.motos_adesivadas) : 0,
    adesivos_casa: launched ? (casaStatus === 'sim' ? Math.max(1, toQty(row.adesivos_casa)) : toQty(row.adesivos_casa)) : 0,
    adesivos_casa_status: casaStatus,
    foto_veiculo_paths: launched ? toPaths(row.foto_veiculo_paths) : [],
    foto_casa_paths: launched ? toPaths(row.foto_casa_paths) : [],
    postagens: launched ? toQty(row.postagens) : 0,
    postagem_links: launched ? toLinks(row.postagem_links) : [],
    ativacao_notas: launched ? String(row.ativacao_notas ?? '') : '',
    ativacao_em,
    contato_whatsapp: status === 'sim',
    contato_whatsapp_status: status,
    formigas_wa_by: launched ? ((row.formigas_wa_by as string | null) ?? null) : null,
    formigas_carros_by: launched ? ((row.formigas_carros_by as string | null) ?? null) : null,
    formigas_casa_by: launched ? ((row.formigas_casa_by as string | null) ?? null) : null,
    formigas_links_by: launched ? ((row.formigas_links_by as string | null) ?? null) : null,
    formigas_wa_by_nome: null as string | null,
    formigas_carros_by_nome: null as string | null,
    formigas_casa_by_nome: null as string | null,
    formigas_links_by_nome: null as string | null,
  }
}

async function enrichOwnerNames(items: AtivacaoPessoa[]): Promise<AtivacaoPessoa[]> {
  if (items.length === 0) return items
  const ids = new Set<string>()
  for (const p of items) {
    if (p.formigas_wa_by) ids.add(p.formigas_wa_by)
    if (p.formigas_carros_by) ids.add(p.formigas_carros_by)
    if (p.formigas_casa_by) ids.add(p.formigas_casa_by)
    if (p.formigas_links_by) ids.add(p.formigas_links_by)
  }
  if (ids.size === 0) return items

  const { data } = await supabase
    .from('profiles')
    .select('id, nome')
    .in('id', [...ids])

  const nomeById = new Map<string, string>()
  for (const row of data ?? []) {
    const id = String(row.id ?? '')
    if (!id) continue
    nomeById.set(id, String(row.nome ?? '').trim() || 'Formiga')
  }

  return items.map((p) => ({
    ...p,
    formigas_wa_by_nome: p.formigas_wa_by ? (nomeById.get(p.formigas_wa_by) ?? null) : null,
    formigas_carros_by_nome: p.formigas_carros_by ? (nomeById.get(p.formigas_carros_by) ?? null) : null,
    formigas_casa_by_nome: p.formigas_casa_by ? (nomeById.get(p.formigas_casa_by) ?? null) : null,
    formigas_links_by_nome: p.formigas_links_by ? (nomeById.get(p.formigas_links_by) ?? null) : null,
  }))
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
    cep: (c.cep ?? '').replace(/\D/g, ''),
    endereco: (c.endereco ?? '').trim(),
    numero: (c.numero ?? '').trim(),
    lat: typeof c.lat === 'number' ? c.lat : null,
    lng: typeof c.lng === 'number' ? c.lng : null,
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
    bairro: (l.bairro ?? '').trim(),
    telefone: l.telefone ?? '',
    cep: (l.cep ?? '').replace(/\D/g, ''),
    endereco: (l.endereco ?? '').trim(),
    numero: (l.numero ?? '').trim(),
    lat: l.lat ?? null,
    lng: l.lng ?? null,
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
    bairro: (c.bairro ?? '').trim(),
    telefone: '',
    cep: (c.cep ?? '').replace(/\D/g, ''),
    endereco: (c.endereco ?? '').trim(),
    numero: (c.numero ?? '').trim(),
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    ...ativ,
    diretoria_id: c.diretoria_id ?? null,
    coordenador: c.nome ?? '',
    lider: '',
    operator_id: null,
    coordenador_id: null,
  }
}

const CADASTRO_SELECT =
  'id, nome_completo, titulo, zona, bairro, telefone, cep, endereco, numero, lat, lng, carros_adesivados, motos_adesivadas, adesivos_casa, adesivos_casa_status, foto_veiculo_paths, foto_casa_paths, postagens, postagem_links, ativacao_notas, ativacao_em, contato_whatsapp, contato_whatsapp_status, formigas_wa_by, formigas_carros_by, formigas_casa_by, formigas_links_by, diretoria_id, coordenador, lider, operator_id'

const LIDER_SELECT =
  'id, nome, telefone, carros_adesivados, motos_adesivadas, adesivos_casa, adesivos_casa_status, foto_veiculo_paths, foto_casa_paths, postagens, postagem_links, ativacao_notas, ativacao_em, contato_whatsapp, contato_whatsapp_status, formigas_wa_by, formigas_carros_by, formigas_casa_by, formigas_links_by, diretoria_id, coordenador_id, cep, endereco, numero, bairro, cidade, uf, lat, lng'

const COORD_SELECT =
  'id, nome, carros_adesivados, motos_adesivadas, adesivos_casa, adesivos_casa_status, foto_veiculo_paths, foto_casa_paths, postagens, postagem_links, ativacao_notas, ativacao_em, contato_whatsapp, contato_whatsapp_status, formigas_wa_by, formigas_carros_by, formigas_casa_by, formigas_links_by, diretoria_id, cep, endereco, numero, bairro, cidade, uf, lat, lng'

export async function searchAtivacaoPessoas(term: string, limit = 12, diretoriaId?: string): Promise<AtivacaoPessoa[]> {
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

  let cadQuery = supabase
      .from('cadastros')
      .select(CADASTRO_SELECT)
      .or(cadOr)
      .order('nome_completo')
      .limit(limit)
  let liderQuery = supabase
      .from('lideres')
      .select(LIDER_SELECT)
      .eq('ativo', true)
      .or(liderOr)
      .order('nome')
      .limit(8)
  let coordQuery = supabase
      .from('coordenadores')
      .select(COORD_SELECT)
      .eq('ativo', true)
      .ilike('nome', `%${q}%`)
      .order('nome')
      .limit(8)
  if (diretoriaId) {
    cadQuery = cadQuery.eq('diretoria_id', diretoriaId)
    liderQuery = liderQuery.eq('diretoria_id', diretoriaId)
    coordQuery = coordQuery.eq('diretoria_id', diretoriaId)
  }

  const [cadRes, lidRes, coordRes] = await Promise.all([cadQuery, liderQuery, coordQuery])

  const searchError = cadRes.error || lidRes.error || coordRes.error
  if (searchError) throw new Error(searchError.message)

  // Liderança/coordenador primeiro: senão o slice(0, limit) só devolve eleitores
  // e a formiga "não acha" a liderança na busca.
  const liderancas = ((lidRes.data ?? []) as unknown as Lider[]).map(fromLider)
  const coordenadores = ((coordRes.data ?? []) as unknown as Coordenador[]).map(fromCoord)
  const eleitores = ((cadRes.data ?? []) as unknown as Cadastro[]).map(fromCadastro)
  return enrichOwnerNames([...liderancas, ...coordenadores, ...eleitores].slice(0, limit))
}

export async function fetchAtivacaoPessoa(
  tipo: AtivacaoTipo,
  id: string,
): Promise<AtivacaoPessoa | null> {
  let pessoa: AtivacaoPessoa | null = null
  if (tipo === 'eleitor') {
    const { data } = await supabase.from('cadastros').select(CADASTRO_SELECT).eq('id', id).maybeSingle()
    pessoa = data ? fromCadastro(data as unknown as Cadastro) : null
  } else if (tipo === 'lideranca') {
    const { data } = await supabase.from('lideres').select(LIDER_SELECT).eq('id', id).maybeSingle()
    pessoa = data ? fromLider(data as unknown as Lider) : null
  } else {
    const { data } = await supabase.from('coordenadores').select(COORD_SELECT).eq('id', id).maybeSingle()
    pessoa = data ? fromCoord(data as unknown as Coordenador) : null
  }
  if (!pessoa) return null
  const [enriched] = await enrichOwnerNames([pessoa])
  return enriched
}

export type AtivacaoSaveInput = {
  carros_adesivados: number
  motos_adesivadas: number
  /** @deprecated use adesivos_casa_status */
  casa?: boolean
  adesivos_casa_status: AdesivosCasaStatus
  links: string[]
  notas: string
  contato_whatsapp_status: ContatoWhatsappStatus
  /** Endereço da casa (obrigatório p/ sim ou talvez) — grava na ficha */
  cep?: string
  endereco?: string
  numero?: string
  bairro?: string
  /** Paths já salvos que devem permanecer */
  foto_veiculo_keep?: string[]
  foto_casa_keep?: string[]
  /** Novos arquivos a enviar */
  foto_veiculo_files?: File[]
  foto_casa_files?: File[]
}

async function uploadFormigasFoto(
  userId: string,
  tipo: AtivacaoTipo,
  pessoaId: string,
  kind: 'veiculo' | 'casa',
  file: File,
): Promise<string> {
  const prepared = await compressImageForUpload(file)
  const ext = prepared.type === 'image/jpeg'
    ? 'jpg'
    : (prepared.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${userId}/${tipo}/${pessoaId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'jpg'}`
  const { error } = await supabase.storage.from(FORMIGAS_FOTOS_BUCKET).upload(path, prepared, {
    cacheControl: '86400',
    upsert: false,
    contentType: prepared.type || 'image/jpeg',
  })
  if (error) throw new Error(error.message)
  return path
}

/** Assina várias fotos Formigas em 1 request (+ cache de sessão). */
export async function signFormigasFotoPaths(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  const out = new Map<string, string>()
  if (!unique.length) return out

  const { hits, missing } = takeCachedSignedUrls(FORMIGAS_FOTOS_BUCKET, unique)
  for (const [path, url] of hits) out.set(path, url)
  if (!missing.length) return out

  const { data, error } = await supabase.storage
    .from(FORMIGAS_FOTOS_BUCKET)
    .createSignedUrls(missing, 60 * 60)

  if (!error && data?.length) {
    for (const row of data) {
      if (row.path && row.signedUrl && !row.error) {
        out.set(row.path, row.signedUrl)
        setCachedSignedUrl(FORMIGAS_FOTOS_BUCKET, row.path, row.signedUrl)
      }
    }
  }

  const stillMissing = missing.filter((p) => !out.has(p))
  if (stillMissing.length) {
    await Promise.all(
      stillMissing.map(async (path) => {
        const { data: one } = await supabase.storage
          .from(FORMIGAS_FOTOS_BUCKET)
          .createSignedUrl(path, 60 * 60)
        if (one?.signedUrl) {
          out.set(path, one.signedUrl)
          setCachedSignedUrl(FORMIGAS_FOTOS_BUCKET, path, one.signedUrl)
        }
      }),
    )
  }
  return out
}

export async function getFormigasFotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const map = await signFormigasFotoPaths([path])
  return map.get(path) ?? null
}

export async function getFormigasFotoUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return []
  const map = await signFormigasFotoPaths(paths)
  return paths.map((p) => map.get(p) ?? null).filter((u): u is string => Boolean(u))
}

function waStatusLabel(status: ContatoWhatsappStatus) {
  if (status === 'sim') return 'Já acionada'
  if (status === 'sem') return 'Sem WhatsApp'
  return 'Não acionada'
}

/** Link do Google Maps a partir de coords ou endereço. */
export function mapsUrlForPessoa(p: {
  lat?: number | null
  lng?: number | null
  endereco?: string | null
  numero?: string | null
  cep?: string | null
  bairro?: string | null
}): string | null {
  if (p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
    return `https://www.google.com/maps?q=${p.lat},${p.lng}`
  }
  const parts = [
    (p.endereco ?? '').trim(),
    (p.numero ?? '').trim() ? `nº ${(p.numero ?? '').trim()}` : '',
    (p.bairro ?? '').trim(),
    (p.cep ?? '').replace(/\D/g, '').length === 8
      ? (p.cep ?? '').replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2')
      : '',
  ].filter(Boolean)
  if (!parts.length) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`
}

type FormigasHistoricoInsert = {
  actor_id: string
  actor_email: string | null
  actor_nome: string | null
  tipo: AtivacaoTipo
  pessoa_id: string
  pessoa_nome: string
  secao: 'whatsapp' | 'carros' | 'casa' | 'links' | 'notas'
  resumo: string
  valor_antes: string | null
  valor_depois: string | null
  diretoria_id: string | null
}

async function logFormigasHistorico(
  previous: AtivacaoPessoa,
  input: AtivacaoSaveInput,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('nome, email')
      .eq('id', userId)
      .maybeSingle()

    const actorEmail = (profile?.email ?? session.user.email ?? '').trim() || null
    const actorNome = (profile?.nome ?? '').trim() || null
    const pessoa = previous.nome.trim() || 'pessoa'

    const nextLinks = input.links.map((l) => l.trim()).filter(Boolean)
    const nextCarros = Math.max(0, Math.floor(Number(input.carros_adesivados) || 0))
    const nextMotos = Math.max(0, Math.floor(Number(input.motos_adesivadas) || 0))
    const nextCasaStatus: AdesivosCasaStatus =
      input.adesivos_casa_status
      ?? (input.casa ? 'sim' : 'nao')
    const nextNotas = input.notas.trim()
    const prevCasaStatus = previous.adesivos_casa_status
    const prevLinks = previous.postagem_links
    const prevNotas = (previous.ativacao_notas || '').trim()

    const rows: FormigasHistoricoInsert[] = []

    if (previous.contato_whatsapp_status !== input.contato_whatsapp_status) {
      const depois = waStatusLabel(input.contato_whatsapp_status)
      rows.push({
        actor_id: userId,
        actor_email: actorEmail,
        actor_nome: actorNome,
        tipo: previous.tipo,
        pessoa_id: previous.id,
        pessoa_nome: pessoa,
        secao: 'whatsapp',
        resumo: `WhatsApp alterado para "${depois}"`,
        valor_antes: waStatusLabel(previous.contato_whatsapp_status),
        valor_depois: depois,
        diretoria_id: previous.diretoria_id,
      })
    }

    if (
      previous.carros_adesivados !== nextCarros
      || previous.motos_adesivadas !== nextMotos
    ) {
      const depois = [
        nextCarros > 0 ? `${nextCarros} carro${nextCarros === 1 ? '' : 's'}` : null,
        nextMotos > 0 ? `${nextMotos} moto${nextMotos === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(' · ') || 'nenhum'
      const antes = [
        previous.carros_adesivados > 0
          ? `${previous.carros_adesivados} carro${previous.carros_adesivados === 1 ? '' : 's'}`
          : null,
        previous.motos_adesivadas > 0
          ? `${previous.motos_adesivadas} moto${previous.motos_adesivadas === 1 ? '' : 's'}`
          : null,
      ].filter(Boolean).join(' · ') || 'nenhum'
      rows.push({
        actor_id: userId,
        actor_email: actorEmail,
        actor_nome: actorNome,
        tipo: previous.tipo,
        pessoa_id: previous.id,
        pessoa_nome: pessoa,
        secao: 'carros',
        resumo: `Veículos adesivados: ${depois}`,
        valor_antes: antes,
        valor_depois: depois,
        diretoria_id: previous.diretoria_id,
      })
    }

    const addrBits = [
      (input.endereco ?? '').trim(),
      (input.numero ?? '').trim() ? `nº ${(input.numero ?? '').trim()}` : '',
      (input.cep ?? '').replace(/\D/g, '').length === 8
        ? `CEP ${(input.cep ?? '').replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2')}`
        : '',
    ].filter(Boolean)
    const addrKey = addrBits.join(', ')
    const prevAddrKey = [
      previous.endereco.trim(),
      previous.numero.trim() ? `nº ${previous.numero.trim()}` : '',
      previous.cep.replace(/\D/g, '').length === 8
        ? `CEP ${previous.cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2')}`
        : '',
    ].filter(Boolean).join(', ')

    if (
      prevCasaStatus !== nextCasaStatus
      || ((nextCasaStatus === 'sim' || nextCasaStatus === 'talvez') && addrKey && addrKey !== prevAddrKey)
    ) {
      const label = casaStatusLabel(nextCasaStatus)
      const depois =
        nextCasaStatus === 'nao'
          ? 'não'
          : addrKey
            ? `${label} — ${addrKey}`
            : label
      rows.push({
        actor_id: userId,
        actor_email: actorEmail,
        actor_nome: actorNome,
        tipo: previous.tipo,
        pessoa_id: previous.id,
        pessoa_nome: pessoa,
        secao: 'casa',
        resumo:
          nextCasaStatus === 'nao'
            ? 'Removeu adesivo residencial'
            : nextCasaStatus === 'talvez'
              ? `Marcou adesivo residencial como talvez${addrKey ? ` — ${addrKey}` : ''}`
              : `Marcou adesivo residencial${addrKey ? ` — ${addrKey}` : ''}`,
        valor_antes: prevCasaStatus === 'nao' ? 'não' : (prevAddrKey || casaStatusLabel(prevCasaStatus)),
        valor_depois: depois,
        diretoria_id: previous.diretoria_id,
      })
    }

    const prevLinksKey = [...prevLinks].sort().join('\n')
    const nextLinksKey = [...nextLinks].sort().join('\n')
    if (prevLinksKey !== nextLinksKey) {
      rows.push({
        actor_id: userId,
        actor_email: actorEmail,
        actor_nome: actorNome,
        tipo: previous.tipo,
        pessoa_id: previous.id,
        pessoa_nome: pessoa,
        secao: 'links',
        resumo: `Atualizou links/redes (${nextLinks.length} postagem${nextLinks.length === 1 ? '' : 's'})`,
        valor_antes: prevLinks.length ? `${prevLinks.length} link(s)` : 'nenhum',
        valor_depois: nextLinks.length ? `${nextLinks.length} link(s)` : 'nenhum',
        diretoria_id: previous.diretoria_id,
      })
    }

    if (prevNotas !== nextNotas) {
      rows.push({
        actor_id: userId,
        actor_email: actorEmail,
        actor_nome: actorNome,
        tipo: previous.tipo,
        pessoa_id: previous.id,
        pessoa_nome: pessoa,
        secao: 'notas',
        resumo: 'Atualizou observações',
        valor_antes: prevNotas || null,
        valor_depois: nextNotas || null,
        diretoria_id: previous.diretoria_id,
      })
    }

    if (rows.length === 0) return
    await supabase.from('formigas_historico').insert(rows)
  } catch {
    // Histórico não deve falhar o lançamento
  }
}

export async function saveAtivacao(
  tipo: AtivacaoTipo,
  id: string,
  input: AtivacaoSaveInput,
  previous?: AtivacaoPessoa | null,
): Promise<{ error: string | null }> {
  const links = input.links.map((l) => l.trim()).filter(Boolean)
  const carros = Math.max(0, Math.floor(Number(input.carros_adesivados) || 0))
  const motos = Math.max(0, Math.floor(Number(input.motos_adesivadas) || 0))
  const casaStatus: AdesivosCasaStatus =
    input.adesivos_casa_status
    ?? (input.casa ? 'sim' : 'nao')
  const casa = casaStatus === 'sim' ? 1 : 0
  const needsCasaAddr = casaStatus === 'sim' || casaStatus === 'talvez'
  const notas = input.notas.trim() || null
  const status: ContatoWhatsappStatus = input.contato_whatsapp_status
  const contato = status === 'sim'
  const hasLaunch =
    carros > 0
    || motos > 0
    || casa > 0
    || casaStatus === 'talvez'
    || links.length > 0
    || Boolean(notas)
    || status === 'sim'
    || status === 'sem'

  const cepDigits = (input.cep ?? '').replace(/\D/g, '')
  const endereco = (input.endereco ?? '').trim()
  const numero = (input.numero ?? '').trim()

  if (needsCasaAddr) {
    if (cepDigits.length !== 8) {
      return { error: 'Informe um CEP válido da casa (adesivo ou talvez).' }
    }
    if (!endereco) {
      return { error: 'Informe o endereço da casa (adesivo ou talvez).' }
    }
    if (!numero) {
      return { error: 'Informe o número da casa (adesivo ou talvez).' }
    }
  }

  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) return { error: 'Sessão expirada. Entre novamente.' }

  const keepVeiculo = [...new Set((input.foto_veiculo_keep ?? []).filter(Boolean))].slice(0, FORMIGAS_MAX_FOTOS)
  const keepCasa = [...new Set((input.foto_casa_keep ?? []).filter(Boolean))].slice(0, FORMIGAS_MAX_FOTOS)
  const filesVeiculo = (input.foto_veiculo_files ?? []).slice(0, Math.max(0, FORMIGAS_MAX_FOTOS - keepVeiculo.length))
  const filesCasa = (input.foto_casa_files ?? []).slice(0, Math.max(0, FORMIGAS_MAX_FOTOS - keepCasa.length))

  if ((carros > 0 || motos > 0) && keepVeiculo.length + filesVeiculo.length < 1) {
    return { error: 'Adicione pelo menos 1 foto do veículo adesivado.' }
  }
  if (casaStatus === 'sim' && keepCasa.length + filesCasa.length < 1) {
    return { error: 'Adicione pelo menos 1 foto da casa adesivada.' }
  }

  const uploaded: string[] = []
  let foto_veiculo_paths = keepVeiculo
  let foto_casa_paths = keepCasa
  try {
    for (const file of filesVeiculo) {
      const path = await uploadFormigasFoto(userId, tipo, id, 'veiculo', file)
      uploaded.push(path)
      foto_veiculo_paths = [...foto_veiculo_paths, path]
    }
    for (const file of filesCasa) {
      const path = await uploadFormigasFoto(userId, tipo, id, 'casa', file)
      uploaded.push(path)
      foto_casa_paths = [...foto_casa_paths, path]
    }
  } catch (err) {
    if (uploaded.length) void supabase.storage.from(FORMIGAS_FOTOS_BUCKET).remove(uploaded)
    return { error: err instanceof Error ? err.message : 'Falha ao enviar as fotos.' }
  }

  if (!(carros > 0 || motos > 0)) foto_veiculo_paths = []
  if (casaStatus !== 'sim') foto_casa_paths = []

  const payload: Record<string, unknown> = {
    carros_adesivados: carros,
    motos_adesivadas: motos,
    adesivos_casa: casa,
    adesivos_casa_status: casaStatus,
    postagem_links: links,
    postagens: links.length,
    ativacao_notas: notas,
    // Mantém a data do primeiro lançamento; editar uma ficha não altera sua antiguidade.
    ativacao_em: hasLaunch ? (previous?.ativacao_em ?? new Date().toISOString()) : null,
    contato_whatsapp: contato,
    contato_whatsapp_status: status,
    foto_veiculo_paths,
    foto_casa_paths,
  }

  if (needsCasaAddr) {
    payload.cep = cepDigits
    payload.endereco = endereco
    payload.numero = numero

    const bairroInput = (input.bairro ?? '').trim()
    let cidade = ''
    let uf = ''
    let bairro = bairroInput

    try {
      const { lookupViaCep, geocodeFromAddress, geocodeFromCep, coordsFromZona } = await import('./geocode')
      const via = await lookupViaCep(cepDigits)
      if (via) {
        if (!bairro && via.bairro) bairro = via.bairro
        cidade = via.localidade || ''
        uf = via.uf || ''
      }
      if (bairro) payload.bairro = bairro
      if (cidade) payload.cidade = cidade
      if (uf) payload.uf = uf

      // Prioridade: endereço completo → CEP (BrasilAPI) → zona eleitoral da ficha → coords já existentes
      const coords =
        (await geocodeFromAddress({
          endereco,
          numero,
          bairro,
          cidade,
          uf,
          cep: cepDigits,
        }))
        || (await geocodeFromCep(cepDigits))
        || (previous?.zona ? coordsFromZona(previous.zona) : null)
        || (previous?.lat != null && previous?.lng != null
          ? { lat: previous.lat, lng: previous.lng }
          : null)

      if (coords) {
        payload.lat = coords.lat
        payload.lng = coords.lng
      }
    } catch {
      if (bairro) payload.bairro = bairro
      // endereço textual já fica salvo mesmo se geocode falhar
    }
  }

  const table = tipo === 'eleitor' ? 'cadastros' : tipo === 'lideranca' ? 'lideres' : 'coordenadores'
  const { data: updated, error } = await supabase.from(table).update(payload).eq('id', id).select('id').maybeSingle()
  if (error) {
    if (uploaded.length) void supabase.storage.from(FORMIGAS_FOTOS_BUCKET).remove(uploaded)
    return { error: error.message }
  }
  if (!updated) {
    if (uploaded.length) void supabase.storage.from(FORMIGAS_FOTOS_BUCKET).remove(uploaded)
    return { error: 'O registro não foi atualizado. Recarregue a ficha e tente novamente.' }
  }

  // Remove do storage paths que saíram da ficha
  if (previous) {
    const dropped = [
      ...previous.foto_veiculo_paths.filter((p) => !foto_veiculo_paths.includes(p)),
      ...previous.foto_casa_paths.filter((p) => !foto_casa_paths.includes(p)),
    ]
    if (dropped.length) void supabase.storage.from(FORMIGAS_FOTOS_BUCKET).remove(dropped)
  }

  if (previous && previous.id === id && previous.tipo === tipo) {
    await logFormigasHistorico(previous, {
      ...input,
      foto_veiculo_keep: foto_veiculo_paths,
      foto_casa_keep: foto_casa_paths,
    })
  }
  await releaseAtivacaoClaim(tipo, id)
  return { error: null }
}

export type FormigasHistoricoItem = {
  id: string
  actor_id: string
  actor_email: string | null
  actor_nome: string | null
  tipo: AtivacaoTipo
  pessoa_id: string
  pessoa_nome: string
  secao: 'whatsapp' | 'carros' | 'casa' | 'links' | 'notas'
  resumo: string
  valor_antes: string | null
  valor_depois: string | null
  created_at: string
}

export function historicoDescricao(item: FormigasHistoricoItem): string {
  if (item.secao === 'whatsapp') {
    return item.valor_depois
      ? `WhatsApp: ${item.valor_depois}`
      : (item.resumo || 'Atualizou WhatsApp')
  }
  if (item.secao === 'carros') {
    return item.valor_depois != null
      ? `Veículos: ${item.valor_depois}`
      : (item.resumo || 'Atualizou veículos')
  }
  if (item.secao === 'casa') {
    if (item.valor_depois && item.valor_depois !== 'sim' && item.valor_depois !== 'não') {
      return `Adesivo residencial — ${item.valor_depois}`
    }
    return item.valor_depois === 'sim'
      ? 'Marcou adesivo residencial'
      : item.valor_depois === 'não'
        ? 'Removeu adesivo residencial'
        : (item.resumo || 'Atualizou adesivo residencial')
  }
  if (item.secao === 'links') {
    return item.valor_depois
      ? `Redes/postagens: ${item.valor_depois}`
      : (item.resumo || 'Atualizou links')
  }
  return item.resumo || 'Atualizou observações'
}

export async function fetchFormigasHistorico(opts?: {
  onlyMine?: boolean
  actorId?: string | null
  limit?: number
  offset?: number
}): Promise<{ items: FormigasHistoricoItem[]; total: number; error: string | null }> {
  const limit = opts?.limit ?? 40
  const offset = opts?.offset ?? 0
  let q = supabase
    .from('formigas_historico')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (opts?.actorId) {
    q = q.eq('actor_id', opts.actorId)
  } else if (opts?.onlyMine) {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return { items: [], total: 0, error: null }
    q = q.eq('actor_id', uid)
  }

  const { data, error, count } = await q
  if (error) return { items: [], total: 0, error: error.message }
  return {
    items: (data ?? []) as FormigasHistoricoItem[],
    total: count ?? 0,
    error: null,
  }
}

/** Timeline de uma ficha (todas as formigas que mexeram nela). */
export async function fetchFormigasHistoricoPorPessoa(
  tipo: AtivacaoTipo,
  pessoaId: string,
  limit = 80,
): Promise<{ items: FormigasHistoricoItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from('formigas_historico')
    .select('*')
    .eq('tipo', tipo)
    .eq('pessoa_id', pessoaId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { items: [], error: error.message }
  return { items: (data ?? []) as FormigasHistoricoItem[], error: null }
}

export async function fetchFormigasHistoricoActors(): Promise<{ id: string; nome: string; email: string }[]> {
  const { data, error } = await supabase
    .from('formigas_historico')
    .select('actor_id, actor_nome, actor_email')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error || !data) return []
  const map = new Map<string, { id: string; nome: string; email: string }>()
  for (const row of data) {
    const id = String(row.actor_id ?? '')
    if (!id || map.has(id)) continue
    map.set(id, {
      id,
      nome: String(row.actor_nome ?? '').trim() || 'Formiga',
      email: String(row.actor_email ?? '').trim(),
    })
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
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
    | 'casa_talvez'
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
    || p.motos_adesivadas > 0
    || p.adesivos_casa > 0
    || p.adesivos_casa_status === 'talvez'
    || p.postagem_links.length > 0
    || p.contato_whatsapp_status === 'sim'
    || p.contato_whatsapp_status === 'sem'
  if (status === 'com_ativacao') return hasAny
  if (status === 'sem_ativacao') return !hasAny
  if (status === 'com_carro') return p.carros_adesivados > 0 || p.motos_adesivadas > 0
  if (status === 'casa_sim') return p.adesivos_casa_status === 'sim' || p.adesivos_casa > 0
  if (status === 'casa_talvez') return p.adesivos_casa_status === 'talvez'
  if (status === 'com_links') return p.postagem_links.length > 0
  if (status === 'contato_sim') return p.contato_whatsapp_status === 'sim'
  if (status === 'contato_nao') return p.contato_whatsapp_status === 'nao'
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
  const pageItems = items.slice(start, start + pageSize)
  // KPIs pedem pageSize enorme — não resolve nomes de owners nesse caminho.
  if (pageSize > 500) return { items: pageItems, total }
  return { items: await enrichOwnerNames(pageItems), total }
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
  let casasTalvez = 0
  let postagens = 0
  let whatsapp = 0
  let comAtivacao = 0
  for (const p of items) {
    if (p.carros_adesivados > 0 || p.motos_adesivadas > 0) carros += 1
    if (p.adesivos_casa_status === 'sim' || p.adesivos_casa > 0) casas += 1
    if (p.adesivos_casa_status === 'talvez') casasTalvez += 1
    if (p.postagem_links.length > 0) postagens += 1
    if (p.contato_whatsapp_status === 'sim') whatsapp += 1
    if (
      p.carros_adesivados > 0
      || p.motos_adesivadas > 0
      || p.adesivos_casa > 0
      || p.adesivos_casa_status === 'talvez'
      || p.postagem_links.length > 0
      || p.contato_whatsapp_status === 'sim'
      || p.contato_whatsapp_status === 'sem'
    ) {
      comAtivacao += 1
    }
  }
  return {
    totalPessoas: items.length,
    carros,
    casas,
    casasTalvez,
    postagens,
    whatsapp,
    comAtivacao,
    pendentes: Math.max(0, items.length - comAtivacao),
  }
}
