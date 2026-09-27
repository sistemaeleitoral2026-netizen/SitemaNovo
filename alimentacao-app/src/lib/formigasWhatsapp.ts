import { hasWhatsappPhone, normalizePhone } from './normalize'
import { supabase } from './supabase'
import { validateBrazilianPhone } from './validation'
import type { Profile } from '../types'

export const FORMIGAS_WHATSAPP_EMAILS = ['aiankacecilia01@gmail.com']

export function canSeeFormigasWhatsapp(profile: Pick<Profile, 'email'> | null | undefined): boolean {
  if (!profile) return false
  const email = (profile.email ?? '').trim().toLowerCase()
  return FORMIGAS_WHATSAPP_EMAILS.includes(email)
}

export type WhatsappStatus = 'sim' | 'sem'

export type WhatsappPessoa = {
  key: string
  id: string
  tipo: 'eleitor' | 'lideranca' | 'coordenador'
  tipoLabel: string
  nome: string
  telefone: string
  coordenador: string
  lider: string
  status: WhatsappStatus
  formigaId: string | null
  formigaNome: string
}

export type WhatsappFormigaResumo = {
  id: string
  nome: string
  acionou: number
  semWhatsapp: number
  total: number
}

export type WhatsappDashboard = {
  pessoas: WhatsappPessoa[]
  porFormiga: WhatsappFormigaResumo[]
  totais: {
    acionou: number
    semWhatsapp: number
    pessoas: number
    formigas: number
  }
}

const PAGE = 1000

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

type RawWa = {
  id: string
  nome: string
  telefone: string | null
  coordenador: string | null
  lider: string | null
  contato_whatsapp_status: string | null
  formigas_wa_by: string | null
}

function tipoLabel(tipo: WhatsappPessoa['tipo']) {
  if (tipo === 'lideranca') return 'Liderança'
  if (tipo === 'coordenador') return 'Coordenador'
  return 'Eleitor'
}

function mapRow(row: RawWa, tipo: WhatsappPessoa['tipo'], nomes: Map<string, string>): WhatsappPessoa | null {
  const status = row.contato_whatsapp_status
  if (status !== 'sim' && status !== 'sem') return null
  // Sem telefone não é acionamento — só entra se sinalizaram "sem WhatsApp".
  if (status === 'sim' && !hasWhatsappPhone(row.telefone)) return null
  const formigaId = row.formigas_wa_by || null
  const formigaNome = ((formigaId ? nomes.get(formigaId) : '') || '').trim()
    || (formigaId ? 'Formiga' : '—')
  return {
    key: `${tipo}:${row.id}`,
    id: row.id,
    tipo,
    tipoLabel: tipoLabel(tipo),
    nome: (row.nome || '').trim() || '—',
    telefone: row.telefone || '',
    coordenador: row.coordenador || '',
    lider: row.lider || '',
    status,
    formigaId,
    formigaNome,
  }
}

async function fetchNomesPorIds(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return map
  try {
    const { data, error } = await supabase.from('profiles').select('id,nome').in('id', unique)
    if (error || !data) return map
    for (const p of data as { id: string; nome: string | null }[]) {
      if (p.id) map.set(p.id, (p.nome || '').trim() || 'Formiga')
    }
  } catch {
    /* RLS pode bloquear administrativo */
  }
  return map
}

async function fetchFormigaNomes(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,nome,role,extra_roles')
      .or('role.eq.mobilizador,extra_roles.cs.{mobilizador}')
    if (error || !data) return map
    for (const p of data as { id: string; nome: string | null }[]) {
      if (p.id && p.nome) map.set(p.id, p.nome)
    }
  } catch {
    /* RLS pode bloquear administrativo */
  }
  return map
}

