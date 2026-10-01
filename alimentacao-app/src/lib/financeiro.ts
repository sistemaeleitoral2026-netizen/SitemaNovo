import { compressImageForUpload } from './imageCompress'
import { getCachedSignedUrl, setCachedSignedUrl, takeCachedSignedUrls } from './signedUrlCache'
import { supabase } from './supabase'

export type FinanceiroForma = 'dinheiro' | 'pix' | 'transferencia'

export type FinanceiroValorDevido = {
  id?: string
  diretoria_id: string
  coordenador_id: string
  lider_id?: string | null
  valor_devido: number
  travado?: boolean
}

export type FinanceiroLancamento = {
  id: string
  diretoria_id: string
  coordenador_id: string
  lider_id?: string | null
  valor: number
  forma: FinanceiroForma
  comprovante_path: string | null
  observacao?: string | null
  created_at: string
  created_by?: string | null
  /** preenchido no client */
  alvo_label?: string
  coordenador_nome?: string
  lider_nome?: string
  diretoria_nome?: string
}

export type FinanceiroAlvoResumo = {
  tipo: 'coordenador' | 'lideranca'
  key: string
  diretoria_id: string
  coordenador_id: string
  lider_id: string | null
  nome: string
  valor_devido: number
  pago: number
  falta: number
  travado: boolean
}

export type FinanceiroCoordBloco = {
  coordenador_id: string
  nome: string
  diretoria_id: string
  proprio: FinanceiroAlvoResumo
  liderancas: FinanceiroAlvoResumo[]
  /** Soma leitura: próprio + lideranças */
  totalLeitura: { devido: number; pago: number; falta: number }
}

/** @deprecated use FinanceiroAlvoResumo */
export type FinanceiroCoordResumo = {
  coordenador_id: string
  nome: string
  valor_devido: number
  pago: number
  falta: number
}

const BUCKET = 'financeiro-comprovantes'
const LOCAL_DEVIDO = 'nerites_financeiro_devido_v3'
const LOCAL_LANC = 'nerites_financeiro_lanc_v3'
const LOCAL_TRAVADO = 'nerites_financeiro_travado_v2'
const LEGACY_DEVIDO = 'nerites_financeiro_devido_v2'
const LEGACY_LANC = 'nerites_financeiro_lanc_v2'
const LEGACY_TRAVADO = 'nerites_financeiro_travado_v1'

export function alvoKey(coordenadorId: string, liderId?: string | null) {
  return liderId ? `lider:${liderId}` : `coord:${coordenadorId}`
}

function travadoStorageKey(diretoriaId: string, coordenadorId: string, liderId?: string | null) {
  return liderId
    ? `${diretoriaId}:${coordenadorId}:${liderId}`
    : `${diretoriaId}:${coordenadorId}`
}

function readLocalTravado(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LOCAL_TRAVADO) || localStorage.getItem(LEGACY_TRAVADO)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalTravado(map: Record<string, boolean>) {
  localStorage.setItem(LOCAL_TRAVADO, JSON.stringify(map))
}

function getLocalTravado(diretoriaId: string, coordenadorId: string, liderId?: string | null): boolean {
  return Boolean(readLocalTravado()[travadoStorageKey(diretoriaId, coordenadorId, liderId)])
}

function setLocalTravado(
  diretoriaId: string,
  coordenadorId: string,
  liderId: string | null | undefined,
  travado: boolean,
) {
  const map = readLocalTravado()
  map[travadoStorageKey(diretoriaId, coordenadorId, liderId)] = travado
  writeLocalTravado(map)
}

function parseForma(v: unknown): FinanceiroForma {
  if (v === 'pix') return 'pix'
  if (v === 'transferencia') return 'transferencia'
  return 'dinheiro'
}

function isMissingRelation(message: string) {
  return /(financeiro_coordenador|financeiro_lancamentos)/i.test(message)
    && /(does not exist|schema cache|relation|Could not find)/i.test(message)
}

function isMissingLiderCol(message: string) {
  return /lider_id/i.test(message)
}

