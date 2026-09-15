import { format } from 'date-fns'
import type { PeriodPreset } from '../../lib/period'
import { getPeriodFromPreset } from '../../lib/period'

interface PeriodFilterProps {
  value: PeriodPreset
  onChange: (preset: PeriodPreset) => void
}

const options: { value: PeriodPreset; label: string }[] = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'all', label: 'Todo período' },
]

export function PeriodFilterSelect({ value, onChange }: PeriodFilterProps) {
  const period = getPeriodFromPreset(value)
  const rangeLabel =
    period.start && period.end
      ? `${format(period.start, 'dd/MM/yyyy')} — ${format(period.end, 'dd/MM/yyyy')}`
      : 'Todo o período'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PeriodPreset)}
        style={{
          padding: '0.5rem 0.75rem',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          background: '#fff',
          fontSize: '0.875rem',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
        {rangeLabel}
      </span>
    </div>
  )
}
