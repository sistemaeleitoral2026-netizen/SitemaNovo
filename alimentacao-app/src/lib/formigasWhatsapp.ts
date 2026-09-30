import { hasWhatsappPhone, normalizePhone } from './normalize'
import { supabase } from './supabase'
import { validateBrazilianPhone } from './validation'
import type { Profile } from '../types'

export const FORMIGAS_WHATSAPP_EMAILS = ['aiankacecilia01@gmail.com']

export function canSeeFormigasWhatsapp(
  profile: Pick<Profile, 'email' | 'role'> | null | undefined,
): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
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
    const { data: rpcData, error: rpcError } = await supabase.rpc('formigas_nomes', { p_ids: unique })
    if (!rpcError && Array.isArray(rpcData)) {
      for (const row of rpcData as { id: string; nome: string | null }[]) {
        if (row.id) map.set(String(row.id), (row.nome || '').trim() || 'Formiga')
      }
    }
  } catch {
    /* RPC pode não existir ainda */
  }

  const missing = unique.filter((id) => !map.has(id))
  if (!missing.length) return map

  try {
    // PostgREST .in() quebra com listas enormes — fatia.
    for (let i = 0; i < missing.length; i += 80) {
      const chunk = missing.slice(i, i + 80)
      const { data, error } = await supabase.from('profiles').select('id,nome').in('id', chunk)
      if (error || !data) continue
      for (const p of data as { id: string; nome: string | null }[]) {
        if (p.id) map.set(p.id, (p.nome || '').trim() || 'Formiga')
      }
    }
  } catch {
    /* RLS pode bloquear — fica "Formiga" até aplicar formigas_nomes */
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
    /* RLS pode bloquear administrativo / Aianka — nomes vêm dos IDs lançados */
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

/* —— Visão completa (admin): WhatsApp + adesivos carro/casa + postagens —— */

export type FormigasVisaoFiltro = 'whatsapp' | 'carros' | 'casas' | 'postagens' | 'todos'

export type FormigasAtivacaoPessoa = {
  key: string
  id: string
  tipo: WhatsappPessoa['tipo']
  tipoLabel: string
  nome: string
  telefone: string
  coordenador: string
  lider: string
  carros: number
  motos: number
  casa: number
  casaStatus: 'nao' | 'sim' | 'talvez' | null
  postagens: number
  fotoVeiculoPaths: string[]
  fotoCasaPaths: string[]
  formigaCarrosId: string | null
  formigaCarrosNome: string
  formigaCasaId: string | null
  formigaCasaNome: string
  formigaLinksId: string | null
  formigaLinksNome: string
}

export type FormigasAtivacaoResumo = {
  id: string
  nome: string
  carros: number
  motos: number
  casas: number
  postagens: number
  veiculosPessoas: number
  casasPessoas: number
  postagensPessoas: number
  total: number
}

export type FormigasVisaoDashboard = {
  whatsapp: WhatsappDashboard
  ativacao: {
    pessoas: FormigasAtivacaoPessoa[]
    porFormiga: FormigasAtivacaoResumo[]
    totais: {
      carros: number
      motos: number
      casas: number
      postagens: number
      veiculosPessoas: number
      casasPessoas: number
      postagensPessoas: number
      formigas: number
    }
  }
}

type RawAtiv = {
  id: string
  nome: string
  telefone: string | null
  coordenador: string | null
  lider: string | null
  carros_adesivados: number
  motos_adesivadas: number
  adesivos_casa: number
  adesivos_casa_status: string | null
  postagens: number
  foto_veiculo_paths: string[]
  foto_casa_paths: string[]
  formigas_carros_by: string | null
  formigas_casa_by: string | null
  formigas_links_by: string | null
}

function qty(v: unknown) {
  const n = Math.floor(Number(v) || 0)
  return n > 0 ? n : 0
}

function toFotoPaths(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? '').trim()).filter(Boolean)
  }
  return []
}

function hasAtivacao(r: RawAtiv) {
  return (
    r.carros_adesivados > 0
    || r.motos_adesivadas > 0
    || r.adesivos_casa > 0
    || r.adesivos_casa_status === 'sim'
    || r.adesivos_casa_status === 'talvez'
    || r.postagens > 0
  )
}