function readLocalDevido(): FinanceiroValorDevido[] {
  try {
    const raw = localStorage.getItem(LOCAL_DEVIDO) || localStorage.getItem(LEGACY_DEVIDO)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FinanceiroValorDevido[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocalDevido(rows: FinanceiroValorDevido[]) {
  localStorage.setItem(LOCAL_DEVIDO, JSON.stringify(rows))
}

function readLocalLanc(): FinanceiroLancamento[] {
  try {
    const raw = localStorage.getItem(LOCAL_LANC) || localStorage.getItem(LEGACY_LANC)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FinanceiroLancamento[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocalLanc(rows: FinanceiroLancamento[]) {
  localStorage.setItem(LOCAL_LANC, JSON.stringify(rows))
}

function sameAlvo(
  a: { coordenador_id: string; lider_id?: string | null },
  coordenadorId: string,
  liderId?: string | null,
) {
  const aLider = a.lider_id || null
  const bLider = liderId || null
  return a.coordenador_id === coordenadorId && aLider === bLider
}

function mapDevidoRow(r: Record<string, unknown>): FinanceiroValorDevido {
  const diretoria_id = r.diretoria_id as string
  const coordenador_id = r.coordenador_id as string
  const lider_id = (r.lider_id as string | null | undefined) ?? null
  const fromDb = Boolean(r.travado)
  return {
    id: r.id as string | undefined,
    diretoria_id,
    coordenador_id,
    lider_id,
    valor_devido: Number(r.valor_devido ?? r.valor ?? 0),
    travado: fromDb || getLocalTravado(diretoria_id, coordenador_id, lider_id),
  }
}

export function formatMoneyBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function parseMoneyInput(raw: string): number {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

export function initials(nome: string) {
  const parts = nome.replace(/^diretora\s+/i, '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function labelAlvoLancamento(l: {
  lider_id?: string | null
  lider_nome?: string
  coordenador_nome?: string
}) {
  const coord = (l.coordenador_nome || 'Coordenação').trim()
  if (l.lider_id) {
    const lider = (l.lider_nome || 'Liderança').trim()
    return `Liderança ${lider} · ${coord}`
  }
  return `Coordenação ${coord}`
}

export async function fetchValoresDevidos(diretoriaIds?: string[]): Promise<FinanceiroValorDevido[]> {
  let q = supabase
    .from('financeiro_coordenador')
    .select('id,diretoria_id,coordenador_id,lider_id,valor_devido,travado')
  if (diretoriaIds?.length) q = q.in('diretoria_id', diretoriaIds)

  const { data, error } = await q
  if (error) {
    if (isMissingRelation(error.message)) {
      const all = readLocalDevido()
      const filtered = !diretoriaIds?.length
        ? all
        : all.filter((r) => diretoriaIds.includes(r.diretoria_id))
      return filtered.map((r) => ({
        ...r,
        lider_id: r.lider_id ?? null,
        travado: r.travado ?? getLocalTravado(r.diretoria_id, r.coordenador_id, r.lider_id),
      }))
    }

    if (isMissingLiderCol(error.message) || /travado|valor_devido/i.test(error.message)) {
      let q2 = supabase
        .from('financeiro_coordenador')
        .select('id,diretoria_id,coordenador_id,valor_devido,travado,valor')
      if (diretoriaIds?.length) q2 = q2.in('diretoria_id', diretoriaIds)
      const { data: d2, error: e2 } = await q2
      if (e2) {
        if (isMissingRelation(e2.message)) {
          const all = readLocalDevido()
          const filtered = !diretoriaIds?.length
            ? all
            : all.filter((r) => diretoriaIds.includes(r.diretoria_id))
          return filtered.map((r) => ({
            ...r,
            lider_id: r.lider_id ?? null,
            travado: r.travado ?? getLocalTravado(r.diretoria_id, r.coordenador_id, r.lider_id),
          }))
        }
        throw new Error(e2.message)
      }
      return (d2 ?? []).map((r) => mapDevidoRow({ ...r, lider_id: null }))
    }
    throw new Error(error.message)
  }

  return (data ?? []).map((r) => mapDevidoRow(r as Record<string, unknown>))
}

export async function upsertValorDevido(input: {
  diretoriaId: string
  coordenadorId: string
  liderId?: string | null
  valorDevido: number
  travado?: boolean
  updatedBy?: string | null
}): Promise<FinanceiroValorDevido> {
  const valor_devido = Math.max(0, Number(input.valorDevido) || 0)
  const travado = input.travado ?? true
  const lider_id = input.liderId || null
  const updated_at = new Date().toISOString()
  const updated_by = input.updatedBy ?? null

  // Busca linha existente (unique parcial — upsert onConflict não é confiável)
  let find = supabase
    .from('financeiro_coordenador')
    .select('id')
    .eq('diretoria_id', input.diretoriaId)
    .eq('coordenador_id', input.coordenadorId)
  find = lider_id ? find.eq('lider_id', lider_id) : find.is('lider_id', null)
  const { data: existing, error: findErr } = await find.maybeSingle()

  if (findErr && !isMissingRelation(findErr.message) && !isMissingLiderCol(findErr.message)) {
    throw new Error(findErr.message)
  }

  const payloadWithLider = {
    diretoria_id: input.diretoriaId,
    coordenador_id: input.coordenadorId,
    lider_id,
    valor_devido,
    travado,
    updated_at,
    updated_by,
  }

  async function saveLocal(): Promise<FinanceiroValorDevido> {
    const all = readLocalDevido()
    const idx = all.findIndex((r) =>
      r.diretoria_id === input.diretoriaId && sameAlvo(r, input.coordenadorId, lider_id),
    )
    const row: FinanceiroValorDevido = {
      id: idx >= 0 ? all[idx].id : crypto.randomUUID(),
      diretoria_id: input.diretoriaId,
      coordenador_id: input.coordenadorId,
      lider_id,
      valor_devido,
      travado,
    }
    if (idx >= 0) all[idx] = row
    else all.push(row)
    writeLocalDevido(all)
    setLocalTravado(input.diretoriaId, input.coordenadorId, lider_id, travado)
    return row
  }

  if (findErr && (isMissingRelation(findErr.message) || isMissingLiderCol(findErr.message))) {
    if (isMissingLiderCol(findErr.message) && lider_id) {
      throw new Error('Rode o SQL financeiro_liderancas_run.sql para habilitar pagamento por liderança.')
    }
    // fallback sem lider_id
    if (!lider_id) {
      const { data, error } = await supabase
        .from('financeiro_coordenador')
        .upsert(
          {
            diretoria_id: input.diretoriaId,
            coordenador_id: input.coordenadorId,
            valor_devido,
            travado,
            updated_at,
            updated_by,
          },
          { onConflict: 'diretoria_id,coordenador_id' },
        )
        .select('id,diretoria_id,coordenador_id,valor_devido,travado')
        .maybeSingle()
      if (!error && data) {
        setLocalTravado(input.diretoriaId, input.coordenadorId, null, Boolean(data.travado ?? travado))
        return {
          id: data.id as string,
          diretoria_id: data.diretoria_id as string,
          coordenador_id: data.coordenador_id as string,
          lider_id: null,
          valor_devido: Number(data.valor_devido ?? valor_devido),
          travado: Boolean(data.travado ?? travado),
        }
      }
    }
    return saveLocal()
  }

  let data: Record<string, unknown> | null = null
  let error: { message: string } | null = null

  if (existing?.id) {
    const res = await supabase
      .from('financeiro_coordenador')
      .update({
        valor_devido,
        travado,
        updated_at,
        updated_by,
        lider_id,
      })
      .eq('id', existing.id)
      .select('id,diretoria_id,coordenador_id,lider_id,valor_devido,travado')
      .maybeSingle()
    data = (res.data as Record<string, unknown> | null) ?? null
    error = res.error
  } else {
    const res = await supabase
      .from('financeiro_coordenador')
      .insert(payloadWithLider)
      .select('id,diretoria_id,coordenador_id,lider_id,valor_devido,travado')
      .maybeSingle()
    data = (res.data as Record<string, unknown> | null) ?? null
    error = res.error
  }

  if (error) {
    if (isMissingLiderCol(error.message) && lider_id) {
      throw new Error('Rode o SQL financeiro_liderancas_run.sql para habilitar pagamento por liderança.')
    }
    if (isMissingRelation(error.message) || isMissingLiderCol(error.message)) {
      return saveLocal()
    }
    throw new Error(error.message)
  }

  const row = mapDevidoRow(data ?? payloadWithLider)
  setLocalTravado(input.diretoriaId, input.coordenadorId, lider_id, Boolean(row.travado))
  return row
}

export async function setValorDevidoTravado(input: {
  diretoriaId: string
  coordenadorId: string
  liderId?: string | null
  valorDevido: number
  travado: boolean
  updatedBy?: string | null
}): Promise<FinanceiroValorDevido> {
  return upsertValorDevido(input)
}

export async function fetchLancamentos(opts?: {
  diretoriaIds?: string[]
  limit?: number
}): Promise<FinanceiroLancamento[]> {
  const limit = opts?.limit ?? 40
  let q = supabase
    .from('financeiro_lancamentos')
    .select('id,diretoria_id,coordenador_id,lider_id,valor,forma,comprovante_path,observacao,created_at,created_by')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (opts?.diretoriaIds?.length) q = q.in('diretoria_id', opts.diretoriaIds)

  const { data, error } = await q
  if (error) {
    if (isMissingLiderCol(error.message)) {
      let q2 = supabase
        .from('financeiro_lancamentos')
        .select('id,diretoria_id,coordenador_id,valor,forma,comprovante_path,observacao,created_at,created_by')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (opts?.diretoriaIds?.length) q2 = q2.in('diretoria_id', opts.diretoriaIds)
      const { data: d2, error: e2 } = await q2
      if (e2) {
        if (isMissingRelation(e2.message)) {
          let all = readLocalLanc().sort((a, b) => b.created_at.localeCompare(a.created_at))
          if (opts?.diretoriaIds?.length) {
            all = all.filter((r) => opts.diretoriaIds!.includes(r.diretoria_id))
          }
          return all.slice(0, limit)
        }
        throw new Error(e2.message)
      }
      return (d2 ?? []).map((r) => ({
        id: r.id as string,
        diretoria_id: r.diretoria_id as string,
        coordenador_id: r.coordenador_id as string,
        lider_id: null,
        valor: Number(r.valor ?? 0),
        forma: parseForma(r.forma),
        comprovante_path: (r.comprovante_path as string | null) ?? null,
        observacao: (r.observacao as string | null) ?? null,
        created_at: r.created_at as string,
        created_by: (r.created_by as string | null) ?? null,
      }))
    }
    if (isMissingRelation(error.message)) {
      let all = readLocalLanc().sort((a, b) => b.created_at.localeCompare(a.created_at))
      if (opts?.diretoriaIds?.length) {
        all = all.filter((r) => opts.diretoriaIds!.includes(r.diretoria_id))
      }
      return all.slice(0, limit)
    }
    throw new Error(error.message)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    diretoria_id: r.diretoria_id as string,
    coordenador_id: r.coordenador_id as string,
    lider_id: (r.lider_id as string | null) ?? null,
    valor: Number(r.valor ?? 0),
    forma: parseForma(r.forma),
    comprovante_path: (r.comprovante_path as string | null) ?? null,
    observacao: (r.observacao as string | null) ?? null,
    created_at: r.created_at as string,
    created_by: (r.created_by as string | null) ?? null,
  }))
}

async function uploadComprovante(userId: string, file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  let prepared: File | Blob = file
  let contentType = file.type || 'application/octet-stream'
  let ext = 'bin'

  if (isPdf) {
    prepared = file
    contentType = 'application/pdf'
    ext = 'pdf'
  } else {
    prepared = await compressImageForUpload(file)
    contentType = prepared.type || 'image/jpeg'
    ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  }

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared, {
    cacheControl: '86400',
    upsert: false,
    contentType,
  })
  if (error) throw new Error(error.message)
  return path
}

export async function createLancamento(input: {
  diretoriaId: string
  coordenadorId: string
  liderId?: string | null
  valor: number
  forma: FinanceiroForma
  file?: File | null
  observacao?: string
  createdBy?: string | null
}): Promise<FinanceiroLancamento> {
  const valor = Math.round((Number(input.valor) || 0) * 100) / 100
  if (valor <= 0) throw new Error('Informe um valor maior que zero.')
  const lider_id = input.liderId || null

  let comprovante_path: string | null = null
  if (input.file && input.createdBy) {
    try {
      comprovante_path = await uploadComprovante(input.createdBy, input.file)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (/bucket|not found|row-level|policy/i.test(msg)) {
        comprovante_path = null
      } else {
        throw err
      }
    }
  }

  const payload = {
    diretoria_id: input.diretoriaId,
    coordenador_id: input.coordenadorId,
    lider_id,
    valor,
    forma: input.forma,
    comprovante_path,
    observacao: input.observacao?.trim() || null,
    created_by: input.createdBy ?? null,
  }

  const { data, error } = await supabase
    .from('financeiro_lancamentos')
    .insert(payload)
    .select('id,diretoria_id,coordenador_id,lider_id,valor,forma,comprovante_path,observacao,created_at,created_by')
    .maybeSingle()

  if (error) {
    if (isMissingLiderCol(error.message) && lider_id) {
      throw new Error('Rode o SQL financeiro_liderancas_run.sql para habilitar pagamento por liderança.')
    }
    if (!isMissingRelation(error.message) && !isMissingLiderCol(error.message)) {
      throw new Error(error.message)
    }

    let localPath: string | null = comprovante_path
    if (!localPath && input.file) {
      try {
        localPath = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('Falha ao ler comprovante'))
          reader.readAsDataURL(input.file!)
        })
      } catch {
        localPath = null
      }
    }

    const row: FinanceiroLancamento = {
      id: crypto.randomUUID(),
      diretoria_id: input.diretoriaId,
      coordenador_id: input.coordenadorId,
      lider_id,
      valor,
      forma: input.forma,
      comprovante_path: localPath,
      observacao: payload.observacao,
      created_at: new Date().toISOString(),
      created_by: input.createdBy ?? null,
    }
    const all = readLocalLanc()
    all.unshift(row)
    writeLocalLanc(all.slice(0, 200))
    return row
  }

  return {
    id: data?.id as string,
    diretoria_id: (data?.diretoria_id as string) ?? input.diretoriaId,
    coordenador_id: (data?.coordenador_id as string) ?? input.coordenadorId,
    lider_id: ((data?.lider_id as string | null) ?? lider_id) || null,
    valor: Number(data?.valor ?? valor),
    forma: parseForma(data?.forma),
    comprovante_path: (data?.comprovante_path as string | null) ?? comprovante_path,
    observacao: (data?.observacao as string | null) ?? null,
    created_at: (data?.created_at as string) ?? new Date().toISOString(),
    created_by: (data?.created_by as string | null) ?? null,
  }
}

export async function deleteLancamento(
  id: string,
  comprovantePath?: string | null,
  opts?: { asAdmin?: boolean },
): Promise<void> {
  if (!opts?.asAdmin) {
    throw new Error('Somente o administrador pode apagar lançamentos.')
  }

  const { error } = await supabase.from('financeiro_lancamentos').delete().eq('id', id)

  if (error) {
    if (!isMissingRelation(error.message)) throw new Error(error.message)
    const all = readLocalLanc().filter((r) => r.id !== id)
    writeLocalLanc(all)
    return
  }

  if (comprovantePath && !comprovantePath.startsWith('data:') && !comprovantePath.startsWith('blob:')) {
    void supabase.storage.from(BUCKET).remove([comprovantePath])
  }
}

export async function signComprovanteUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http')) return path

  const cached = getCachedSignedUrl(BUCKET, path)
  if (cached) return cached

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) return null
  setCachedSignedUrl(BUCKET, path, data.signedUrl)
  return data.signedUrl
}

