import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { normalizeCadastroFields, formatCpf, formatPhone, formatCep } from '../lib/normalize'
import { validateCadastroForm, isDuplicateCpfError } from '../lib/validation'
import { geocodeFromCep } from '../lib/geocode'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { CadastroFormData } from '../types'

const emptyForm: CadastroFormData = {
  nome_completo: '',
  cpf: '',
  telefone: '',
  titulo: '',
  zona: '',
  secao: '',
  nome_mae: '',
  cep: '',
}

export function CadastroFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [form, setForm] = useState<CadastroFormData>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    supabase.from('cadastros').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) {
        setForm({
          nome_completo: data.nome_completo,
          cpf: formatCpf(data.cpf ?? ''),
          telefone: formatPhone(data.telefone),
          titulo: data.titulo,
          zona: data.zona,
          secao: data.secao,
          nome_mae: data.nome_mae,
          cep: formatCep(data.cep ?? ''),
        })
      }
      setLoading(false)
    })
  }, [id])

  function updateField(field: keyof CadastroFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function handleClear() {
    setForm(emptyForm)
    setErrors({})
    setGlobalError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGlobalError(null)

    const normalized = normalizeCadastroFields(form)
    const fieldErrors = validateCadastroForm(normalized)
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors)
      return
    }

    setSaving(true)

    const coords = await geocodeFromCep(normalized.cep)

    const payload = {
      nome_completo: normalized.nome_completo,
      cpf: normalized.cpf || null,
      telefone: normalized.telefone,
      titulo: normalized.titulo,
      zona: normalized.zona,
      secao: normalized.secao,
      nome_mae: normalized.nome_mae,
      cep: normalized.cep || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      operator_id: profile!.id,
    }

    if (isEdit && id) {
      const { error } = await supabase.from('cadastros').update(payload).eq('id', id)
      setSaving(false)
      if (error) {
        if (isDuplicateCpfError(error.message)) {
          setErrors({ cpf: 'Este CPF já está cadastrado.' })
        } else {
          setGlobalError(error.message)
        }
        return
      }
      await logAudit('atualizar', 'cadastros', id, { cpf: normalized.cpf })
      navigate(profile?.role === 'admin' ? '/cadastros' : '/meus-cadastros')
    } else {
      const { data, error } = await supabase.from('cadastros').insert(payload).select('id').single()
      setSaving(false)
      if (error) {
        if (isDuplicateCpfError(error.message)) {
          setErrors({ cpf: 'Este CPF já está cadastrado.' })
        } else {
          setGlobalError(error.message)
        }
        return
      }
      await logAudit('criar', 'cadastros', data.id, { cpf: normalized.cpf })
      navigate(profile?.role === 'admin' ? '/cadastros' : '/meus-cadastros')
    }
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
          <h1 className="page-title">{isEdit ? 'Editar Cadastro' : 'Novo Cadastro'}</h1>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <Input
              label="Nome completo"
              value={form.nome_completo}
              onChange={(e) => updateField('nome_completo', e.target.value)}
              error={errors.nome_completo}
            />
            <Input
              label="CPF (opcional)"
              value={form.cpf}
              onChange={(e) => updateField('cpf', formatCpf(e.target.value))}
              error={errors.cpf}
              placeholder="000.000.000-00"
            />
            <Input
              label="Telefone"
              value={form.telefone}
              onChange={(e) => updateField('telefone', formatPhone(e.target.value))}
              error={errors.telefone}
              placeholder="(98) 99123-4567"
            />
            <Input
              label="Título de eleitor"
              value={form.titulo}
              onChange={(e) => updateField('titulo', e.target.value)}
              error={errors.titulo}
            />
            <Input
              label="Zona eleitoral"
              value={form.zona}
              onChange={(e) => updateField('zona', e.target.value)}
              error={errors.zona}
            />
            <Input
              label="Sessão eleitoral"
              value={form.secao}
              onChange={(e) => updateField('secao', e.target.value)}
              error={errors.secao}
            />
            <Input
              label="Nome completo da mãe"
              value={form.nome_mae}
              onChange={(e) => updateField('nome_mae', e.target.value)}
              error={errors.nome_mae}
            />
            <Input
              label="CEP (opcional)"
              value={form.cep}
              onChange={(e) => updateField('cep', formatCep(e.target.value))}
              error={errors.cep}
              placeholder="00000-000"
            />
          </div>

          {globalError && (
            <div className="alert alert-error" style={{ marginTop: '1rem' }}>
              {globalError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <Button type="submit" loading={saving}>
              Salvar Cadastro
            </Button>
            <Button type="button" variant="secondary" onClick={handleClear}>
              Limpar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
