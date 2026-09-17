import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { formatDateTime } from '../lib/format'

export function ConfiguracoesPage() {
  const { profile, updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const { error: err } = await updatePassword(password)
    setLoading(false)

    if (err) {
      setError(err)
      return
    }

    setMessage('Senha alterada com sucesso.')
    setPassword('')
    setConfirm('')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-subtitle">Perfil e segurança da conta.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1rem', maxWidth: 620 }}>
        <Card title="Informações do perfil">
          <div className="profile-rows">
            <div className="profile-row">
              <span>Nome</span>
              <strong>{profile?.nome ?? '—'}</strong>
            </div>
            <div className="profile-row">
              <span>E-mail</span>
              <strong>{profile?.email ?? '—'}</strong>
            </div>
            <div className="profile-row">
              <span>Função</span>
              <strong>{profile?.role === 'admin' ? 'Administrador' : 'Nerite'}</strong>
            </div>
            <div className="profile-row">
              <span>Conta criada</span>
              <strong>{formatDateTime(profile?.created_at)}</strong>
            </div>
          </div>
        </Card>

        <Card title="Alterar senha">
          <form onSubmit={handlePasswordChange} style={{ display: 'grid', gap: '1rem' }}>
            <Input
              label="Nova senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              label="Confirmar nova senha"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />

            {error && <div className="alert alert-error">{error}</div>}
            {message && <div className="alert alert-success">{message}</div>}

            <Button type="submit" loading={loading}>Salvar senha</Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
