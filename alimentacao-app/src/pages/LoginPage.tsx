import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import { CheckCircle2, LockKeyhole } from 'lucide-react'

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
      <section className="login-intro" aria-label="Apresentação do sistema">
        <div className="login-intro-content">
          <div className="login-wordmark"><span>N</span>Nerites</div>
          <h1>Gestão de cadastros<br />com visão territorial.</h1>
          <p>Centralize a operação, acompanhe a equipe e visualize os dados coletados em um único ambiente.</p>
          <ul>
            <li><CheckCircle2 size={17} /> Gestão organizada da equipe</li>
            <li><CheckCircle2 size={17} /> Indicadores e relatórios consolidados</li>
            <li><CheckCircle2 size={17} /> Leitura geográfica dos cadastros</li>
          </ul>
        </div>
      </section>
      <div className="login-card">
        <div className="login-brand">
          <div className="login-card-icon"><LockKeyhole size={22} /></div>
          <span className="login-kicker">Acesso ao sistema</span>
          <h1>Bem-vindo</h1>
          <p>Entre com suas credenciais para continuar.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="E-mail"
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
