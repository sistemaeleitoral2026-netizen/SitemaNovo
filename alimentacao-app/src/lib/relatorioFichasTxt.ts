import { supabase } from './supabase'

export type RelatorioTxtStatus = 'ok' | 'erro'

export type RelatorioTxtLinha = {
  titulo_key: string
  titulo: string
  data_nascimento: string
  nome_mae: string
  status: RelatorioTxtStatus
}

export function tituloKey(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

export function parseRelatorioTxtLines(text: string): RelatorioTxtLinha[] {
  const out: RelatorioTxtLinha[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.toLowerCase().startsWith('titulo de eleitor')) continue
    const parts = line.split(';')
    const titulo = (parts[0] ?? '').trim()
    const key = tituloKey(titulo)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({
      titulo_key: key,
      titulo,
      data_nascimento: (parts[1] ?? '').trim(),
      nome_mae: (parts[2] ?? '').trim(),
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
    const { data, error } = await supabase
      .from('relatorio_fichas_txt')
      .select('titulo_key, titulo, data_nascimento, nome_mae, status')
      .order('updated_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const chunk = (data ?? []) as RelatorioTxtLinha[]
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