export async function fetchFormigasWhatsappDashboard(): Promise<WhatsappDashboard> {
  const nomes = await fetchFormigaNomes()

  const [cadastros, lideres, coordenadores] = await Promise.all([
    fetchAllPaged<RawWa>((from, to) =>
      supabase
        .from('cadastros')
        .select('id,nome_completo,telefone,coordenador,lider,contato_whatsapp_status,formigas_wa_by')
        .in('contato_whatsapp_status', ['sim', 'sem'])
        .range(from, to)
        .then(({ data, error }) => ({
          data: (data ?? []).map((r) => ({
            id: String((r as { id: string }).id),
            nome: String((r as { nome_completo?: string }).nome_completo ?? ''),
            telefone: (r as { telefone?: string | null }).telefone ?? null,
            coordenador: (r as { coordenador?: string | null }).coordenador ?? null,
            lider: (r as { lider?: string | null }).lider ?? null,
            contato_whatsapp_status: (r as { contato_whatsapp_status?: string | null }).contato_whatsapp_status ?? null,
            formigas_wa_by: (r as { formigas_wa_by?: string | null }).formigas_wa_by ?? null,
          })),
          error,
        })),
    ),
    fetchAllPaged<RawWa>((from, to) =>
      supabase
        .from('lideres')
        .select('id,nome,telefone,contato_whatsapp_status,formigas_wa_by')
        .in('contato_whatsapp_status', ['sim', 'sem'])
        .range(from, to)
        .then(({ data, error }) => ({
          data: error
            ? []
            : (data ?? []).map((r) => ({
                id: String((r as { id: string }).id),
                nome: String((r as { nome?: string }).nome ?? ''),
                telefone: (r as { telefone?: string | null }).telefone ?? null,
                coordenador: null,
                lider: String((r as { nome?: string }).nome ?? ''),
                contato_whatsapp_status: (r as { contato_whatsapp_status?: string | null }).contato_whatsapp_status ?? null,
                formigas_wa_by: (r as { formigas_wa_by?: string | null }).formigas_wa_by ?? null,
              })),
          error: null,
        })),
    ),
    fetchAllPaged<RawWa>((from, to) =>
      supabase
        .from('coordenadores')
        .select('id,nome,telefone,contato_whatsapp_status,formigas_wa_by')
        .in('contato_whatsapp_status', ['sim', 'sem'])
        .range(from, to)
        .then(({ data, error }) => ({
          data: error
            ? []
            : (data ?? []).map((r) => ({
                id: String((r as { id: string }).id),
                nome: String((r as { nome?: string }).nome ?? ''),
                telefone: (r as { telefone?: string | null }).telefone ?? null,
                coordenador: String((r as { nome?: string }).nome ?? ''),
                lider: null,
                contato_whatsapp_status: (r as { contato_whatsapp_status?: string | null }).contato_whatsapp_status ?? null,
                formigas_wa_by: (r as { formigas_wa_by?: string | null }).formigas_wa_by ?? null,
              })),
          error: null,
        })),
    ),
  ])

  const ownerIds = [...cadastros, ...lideres, ...coordenadores]
    .map((r) => r.formigas_wa_by)
    .filter((id): id is string => Boolean(id))
  const nomesPorId = await fetchNomesPorIds(ownerIds)
  for (const [id, nome] of nomesPorId) nomes.set(id, nome)

  const pessoas: WhatsappPessoa[] = []
  for (const row of cadastros) {
    const mapped = mapRow(row, 'eleitor', nomes)
    if (mapped) pessoas.push(mapped)
  }
  for (const row of lideres) {
    const mapped = mapRow(row, 'lideranca', nomes)
    if (mapped) pessoas.push(mapped)
  }
  for (const row of coordenadores) {
    const mapped = mapRow(row, 'coordenador', nomes)
    if (mapped) pessoas.push(mapped)
  }

  pessoas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const byFormiga = new Map<string, WhatsappFormigaResumo>()

  for (const [id, nome] of nomes) {
    byFormiga.set(id, { id, nome, acionou: 0, semWhatsapp: 0, total: 0 })
  }

  for (const p of pessoas) {
    const id = p.formigaId || `sem:${p.formigaNome}`
    const current = byFormiga.get(id) ?? {
      id,
      nome: p.formigaNome,
      acionou: 0,
      semWhatsapp: 0,
      total: 0,
    }
    if (p.status === 'sim') current.acionou += 1
    else current.semWhatsapp += 1
    current.total += 1
    if (p.formigaNome && current.nome === 'Formiga') current.nome = p.formigaNome
    byFormiga.set(id, current)
  }

  const porFormiga = [...byFormiga.values()]
    .filter((f) => f.total > 0 || nomes.has(f.id))
    .sort((a, b) => b.acionou - a.acionou || b.semWhatsapp - a.semWhatsapp || a.nome.localeCompare(b.nome, 'pt-BR'))

  const acionou = pessoas.filter((p) => p.status === 'sim').length
  const semWhatsapp = pessoas.filter((p) => p.status === 'sem').length

  return {
    pessoas,
    porFormiga,
    totais: {
      acionou,
      semWhatsapp,
      pessoas: pessoas.length,
      formigas: porFormiga.filter((f) => f.total > 0).length,
    },
  }
}

function tableForTipo(tipo: WhatsappPessoa['tipo']) {
  if (tipo === 'lideranca') return 'lideres'
  if (tipo === 'coordenador') return 'coordenadores'
  return 'cadastros'
}

/** Grava o telefone na ficha oficial (cadastros / lideres / coordenadores). */
export async function updateWhatsappTelefone(
  tipo: WhatsappPessoa['tipo'],
  id: string,
  telefone: string,
): Promise<string> {
  const phone = normalizePhone(telefone)
  const invalid = validateBrazilianPhone(phone)
  if (invalid) throw new Error(invalid)

  const stored = tipo === 'eleitor' ? phone : (phone || null)
  const table = tableForTipo(tipo)

  const { error } = await supabase.from(table).update({ telefone: stored }).eq('id', id)
  if (!error) return phone

  const { error: rpcError } = await supabase.rpc('formigas_whatsapp_editar_telefone', {
    p_tipo: tipo,
    p_id: id,
    p_telefone: phone,
  })
  if (!rpcError) return phone

  throw new Error(rpcError.message || error.message)
}
