import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, User, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { normalizeCadastroFields, formatCpf, formatPhone, formatCep } from '../lib/normalize'
import { validateCadastroForm, isDuplicateCpfError, isDuplicateTituloError } from '../lib/validation'
import { geocodeFromZona } from '../lib/geocode'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { CadastroFormData, Coordenador, Lider } from '../types'

const emptyForm: CadastroFormData = {
  nome_completo: '',
  cpf: '',
  telefone: '',
  titulo: '',
  zona: '',
  secao: '',
  nome_mae: '',
  coordenador: '',
  lider: '',
  data_nascimento: '',
  cep: '',
}

export function CadastroFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [form, setForm] = useState<CadastroFormData>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [coordenadorId, setCoordenadorId] = useState('')
  const [liderId, setLiderId] = useState('')
  const [carrosAdesivados, setCarrosAdesivados] = useState(0)
  const [adesivosCasa, setAdesivosCasa] = useState(0)
  const [postagens, setPostagens] = useState(0)

  const isStaff = profile?.role === 'admin' || profile?.role === 'diretoria'
  const showMobilizacao = isStaff && isEdit

  const diretoriaId =
    profile?.role === 'diretoria'
      ? profile.id
      : profile?.diretoria_id ?? null

  useEffect(() => {
    async function loadOptions() {
      let coordsQuery = supabase.from('coordenadores').select('*').eq('ativo', true).order('nome')
      let lidsQuery = supabase.from('lideres').select('*').eq('ativo', true).order('nome')
      if (diretoriaId) {
        coordsQuery = coordsQuery.eq('diretoria_id', diretoriaId)
        lidsQuery = lidsQuery.eq('diretoria_id', diretoriaId)
      }

      const [coords, lids] = await Promise.all([coordsQuery, lidsQuery])
      setCoordenadores((coords.data ?? []) as Coordenador[])
      setLideres((lids.data ?? []) as Lider[])
      if (!isEdit) setLoading(false)
    }

    loadOptions()
  }, [diretoriaId, isEdit])

  useEffect(() => {
    if (!id) return
    supabase.from('cadastros').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) {
        setForm({
          nome_completo: data.nome_completo ?? '',
          cpf: formatCpf(data.cpf ?? ''),
          telefone: formatPhone(data.telefone ?? ''),
          titulo: data.titulo ?? '',
          zona: data.zona ?? '',
          secao: data.secao ?? '',
          nome_mae: data.nome_mae ?? '',
          coordenador: data.coordenador ?? '',
          lider: data.lider ?? '',
          data_nascimento: data.data_nascimento ? String(data.data_nascimento).slice(0, 10) : '',
          cep: formatCep(data.cep ?? ''),
        })
        setCarrosAdesivados(Number(data.carros_adesivados) || 0)
        setAdesivosCasa(Number(data.adesivos_casa) || 0)
        setPostagens(Number(data.postagens) || 0)
      }
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (!coordenadores.length && !lideres.length) return
    if (form.coordenador && !coordenadorId) {
      const match = coordenadores.find(
        (c) => c.nome.toLowerCase() === form.coordenador.toLowerCase(),
      )
      if (match) setCoordenadorId(match.id)
    }
    if (form.lider && !liderId) {
      const match = lideres.find((l) => l.nome.toLowerCase() === form.lider.toLowerCase())
      if (match) setLiderId(match.id)
    }
  }, [coordenadores, lideres, form.coordenador, form.lider, coordenadorId, liderId])

  const lideresFiltrados = useMemo(() => {
    if (!coordenadorId) return lideres
    return lideres.filter((l) => !l.coordenador_id || l.coordenador_id === coordenadorId)
  }, [lideres, coordenadorId])

  function updateField(field: keyof CadastroFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function handleCoordenadorChange(value: string) {
    setCoordenadorId(value)
    const nome = coordenadores.find((c) => c.id === value)?.nome ?? ''
    updateField('coordenador', nome)
    if (liderId) {
      const current = lideres.find((l) => l.id === liderId)
      if (current?.coordenador_id && current.coordenador_id !== value) {
        setLiderId('')
        updateField('lider', '')
      }
    }
  }

  function handleLiderChange(value: string) {
    setLiderId(value)
    const lid = lideres.find((l) => l.id === value)
    updateField('lider', lid?.nome ?? '')
    if (lid?.coordenador_id) {
      const coord = coordenadores.find((c) => c.id === lid.coordenador_id)
      if (coord) {
        setCoordenadorId(coord.id)
        updateField('coordenador', coord.nome)
      }
    }
  }

  function handleClear() {
    setForm(emptyForm)
    setCoordenadorId('')
    setLiderId('')
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

    const coords = normalized.zona
      ? await geocodeFromZona(normalized.zona)
      : null

    const payload: Record<string, unknown> = {
      nome_completo: normalized.nome_completo || '',
      cpf: normalized.cpf || null,
      telefone: normalized.telefone || '',
      titulo: normalized.titulo || null,
      zona: normalized.zona || '',
      secao: normalized.secao || '',
      nome_mae: normalized.nome_mae || '',
      coordenador: normalized.coordenador || '',
      lider: normalized.lider || '',
      data_nascimento: normalized.data_nascimento || null,
      cep: normalized.cep || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    }

    if (!isEdit) {
      payload.operator_id = profile!.id
      payload.diretoria_id =
        profile?.role === 'operador'
          ? (profile.diretoria_id ?? null)
          : profile?.role === 'diretoria'
            ? profile.id
            : null
    } else if (isStaff) {
      payload.carros_adesivados = Math.max(0, Math.floor(Number(carrosAdesivados) || 0))
      payload.adesivos_casa = Math.max(0, Math.floor(Number(adesivosCasa) || 0))
      payload.postagens = Math.max(0, Math.floor(Number(postagens) || 0))
      if (profile?.role === 'diretoria') {
        payload.diretoria_id = profile.id
      }
    }

    if (isEdit && id) {
      const { error } = await supabase.from('cadastros').update(payload).eq('id', id)
      setSaving(false)
      if (error) {
        if (isDuplicateCpfError(error.message)) {
          setErrors({ cpf: 'Este CPF já está cadastrado.' })
        } else if (isDuplicateTituloError(error.message)) {
          setErrors({ titulo: 'Este título de eleitor já está cadastrado.' })
        } else if (/jwt|session|auth|token|not authenticated|expir/i.test(error.message)) {
          setGlobalError('Sessão expirada. Saia e entre novamente para salvar o cadastro.')
        } else {
          setGlobalError(error.message)
        }
        return
      }
      await logAudit('atualizar', 'cadastros', id, { cpf: normalized.cpf })
      navigate(profile?.role === 'operador' ? '/meus-cadastros' : '/cadastros')
    } else {
      const { data, error } = await supabase.from('cadastros').insert(payload).select('id').single()
      setSaving(false)
      if (error) {
        if (isDuplicateCpfError(error.message)) {
          setErrors({ cpf: 'Este CPF já está cadastrado.' })
        } else if (isDuplicateTituloError(error.message)) {
          setErrors({ titulo: 'Este título de eleitor já está cadastrado.' })
        } else if (/jwt|session|auth|token|not authenticated|expir/i.test(error.message)) {
          setGlobalError('Sessão expirada. Saia e entre novamente para salvar o cadastro.')
        } else {
          setGlobalError(error.message)
        }
        return
      }
      await logAudit('criar', 'cadastros', data.id, { cpf: normalized.cpf })
      navigate(profile?.role === 'operador' ? '/meus-cadastros' : '/cadastros')
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
          <p className="page-subtitle">
            {isEdit
              ? 'Atualize os dados do cadastro selecionado.'
              : 'Selecione coordenador e liderança. Os demais campos são opcionais.'}
          </p>
        </div>
      </div>

      {showMobilizacao && (
        <div className="ficha-mobilizacao-bar">
          <strong>Mobilização</strong>
          <label className="ficha-mobilizacao-field">
            <span>Carros adesivados</span>
            <input
              type="text"
              inputMode="numeric"
              className="mobilizacao-qty"
              value={carrosAdesivados ? String(carrosAdesivados) : ''}
              placeholder="0"
              onChange={(e) => setCarrosAdesivados(Number(e.target.value.replace(/\D/g, '') || 0))}
            />
          </label>
          <label className="ficha-mobilizacao-field">
            <span>Adesivos para casa</span>
            <input
              type="text"
              inputMode="numeric"
              className="mobilizacao-qty"
              value={adesivosCasa ? String(adesivosCasa) : ''}
              placeholder="0"
              onChange={(e) => setAdesivosCasa(Number(e.target.value.replace(/\D/g, '') || 0))}
            />
          </label>
          <label className="ficha-mobilizacao-field">
            <span>Postagens</span>
            <input
              type="text"
              inputMode="numeric"
              className="mobilizacao-qty"
              value={postagens ? String(postagens) : ''}
              placeholder="0"
              onChange={(e) => setPostagens(Number(e.target.value.replace(/\D/g, '') || 0))}
            />
          </label>
        </div>
      )}

      <Card>
        <form onSubmit={handleSubmit}>
          <div className="form-section-title">
            <User size={18} color="#2459c4" />
            <strong>Dados do eleitor</strong>
          </div>
          <div className="form-grid">
            <Input
              label="Nome completo"
              value={form.nome_completo}
              onChange={(e) => updateField('nome_completo', e.target.value)}
              error={errors.nome_completo}
              placeholder="Nome completo"
            />
            <Select
              label="Coordenador"
              value={coordenadorId}
              onChange={(e) => handleCoordenadorChange(e.target.value)}
              error={errors.coordenador}
              placeholder={coordenadores.length ? 'Selecione o coordenador' : 'Nenhum cadastrado ainda'}
              options={coordenadores.map((c) => ({ value: c.id, label: c.nome }))}
            />
            <Select
              label="Liderança"
              value={liderId}
              onChange={(e) => handleLiderChange(e.target.value)}
              error={errors.lider}
              placeholder={lideresFiltrados.length ? 'Selecione a liderança' : 'Nenhuma cadastrada ainda'}
              options={lideresFiltrados.map((l) => ({ value: l.id, label: l.nome }))}
            />
            <Input
              label="Data de nascimento"
              type="date"
              value={form.data_nascimento}
              onChange={(e) => updateField('data_nascimento', e.target.value)}
              error={errors.data_nascimento}
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
              placeholder="Somente números"
            />
            <Input
              label="Zona eleitoral"
              value={form.zona}
              onChange={(e) => updateField('zona', e.target.value)}
              error={errors.zona}
              placeholder="Zona"
            />
            <Input
              label="Sessão eleitoral"
              value={form.secao}
              onChange={(e) => updateField('secao', e.target.value)}
              error={errors.secao}
              placeholder="Sessão"
            />
            <Input
              label="CPF"
              value={form.cpf}
              onChange={(e) => updateField('cpf', formatCpf(e.target.value))}
              error={errors.cpf}
              placeholder="000.000.000-00"
            />
          </div>

          <div className="form-section-title form-section-gap">
            <Users size={18} color="#2459c4" />
            <strong>Dados complementares</strong>
          </div>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <Input
              label="Nome completo da mãe"
              value={form.nome_mae}
              onChange={(e) => updateField('nome_mae', e.target.value)}
              error={errors.nome_mae}
              placeholder="Nome completo da mãe"
            />
            <Input
              label="CEP"
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
              <Save size={16} /> Salvar Cadastro
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
