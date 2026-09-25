import { supabase } from './supabase'
import { digitsOnly } from './normalize'

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
}

export const RELATORIO_TXT_HEADER = 'Nome;id;CPF;Titulo de eleitor;Data de nascimento;Nome completo da mãe;zona;sessao'

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
      .select('titulo_key, titulo, cadastro_id, nome, cpf, data_nascimento, nome_mae, zona, secao, status')
      .order('updated_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error && /cadastro_id|cpf|zona|secao|nome/i.test(error.message)) {
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
