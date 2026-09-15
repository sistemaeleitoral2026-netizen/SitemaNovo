import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  title?: string
  subtitle?: string
  action?: ReactNode
  className?: string
  style?: CSSProperties
  padding?: boolean
}

export function Card({
  children,
  title,
  subtitle,
  action,
  className = '',
  style,
  padding = true,
}: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--color-white)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: padding ? '1rem 1.25rem' : undefined,
            borderBottom: title ? '1px solid var(--color-border)' : undefined,
          }}
        >
          <div>
            {title && (
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
            )}
            {subtitle && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>
                {subtitle}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      <div style={{ padding: padding ? '1.25rem' : undefined }}>{children}</div>
    </div>
  )
}