export async function signComprovanteUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  const out = new Map<string, string>()
  if (!unique.length) return out

  for (const p of unique) {
    if (p.startsWith('data:') || p.startsWith('blob:') || p.startsWith('http')) {
      out.set(p, p)
    }
  }
  const toSign = unique.filter((p) => !out.has(p))
  if (!toSign.length) return out

  const { hits, missing } = takeCachedSignedUrls(BUCKET, toSign)
  for (const [path, url] of hits) out.set(path, url)
  if (!missing.length) return out

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, 60 * 60)
  if (!error && data?.length) {
    for (const row of data) {
      if (row.path && row.signedUrl && !row.error) {
        out.set(row.path, row.signedUrl)
        setCachedSignedUrl(BUCKET, row.path, row.signedUrl)
      }
    }
  }
  return out
}

function money(n: number) {
  return Math.round(n * 100) / 100
}

function findDevido(
  devidos: FinanceiroValorDevido[],
  diretoriaId: string,
  coordenadorId: string,
  liderId?: string | null,
) {
  return devidos.find(
    (d) => d.diretoria_id === diretoriaId && sameAlvo(d, coordenadorId, liderId),
  )
}

function sumPago(
  lancamentos: FinanceiroLancamento[],
  coordenadorId: string,
  liderId?: string | null,
) {
  let pago = 0
  for (const l of lancamentos) {
    if (sameAlvo(l, coordenadorId, liderId)) pago += l.valor
  }
  return money(pago)
}

