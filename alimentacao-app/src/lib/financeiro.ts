import { compressImageForUpload } from './imageCompress'
import { getCachedSignedUrl, setCachedSignedUrl, takeCachedSignedUrls } from './signedUrlCache'
import { supabase } from './supabase'

export type FinanceiroForma = 'dinheiro' | 'pix' | 'transferencia'

export type FinanceiroValorDevido = {
  id?: string
  diretoria_id: string
  coordenador_id: string
  valor_devido: number
  travado?: boolean
}

export type FinanceiroLancamento = {
  id: string
  diretoria_id: string
  coordenador_id: string
  valor: number
  forma: FinanceiroForma
  comprovante_path: string | null
  observacao?: string | null
  created_at: string
  created_by?: string | null
  /** preenchido no client */
  coordenador_nome?: string
  diretoria_nome?: string
}

export type FinanceiroCoordResumo = {
  coordenador_id: string
  nome: string
  valor_devido: number
  pago: number
  falta: number
}

const BUCKET = 'financeiro-comprovantes'
const LOCAL_DEVIDO = 'nerites_financeiro_devido_v2'
const LOCAL_LANC = 'nerites_financeiro_lanc_v2'
const LOCAL_TRAVADO = 'nerites_financeiro_travado_v1'

function readLocalTravado(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LOCAL_TRAVADO)
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

function travadoKey(diretoriaId: string, coordenadorId: string) {
  return `${diretoriaId}:${coordenadorId}`
}

function getLocalTravado(diretoriaId: string, coordenadorId: string): boolean {
  return Boolean(readLocalTravado()[travadoKey(diretoriaId, coordenadorId)])
}

function setLocalTravado(diretoriaId: string, coordenadorId: string, travado: boolean) {
  const map = readLocalTravado()
  map[travadoKey(diretoriaId, coordenadorId)] = travado
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

function readLocalDevido(): FinanceiroValorDevido[] {
  try {
    const raw = localStorage.getItem(LOCAL_DEVIDO)
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
    const raw = localStorage.getItem(LOCAL_LANC)
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

export async function fetchValoresDevidos(diretoriaIds?: string[]): Promise<FinanceiroValorDevido[]> {
  let q = supabase
    .from('financeiro_coordenador')
    .select('id,diretoria_id,coordenador_id,valor_devido,travado')
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
        travado: r.travado ?? getLocalTravado(r.diretoria_id, r.coordenador_id),
      }))
    }
    // coluna travado ou valor_devido ausente
    if (/travado|valor_devido/i.test(error.message)) {
      let q2 = supabase
        .from('financeiro_coordenador')
        .select('id,diretoria_id,coordenador_id,valor_devido,valor')
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
            travado: r.travado ?? getLocalTravado(r.diretoria_id, r.coordenador_id),
          }))
        }
        throw new Error(e2.message)
      }
      return (d2 ?? []).map((r) => {
        const diretoria_id = r.diretoria_id as string
        const coordenador_id = r.coordenador_id as string
        const row = r as { valor_devido?: number; valor?: number }
        return {
          id: r.id as string,
          diretoria_id,
          coordenador_id,
          valor_devido: Number(row.valor_devido ?? row.valor ?? 0),
          travado: getLocalTravado(diretoria_id, coordenador_id),
        }
      })
    }
    throw new Error(error.message)
  }

  return (data ?? []).map((r) => {
    const diretoria_id = r.diretoria_id as string
    const coordenador_id = r.coordenador_id as string
    const fromDb = Boolean((r as { travado?: boolean }).travado)
    return {
      id: r.id as string,
      diretoria_id,
      coordenador_id,
      valor_devido: Number(r.valor_devido ?? 0),
      travado: fromDb || getLocalTravado(diretoria_id, coordenador_id),
    }
  })
}

