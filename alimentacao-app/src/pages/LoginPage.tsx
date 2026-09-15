import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'

export function LoginPage() {
  const { session, profile, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="login-page">
        <Spinner size={40} />
      </div>
    )
  }

  if (session && profile) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: err } = await signIn(email, password)
    setSubmitting(false)
    if (err) {
      setError('Usuário ou senha inválidos.')
      return
    }
    if (remember) {
      localStorage.setItem('alimentacao_remember', '1')
    } else {
      localStorage.removeItem('alimentacao_remember')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <h1>AlimentaAção</h1>
          <p>Cadastro e Geolocalização</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Usuário"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Lembrar-me
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          <Button type="submit" loading={submitting} size="lg" style={{ width: '100%' }}>
            Entrar
          </Button>

          <Link
            to="/esqueci-senha"
            style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-primary)' }}
          >
            Esqueceu sua senha?
          </Link>
        </form>
      </div>
    </div>
  )
}
