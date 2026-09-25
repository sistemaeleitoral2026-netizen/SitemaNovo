import { supabase } from './supabase'
import type { GaragemCarro } from '../types'

export type GaragemCarroInput = {
  created_by?: string | null
  diretoria_id: string | null
  coordenador_id: string
  coordenador_nome: string
  lider_id: string | null
  lider_nome: string
  pessoa_nome: string
  placa: string
  cor: string
  modelo: string
  telefone: string
}

export function formatPlacaInput(value: string): string {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
  if (raw.length <= 3) return raw
  return `${raw.slice(0, 3)}-${raw.slice(3)}`
}

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function garagemWhatsAppMessage(row: {
  pessoa_nome: string
  placa: string
  modelo: string
  lider_nome: string
}): string {
  const quem = row.pessoa_nome.trim() || 'tudo bem'
  const carro = [row.modelo, row.placa].filter(Boolean).join(' · ') || 'o veículo'
  const lider = row.lider_nome.trim()
  return lider
    ? `Oi ${quem}, tudo bem? Aqui é da equipe. Passando sobre ${carro} da liderança ${lider}.`
    : `Oi ${quem}, tudo bem? Aqui é da equipe. Passando sobre ${carro}.`
}

function mapRow(row: GaragemCarro): GaragemCarro {
  return {
    ...row,
    lider_nome: row.lider_nome ?? '',
    pessoa_nome: row.pessoa_nome ?? '',
    placa: row.placa ?? '',
    cor: row.cor ?? '',
    modelo: row.modelo ?? '',
    telefone: row.telefone ?? '',
    coordenador_nome: row.coordenador_nome ?? '',
  }
}

export async function fetchGaragemCarros(diretoriaId?: string | null): Promise<GaragemCarro[]> {
  let query = supabase
    .from('garagem_carros')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3000)

  if (diretoriaId) query = query.eq('diretoria_id', diretoriaId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as GaragemCarro[]).map(mapRow)
}

export async function fetchGaragemCarro(id: string): Promise<GaragemCarro | null> {
  const { data, error } = await supabase
    .from('garagem_carros')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapRow(data as GaragemCarro) : null
}

export async function createGaragemCarro(input: GaragemCarroInput): Promise<GaragemCarro> {
  const { data, error } = await supabase
    .from('garagem_carros')
    .insert({
      created_by: input.created_by ?? null,
      diretoria_id: input.diretoria_id,
      coordenador_id: input.coordenador_id,
      coordenador_nome: normalizeText(input.coordenador_nome),
      lider_id: input.lider_id,
      lider_nome: normalizeText(input.lider_nome),
      pessoa_nome: normalizeText(input.pessoa_nome),
      placa: formatPlacaInput(input.placa),
      cor: normalizeText(input.cor),
      modelo: normalizeText(input.modelo),
      telefone: normalizeText(input.telefone),
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapRow(data as GaragemCarro)
}

export async function updateGaragemCarro(id: string, input: GaragemCarroInput): Promise<GaragemCarro> {
  const { data, error } = await supabase
    .from('garagem_carros')
    .update({
      diretoria_id: input.diretoria_id,
      coordenador_id: input.coordenador_id,
      coordenador_nome: normalizeText(input.coordenador_nome),
      lider_id: input.lider_id,
      lider_nome: normalizeText(input.lider_nome),
      pessoa_nome: normalizeText(input.pessoa_nome),
      placa: formatPlacaInput(input.placa),
      cor: normalizeText(input.cor),
      modelo: normalizeText(input.modelo),
      telefone: normalizeText(input.telefone),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapRow(data as GaragemCarro)
}

export async function deleteGaragemCarro(id: string): Promise<void> {
  const { error } = await supabase.from('garagem_carros').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