function makeAlvo(input: {
  tipo: 'coordenador' | 'lideranca'
  diretoriaId: string
  coordenadorId: string
  liderId: string | null
  nome: string
  devidos: FinanceiroValorDevido[]
  lancamentos: FinanceiroLancamento[]
}): FinanceiroAlvoResumo {
  const devidoRow = findDevido(input.devidos, input.diretoriaId, input.coordenadorId, input.liderId)
  const valor_devido = Number(devidoRow?.valor_devido ?? 0)
  const pago = sumPago(input.lancamentos, input.coordenadorId, input.liderId)
  const falta = Math.max(0, money(valor_devido - pago))
  return {
    tipo: input.tipo,
    key: alvoKey(input.coordenadorId, input.liderId),
    diretoria_id: input.diretoriaId,
    coordenador_id: input.coordenadorId,
    lider_id: input.liderId,
    nome: input.nome,
    valor_devido,
    pago,
    falta,
    // R$ 0 não fica “travado” na UI — senão o campo vira só texto
    travado: Boolean(devidoRow?.travado) && valor_devido > 0,
  }
}

export function buildHierarquiaFinanceiro(
  coords: { id: string; nome: string; diretoria_id: string }[],
  lideres: { id: string; nome: string; coordenador_id: string | null; diretoria_id: string; ativo?: boolean }[],
  devidos: FinanceiroValorDevido[],
  lancamentos: FinanceiroLancamento[],
): FinanceiroCoordBloco[] {
  const lideresByCoord = new Map<string, typeof lideres>()
  for (const l of lideres) {
    if (!l.coordenador_id) continue
    if (l.ativo === false) continue
    const list = lideresByCoord.get(l.coordenador_id) ?? []
    list.push(l)
    lideresByCoord.set(l.coordenador_id, list)
  }

  return coords.map((c) => {
    const proprio = makeAlvo({
      tipo: 'coordenador',
      diretoriaId: c.diretoria_id,
      coordenadorId: c.id,
      liderId: null,
      nome: c.nome,
      devidos,
      lancamentos,
    })
    const kids = (lideresByCoord.get(c.id) ?? [])
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((l) =>
        makeAlvo({
          tipo: 'lideranca',
          diretoriaId: c.diretoria_id,
          coordenadorId: c.id,
          liderId: l.id,
          nome: l.nome,
          devidos,
          lancamentos,
        }),
      )
    const totalLeitura = sumAlvos([proprio, ...kids])
    return {
      coordenador_id: c.id,
      nome: c.nome,
      diretoria_id: c.diretoria_id,
      proprio,
      liderancas: kids,
      totalLeitura,
    }
  })
}

