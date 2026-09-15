import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)
    const { error: err } = await resetPassword(email)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    setMessage('Se o e-mail existir, você receberá instruções para redefinir sua senha.')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <h1>AlimentaAção</h1>
          <p>Recuperar senha</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Usuário"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {error && <div className="alert alert-error">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <Button type="submit" loading={loading} size="lg" style={{ width: '100%' }}>
            Enviar
          </Button>

          <Link
            to="/login"
            style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-primary)' }}
          >
            Voltar ao login
          </Link>
        </form>
      </div>
    </div>
  )
}
