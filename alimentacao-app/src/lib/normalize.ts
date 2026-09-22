export function safeTrim(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

export function collapseSpaces(value: unknown): string {
  return safeTrim(value).replace(/\s+/g, ' ')
}

export function normalizeName(value: unknown): string {
  return collapseSpaces(value)
}

export function normalizeTitulo(value: unknown): string {
  return digitsOnly(value).slice(0, 12)
}

export function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

export function normalizeCpf(value: unknown): string {
  return digitsOnly(value).slice(0, 11)
}

export function formatCpf(value: string | null | undefined): string {
  if (!value || value === '—') return ''
  const d = normalizeCpf(value)
  if (!d) return ''
  if (d.length !== 11) return d
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function normalizePhone(value: unknown): string {
  let d = digitsOnly(value)
  // Colaram com DDI 55 (ex.: 5598999999999) → remove o país
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    d = d.slice(2)
  }
  return d.slice(0, 11)
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return ''
  const d = normalizePhone(value)
  if (d.length === 11) {
    return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }
  if (d.length === 10) {
    return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  }
  return value
}

export function normalizeCep(value: unknown): string {
  return digitsOnly(value).slice(0, 8)
}

export function formatCep(value: string | null | undefined): string {
  if (!value || value === '—') return ''
  const d = normalizeCep(value)
  if (!d) return ''
  if (d.length !== 8) return d
  return d.replace(/(\d{5})(\d{3})/, '$1-$2')
}

export function normalizeZona(value: unknown): string {
  const digits = digitsOnly(value)
  if (!digits) return ''
  return digits.padStart(3, '0')
}

export function normalizeSecao(value: unknown): string {
  const digits = digitsOnly(value)
  if (!digits) return ''
  return digits.padStart(4, '0')
}

export function normalizeBirthDate(value: unknown): string {
  const raw = safeTrim(value)
  if (!raw) return ''

  // YYYY-MM-DD (input type="date")
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // DD/MM/YYYY or DD-MM-YYYY
  const br = raw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`

  // Excel serial-ish fallback: leave empty if invalid
  return ''
}

export function normalizeCadastroFields<T extends {
  nome_completo: string
  cpf: string
  telefone: string
  titulo: string
  zona: string
  secao: string
  nome_mae: string
  coordenador: string
  lider: string
  data_nascimento: string
  cep: string
  endereco?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
}>(data: T): T {
  return {
    ...data,
    nome_completo: normalizeName(data.nome_completo),
    cpf: normalizeCpf(data.cpf),
    telefone: normalizePhone(data.telefone),
    titulo: normalizeTitulo(data.titulo),
    zona: normalizeZona(data.zona),
    secao: normalizeSecao(data.secao),
    nome_mae: normalizeName(data.nome_mae),
    coordenador: normalizeName(data.coordenador),
    lider: normalizeName(data.lider),
    data_nascimento: normalizeBirthDate(data.data_nascimento),
    cep: normalizeCep(data.cep),
    ...(data.endereco !== undefined ? { endereco: String(data.endereco ?? '').trim() } : {}),
    ...(data.numero !== undefined ? { numero: String(data.numero ?? '').trim() } : {}),
    ...(data.complemento !== undefined ? { complemento: String(data.complemento ?? '').trim() } : {}),
    ...(data.bairro !== undefined ? { bairro: String(data.bairro ?? '').trim() } : {}),
    ...(data.cidade !== undefined ? { cidade: String(data.cidade ?? '').trim() } : {}),
    ...(data.uf !== undefined ? { uf: String(data.uf ?? '').trim().toUpperCase().slice(0, 2) } : {}),
  }
}
