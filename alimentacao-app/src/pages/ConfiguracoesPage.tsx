import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { formatDateTime } from '../lib/format'
import { DEFAULT_META, getMetaFichas, setMetaFichas } from '../lib/meta'

export function ConfiguracoesPage() {
  const { profile, updatePassword } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [metaInput, setMetaInput] = useState(String(DEFAULT_META))
  const [metaMessage, setMetaMessage] = useState<string | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)

  useEffect(() => {
    setMetaInput(String(getMetaFichas()))
  }, [])

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

  function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault()
    setMetaError(null)
    setMetaMessage(null)
    const n = Number(String(metaInput).replace(/\D/g, ''))
    if (!n || n < 1) {
      setMetaError('Informe uma meta válida (mínimo 1).')
      return
    }
    const saved = setMetaFichas(n)
    setMetaInput(String(saved))
    setMetaMessage(`Meta atualizada para ${saved.toLocaleString('pt-BR')} fichas.`)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-subtitle">Perfil, segurança e metas do sistema.</p>
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
              <strong>
                {profile?.role === 'admin'
                  ? 'Administrador'
                  : profile?.role === 'diretoria'
                    ? 'Diretoria'
                    : 'Nerite'}
              </strong>
            </div>
            <div className="profile-row">
              <span>Conta criada</span>
              <strong>{formatDateTime(profile?.created_at)}</strong>
            </div>
          </div>
        </Card>

        {isAdmin && (
          <Card title="Meta de fichas">
            <form onSubmit={handleSaveMeta} style={{ display: 'grid', gap: '1rem' }}>
              <p style={{ margin: 0, fontSize: '.84rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                Defina a meta geral do sistema. O dashboard do admin mostra quanto falta
                e o primeiro acesso do dia exibe um aviso central.
              </p>
              <Input
                label="Meta atual (fichas)"
                type="number"
                min={1}
                step={1}
                value={metaInput}
                onChange={(e) => setMetaInput(e.target.value)}
                required
              />
              <div className="meta-config-hint">
                <ClipboardList size={15} strokeWidth={1.75} />
                <span>Padrão sugerido: {DEFAULT_META.toLocaleString('pt-BR')} fichas</span>
              </div>
              {metaError && <div className="alert alert-error">{metaError}</div>}
              {metaMessage && <div className="alert alert-success">{metaMessage}</div>}
              <Button type="submit">Salvar meta</Button>
            </form>
          </Card>
        )}

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
