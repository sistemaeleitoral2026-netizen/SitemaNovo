import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { formatDateTime } from '../lib/format'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Cadastro, OperadorStats, Profile } from '../types'

export function OperadoresPage() {
  const { createNerite } = useAuth()
  const [operadores, setOperadores] = useState<Profile[]>([])
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [search, setSearch] = useState('')
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d')
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', email: '', password: '', confirm: '' })

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  async function load() {
    setLoading(true)
    const [ops, cads] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'operador').order('nome'),
      supabase.from('cadastros').select('*'),
    ])
    setOperadores((ops.data ?? []) as Profile[])
    setCadastros((cads.data ?? []) as Cadastro[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const stats = useMemo((): OperadorStats[] => {
    return operadores
      .filter((op) => op.nome.toLowerCase().includes(search.toLowerCase()))
      .map((op) => {
        const all = cadastros.filter((c) => c.operator_id === op.id)
        const inPeriod = all.filter((c) => {
          if (!period.start && !period.end) return true
          const d = new Date(c.created_at)
          if (period.start && d < period.start) return false
          if (period.end && d > period.end) return false
          return true
        })
        const ultima = all.length
          ? all.reduce((latest, c) => (c.created_at > latest ? c.created_at : latest), all[0].created_at)
          : null

        return {
          id: op.id,
          nome: op.nome,
          email: op.email,
          ativo: op.ativo,
          total: all.length,
          periodo: inPeriod.length,
          ultima_atividade: ultima,
        }
      })
  }, [operadores, cadastros, search, period])

  async function handleCreate() {
    setCreateError(null)
    if (!form.nome.trim()) {
      setCreateError('Informe o nome da nerite.')
      return
    }
    if (!form.email.trim()) {
      setCreateError('Informe o e-mail de acesso.')
      return
    }
    if (form.password.length < 8) {
      setCreateError('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (form.password !== form.confirm) {
      setCreateError('As senhas não coincidem.')
      return
    }

    setCreating(true)
    const { error } = await createNerite({
      nome: form.nome,
      email: form.email,
      password: form.password,
    })
    setCreating(false)

    if (error) {
      setCreateError(error)
      return
    }

    setCreateOpen(false)
    setForm({ nome: '', email: '', password: '', confirm: '' })
    await load()
  }

  async function toggleAtivo(op: OperadorStats) {
    await supabase.from('profiles').update({ ativo: !op.ativo }).eq('id', op.id)
    await load()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nerites</h1>
          <p className="page-subtitle">Crie contas, defina senhas e acompanhe o desempenho</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} />
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus size={16} /> Nova nerite
          </Button>
        </div>
      </div>

      <Card>
        <div style={{ marginBottom: '1rem', maxWidth: 360 }}>
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar nerite"
          />
        </div>

        {!stats.length ? (
          <EmptyState
            title="Nenhuma nerite cadastrada"
            description="Crie a conta e a senha de cada nerite para ela começar a cadastrar."
            action={<Button onClick={() => setCreateOpen(true)}>Criar primeira nerite</Button>}
          />
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nerite</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Cadastros no período</th>
                  <th>Última atividade</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((op) => (
                  <tr key={op.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{op.nome}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{op.email}</div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.5rem',
                          borderRadius: 999,
                          background: op.ativo ? '#dcfce7' : '#fee2e2',
                          color: op.ativo ? '#166534' : '#991b1b',
                        }}
                      >
                        {op.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td>{op.total}</td>
                    <td>{op.periodo}</td>
                    <td>{formatDateTime(op.ultima_atividade)}</td>
                    <td style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Link to={`/nerites/${op.id}`}>
                        <Button variant="secondary" size="sm">Ver análise</Button>
                      </Link>
                      <Button variant="ghost" size="sm" onClick={() => toggleAtivo(op)}>
                        {op.ativo ? 'Desativar' : 'Ativar'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        title="Nova nerite"
        description="Informe nome, e-mail e senha. A conta já fica pronta para entrar — sem confirmar e-mail."
        onClose={() => !creating && setCreateOpen(false)}
        onConfirm={handleCreate}
        confirmLabel="Criar conta"
        loading={creating}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Input
            label="Nome completo"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            placeholder="Nome da nerite"
          />
          <Input
            label="E-mail de acesso"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="nerite@exemplo.com"
          />
          <Input
            label="Senha"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Mínimo 8 caracteres"
          />
          <Input
            label="Confirmar senha"
            type="password"
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          />
          {createError && <div className="alert alert-error">{createError}</div>}
        </div>
      </Modal>
    </div>
  )
}