export async function upsertValorDevido(input: {
  diretoriaId: string
  coordenadorId: string
  valorDevido: number
  travado?: boolean
  updatedBy?: string | null
}): Promise<FinanceiroValorDevido> {
  const valor_devido = Math.max(0, Number(input.valorDevido) || 0)
  const travado = input.travado ?? true
  const payload = {
    diretoria_id: input.diretoriaId,
    coordenador_id: input.coordenadorId,
    valor_devido,
    travado,
    updated_at: new Date().toISOString(),
    updated_by: input.updatedBy ?? null,
  }

  const { data, error } = await supabase
    .from('financeiro_coordenador')
    .upsert(payload, { onConflict: 'diretoria_id,coordenador_id' })
    .select('id,diretoria_id,coordenador_id,valor_devido,travado')
    .maybeSingle()

  if (error) {
    // tenta sem coluna travado
    if (/travado/i.test(error.message)) {
      const { data: d2, error: e2 } = await supabase
        .from('financeiro_coordenador')
        .upsert(
          {
            diretoria_id: input.diretoriaId,
            coordenador_id: input.coordenadorId,
            valor_devido,
            updated_at: payload.updated_at,
            updated_by: payload.updated_by,
          },
          { onConflict: 'diretoria_id,coordenador_id' },
        )
        .select('id,diretoria_id,coordenador_id,valor_devido')
        .maybeSingle()
      if (!e2) {
        setLocalTravado(input.diretoriaId, input.coordenadorId, travado)
        return {
          id: d2?.id as string | undefined,
          diretoria_id: input.diretoriaId,
          coordenador_id: input.coordenadorId,
          valor_devido: Number(d2?.valor_devido ?? valor_devido),
          travado,
        }
      }
    }

    if (!isMissingRelation(error.message) && !/valor_devido/i.test(error.message)) {
      throw new Error(error.message)
    }

    if (/valor_devido/i.test(error.message)) {
      const { data: d2, error: e2 } = await supabase
        .from('financeiro_coordenador')
        .upsert(
          {
            diretoria_id: input.diretoriaId,
            coordenador_id: input.coordenadorId,
            valor: valor_devido,
            updated_at: payload.updated_at,
            updated_by: payload.updated_by,
          },
          { onConflict: 'diretoria_id,coordenador_id' },
        )
        .select('id,diretoria_id,coordenador_id,valor')
        .maybeSingle()
      if (!e2) {
        setLocalTravado(input.diretoriaId, input.coordenadorId, travado)
        return {
          id: d2?.id as string | undefined,
          diretoria_id: input.diretoriaId,
          coordenador_id: input.coordenadorId,
          valor_devido: Number((d2 as { valor?: number } | null)?.valor ?? valor_devido),
          travado,
        }
      }
    }

    const all = readLocalDevido()
    const idx = all.findIndex(
      (r) => r.diretoria_id === input.diretoriaId && r.coordenador_id === input.coordenadorId,
    )
    const row: FinanceiroValorDevido = {
      id: idx >= 0 ? all[idx].id : crypto.randomUUID(),
      diretoria_id: input.diretoriaId,
      coordenador_id: input.coordenadorId,
      valor_devido,
      travado,
    }
    if (idx >= 0) all[idx] = row
    else all.push(row)
    writeLocalDevido(all)
    setLocalTravado(input.diretoriaId, input.coordenadorId, travado)
    return row
  }

  setLocalTravado(input.diretoriaId, input.coordenadorId, Boolean(data?.travado ?? travado))
  return {
    id: data?.id as string | undefined,
    diretoria_id: (data?.diretoria_id as string) ?? input.diretoriaId,
    coordenador_id: (data?.coordenador_id as string) ?? input.coordenadorId,
    valor_devido: Number(data?.valor_devido ?? valor_devido),
    travado: Boolean((data as { travado?: boolean } | null)?.travado ?? travado),
  }
}

