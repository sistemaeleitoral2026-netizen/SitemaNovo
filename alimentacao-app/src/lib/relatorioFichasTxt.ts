import { supabase } from './supabase'
import { digitsOnly, normalizeBirthDate, normalizeCpf, normalizeName, normalizeSecao, normalizeZona } from './normalize'

export type RelatorioTxtStatus = 'ok' | 'erro'

export type RelatorioTxtLinha = {
  titulo_key: string
  titulo: string
  cadastro_id: string | null
  nome: string
  cpf: string
  data_nascimento: string
  nome_mae: string
  zona: string
  secao: string
  status: RelatorioTxtStatus
  operador_nome?: string
  coordenador?: string
  lider?: string
  linha_txt?: string
  motivo?: string
}

export const RELATORIO_TXT_HEADER = 'Nome;id;CPF;Titulo de eleitor;Data de nascimento;Nome completo da mãe;zona;sessao'
export const RELATORIO_TXT_LIMITE = 200

export type ProgressoCorrecao = {
  etapa: 'conferindo' | 'subindo' | 'gravando' | 'concluido'
  atual: number
  total: number
  nome: string
  aplicadas: number
  inalteradas: number
  falhas: number
}

function erroLimite(n: number): Error {
  return new Error(
    `São ${n} linhas. O limite é ${RELATORIO_TXT_LIMITE} por vez — não dá para subir mais. Tire o restante e faça outro lote.`,
  )
}

function assertLimiteLinhas(n: number) {
  if (n > RELATORIO_TXT_LIMITE) throw erroLimite(n)
}

async function yieldUi() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RelatorioTxtGerado = {
  at: string
  lines: string[]
  rows: Array<{
    id: string
    nome: string
    cpf: string
    titulo: string
    data_nascimento: string
    nome_mae: string
    zona: string
    secao: string
  }>
}

export function tituloKey(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

export function rowKey(id: string | null | undefined, titulo: string | null | undefined): string {
  const tid = String(id ?? '').trim()
  if (tid) return `id:${tid}`
  return tituloKey(titulo)
}

function isHeaderLine(line: string): boolean {
  const low = line.toLowerCase()
  return low.startsWith('nome;') || low.startsWith('id;') || low.startsWith('titulo de eleitor')
}

export function parseRelatorioTxtLines(text: string): RelatorioTxtLinha[] {
  const out: RelatorioTxtLinha[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || isHeaderLine(line)) continue
    const parts = line.split(';')
    const first = (parts[0] ?? '').trim()
    const second = (parts[1] ?? '').trim()

    let cadastro_id: string | null = null
    let nome = ''
    let cpf = ''
    let titulo = ''
    let data_nascimento = ''
    let nome_mae = ''
    let zona = ''
    let secao = ''

    if (UUID_RE.test(second)) {
      nome = first
      cadastro_id = second
      cpf = digitsOnly(parts[2] ?? '')
      titulo = (parts[3] ?? '').trim()
      data_nascimento = (parts[4] ?? '').trim()
      nome_mae = (parts[5] ?? '').trim()
      zona = (parts[6] ?? '').trim()
      secao = (parts[7] ?? '').trim()
    } else if (UUID_RE.test(first)) {
      cadastro_id = first
      cpf = digitsOnly(parts[1] ?? '')
      titulo = (parts[2] ?? '').trim()
      data_nascimento = (parts[3] ?? '').trim()
      nome_mae = (parts[4] ?? '').trim()
      zona = (parts[5] ?? '').trim()
      secao = (parts[6] ?? '').trim()
    } else {
      titulo = first
      data_nascimento = (parts[1] ?? '').trim()
      nome_mae = (parts[2] ?? '').trim()
      zona = (parts[3] ?? '').trim()
      secao = (parts[4] ?? '').trim()
    }

    const key = rowKey(cadastro_id, titulo)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({
      titulo_key: key,
      titulo,
      cadastro_id,
      nome,
      cpf,
      data_nascimento,
      nome_mae,
      zona,
      secao,
      status: 'ok',
    })
  }
  return out
}

