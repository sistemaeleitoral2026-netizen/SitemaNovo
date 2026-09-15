import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

const styles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
  primary: {
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
  },
  secondary: {
    background: '#fff',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
  danger: {
    background: 'var(--color-danger)',
    color: '#fff',
    border: 'none',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-muted)',
    border: 'none',
  },
}

const sizes: Record<NonNullable<ButtonProps['size']>, React.CSSProperties> = {
  sm: { padding: '0.375rem 0.75rem', fontSize: '0.8125rem' },
  md: { padding: '0.5rem 1rem', fontSize: '0.875rem' },
  lg: { padding: '0.625rem 1.25rem', fontSize: '0.9375rem' },
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        borderRadius: 'var(--radius)',
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        transition: 'background 0.15s, opacity 0.15s',
        ...sizes[size],
        ...styles[variant],
        ...style,
      }}
    >
      {loading ? 'Aguarde...' : children}
    </button>
  )
}