export async function setValorDevidoTravado(input: {
  diretoriaId: string
  coordenadorId: string
  valorDevido: number
  travado: boolean
  updatedBy?: string | null
}): Promise<FinanceiroValorDevido> {
  return upsertValorDevido({
    diretoriaId: input.diretoriaId,
    coordenadorId: input.coordenadorId,
    valorDevido: input.valorDevido,
    travado: input.travado,
    updatedBy: input.updatedBy,
  })
}

export async function fetchLancamentos(opts?: {
  diretoriaIds?: string[]
  limit?: number
}): Promise<FinanceiroLancamento[]> {
  const limit = opts?.limit ?? 40
  let q = supabase
    .from('financeiro_lancamentos')
    .select('id,diretoria_id,coordenador_id,valor,forma,comprovante_path,observacao,created_at,created_by')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (opts?.diretoriaIds?.length) q = q.in('diretoria_id', opts.diretoriaIds)

  const { data, error } = await q
  if (error) {
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
  valor: number
  forma: FinanceiroForma
  file?: File | null
  observacao?: string
  createdBy?: string | null
}): Promise<FinanceiroLancamento> {
  const valor = Math.round((Number(input.valor) || 0) * 100) / 100
  if (valor <= 0) throw new Error('Informe um valor maior que zero.')

  let comprovante_path: string | null = null
  if (input.file && input.createdBy) {
    try {
      comprovante_path = await uploadComprovante(input.createdBy, input.file)
    } catch (err) {
      // sem bucket: segue sem comprovante no servidor, ou data-url local
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
    valor,
    forma: input.forma,
    comprovante_path,
    observacao: input.observacao?.trim() || null,
    created_by: input.createdBy ?? null,
  }

  const { data, error } = await supabase
    .from('financeiro_lancamentos')
    .insert(payload)
    .select('id,diretoria_id,coordenador_id,valor,forma,comprovante_path,observacao,created_at,created_by')
    .maybeSingle()

  if (error) {
    if (!isMissingRelation(error.message)) throw new Error(error.message)

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
    valor: Number(data?.valor ?? valor),
    forma: parseForma(data?.forma),
    comprovante_path: (data?.comprovante_path as string | null) ?? comprovante_path,
    observacao: (data?.observacao as string | null) ?? null,
    created_at: (data?.created_at as string) ?? new Date().toISOString(),
    created_by: (data?.created_by as string | null) ?? null,
  }
}

export async function deleteLancamento(id: string, comprovantePath?: string | null): Promise<void> {
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

export function buildCoordResumos(
  coords: { id: string; nome: string }[],
  devidos: FinanceiroValorDevido[],
  lancamentos: FinanceiroLancamento[],
): FinanceiroCoordResumo[] {
  const devidoMap = new Map(devidos.map((d) => [d.coordenador_id, d.valor_devido]))
  const pagoMap = new Map<string, number>()
  for (const l of lancamentos) {
    pagoMap.set(l.coordenador_id, (pagoMap.get(l.coordenador_id) ?? 0) + l.valor)
  }
  return coords.map((c) => {
    const valor_devido = devidoMap.get(c.id) ?? 0
    const pago = Math.round((pagoMap.get(c.id) ?? 0) * 100) / 100
    const falta = Math.max(0, Math.round((valor_devido - pago) * 100) / 100)
    return { coordenador_id: c.id, nome: c.nome, valor_devido, pago, falta }
  })
}

export function sumResumos(rows: FinanceiroCoordResumo[]) {
  let devido = 0
  let pago = 0
  let falta = 0
  for (const r of rows) {
    devido += r.valor_devido
    pago += r.pago
    falta += r.falta
  }
  return {
    devido: Math.round(devido * 100) / 100,
    pago: Math.round(pago * 100) / 100,
    falta: Math.round(falta * 100) / 100,
  }
}

export function isLocalFinanceiroMode(): boolean {
  try {
    return Boolean(localStorage.getItem(LOCAL_DEVIDO) || localStorage.getItem(LOCAL_LANC))
  } catch {
    return false
  }
}
