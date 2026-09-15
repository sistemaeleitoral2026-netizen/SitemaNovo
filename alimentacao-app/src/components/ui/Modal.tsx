import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'primary' | 'danger'
  loading?: boolean
  children?: ReactNode
}

export function Modal({
  open,
  title,
  description,
  onClose,
  onConfirm,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'primary',
  loading = false,
  children,
}: ModalProps) {
  if (!open) return null

  return (
    <>
      <div className="overlay" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 101,
          width: '100%',
          maxWidth: '440px',
          background: '#fff',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-md)',
          padding: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>
        {description && (
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', fontSize: '0.9375rem' }}>
            {description}
          </p>
        )}
        {children}
        {onConfirm && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
