import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import type { PeriodPreset } from '../../lib/period'
import { getPeriodFromPreset } from '../../lib/period'

interface PeriodFilterProps {
  value: PeriodPreset
  onChange: (preset: PeriodPreset) => void
  showRange?: boolean
}

const options: { value: PeriodPreset; label: string }[] = [
  { value: 'all', label: 'Todo o período' },
  { value: '90d', label: '90 dias' },
  { value: '30d', label: '30 dias' },
  { value: '7d', label: '7 dias' },
]

export function PeriodFilterSelect({ value, onChange, showRange = true }: PeriodFilterProps) {
  const period = getPeriodFromPreset(value)
  const rangeLabel =
    period.start && period.end
      ? `${format(period.start, 'dd/MM/yyyy')} — ${format(period.end, 'dd/MM/yyyy')}`
      : 'Todo o período'

  return (
    <div className="period-filter">
      {showRange && (
        <div className="period-range" aria-hidden>
          <CalendarDays size={15} />
          <span>{rangeLabel}</span>
        </div>
      )}
      <select
        className="period-select"
        value={value}
        onChange={(e) => onChange(e.target.value as PeriodPreset)}
        aria-label="Período"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
