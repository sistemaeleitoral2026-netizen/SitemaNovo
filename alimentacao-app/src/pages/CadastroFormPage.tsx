import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, User, Users, MapPin } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { Modal } from '../components/ui/Modal'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import { normalizeCadastroFields, formatCpf, formatPhone, formatCep, normalizeZona } from '../lib/normalize'
import { validateCadastroForm, isDuplicateCpfError, isDuplicateTituloError } from '../lib/validation'
import { coordsFromZona, lookupViaCep } from '../lib/geocode'
import { findDuplicateCadastro, type DuplicateCadastroInfo } from '../lib/cadastros'
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
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
}

const ZONA_OPTIONS = [
  { value: '089', label: 'Zona 089' },
  { value: '010', label: 'Zona 010' },
]

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
  const [saveOk, setSaveOk] = useState<string | null>(null)
  const [cepLoading, setCepLoading] = useState(false)
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateCadastroInfo | null>(null)
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [coordenadorId, setCoordenadorId] = useState('')
  const [liderId, setLiderId] = useState('')

  const isStaff = profile?.role === 'admin' || profile?.role === 'diretoria'

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
          zona: normalizeZona(data.zona ?? ''),
          secao: data.secao ?? '',
          nome_mae: data.nome_mae ?? '',
          coordenador: data.coordenador ?? '',
          lider: data.lider ?? '',
          data_nascimento: data.data_nascimento ? String(data.data_nascimento).slice(0, 10) : '',
          cep: formatCep(data.cep ?? ''),
          endereco: data.endereco ?? '',
          numero: data.numero ?? '',
          complemento: data.complemento ?? '',
          bairro: data.bairro ?? '',
          cidade: data.cidade ?? '',
          uf: data.uf ?? '',
        })
      }
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (!coordenadores.length && !lideres.length) return

    // Só sincroniza o select com o texto já salvo na ficha (edição) — sem preencher automático.
    if (!coordenadorId && form.coordenador) {
      const match = coordenadores.find(
        (c) => c.nome.toLowerCase() === form.coordenador.toLowerCase(),
      )
      if (match) setCoordenadorId(match.id)
    }

    if (!liderId && form.lider) {
      const match = lideres.find((l) => l.nome.toLowerCase() === form.lider.toLowerCase())
      if (match) setLiderId(match.id)
    }
  }, [
    coordenadores,
    lideres,
    form.coordenador,
    form.lider,
    coordenadorId,
    liderId,
  ])

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
    setSaveOk(null)
  }

  async function handleCepBlur() {
    const digits = form.cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const addr = await lookupViaCep(digits)
      if (!addr) return
      setForm((prev) => ({
        ...prev,
        endereco: addr.logradouro || prev.endereco,
        bairro: addr.bairro || prev.bairro,
        cidade: addr.localidade || prev.cidade,
        uf: addr.uf || prev.uf,
      }))
    } finally {
      setCepLoading(false)
    }
  }

  async function checkDuplicate(field?: 'cpf' | 'titulo' | 'pessoa') {
    if (isEdit) return
    const cpf = form.cpf.replace(/\D/g, '')
    const titulo = form.titulo.trim()
    const phone = form.telefone.replace(/\D/g, '')
    const nome = form.nome_completo.trim()

    if (field === 'cpf' && cpf.length !== 11) return
    if (field === 'titulo' && !titulo) return
    if (field === 'pessoa' && (!nome || phone.length < 10)) return

    const found = await findDuplicateCadastro({
      cpf: !field || field === 'cpf' ? cpf : undefined,
      titulo: !field || field === 'titulo' ? titulo : undefined,
      nome: !field || field === 'pessoa' ? nome : undefined,
      telefone: !field || field === 'pessoa' ? form.telefone : undefined,
      excludeId: id,
    })
    if (found) setDuplicateInfo(found)
  }

  async function showDuplicateFromSave(kind: 'cpf' | 'titulo') {
    const found = await findDuplicateCadastro({
      cpf: kind === 'cpf' ? form.cpf : undefined,
      titulo: kind === 'titulo' ? form.titulo : undefined,
      excludeId: id,
    })
    if (found) {
      setDuplicateInfo(found)
      return
    }
    setDuplicateInfo({
      id: '',
      nome_completo: form.nome_completo || '—',
      coordenador: '—',
      lider: '—',
      nerite: '—',
      motivo: kind === 'cpf' ? 'CPF' : 'título de eleitor',
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGlobalError(null)
    setSaveOk(null)

    const normalized = normalizeCadastroFields(form)
    // Grava o nome exatamente do que foi selecionado no dropdown (sem inventar)
    if (coordenadorId) {
      const nome = coordenadores.find((c) => c.id === coordenadorId)?.nome
      if (nome) normalized.coordenador = nome
    }
    if (liderId) {
      const nome = lideres.find((l) => l.id === liderId)?.nome
      if (nome) normalized.lider = nome
    }

    const fieldErrors = validateCadastroForm(normalized)
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors)
      return
    }

    setSaving(true)

    const coords = normalized.zona ? coordsFromZona(normalized.zona) : null

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
      endereco: (normalized.endereco || '').trim() || null,
      numero: (normalized.numero || '').trim() || null,
      complemento: (normalized.complemento || '').trim() || null,
      bairro: (normalized.bairro || '').trim() || null,
      cidade: (normalized.cidade || '').trim() || null,
      uf: (normalized.uf || '').trim() || null,
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
          void showDuplicateFromSave('cpf')
        } else if (isDuplicateTituloError(error.message)) {
          setErrors({ titulo: 'Este título de eleitor já está cadastrado.' })
          void showDuplicateFromSave('titulo')
        } else if (/jwt|session|auth|token|not authenticated|expir/i.test(error.message)) {
          setGlobalError('Sessão expirada. Saia e entre novamente para salvar o cadastro.')
        } else {
          setGlobalError(error.message)
        }
        return
      }
      logAudit('atualizar', 'cadastros', id, { cpf: normalized.cpf })
      navigate(profile?.role === 'operador' ? '/meus-cadastros' : '/cadastros')
    } else {
      const { data, error } = await supabase.from('cadastros').insert(payload).select('id').single()
      setSaving(false)
      if (error) {
        if (isDuplicateCpfError(error.message)) {
          setErrors({ cpf: 'Este CPF já está cadastrado.' })
          void showDuplicateFromSave('cpf')
        } else if (isDuplicateTituloError(error.message)) {
          setErrors({ titulo: 'Este título de eleitor já está cadastrado.' })
          void showDuplicateFromSave('titulo')
        } else if (/jwt|session|auth|token|not authenticated|expir/i.test(error.message)) {
          setGlobalError('Sessão expirada. Saia e entre novamente para salvar o cadastro.')
        } else {
          setGlobalError(error.message)
        }
        return
      }
      logAudit('criar', 'cadastros', data.id, { cpf: normalized.cpf })

      // Nerite: fica na ficha limpa para cadastrar a próxima (evita reload da lista)
      if (profile?.role === 'operador') {
        const keepCoord = form.coordenador
        const keepLider = form.lider
        const keepCoordId = coordenadorId
        const keepLiderId = liderId
        setForm({ ...emptyForm, coordenador: keepCoord, lider: keepLider })
        setCoordenadorId(keepCoordId)
        setLiderId(keepLiderId)
        setErrors({})
        setSaveOk('Ficha salva! Pode cadastrar a próxima.')
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      navigate('/cadastros')
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

      <Card>
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            // Evita salvar “vazio” ao apertar Enter no meio do preenchimento
            if (e.key !== 'Enter') return
            const tag = (e.target as HTMLElement).tagName
            if (tag === 'INPUT' || tag === 'SELECT') e.preventDefault()
          }}
        >
          <div className="form-section-title">
            <User size={18} color="#2459c4" />
            <strong>Dados do eleitor</strong>
          </div>
          <div className="form-grid">
            <Input
              label="Nome completo *"
              value={form.nome_completo}
              onChange={(e) => updateField('nome_completo', e.target.value)}
              onBlur={() => void checkDuplicate('pessoa')}
              error={errors.nome_completo}
              placeholder="Nome e sobrenome"
              required
              autoComplete="name"
            />
            <Select
              label="Coordenador *"
              value={coordenadorId}
              onChange={(e) => handleCoordenadorChange(e.target.value)}
              error={errors.coordenador}
              placeholder={coordenadores.length ? 'Selecione o coordenador' : 'Nenhum cadastrado ainda'}
              options={coordenadores.map((c) => ({ value: c.id, label: c.nome }))}
              required
            />
            <div className="ui-field">
              <label htmlFor="lideranca" className="ui-field-label">
                Liderança *
              </label>
              <div className="phone-with-whatsapp">
                <select
                  id="lideranca"
                  value={liderId}
                  onChange={(e) => handleLiderChange(e.target.value)}
                  aria-invalid={errors.lider ? true : undefined}
                  className={`ui-select${errors.lider ? ' ui-input-error' : ''}`}
                >
                  <option value="">
                    {lideresFiltrados.length ? 'Selecione a liderança' : 'Nenhuma cadastrada ainda'}
                  </option>
                  {lideresFiltrados.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
                <WhatsAppLink
                  phone={lideres.find((l) => l.id === liderId)?.telefone}
                  label="WhatsApp da liderança"
                />
              </div>
              {errors.lider && <span className="field-error">{errors.lider}</span>}
            </div>
            <Input
              label="Data de nascimento"
              type="date"
              value={form.data_nascimento}
              onChange={(e) => updateField('data_nascimento', e.target.value)}
              error={errors.data_nascimento}
            />
            <div className="ui-field">
              <label htmlFor="telefone" className="ui-field-label">
                Telefone
              </label>
              <div className="phone-with-whatsapp">
                <input
                  id="telefone"
                  value={form.telefone}
                  onChange={(e) => updateField('telefone', formatPhone(e.target.value))}
                  onBlur={() => void checkDuplicate('pessoa')}
                  placeholder="(98) 99123-4567"
                  aria-invalid={errors.telefone ? true : undefined}
                  className={`ui-input${errors.telefone ? ' ui-input-error' : ''}`}
                />
                <WhatsAppLink phone={form.telefone} />
              </div>
              {errors.telefone && <span className="field-error">{errors.telefone}</span>}
              {!errors.telefone && (
                <span className="field-hint" style={{ display: 'block', marginTop: 4, fontSize: '.72rem', color: '#64748b' }}>
                  Formato BR (DDD + número). Confirmação no WhatsApp é feita pelas Formigas no Registro.
                </span>
              )}
            </div>
            <Input
              label="Título de eleitor"
              value={form.titulo}
              onChange={(e) => updateField('titulo', e.target.value)}
              onBlur={() => void checkDuplicate('titulo')}
              error={errors.titulo}
              placeholder="Somente números"
            />
            <Select
              label="Zona eleitoral"
              value={form.zona}
              onChange={(e) => updateField('zona', e.target.value)}
              error={errors.zona}
              options={
                form.zona && !ZONA_OPTIONS.some((o) => o.value === form.zona)
                  ? [...ZONA_OPTIONS, { value: form.zona, label: `Zona ${form.zona} (atual)` }]
                  : ZONA_OPTIONS
              }
              placeholder="Selecione a zona"
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
              onBlur={() => void checkDuplicate('cpf')}
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
          </div>

          <div className="form-section-title form-section-gap">
            <MapPin size={18} color="#2459c4" />
            <strong>Endereço</strong>
          </div>
          <p className="form-section-hint">
            Opcional. Ao digitar o CEP, o sistema busca rua, bairro, cidade e UF automaticamente
            {cepLoading ? '…' : '.'}
          </p>
          <div className="form-grid form-grid-endereco">
            <Input
              label="CEP"
              value={form.cep}
              onChange={(e) => {
                const next = formatCep(e.target.value)
                updateField('cep', next)
                if (next.replace(/\D/g, '').length === 8) {
                  // dispara busca ao completar 8 dígitos
                  window.setTimeout(() => {
                    void (async () => {
                      const digits = next.replace(/\D/g, '')
                      if (digits.length !== 8) return
                      setCepLoading(true)
                      try {
                        const addr = await lookupViaCep(digits)
                        if (!addr) return
                        setForm((prev) => ({
                          ...prev,
                          cep: formatCep(digits),
                          endereco: addr.logradouro || prev.endereco,
                          bairro: addr.bairro || prev.bairro,
                          cidade: addr.localidade || prev.cidade,
                          uf: addr.uf || prev.uf,
                        }))
                      } finally {
                        setCepLoading(false)
                      }
                    })()
                  }, 0)
                }
              }}
              onBlur={handleCepBlur}
              error={errors.cep}
              placeholder="00000-000"
              inputMode="numeric"
            />
            <Input
              label="Nº"
              value={form.numero}
              onChange={(e) => updateField('numero', e.target.value)}
              placeholder="Nº"
            />
            <Input
              label="Complemento"
              value={form.complemento}
              onChange={(e) => updateField('complemento', e.target.value)}
              placeholder="Apto, bloco…"
            />
            <div className="form-grid-span-2">
              <Input
                label="Endereço (rua / avenida)"
                value={form.endereco}
                onChange={(e) => updateField('endereco', e.target.value)}
                placeholder="Rua, avenida…"
              />
            </div>
            <Input
              label="Bairro"
              value={form.bairro}
              onChange={(e) => updateField('bairro', e.target.value)}
              placeholder="Bairro"
            />
            <Input
              label="Cidade"
              value={form.cidade}
              onChange={(e) => updateField('cidade', e.target.value)}
              placeholder="Cidade"
            />
            <Input
              label="UF"
              value={form.uf}
              onChange={(e) => updateField('uf', e.target.value.toUpperCase().slice(0, 2))}
              placeholder="UF"
              maxLength={2}
            />
          </div>

          {saveOk && (
            <div className="alert alert-success" style={{ marginTop: '1rem' }}>
              {saveOk}
            </div>
          )}

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

      <Modal
        open={Boolean(duplicateInfo)}
        title="Pessoa já cadastrada"
        description={`Esta pessoa já consta em uma ficha (${duplicateInfo?.motivo ?? 'duplicidade'}). Confira os dados abaixo antes de continuar.`}
        onClose={() => setDuplicateInfo(null)}
        onConfirm={() => setDuplicateInfo(null)}
        confirmLabel="Entendi"
        cancelLabel="Fechar"
      >
        {duplicateInfo && (
          <div className="duplicate-ficha-box">
            <div>
              <span>Eleitor(a)</span>
              <strong>{duplicateInfo.nome_completo}</strong>
            </div>
            <div>
              <span>Nerite que cadastrou</span>
              <strong>{duplicateInfo.nerite}</strong>
            </div>
            <div>
              <span>Coordenação</span>
              <strong>{duplicateInfo.coordenador}</strong>
            </div>
            <div>
              <span>Liderança</span>
              <strong>{duplicateInfo.lider}</strong>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