export async function fetchRelatorioTxtLinhas(): Promise<RelatorioTxtLinha[]> {
  const pageSize = 1000
  const all: RelatorioTxtLinha[] = []
  let from = 0
  for (;;) {
    let { data, error } = await supabase
      .from('relatorio_fichas_txt')
      .select('titulo_key, titulo, cadastro_id, nome, cpf, data_nascimento, nome_mae, zona, secao, status, operador_nome, coordenador, lider, linha_txt, motivo')
      .order('updated_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error && /cadastro_id|cpf|zona|secao|nome|operador|coordenador|lider|linha_txt|motivo/i.test(error.message)) {
      const fallback = await supabase
        .from('relatorio_fichas_txt')
        .select('titulo_key, titulo, data_nascimento, nome_mae, status')
        .order('updated_at', { ascending: false })
        .range(from, from + pageSize - 1)
      data = (fallback.data ?? []) as typeof data
      error = fallback.error
    }
    if (error) throw new Error(error.message)
    const chunk = ((data ?? []) as RelatorioTxtLinha[]).map((row) => ({
      ...row,
      cadastro_id: row.cadastro_id ?? null,
      nome: row.nome ?? '',
      cpf: row.cpf ?? '',
      zona: row.zona ?? '',
      secao: row.secao ?? '',
      operador_nome: row.operador_nome ?? '',
      coordenador: row.coordenador ?? '',
      lider: row.lider ?? '',
      linha_txt: row.linha_txt ?? '',
      motivo: row.motivo ?? '',
    }))
    all.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function saveRelatorioTxtLinhas(
  text: string,
  status: RelatorioTxtStatus,
  userId: string | null,
): Promise<number> {
  const parsed = parseRelatorioTxtLines(text).map((row) => ({
    ...row,
    status,
    created_by: userId,
    updated_at: new Date().toISOString(),
  }))
  if (!parsed.length) return 0

  const page = 400
  for (let i = 0; i < parsed.length; i += page) {
    const slice = parsed.slice(i, i + page)
    const { error } = await supabase
      .from('relatorio_fichas_txt')
      .upsert(slice, { onConflict: 'titulo_key' })
    if (error) throw new Error(error.message)
  }
  return parsed.length
}

export function formatRelatorioLinha(row: {
  id?: string | null
  cadastro_id?: string | null
  nome?: string | null
  nome_completo?: string | null
  cpf?: string | null
  titulo?: string | null
  data_nascimento?: string | null
  nome_mae?: string | null
  zona?: string | null
  secao?: string | null
}): string {
  const id = String(row.id ?? row.cadastro_id ?? '').trim()
  const nome = String(row.nome_completo ?? row.nome ?? '').trim()
  const cpf = digitsOnly(row.cpf ?? '')
  const titulo = String(row.titulo ?? '').trim()
  const nasc = String(row.data_nascimento ?? '').trim()
  const mae = String(row.nome_mae ?? '').trim()
  const zona = String(row.zona ?? '').trim()
  const secao = String(row.secao ?? '').trim()
  return `${nome};${id};${cpf};${titulo};${nasc};${mae};${zona};${secao}`
}

export function linhaTxtDe(row: RelatorioTxtLinha): string {
  if (row.linha_txt?.trim()) return row.linha_txt.trim()
  return formatRelatorioLinha(row)
}

type CadastroCorrecao = {
  id: string
  nome_completo: string | null
  cpf: string | null
  titulo: string | null
  data_nascimento: string | null
  nome_mae: string | null
  zona: string | null
  secao: string | null
  coordenador: string | null
  lider: string | null
  operator_id: string | null
  diretoria_id: string | null
}

export type CorrecaoBackup = {
  id: string
  cadastro_id: string
  nome_completo: string
  antes: Record<string, string>
  depois: Record<string, string>
  linha_txt: string
  alterado_por_nome: string
  alterado_em: string
  revertido: boolean
}

export type AplicarCorrecoesResult = {
  aplicadas: number
  inalteradas: number
  falhas: RelatorioTxtLinha[]
}

export const FICHA_CAMPOS = [
  { key: 'nome_completo', label: 'Nome Completo' },
  { key: 'nome_mae', label: 'Nome da Mãe' },
  { key: 'data_nascimento', label: 'Data de Nascimento' },
  { key: 'titulo', label: 'Título de Eleitor' },
  { key: 'cpf', label: 'CPF' },
  { key: 'zona', label: 'Zona' },
  { key: 'secao', label: 'Seção' },
] as const

export type CorrecaoPreviewStatus = 'aplicar' | 'inalterada' | 'falha'

export type CorrecaoPreview = {
  key: string
  line: RelatorioTxtLinha
  extra: { operador_nome: string; coordenador: string; lider: string }
  antes: Record<string, string> | null
  depois: Record<string, string> | null
  status: CorrecaoPreviewStatus
  motivo?: string
}

function snapshotFicha(row: CadastroCorrecao): Record<string, string> {
  return {
    nome_completo: String(row.nome_completo ?? '').trim(),
    cpf: digitsOnly(row.cpf ?? ''),
    titulo: String(row.titulo ?? '').trim(),
    data_nascimento: normalizeBirthDate(row.data_nascimento) || String(row.data_nascimento ?? '').trim().slice(0, 10),
    nome_mae: String(row.nome_mae ?? '').trim(),
    zona: String(row.zona ?? '').trim(),
    secao: String(row.secao ?? '').trim(),
  }
}

function payloadDaLinha(line: RelatorioTxtLinha): Record<string, string> {
  return {
    nome_completo: normalizeName(line.nome),
    cpf: normalizeCpf(line.cpf),
    titulo: String(line.titulo ?? '').replace(/\D/g, '').slice(0, 12),
    data_nascimento: normalizeBirthDate(line.data_nascimento),
    nome_mae: normalizeName(line.nome_mae),
    zona: normalizeZona(line.zona),
    secao: normalizeSecao(line.secao),
  }
}

function mudou(antes: Record<string, string>, depois: Record<string, string>) {
  return Object.keys(depois).some((key) => (antes[key] ?? '') !== (depois[key] ?? ''))
}

async function fetchCadastrosByIds(ids: string[]): Promise<Map<string, CadastroCorrecao>> {
  const map = new Map<string, CadastroCorrecao>()
  const unique = [...new Set(ids.filter(Boolean))]
  const page = 200
  for (let i = 0; i < unique.length; i += page) {
    const slice = unique.slice(i, i + page)
    const { data, error } = await supabase
      .from('cadastros')
      .select('id, nome_completo, cpf, titulo, data_nascimento, nome_mae, zona, secao, coordenador, lider, operator_id, diretoria_id')
      .in('id', slice)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as CadastroCorrecao[]) {
      map.set(row.id, row)
    }
  }
  return map
}

async function fetchNomesOperadores(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return map
  const { data } = await supabase.from('profiles').select('id, nome').in('id', unique)
  for (const row of (data ?? []) as { id: string; nome: string | null }[]) {
    if (row.id) map.set(row.id, (row.nome || '').trim())
  }
  return map
}

function toFalha(
  line: RelatorioTxtLinha,
  motivo: string,
  extra?: { operador_nome?: string; coordenador?: string; lider?: string },
): RelatorioTxtLinha {
  const linha = formatRelatorioLinha(line)
  return {
    ...line,
    status: 'erro',
    motivo,
    linha_txt: linha,
    operador_nome: extra?.operador_nome ?? line.operador_nome ?? '',
    coordenador: extra?.coordenador ?? line.coordenador ?? '',
    lider: extra?.lider ?? line.lider ?? '',
  }
}

export async function previsualizarCorrecoesTxt(
  text: string,
  diretoriaId?: string | null,
): Promise<CorrecaoPreview[]> {
  const parsed = parseRelatorioTxtLines(text)
  assertLimiteLinhas(parsed.length)
  if (!parsed.length) return []

  const ids = parsed.map((p) => p.cadastro_id).filter((id): id is string => Boolean(id))
  const cadastros = await fetchCadastrosByIds(ids)
  const operadores = await fetchNomesOperadores(
    [...cadastros.values()].map((c) => c.operator_id ?? ''),
  )

  return parsed.map((line) => {
    if (!line.cadastro_id) {
      return {
        key: line.titulo_key,
        line,
        extra: { operador_nome: '', coordenador: '', lider: '' },
        antes: null,
        depois: payloadDaLinha(line),
        status: 'falha' as const,
        motivo: 'Linha sem id da ficha',
      }
    }

    const atual = cadastros.get(line.cadastro_id)
    if (!atual) {
      return {
        key: line.titulo_key,
        line,
        extra: { operador_nome: '', coordenador: '', lider: '' },
        antes: null,
        depois: payloadDaLinha(line),
        status: 'falha' as const,
        motivo: 'Ficha não encontrada',
      }
    }

    const extra = {
      operador_nome: operadores.get(atual.operator_id ?? '') ?? '',
      coordenador: atual.coordenador ?? '',
      lider: atual.lider ?? '',
    }

    if (diretoriaId && atual.diretoria_id && atual.diretoria_id !== diretoriaId) {
      return {
        key: line.titulo_key,
        line,
        extra,
        antes: snapshotFicha(atual),
        depois: payloadDaLinha({ ...line, nome: line.nome || String(atual.nome_completo ?? '') }),
        status: 'falha' as const,
        motivo: 'Ficha de outra diretoria',
      }
    }

    const depois = payloadDaLinha({
      ...line,
      nome: line.nome || String(atual.nome_completo ?? ''),
    })
    if (!depois.nome_completo) {
      return {
        key: line.titulo_key,
        line,
        extra,
        antes: snapshotFicha(atual),
        depois,
        status: 'falha' as const,
        motivo: 'Nome vazio',
      }
    }

    const antes = snapshotFicha(atual)
    return {
      key: line.titulo_key,
      line: { ...line, nome: depois.nome_completo },
      extra,
      antes,
      depois,
      status: mudou(antes, depois) ? 'aplicar' as const : 'inalterada' as const,
    }
  })
}

export async function aplicarCorrecoesTxt(
  text: string,
  user: { id: string; nome: string } | null,
  diretoriaId?: string | null,
  selecionadas?: Set<string> | null,
  onProgress?: (info: ProgressoCorrecao) => void,
): Promise<AplicarCorrecoesResult> {
  const parsed = parseRelatorioTxtLines(text)
  assertLimiteLinhas(parsed.length)
  onProgress?.({
    etapa: 'conferindo',
    atual: 0,
    total: parsed.length,
    nome: '',
    aplicadas: 0,
    inalteradas: 0,
    falhas: 0,
  })
  const previews = await previsualizarCorrecoesTxt(text, diretoriaId)
  const escolhidas = previews.filter((item) => !selecionadas || selecionadas.has(item.key))
  if (!escolhidas.length) return { aplicadas: 0, inalteradas: 0, falhas: [] }
  assertLimiteLinhas(escolhidas.length)

  const falhas: RelatorioTxtLinha[] = []
  const okRows: RelatorioTxtLinha[] = []
  let aplicadas = 0
  let inalteradas = 0

  for (let i = 0; i < escolhidas.length; i += 1) {
    const item = escolhidas[i]
    if (!item) continue
    const nome = (
      item.depois?.nome_completo
      || item.antes?.nome_completo
      || item.line.nome
      || 'ficha'
    ).trim()
    onProgress?.({
      etapa: 'subindo',
      atual: i + 1,
      total: escolhidas.length,
      nome,
      aplicadas,
      inalteradas,
      falhas: falhas.length,
    })
    await yieldUi()

    const extra = item.extra
    if (item.status === 'falha' || !item.depois) {
      falhas.push(toFalha(item.line, item.motivo || 'Não foi possível aplicar', extra))
      continue
    }

    const linha = formatRelatorioLinha({ ...item.line, id: item.line.cadastro_id, nome: item.depois.nome_completo })
    if (item.status === 'inalterada' || !item.antes) {
      inalteradas += 1
      okRows.push({ ...item.line, status: 'ok', ...extra, linha_txt: linha, nome: item.depois.nome_completo })
      continue
    }

    const { error: upErr } = await supabase
      .from('cadastros')
      .update({
        nome_completo: item.depois.nome_completo,
        cpf: item.depois.cpf || null,
        titulo: item.depois.titulo,
        data_nascimento: item.depois.data_nascimento || null,
        nome_mae: item.depois.nome_mae,
        zona: item.depois.zona,
        secao: item.depois.secao,
      })
      .eq('id', item.line.cadastro_id)
    if (upErr) {
      falhas.push(toFalha(item.line, upErr.message, extra))
      continue
    }

    const { error: bkErr } = await supabase.from('cadastro_correcao_backup').insert({
      cadastro_id: item.line.cadastro_id,
      nome_completo: item.depois.nome_completo,
      antes: item.antes,
      depois: item.depois,
      linha_txt: linha,
      alterado_por: user?.id ?? null,
      alterado_por_nome: user?.nome ?? '',
    })
    if (bkErr && !/does not exist|schema cache/i.test(bkErr.message)) {
      falhas.push(toFalha(item.line, `Ficha gravada, mas o backup falhou: ${bkErr.message}`, extra))
      continue
    }

    aplicadas += 1
    okRows.push({ ...item.line, status: 'ok', ...extra, linha_txt: linha, nome: item.depois.nome_completo })
  }

  onProgress?.({
    etapa: 'gravando',
    atual: escolhidas.length,
    total: escolhidas.length,
    nome: '',
    aplicadas,
    inalteradas,
    falhas: falhas.length,
  })

  if (okRows.length) {
    const { error } = await supabase.from('relatorio_fichas_txt').upsert(
      okRows.map((row) => ({
        ...row,
        created_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'titulo_key' },
    )
    if (error && !/operador_nome|linha_txt|motivo/i.test(error.message)) {
      throw new Error(error.message)
    }
  }

  if (falhas.length) {
    const { error } = await supabase.from('relatorio_fichas_txt').upsert(
      falhas.map((row) => ({
        ...row,
        created_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'titulo_key' },
    )
    if (error && !/operador_nome|linha_txt|motivo/i.test(error.message)) {
      throw new Error(error.message)
    }
  }

  onProgress?.({
    etapa: 'concluido',
    atual: escolhidas.length,
    total: escolhidas.length,
    nome: '',
    aplicadas,
    inalteradas,
    falhas: falhas.length,
  })
  return { aplicadas, inalteradas, falhas }
}

export async function saveFalhasTxt(
  text: string,
  userId: string | null,
): Promise<number> {
  const parsed = parseRelatorioTxtLines(text)
  if (!parsed.length) return 0
  assertLimiteLinhas(parsed.length)
  const ids = parsed.map((p) => p.cadastro_id).filter((id): id is string => Boolean(id))
  const cadastros = await fetchCadastrosByIds(ids)
  const operadores = await fetchNomesOperadores(
    [...cadastros.values()].map((c) => c.operator_id ?? ''),
  )
  const rows = parsed.map((line) => {
    const atual = line.cadastro_id ? cadastros.get(line.cadastro_id) : undefined
    return {
      ...line,
      status: 'erro' as const,
      linha_txt: formatRelatorioLinha(line),
      operador_nome: atual ? (operadores.get(atual.operator_id ?? '') ?? '') : '',
      coordenador: atual?.coordenador ?? '',
      lider: atual?.lider ?? '',
      motivo: 'Colado em Falhas',
      created_by: userId,
      updated_at: new Date().toISOString(),
    }
  })
  const { error } = await supabase.from('relatorio_fichas_txt').upsert(rows, { onConflict: 'titulo_key' })
  if (error) throw new Error(error.message)
  return rows.length
}

export async function fetchCorrecaoBackups(opts: {
  nome?: string
  data?: string
  hora?: string
}): Promise<CorrecaoBackup[]> {
  let q = supabase
    .from('cadastro_correcao_backup')
    .select('id, cadastro_id, nome_completo, antes, depois, linha_txt, alterado_por_nome, alterado_em, revertido')
    .order('alterado_em', { ascending: false })
    .limit(200)
  const nome = (opts.nome ?? '').trim()
  if (nome) q = q.ilike('nome_completo', `%${nome}%`)
  if (opts.data) {
    const start = `${opts.data}T${opts.hora && opts.hora.length >= 4 ? opts.hora : '00:00'}:00`
    const end = opts.hora && opts.hora.length >= 4
      ? `${opts.data}T${opts.hora}:59`
      : `${opts.data}T23:59:59`
    q = q.gte('alterado_em', start).lte('alterado_em', end)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as CorrecaoBackup[]
}

export async function reverterCorrecaoBackup(id: string, userId: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('cadastro_correcao_backup')
    .select('id, cadastro_id, antes, revertido')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const row = data as { id: string; cadastro_id: string; antes: Record<string, string>; revertido: boolean } | null
  if (!row) throw new Error('Backup não encontrado.')
  if (row.revertido) throw new Error('Essa alteração já foi revertida.')
  const antes = row.antes ?? {}
  const { error: upErr } = await supabase
    .from('cadastros')
    .update({
      nome_completo: antes.nome_completo ?? '',
      cpf: antes.cpf || null,
      titulo: antes.titulo ?? '',
      data_nascimento: antes.data_nascimento || null,
      nome_mae: antes.nome_mae ?? '',
      zona: antes.zona ?? '',
      secao: antes.secao ?? '',
    })
    .eq('id', row.cadastro_id)
  if (upErr) throw new Error(upErr.message)
  const { error: bkErr } = await supabase
    .from('cadastro_correcao_backup')
    .update({
      revertido: true,
      revertido_em: new Date().toISOString(),
      revertido_por: userId,
    })
    .eq('id', id)
  if (bkErr) throw new Error(bkErr.message)
}