export function sumAlvos(rows: Pick<FinanceiroAlvoResumo, 'valor_devido' | 'pago' | 'falta'>[]) {
  let devido = 0
  let pago = 0
  let falta = 0
  for (const r of rows) {
    devido += r.valor_devido
    pago += r.pago
    falta += r.falta
  }
  return {
    devido: money(devido),
    pago: money(pago),
    falta: money(falta),
  }
}

export function buildCoordResumos(
  coords: { id: string; nome: string }[],
  devidos: FinanceiroValorDevido[],
  lancamentos: FinanceiroLancamento[],
): FinanceiroCoordResumo[] {
  return coords.map((c) => {
    const valor_devido = devidos.find((d) => d.coordenador_id === c.id && !d.lider_id)?.valor_devido ?? 0
    const pago = sumPago(
      lancamentos.filter((l) => !l.lider_id),
      c.id,
      null,
    )
    const falta = Math.max(0, money(valor_devido - pago))
    return { coordenador_id: c.id, nome: c.nome, valor_devido, pago, falta }
  })
}

export function sumResumos(rows: FinanceiroCoordResumo[]) {
  return sumAlvos(rows)
}

export function isLocalFinanceiroMode(): boolean {
  try {
    return Boolean(
      localStorage.getItem(LOCAL_DEVIDO)
      || localStorage.getItem(LOCAL_LANC)
      || localStorage.getItem(LEGACY_DEVIDO)
      || localStorage.getItem(LEGACY_LANC),
    )
  } catch {
    return false
  }
}
