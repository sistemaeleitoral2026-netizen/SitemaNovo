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

/** No máximo 20 fichas, e só depois de 2 letras. A base inteira fica no Nerites. */
export async function buscarFichasPorNome(q: string): Promise<FichaBusca[]> {
  const termo = termoBusca(q)
  if (termo.length < 2) return []
  const { data, error } = await supabase
    .from('cadastros')
    .select('id,nome_completo,telefone,bairro,lider,titulo,zona,secao')
    .ilike('nome_completo', `%${termo}%`)
    .order('nome_completo')
    .limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: String(row.id),
    n: String(row.nome_completo || ''),
    telefone: String(row.telefone || ''),
    bairro: String(row.bairro || ''),
    lider: String(row.lider || ''),
    titulo: String(row.titulo || ''),
    zona: String(row.zona || ''),
    secao: String(row.secao || ''),
    sub: [row.bairro, row.zona && row.secao ? `Zona ${row.zona} · Seção ${row.secao}` : '', row.lider, row.telefone].filter(Boolean).join(' · '),
  }))
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
