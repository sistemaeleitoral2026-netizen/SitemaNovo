import type { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  accent: 'blue' | 'green' | 'purple' | 'orange'
  helper?: string
  delta?: string
  deltaTone?: 'up' | 'neutral'
}

const accentColors = {
  blue: 'var(--color-kpi-blue)',
  green: 'var(--color-kpi-green)',
  purple: 'var(--color-kpi-purple)',
  orange: 'var(--color-kpi-orange)',
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  helper,
  delta,
  deltaTone = 'neutral',
}: KpiCardProps) {
  const color = accentColors[accent]

  return (
    <div className="kpi-card" style={{ '--kpi-accent': color } as React.CSSProperties}>
      <div className="kpi-card-top">
        <div className="kpi-icon" style={{ background: `${color}14` }}>
          <Icon size={20} color={color} />
        </div>
        {delta && (
          <span className={`kpi-delta kpi-delta-${deltaTone}`}>{delta}</span>
        )}
      </div>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {helper && <span className="kpi-helper">{helper}</span>}
    </div>
  )
}
