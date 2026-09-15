import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        color: 'var(--color-text-muted)',
      }}
    >
      <Inbox size={40} strokeWidth={1.5} style={{ marginBottom: '1rem', opacity: 0.5 }} />
      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.25rem' }}>
        {title}
      </h3>
      {description && <p style={{ fontSize: '0.875rem', maxWidth: '360px' }}>{description}</p>}
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  )
}
