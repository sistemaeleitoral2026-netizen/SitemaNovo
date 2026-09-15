import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatCpf, formatPhone, formatCep } from './normalize'

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? parseISO(value) : value
  return format(date, 'dd/MM/yyyy', { locale: ptBR })
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? parseISO(value) : value
  return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export { formatCpf, formatPhone, formatCep }
