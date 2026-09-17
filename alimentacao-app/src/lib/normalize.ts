export function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizeName(value: string): string {
  return collapseSpaces(value)
}

export function normalizeTitulo(value: string): string {
  return collapseSpaces(value)
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function normalizeCpf(value: string): string {
  return digitsOnly(value).slice(0, 11)
}

export function formatCpf(value: string | null | undefined): string {
  if (!value) return '—'
  const d = normalizeCpf(value)
  if (d.length !== 11) return value
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function normalizePhone(value: string): string {
  return digitsOnly(value).slice(0, 11)
}

export function formatPhone(value: string): string {
  const d = normalizePhone(value)
  if (d.length === 11) {
    return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }
  if (d.length === 10) {
    return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  }
  return value
}

export function normalizeCep(value: string): string {
  return digitsOnly(value).slice(0, 8)
}

export function formatCep(value: string | null | undefined): string {
  if (!value) return '—'
  const d = normalizeCep(value)
  if (d.length !== 8) return value
  return d.replace(/(\d{5})(\d{3})/, '$1-$2')
}

export function normalizeZona(value: string): string {
  const digits = digitsOnly(value)
  if (!digits) return ''
  return digits.padStart(3, '0')
}

export function normalizeSecao(value: string): string {
  const digits = digitsOnly(value)
  if (!digits) return ''
  return digits.padStart(4, '0')
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
  cep: string
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
    cep: normalizeCep(data.cep),
  }
}
