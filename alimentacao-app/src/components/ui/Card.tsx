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
      className={`ui-card ${className}`}
      style={{
        ...style,
      }}
    >
      {(title || action) && (
        <div className="ui-card-header" style={{ padding: padding ? undefined : 0 }}>
          <div>
            {title && (
              <h3>{title}</h3>
            )}
            {subtitle && (
              <p>
                {subtitle}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="ui-card-body" style={{ padding: padding ? undefined : 0 }}>{children}</div>
    </div>
  )
}