function mapAtiv(
  row: RawAtiv,
  tipo: WhatsappPessoa['tipo'],
  nomes: Map<string, string>,
): FormigasAtivacaoPessoa | null {
  if (!hasAtivacao(row)) return null
  const casaStatus =
    row.adesivos_casa_status === 'sim' || row.adesivos_casa_status === 'talvez' || row.adesivos_casa_status === 'nao'
      ? row.adesivos_casa_status
      : null
  const formigaCarrosId = row.formigas_carros_by || null
  const formigaCasaId = row.formigas_casa_by || null
  const formigaLinksId = row.formigas_links_by || null
  return {
    key: `${tipo}:${row.id}`,
    id: row.id,
    tipo,
    tipoLabel: tipoLabel(tipo),
    nome: (row.nome || '').trim() || '—',
    telefone: row.telefone || '',
    coordenador: row.coordenador || '',
    lider: row.lider || '',
    carros: row.carros_adesivados,
    motos: row.motos_adesivadas,
    casa: row.adesivos_casa,
    casaStatus,
    postagens: row.postagens,
    fotoVeiculoPaths: row.foto_veiculo_paths,
    fotoCasaPaths: row.foto_casa_paths,
    formigaCarrosId,
    formigaCarrosNome: ((formigaCarrosId ? nomes.get(formigaCarrosId) : '') || '').trim() || (formigaCarrosId ? 'Formiga' : '—'),
    formigaCasaId,
    formigaCasaNome: ((formigaCasaId ? nomes.get(formigaCasaId) : '') || '').trim() || (formigaCasaId ? 'Formiga' : '—'),
    formigaLinksId,
    formigaLinksNome: ((formigaLinksId ? nomes.get(formigaLinksId) : '') || '').trim() || (formigaLinksId ? 'Formiga' : '—'),
  }
}

async function fetchAtivacaoRows(): Promise<{
  cadastros: RawAtiv[]
  lideres: RawAtiv[]
  coordenadores: RawAtiv[]
}> {
  const mapCad = (r: Record<string, unknown>): RawAtiv => ({
    id: String(r.id),
    nome: String(r.nome_completo ?? r.nome ?? ''),
    telefone: (r.telefone as string | null) ?? null,
    coordenador: (r.coordenador as string | null) ?? null,
    lider: (r.lider as string | null) ?? null,
    carros_adesivados: qty(r.carros_adesivados),
    motos_adesivadas: qty(r.motos_adesivadas),
    adesivos_casa: qty(r.adesivos_casa),
    adesivos_casa_status: (r.adesivos_casa_status as string | null) ?? null,
    postagens: qty(r.postagens),
    foto_veiculo_paths: toFotoPaths(r.foto_veiculo_paths),
    foto_casa_paths: toFotoPaths(r.foto_casa_paths),
    formigas_carros_by: (r.formigas_carros_by as string | null) ?? null,
    formigas_casa_by: (r.formigas_casa_by as string | null) ?? null,
    formigas_links_by: (r.formigas_links_by as string | null) ?? null,
  })

  const [cadastros, lideres, coordenadores] = await Promise.all([
    fetchAllPaged<RawAtiv>((from, to) =>
      supabase
        .from('cadastros')
        .select(
          'id,nome_completo,telefone,coordenador,lider,carros_adesivados,motos_adesivadas,adesivos_casa,adesivos_casa_status,postagens,foto_veiculo_paths,foto_casa_paths,formigas_carros_by,formigas_casa_by,formigas_links_by',
        )
        .or(
          'carros_adesivados.gt.0,motos_adesivadas.gt.0,adesivos_casa.gt.0,adesivos_casa_status.eq.sim,adesivos_casa_status.eq.talvez,postagens.gt.0',
        )
        .range(from, to)
        .then(({ data, error }) => ({
          data: (data ?? []).map((r) => mapCad(r as Record<string, unknown>)),
          error,
        })),
    ),
    fetchAllPaged<RawAtiv>((from, to) =>
      supabase
        .from('lideres')
        .select(
          'id,nome,telefone,carros_adesivados,motos_adesivadas,adesivos_casa,adesivos_casa_status,postagens,foto_veiculo_paths,foto_casa_paths,formigas_carros_by,formigas_casa_by,formigas_links_by',
        )
        .or(
          'carros_adesivados.gt.0,motos_adesivadas.gt.0,adesivos_casa.gt.0,adesivos_casa_status.eq.sim,adesivos_casa_status.eq.talvez,postagens.gt.0',
        )
        .range(from, to)
        .then(({ data, error }) => ({
          data: error
            ? []
            : (data ?? []).map((r) => {
                const row = mapCad({ ...r, nome_completo: (r as { nome?: string }).nome })
                row.lider = row.nome
                row.coordenador = ''
                return row
              }),
          error: null,
        })),
    ),
    fetchAllPaged<RawAtiv>((from, to) =>
      supabase
        .from('coordenadores')
        .select(
          'id,nome,carros_adesivados,motos_adesivadas,adesivos_casa,adesivos_casa_status,postagens,foto_veiculo_paths,foto_casa_paths,formigas_carros_by,formigas_casa_by,formigas_links_by',
        )
        .or(
          'carros_adesivados.gt.0,motos_adesivadas.gt.0,adesivos_casa.gt.0,adesivos_casa_status.eq.sim,adesivos_casa_status.eq.talvez,postagens.gt.0',
        )
        .range(from, to)
        .then(({ data, error }) => ({
          data: error
            ? []
            : (data ?? []).map((r) => {
                const row = mapCad({ ...r, nome_completo: (r as { nome?: string }).nome, telefone: null })
                row.coordenador = row.nome
                row.lider = ''
                return row
              }),
          error: null,
        })),
    ),
  ])

  return { cadastros, lideres, coordenadores }
}

