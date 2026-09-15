import type { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  accent: 'blue' | 'green' | 'purple' | 'orange'
}

const accentColors = {
  blue: 'var(--color-kpi-blue)',
  green: 'var(--color-kpi-green)',
  purple: 'var(--color-kpi-purple)',
  orange: 'var(--color-kpi-orange)',
}

export function KpiCard({ label, value, icon: Icon, accent }: KpiCardProps) {
  const color = accentColors[accent]

  return (
    <div
      style={{
        background: 'var(--color-white)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: '1.25rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--radius)',
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={22} color={color} />
      </div>
      <div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
          {label}
        </p>
        <p style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</p>
      </div>
    </div>
  )
}
