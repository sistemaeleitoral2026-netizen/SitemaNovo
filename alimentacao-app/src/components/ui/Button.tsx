import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
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
      className={`ui-button ui-button-${variant} ui-button-${size} ${props.className ?? ''}`.trim()}
      style={style}
    >
      {loading && <span className="ui-button-spinner" aria-hidden />}
      <span>{loading ? 'Aguarde...' : children}</span>
    </button>
  )
}
