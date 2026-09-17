import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, UserPlus, Users, UserCog, Crown } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { supabase } from '../lib/supabase'
import type { Coordenador, Lider, Profile } from '../types'

type Tab = 'nerites' | 'coordenadores' | 'lideres'

const TAB_META: Record<Tab, { title: string; subtitle: string }> = {
  nerites: {
    title: 'Nerites',
    subtitle: 'Crie contas das nerites da sua diretoria. Elas ficam vinculadas a você.',
  },
  coordenadores: {
    title: 'Coordenadores',
    subtitle: 'Cadastre os coordenadores. As nerites selecionam esses nomes na ficha.',
  },
  lideres: {
    title: 'Lideranças',
    subtitle: 'Cadastre as lideranças. As nerites selecionam esses nomes na ficha.',
  },
}

export function EquipePage() {
  const { profile, createNerite } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const diretoriaId = profile?.role === 'diretoria' ? profile.id : null
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const tab: Tab =
    tabParam === 'coordenadores' || tabParam === 'lideres' || tabParam === 'nerites'
      ? tabParam
      : isAdmin
        ? 'nerites'
        : 'coordenadores'

  function setTab(next: Tab) {
    setSearchParams({ tab: next })
  }

  const [loading, setLoading] = useState(true)
  const [diretorias, setDiretorias] = useState<Profile[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [filterDiretoria, setFilterDiretoria] = useState('')
  const [search, setSearch] = useState('')

  const [neriteOpen, setNeriteOpen] = useState(false)
  const [coordOpen, setCoordOpen] = useState(false)
  const [liderOpen, setLiderOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [neriteForm, setNeriteForm] = useState({
    nome: '', email: '', password: '', confirm: '', diretoria_id: '', coordenador_id: '', lider_id: '',
  })
  const [coordForm, setCoordForm] = useState({ nome: '', diretoria_id: '' })
  const [liderForm, setLiderForm] = useState({ nome: '', diretoria_id: '', coordenador_id: '' })

  async function load() {
    setLoading(true)
    const dirs = await supabase.from('profiles').select('*').eq('role', 'diretoria').order('nome')
    setDiretorias((dirs.data ?? []) as Profile[])

    let neritesQuery = supabase.from('profiles').select('*').eq('role', 'operador').order('nome')
    let coordsQuery = supabase.from('coordenadores').select('*').order('nome')
    let lideresQuery = supabase.from('lideres').select('*').order('nome')

    const scope = isAdmin ? filterDiretoria : diretoriaId
    if (scope) {
      neritesQuery = neritesQuery.eq('diretoria_id', scope)
      coordsQuery = coordsQuery.eq('diretoria_id', scope)
      lideresQuery = lideresQuery.eq('diretoria_id', scope)
    }

    const [n, c, l] = await Promise.all([neritesQuery, coordsQuery, lideresQuery])
    setNerites((n.data ?? []) as Profile[])
    setCoordenadores((c.data ?? []) as Coordenador[])
    setLideres((l.data ?? []) as Lider[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [filterDiretoria, diretoriaId, isAdmin])

  const q = search.trim().toLowerCase()
  const filteredNerites = useMemo(
    () => nerites.filter((n) => !q || n.nome.toLowerCase().includes(q) || n.email.toLowerCase().includes(q)),
    [nerites, q],
  )
  const filteredCoords = useMemo(
    () => coordenadores.filter((c) => !q || c.nome.toLowerCase().includes(q)),
    [coordenadores, q],
  )
  const filteredLideres = useMemo(
    () => lideres.filter((l) => !q || l.nome.toLowerCase().includes(q)),
    [lideres, q],
  )

  const coordOptionsForForm = useMemo(() => {
    const dir = isAdmin ? (neriteForm.diretoria_id || coordForm.diretoria_id || liderForm.diretoria_id) : diretoriaId
    return coordenadores.filter((c) => !dir || c.diretoria_id === dir)
  }, [coordenadores, isAdmin, neriteForm.diretoria_id, coordForm.diretoria_id, liderForm.diretoria_id, diretoriaId])

  const liderOptionsForForm = useMemo(() => {
    const dir = isAdmin ? neriteForm.diretoria_id : diretoriaId
    return lideres.filter((l) => {
      if (dir && l.diretoria_id !== dir) return false
      if (neriteForm.coordenador_id && l.coordenador_id && l.coordenador_id !== neriteForm.coordenador_id) return false
      return true
    })
  }, [lideres, isAdmin, neriteForm.diretoria_id, neriteForm.coordenador_id, diretoriaId])

  async function handleCreateNerite() {
    setError(null)
    if (neriteForm.password !== neriteForm.confirm) {
      setError('As senhas não coincidem.')
      return
    }
    const targetDir = isAdmin ? neriteForm.diretoria_id : diretoriaId
    if (!targetDir) {
      setError('Selecione a diretoria.')
      return
    }
    setSaving(true)
    const { error: err } = await createNerite({
      nome: neriteForm.nome,
      email: neriteForm.email,
      password: neriteForm.password,
      role: 'operador',
      diretoria_id: targetDir,
      coordenador_id: neriteForm.coordenador_id || null,
      lider_id: neriteForm.lider_id || null,
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setNeriteOpen(false)
    setNeriteForm({ nome: '', email: '', password: '', confirm: '', diretoria_id: '', coordenador_id: '', lider_id: '' })
    await load()
  }

  async function handleCreateCoord() {
    setError(null)
    const targetDir = isAdmin ? coordForm.diretoria_id : diretoriaId
    if (!coordForm.nome.trim() || !targetDir) {
      setError('Informe o nome e a diretoria.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('coordenadores').insert({
      nome: coordForm.nome.trim(),
      diretoria_id: targetDir,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setCoordOpen(false)
    setCoordForm({ nome: '', diretoria_id: '' })
    await load()
  }

  async function handleCreateLider() {
    setError(null)
    const targetDir = isAdmin ? liderForm.diretoria_id : diretoriaId
    if (!liderForm.nome.trim() || !targetDir) {
      setError('Informe o nome e a diretoria.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('lideres').insert({
      nome: liderForm.nome.trim(),
      diretoria_id: targetDir,
      coordenador_id: liderForm.coordenador_id || null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setLiderOpen(false)
    setLiderForm({ nome: '', diretoria_id: '', coordenador_id: '' })
    await load()
  }

  const dirName = (id: string | null | undefined) => diretorias.find((d) => d.id === id)?.nome ?? '—'
  const meta = TAB_META[tab]

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
          <h1 className="page-title">{isAdmin ? 'Equipe' : meta.title}</h1>
          <p className="page-subtitle">
            {isAdmin
              ? 'Gerencie diretorias, nerites, líderes e coordenadores.'
              : meta.subtitle}
          </p>
        </div>
        <div className="page-header-actions">
          {tab === 'nerites' && (
            <Button onClick={() => { setError(null); setNeriteOpen(true) }}><UserPlus size={16} /> Nova nerite</Button>
          )}
          {tab === 'coordenadores' && (
            <Button onClick={() => { setError(null); setCoordOpen(true) }}><Plus size={16} /> Novo coordenador</Button>
          )}
          {tab === 'lideres' && (
            <Button onClick={() => { setError(null); setLiderOpen(true) }}><Plus size={16} /> Nova liderança</Button>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="ficha-setup-banner">
          <strong>Fluxo da ficha</strong>
          <span>1) Cadastre coordenadores → 2) Cadastre lideranças → 3) Cadastre nerites. Na ficha, a nerite só seleciona esses nomes.</span>
        </div>
      )}

      <div className="views-row">
        {([
          ['coordenadores', 'Coordenadores', UserCog],
          ['lideres', 'Lideranças', Crown],
          ['nerites', 'Nerites', Users],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} type="button" className={`view-chip${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={14} /> {label}
            <em className="view-chip-count">
              {key === 'nerites' ? nerites.length : key === 'coordenadores' ? coordenadores.length : lideres.length}
            </em>
          </button>
        ))}
      </div>

      <Card>
        <div className="filters-grid filters-grid-nerites" style={{ marginBottom: '1rem' }}>
          <div className="search-field">
            <Search size={16} />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {isAdmin && (
            <Select
              value={filterDiretoria}
              onChange={(e) => setFilterDiretoria(e.target.value)}
              placeholder="Todas as diretorias"
              options={diretorias.map((d) => ({ value: d.id, label: d.nome }))}
            />
          )}
        </div>

        {tab === 'nerites' && (
          !filteredNerites.length ? (
            <EmptyState
              title="Nenhuma nerite"
              description="Crie a primeira nerite da sua diretoria. Ela ficará vinculada a você."
              action={<Button onClick={() => setNeriteOpen(true)}><UserPlus size={16} /> Nova nerite</Button>}
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nerite</th>
                    <th>E-mail</th>
                    {isAdmin && <th>Diretoria</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNerites.map((n) => (
                    <tr key={n.id}>
                      <td><strong>{n.nome}</strong></td>
                      <td>{n.email}</td>
                      {isAdmin && <td>{dirName(n.diretoria_id)}</td>}
                      <td><span className={`badge ${n.ativo ? 'badge-success' : 'badge-danger'}`}>{n.ativo ? 'Ativa' : 'Inativa'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'coordenadores' && (
          !filteredCoords.length ? (
            <EmptyState
              title="Nenhum coordenador"
              description="Cadastre os coordenadores que vão aparecer para seleção na ficha das nerites."
              action={<Button onClick={() => setCoordOpen(true)}><Plus size={16} /> Novo coordenador</Button>}
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Coordenador</th>
                    {isAdmin && <th>Diretoria</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoords.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.nome}</strong></td>
                      {isAdmin && <td>{dirName(c.diretoria_id)}</td>}
                      <td><span className={`badge ${c.ativo ? 'badge-success' : 'badge-danger'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'lideres' && (
          !filteredLideres.length ? (
            <EmptyState
              title="Nenhuma liderança"
              description="Cadastre as lideranças que vão aparecer para seleção na ficha das nerites."
              action={<Button onClick={() => setLiderOpen(true)}><Plus size={16} /> Nova liderança</Button>}
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Liderança</th>
                    <th>Coordenador</th>
                    {isAdmin && <th>Diretoria</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLideres.map((l) => (
                    <tr key={l.id}>
                      <td><strong>{l.nome}</strong></td>
                      <td>{coordenadores.find((c) => c.id === l.coordenador_id)?.nome ?? '—'}</td>
                      {isAdmin && <td>{dirName(l.diretoria_id)}</td>}
                      <td><span className={`badge ${l.ativo ? 'badge-success' : 'badge-danger'}`}>{l.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>

      <Modal open={neriteOpen} title="Nova nerite" onClose={() => !saving && setNeriteOpen(false)} onConfirm={handleCreateNerite} confirmLabel="Criar nerite" loading={saving}>
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {isAdmin && (
            <Select
              label="Diretoria"
              value={neriteForm.diretoria_id}
              onChange={(e) => setNeriteForm((f) => ({ ...f, diretoria_id: e.target.value, coordenador_id: '', lider_id: '' }))}
              options={diretorias.map((d) => ({ value: d.id, label: d.nome }))}
              placeholder="Selecione"
            />
          )}
          <Input label="Nome" value={neriteForm.nome} onChange={(e) => setNeriteForm((f) => ({ ...f, nome: e.target.value }))} />
          <Input label="E-mail" type="email" value={neriteForm.email} onChange={(e) => setNeriteForm((f) => ({ ...f, email: e.target.value }))} />
          <Select
            label="Coordenador"
            value={neriteForm.coordenador_id}
            onChange={(e) => setNeriteForm((f) => ({ ...f, coordenador_id: e.target.value, lider_id: '' }))}
            options={coordOptionsForForm.map((c) => ({ value: c.id, label: c.nome }))}
            placeholder="Opcional"
          />
          <Select
            label="Liderança"
            value={neriteForm.lider_id}
            onChange={(e) => setNeriteForm((f) => ({ ...f, lider_id: e.target.value }))}
            options={liderOptionsForForm.map((l) => ({ value: l.id, label: l.nome }))}
            placeholder="Opcional"
          />
          <Input label="Senha" type="password" value={neriteForm.password} onChange={(e) => setNeriteForm((f) => ({ ...f, password: e.target.value }))} />
          <Input label="Confirmar senha" type="password" value={neriteForm.confirm} onChange={(e) => setNeriteForm((f) => ({ ...f, confirm: e.target.value }))} />
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      </Modal>

      <Modal open={coordOpen} title="Novo coordenador" onClose={() => !saving && setCoordOpen(false)} onConfirm={handleCreateCoord} confirmLabel="Salvar" loading={saving}>
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {isAdmin && (
            <Select
              label="Diretoria"
              value={coordForm.diretoria_id}
              onChange={(e) => setCoordForm((f) => ({ ...f, diretoria_id: e.target.value }))}
              options={diretorias.map((d) => ({ value: d.id, label: d.nome }))}
              placeholder="Selecione"
            />
          )}
          <Input label="Nome do coordenador" value={coordForm.nome} onChange={(e) => setCoordForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome que aparece na ficha" />
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      </Modal>

      <Modal open={liderOpen} title="Nova liderança" onClose={() => !saving && setLiderOpen(false)} onConfirm={handleCreateLider} confirmLabel="Salvar" loading={saving}>
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {isAdmin && (
            <Select
              label="Diretoria"
              value={liderForm.diretoria_id}
              onChange={(e) => setLiderForm((f) => ({ ...f, diretoria_id: e.target.value, coordenador_id: '' }))}
              options={diretorias.map((d) => ({ value: d.id, label: d.nome }))}
              placeholder="Selecione"
            />
          )}
          <Select
            label="Coordenador"
            value={liderForm.coordenador_id}
            onChange={(e) => setLiderForm((f) => ({ ...f, coordenador_id: e.target.value }))}
            options={coordOptionsForForm.map((c) => ({ value: c.id, label: c.nome }))}
            placeholder="Opcional — vincula ao coordenador"
          />
          <Input label="Nome da liderança" value={liderForm.nome} onChange={(e) => setLiderForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome que aparece na ficha" />
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      </Modal>
    </div>
  )
}
