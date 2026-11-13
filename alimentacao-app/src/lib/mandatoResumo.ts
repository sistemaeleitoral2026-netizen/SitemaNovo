import { supabase } from './supabase'
import type { MapMarkerData } from '../types'

export type BairroResumo = {
  nome: string
  fichas: number
  liderancas: number
  lat: number | null
  lng: number | null
}

export type ResumoFichas = {
  cidadaos: number
  bairros: number
  semBairro: number
  ranking: BairroResumo[]
  markers: MapMarkerData[]
  /** Quantidade de fichas por nome de liderança, já contada na leitura dos bairros. */
  fichasPorLider: Record<string, number>
}

type FichaBairro = { bairro: string | null; lider: string | null; lat: number | null; lng: number | null }

export type FichaBusca = {
  id: string
  n: string
  sub: string
  telefone: string
  bairro: string
  lider: string
  titulo: string
  zona: string
  secao: string
  /** eleitor | lideranca | coordenacao */
  tipo: 'eleitor' | 'lideranca' | 'coordenacao'
  tipoLabel: string
  cpf: string
  nasc: string
  cep: string
  rua: string
  num: string
  comp: string
  email: string
}

export type LiderPainel = {
  id: string
  nome: string
  telefone: string
  bairro: string
}

function termoBusca(q: string) {
  return q.trim().replace(/[%*,()\\]/g, '').slice(0, 60)
}

export function chaveLider(nome: string) {
  return nome.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR')
}

function soDigitos(v: string) {
  return v.replace(/\D/g, '')
}