export async function fetchFormigasVisaoDashboard(): Promise<FormigasVisaoDashboard> {
  const nomes = await fetchFormigaNomes()
  const [whatsapp, ativRaw] = await Promise.all([
    fetchFormigasWhatsappDashboard(),
    fetchAtivacaoRows(),
  ])

  const ownerIds = [
    ...ativRaw.cadastros,
    ...ativRaw.lideres,
    ...ativRaw.coordenadores,
  ].flatMap((r) => [r.formigas_carros_by, r.formigas_casa_by, r.formigas_links_by].filter(Boolean) as string[])
  const nomesPorId = await fetchNomesPorIds(ownerIds)
  for (const [id, nome] of nomesPorId) nomes.set(id, nome)

  const pessoas: FormigasAtivacaoPessoa[] = []
  for (const row of ativRaw.cadastros) {
    const m = mapAtiv(row, 'eleitor', nomes)
    if (m) pessoas.push(m)
  }
  for (const row of ativRaw.lideres) {
    const m = mapAtiv(row, 'lideranca', nomes)
    if (m) pessoas.push(m)
  }
  for (const row of ativRaw.coordenadores) {
    const m = mapAtiv(row, 'coordenador', nomes)
    if (m) pessoas.push(m)
  }
  pessoas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const byFormiga = new Map<string, FormigasAtivacaoResumo>()
  function bump(
    formigaId: string | null,
    formigaNome: string,
    patch: Partial<Pick<FormigasAtivacaoResumo, 'carros' | 'motos' | 'casas' | 'postagens' | 'veiculosPessoas' | 'casasPessoas' | 'postagensPessoas'>>,
  ) {
    if (!formigaId && formigaNome === '—') return
    const id = formigaId || `sem:${formigaNome}`
    const cur = byFormiga.get(id) ?? {
      id,
      nome: formigaNome || 'Formiga',
      carros: 0,
      motos: 0,
      casas: 0,
      postagens: 0,
      veiculosPessoas: 0,
      casasPessoas: 0,
      postagensPessoas: 0,
      total: 0,
    }
    if (patch.carros) cur.carros += patch.carros
    if (patch.motos) cur.motos += patch.motos
    if (patch.casas) cur.casas += patch.casas
    if (patch.postagens) cur.postagens += patch.postagens
    if (patch.veiculosPessoas) cur.veiculosPessoas += patch.veiculosPessoas
    if (patch.casasPessoas) cur.casasPessoas += patch.casasPessoas
    if (patch.postagensPessoas) cur.postagensPessoas += patch.postagensPessoas
    cur.total = cur.veiculosPessoas + cur.casasPessoas + cur.postagensPessoas
    if (formigaNome && cur.nome === 'Formiga') cur.nome = formigaNome
    byFormiga.set(id, cur)
  }

  for (const p of pessoas) {
    if (p.carros > 0 || p.motos > 0) {
      bump(p.formigaCarrosId, p.formigaCarrosNome, {
        carros: p.carros,
        motos: p.motos,
        veiculosPessoas: 1,
      })
    }
    if (p.casa > 0 || p.casaStatus === 'sim' || p.casaStatus === 'talvez') {
      bump(p.formigaCasaId, p.formigaCasaNome, {
        casas: Math.max(p.casa, p.casaStatus === 'sim' || p.casaStatus === 'talvez' ? 1 : 0),
        casasPessoas: 1,
      })
    }
    if (p.postagens > 0) {
      bump(p.formigaLinksId, p.formigaLinksNome, {
        postagens: p.postagens,
        postagensPessoas: 1,
      })
    }
  }

  const porFormiga = [...byFormiga.values()]
    .filter((f) => f.total > 0)
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))

  let carros = 0
  let motos = 0
  let casas = 0
  let postagens = 0
  let veiculosPessoas = 0
  let casasPessoas = 0
  let postagensPessoas = 0
  for (const p of pessoas) {
    carros += p.carros
    motos += p.motos
    if (p.casa > 0 || p.casaStatus === 'sim') {
      casas += Math.max(p.casa, 1)
      casasPessoas += 1
    } else if (p.casaStatus === 'talvez') {
      casasPessoas += 1
    }
    postagens += p.postagens
    if (p.carros > 0 || p.motos > 0) veiculosPessoas += 1
    if (p.postagens > 0) postagensPessoas += 1
  }

  return {
    whatsapp,
    ativacao: {
      pessoas,
      porFormiga,
      totais: {
        carros,
        motos,
        casas,
        postagens,
        veiculosPessoas,
        casasPessoas,
        postagensPessoas,
        formigas: porFormiga.length,
      },
    },
  }
}
