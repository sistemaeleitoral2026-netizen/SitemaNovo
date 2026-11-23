import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Spinner } from '../../components/ui/Spinner'
import { hasRole } from '../../lib/roles'
import {
  clearSite,
  isSiteId,
  readSite,
  SITES,
  siteById,
  sitesForProfile,
  writeSite,
  type SiteId,
} from '../../lib/sites'

export function LoginPage() {
  const { session, profile, loading, signIn, signOut } = useAuth()
  const navigate = useNavigate()
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
    const disponiveis = sitesForProfile(profile)
    const escolhido = readSite()
    // Login com senha já gravou o sistema: entra direto (evita pedir de novo após a sessão carregar).
    // "Trocar sistema" limpa a escolha e aí sim mostra o seletor.
    if (escolhido && disponiveis.some((s) => s.id === escolhido)) {
      return <Navigate to={siteById(escolhido)?.home ?? '/'} replace />
    }

    const nome = profile.nome || profile.email || 'Usuário'

    function entrarNoSistema(e: React.FormEvent) {
      e.preventDefault()
      setError(null)
      if (!isSiteId(siteId)) {
        setError('Selecione o sistema.')
        return
      }
      if (!disponiveis.some((s) => s.id === siteId)) {
        setError('Você não tem acesso a este sistema.')
        return
      }
      writeSite(siteId)
      navigate(siteById(siteId)?.home ?? '/', { replace: true })
    }

    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <h1>Escolher sistema</h1>
            <p>
              Conectado como <strong>{nome}</strong>. Escolha o sistema para continuar. Não
              precisa digitar a senha de novo.
            </p>
          </div>

          <form className="login-form" onSubmit={entrarNoSistema}>
            <Select
              label="Sistema"
              value={siteId}
              onChange={(e) => {
                const value = e.target.value
                setSiteId(isSiteId(value) ? value : '')
                setError(null)
              }}
              placeholder="Selecione"
              options={disponiveis.map((s) => ({ value: s.id, label: s.nome }))}
              required
            />

            {error && <div className="alert alert-error">{error}</div>}

            <Button type="submit" size="lg" style={{ width: '100%' }}>
              Entrar
            </Button>

            {hasRole(profile, 'admin') ? (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                style={{ width: '100%' }}
                onClick={() => {
                  writeSite('nerites')
                  navigate('/admin', { replace: true })
                }}
              >
                Administração
              </Button>
            ) : null}

            <button
              type="button"
              className="login-help-link"
              onClick={() => void signOut()}
              style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
            >
              Encerrar sessão
            </button>
          </form>
        </div>
      </div>
    )
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
    const escolhido = siteId
    const { error: err } = await signIn(email, password)
    setSubmitting(false)
    if (err) {
      clearSite()
      setError('Usuário ou senha inválidos.')
      return
    }
    if (remember) {
      localStorage.setItem('alimentacao_remember', '1')
    } else {
      localStorage.removeItem('alimentacao_remember')
    }
    navigate(siteById(escolhido)?.home ?? '/', { replace: true })
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
        </form>
      </div>
    </div>
  )
}