function formatCpfMask(v: string) {
  const d = soDigitos(v).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function formatCepMask(v: string) {
  const d = soDigitos(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

function formatTelMask(v: string) {
  const d = soDigitos(v).slice(0, 11)
  if (d.length < 3) return d
  if (d.length < 8) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`
}

function nascISO(v: unknown) {
  const raw = String(v || '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return ''
}

function montarFicha(base: {
  id: string
  n: string
  tipo: FichaBusca['tipo']
  tipoLabel: string
  telefone?: string | null
  bairro?: string | null
  lider?: string | null
  titulo?: string | null
  zona?: string | null
  secao?: string | null
  cpf?: string | null
  nasc?: string | null
  cep?: string | null
  rua?: string | null
  num?: string | null
  comp?: string | null
  email?: string | null
}): FichaBusca {
  const telefone = formatTelMask(String(base.telefone || ''))
  const cpf = formatCpfMask(String(base.cpf || ''))
  const cep = formatCepMask(String(base.cep || ''))
  const bairro = String(base.bairro || '').trim()
  const lider = String(base.lider || '').trim()
  const titulo = String(base.titulo || '').trim()
  const zona = String(base.zona || '').trim()
  const secao = String(base.secao || '').trim()
  return {
    id: String(base.id),
    n: String(base.n || '').trim(),
    tipo: base.tipo,
    tipoLabel: base.tipoLabel,
    telefone,
    bairro,
    lider,
    titulo,
    zona,
    secao,
    cpf,
    nasc: nascISO(base.nasc),
    cep,
    rua: String(base.rua || '').trim(),
    num: String(base.num || '').trim(),
    comp: String(base.comp || '').trim(),
    email: String(base.email || '').trim(),
    sub: [base.tipoLabel, bairro, zona && secao ? `Zona ${zona} · Seção ${secao}` : '', lider, telefone || cpf]
      .filter(Boolean)
      .join(' · '),
  }
}

/**
 * Busca eleitor, liderança e coordenação no Nerites por nome ou CPF.
 * No máximo ~20 resultados; a base inteira fica no Nerites.
 */
export async function buscarFichasPorNome(q: string): Promise<FichaBusca[]> {
  const termo = termoBusca(q)
  const digits = soDigitos(termo)
  const temLetras = /[a-zA-ZÀ-ÿ]/.test(termo)
  const porCpf = digits.length >= 4
  if (!temLetras && !porCpf) return []
  if (temLetras && termo.length < 2 && !porCpf) return []

  const cadOr = [
    temLetras && termo.length >= 2 ? `nome_completo.ilike.%${termo}%` : '',
    porCpf ? `cpf.ilike.%${digits}%` : '',
  ]
    .filter(Boolean)
    .join(',')

  type QueryRes = { data: unknown[] | null; error: { message: string } | null }
  const vazio: QueryRes = { data: [], error: null }

  const cadPromise: PromiseLike<QueryRes> = cadOr
    ? supabase
        .from('cadastros')
        .select(
          'id,nome_completo,cpf,telefone,bairro,lider,titulo,zona,secao,data_nascimento,cep,endereco,numero,complemento',
        )
        .or(cadOr)
        .order('nome_completo')
        .limit(20)
    : Promise.resolve(vazio)

  const lidPromise: PromiseLike<QueryRes> =
    temLetras && termo.length >= 2
      ? supabase
          .from('lideres')
          .select('id,nome,telefone,bairro,cep,endereco,numero')
          .eq('ativo', true)
          .ilike('nome', `%${termo}%`)
          .order('nome')
          .limit(8)
      : Promise.resolve(vazio)

  const coordPromise: PromiseLike<QueryRes> =
    temLetras && termo.length >= 2
      ? supabase
          .from('coordenadores')
          .select('id,nome,cep,endereco,numero,bairro')
          .eq('ativo', true)
          .ilike('nome', `%${termo}%`)
          .order('nome')
          .limit(8)
      : Promise.resolve(vazio)

  // Cada fonte é independente: se coordenação/liderança falhar, eleitores ainda aparecem.
  const settled = await Promise.allSettled([cadPromise, lidPromise, coordPromise])
  const cadRes: QueryRes = settled[0].status === 'fulfilled' ? settled[0].value : vazio
  const lidRes: QueryRes = settled[1].status === 'fulfilled' ? settled[1].value : vazio
  const coordRes: QueryRes = settled[2].status === 'fulfilled' ? settled[2].value : vazio
  if (cadRes.error && lidRes.error && coordRes.error) {
    throw new Error(cadRes.error.message)
  }

  type CadRow = {
    id: string
    nome_completo?: string | null
    cpf?: string | null
    telefone?: string | null
    bairro?: string | null
    lider?: string | null
    titulo?: string | null
    zona?: string | null
    secao?: string | null
    data_nascimento?: string | null
    cep?: string | null
    endereco?: string | null
    numero?: string | null
    complemento?: string | null
  }
  type LidRow = {
    id: string
    nome?: string | null
    telefone?: string | null
    bairro?: string | null
    cep?: string | null
    endereco?: string | null
    numero?: string | null
  }
  type CoordRow = {
    id: string
    nome?: string | null
    cep?: string | null
    endereco?: string | null
    numero?: string | null
    bairro?: string | null
  }

  const coords = ((coordRes.data ?? []) as CoordRow[]).map((row) =>
    montarFicha({
      id: row.id,
      n: row.nome || '',
      tipo: 'coordenacao',
      tipoLabel: 'Coordenação',
      bairro: row.bairro,
      cep: row.cep,
      rua: row.endereco,
      num: row.numero,
    }),
  )
  const lids = ((lidRes.data ?? []) as LidRow[]).map((row) =>
    montarFicha({
      id: row.id,
      n: row.nome || '',
      tipo: 'lideranca',
      tipoLabel: 'Liderança',
      telefone: row.telefone,
      bairro: row.bairro,
      lider: row.nome,
      cep: row.cep,
      rua: row.endereco,
      num: row.numero,
    }),
  )
  const cads = ((cadRes.data ?? []) as CadRow[]).map((row) =>
    montarFicha({
      id: row.id,
      n: row.nome_completo || '',
      tipo: 'eleitor',
      tipoLabel: 'Eleitor',
      telefone: row.telefone,
      bairro: row.bairro,
      lider: row.lider,
      titulo: row.titulo,
      zona: row.zona,
      secao: row.secao,
      cpf: row.cpf,
      nasc: row.data_nascimento,
      cep: row.cep,
      rua: row.endereco,
      num: row.numero,
      comp: row.complemento,
    }),
  )

  // Coordenação e liderança primeiro; depois eleitores.
  return [...coords, ...lids, ...cads].slice(0, 20)
}

/** Lideranças ativas do Nerites, só nome, telefone e bairro. */
export async function listarLiderancasNerites(): Promise<LiderPainel[]> {
  const { data, error } = await supabase
    .from('lideres')
    .select('id,nome,telefone,bairro')
    .eq('ativo', true)
    .order('nome')
    .limit(400)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: String(row.id),
    nome: String(row.nome || ''),
    telefone: String(row.telefone || ''),
    bairro: String(row.bairro || ''),
  }))
}

/** Conta as fichas no Nerites e agrupa o bairro de cada uma. Não grava nada no Gabinete. */
export async function carregarResumoFichas(): Promise<ResumoFichas> {
  const { count, error } = await supabase.from('cadastros').select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)

  const rows: FichaBairro[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error: err } = await supabase
      .from('cadastros')
      .select('bairro,lider,lat,lng')
      .order('id', { ascending: true })
      .range(from, from + page - 1)
    if (err) throw new Error(err.message)
    const chunk = (data ?? []) as FichaBairro[]
    rows.push(...chunk)
    if (chunk.length < page) break
  }

  const grupos = new Map<string, { nome: string; fichas: number; lideres: Set<string>; lat: number; lng: number; pontos: number }>()
  const fichasPorLider: Record<string, number> = {}
  let semBairro = 0
  for (const row of rows) {
    const liderNome = (row.lider || '').replace(/\s+/g, ' ').trim()
    if (liderNome) {
      const chave = chaveLider(liderNome)
      fichasPorLider[chave] = (fichasPorLider[chave] || 0) + 1
    }
    const nome = (row.bairro || '').replace(/\s+/g, ' ').trim()
    if (!nome) {
      semBairro += 1
      continue
    }
    const key = nome.toLocaleLowerCase('pt-BR')
    let grupo = grupos.get(key)
    if (!grupo) {
      grupo = { nome, fichas: 0, lideres: new Set(), lat: 0, lng: 0, pontos: 0 }
      grupos.set(key, grupo)
    }
    grupo.fichas += 1
    const lider = (row.lider || '').replace(/\s+/g, ' ').trim()
    if (lider) grupo.lideres.add(lider.toLocaleLowerCase('pt-BR'))
    if (typeof row.lat === 'number' && typeof row.lng === 'number' && Number.isFinite(row.lat) && Number.isFinite(row.lng)) {
      grupo.lat += row.lat
      grupo.lng += row.lng
      grupo.pontos += 1
    }
  }

  const ranking = [...grupos.values()]
    .map((grupo) => ({
      nome: grupo.nome,
      fichas: grupo.fichas,
      liderancas: grupo.lideres.size,
      lat: grupo.pontos ? grupo.lat / grupo.pontos : null,
      lng: grupo.pontos ? grupo.lng / grupo.pontos : null,
    }))
    .sort((a, b) => b.fichas - a.fichas || a.nome.localeCompare(b.nome, 'pt-BR'))

  const markers: MapMarkerData[] = ranking
    .filter((bairro): bairro is BairroResumo & { lat: number; lng: number } => bairro.lat != null && bairro.lng != null)
    .map((bairro) => ({
      id: `bairro:${bairro.nome.toLocaleLowerCase('pt-BR')}`,
      lat: bairro.lat,
      lng: bairro.lng,
      zona: '',
      secao: '',
      bairro: bairro.nome,
      count: bairro.fichas,
    }))

  return {
    cidadaos: count ?? rows.length,
    bairros: ranking.length,
    semBairro,
    ranking,
    markers,
    fichasPorLider,
  }
}
