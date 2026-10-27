import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { clearSite, isSiteId, readSite, SITES, siteById, writeSite, type SiteId } from '../lib/sites'

export function LoginPage() {
  const { session, profile, loading, signIn } = useAuth()
  const [siteId, setSiteId] = useState<SiteId | ''>('')
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
    const escolhido = siteById(readSite())
    return <Navigate to={escolhido?.home ?? '/'} replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isSiteId(siteId)) {
      setError('Selecione o sistema.')
      return
    }
    writeSite(siteId)
    setSubmitting(true)
    const { error: err } = await signIn(email, password)
    setSubmitting(false)
    if (err) {
      clearSite()
      setError('Usuário ou senha inválidos.')
    } else if (remember) {
      localStorage.setItem('alimentacao_remember', '1')
    } else {
      localStorage.removeItem('alimentacao_remember')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <h1>Acesso</h1>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <Select
            label="Sistema"
            value={siteId}
            onChange={(e) => {
              const value = e.target.value
              setSiteId(isSiteId(value) ? value : '')
              setError(null)
            }}
            placeholder="Selecione"
            options={SITES.map((s) => ({ value: s.id, label: s.nome }))}
            required
          />
          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            inputMode="email"
          />
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <label className="login-remember">
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

          <Link to="/esqueci-senha" className="login-help-link">
            Esqueceu sua senha?
          </Link>
        </form>
      </div>
    </div>
  )
}
