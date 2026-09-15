import { endOfDay, startOfDay, subDays } from 'date-fns'
import type { PeriodFilter } from '../types'

export type PeriodPreset = '7d' | '30d' | '90d' | 'all'

export function getPeriodFromPreset(preset: PeriodPreset): PeriodFilter {
  const end = endOfDay(new Date())
  if (preset === 'all') return { start: null, end: null }
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  return { start: startOfDay(subDays(end, days - 1)), end }
}

export function applyPeriodFilter<T extends { created_at: string }>(
  items: T[],
  period: PeriodFilter,
): T[] {
  if (!period.start && !period.end) return items
  return items.filter((item) => {
    const date = new Date(item.created_at)
    if (period.start && date < period.start) return false
    if (period.end && date > period.end) return false
    return true
  })
}

export function toIsoStart(date: Date | null): string | undefined {
  return date ? date.toISOString() : undefined
}

export function toIsoEnd(date: Date | null): string | undefined {
  return date ? date.toISOString() : undefined
}
