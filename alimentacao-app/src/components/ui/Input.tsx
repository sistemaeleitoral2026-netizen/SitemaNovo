import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, id, style, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="ui-field">
      {label && (
        <label htmlFor={inputId} className="ui-field-label">
          {label}
        </label>
      )}
      <input
        id={inputId}
        {...props}
        aria-invalid={error ? true : undefined}
        className={`ui-input${error ? ' ui-input-error' : ''}`}
        style={style}
      />
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
