import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2, UserPlus, Users, UserCog, Crown, ClipboardList } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
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
    subtitle: 'Cadastre, edite ou exclua as nerites da sua diretoria.',
  },
  coordenadores: {
    title: 'Coordenadores',
    subtitle: 'Cadastre, edite ou exclua os coordenadores da sua diretoria.',
  },
  lideres: {
    title: 'Lideranças',
    subtitle: 'Cadastre, edite ou exclua as lideranças da sua diretoria.',
  },
}

export function EquipePage() {
  const { profile, createNerite } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const canManageTeam = isAdmin || profile?.role === 'diretoria'
  const diretoriaId = profile?.role === 'diretoria' ? profile.id : null
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const tab: Tab =
    tabParam === 'coordenadores' || tabParam === 'lideres' || tabParam === 'nerites'
      ? tabParam
      : isAdmin
        ? 'nerites'
        : 'coordenadores'

  const diretoriaFromUrl = searchParams.get('diretoria') ?? ''
  const coordenadorFromUrl = searchParams.get('coordenador') ?? ''
  const liderFromUrl = searchParams.get('lider') ?? ''

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams)
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    })
    setSearchParams(next)
  }

  function setTab(next: Tab) {
    if (next === 'coordenadores') {
      patchParams({ tab: next, coordenador: null, lider: null })
    } else if (next === 'lideres') {
      patchParams({ tab: next, lider: null })
    } else {
      patchParams({ tab: next })
    }
  }

  const [loading, setLoading] = useState(true)
  const [diretorias, setDiretorias] = useState<Profile[]>([])
  const [nerites, setNerites] = useState<Profile[]>([])
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [fichasByCoord, setFichasByCoord] = useState<Record<string, number>>({})
  const [fichasByLider, setFichasByLider] = useState<Record<string, number>>({})
  const [fichasByNerite, setFichasByNerite] = useState<Record<string, number>>({})
  const [filterDiretoria, setFilterDiretoria] = useState(diretoriaFromUrl)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setFilterDiretoria(diretoriaFromUrl)
  }, [diretoriaFromUrl])

  function setAdminDiretoria(id: string) {
    setFilterDiretoria(id)
    patchParams({ diretoria: id || null })
  }

  const [neriteOpen, setNeriteOpen] = useState(false)
  const [coordOpen, setCoordOpen] = useState(false)
  const [liderOpen, setLiderOpen] = useState(false)
  const [editingNeriteId, setEditingNeriteId] = useState<string | null>(null)
  const [editingCoordId, setEditingCoordId] = useState<string | null>(null)
  const [editingLiderId, setEditingLiderId] = useState<string | null>(null)
  const [deleteNeriteId, setDeleteNeriteId] = useState<string | null>(null)
  const [deleteCoordId, setDeleteCoordId] = useState<string | null>(null)
  const [deleteLiderId, setDeleteLiderId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [neriteForm, setNeriteForm] = useState({
    nome: '',
    email: '',
    password: '',
    confirm: '',
    diretoria_id: '',
    coordenador_id: '',
    lider_id: '',
    ativo: true,
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
    let fichasQuery = supabase.from('cadastros').select('operator_id, coordenador, lider, diretoria_id')

    const scope = isAdmin ? filterDiretoria : diretoriaId
    if (scope) {
      neritesQuery = neritesQuery.eq('diretoria_id', scope)
      coordsQuery = coordsQuery.eq('diretoria_id', scope)
      lideresQuery = lideresQuery.eq('diretoria_id', scope)
    }

    const [n, c, l, f] = await Promise.all([neritesQuery, coordsQuery, lideresQuery, fichasQuery])
    const neriteRows = (n.data ?? []) as Profile[]
    const coordRows = (c.data ?? []) as Coordenador[]
    const liderRows = (l.data ?? []) as Lider[]
    setNerites(neriteRows)
    setCoordenadores(coordRows)
    setLideres(liderRows)

    const neriteIds = new Set(neriteRows.map((row) => row.id))
    const byCoord: Record<string, number> = {}
    const byLider: Record<string, number> = {}
    const byNerite: Record<string, number> = {}

    ;((f.data ?? []) as { operator_id: string; coordenador: string | null; lider: string | null; diretoria_id: string | null }[])
      .forEach((row) => {
        if (scope) {
          const inScope =
            row.diretoria_id === scope || neriteIds.has(row.operator_id)
          if (!inScope) return
        }
        const coord = row.coordenador?.trim()
        const lider = row.lider?.trim()
        if (coord) byCoord[coord] = (byCoord[coord] ?? 0) + 1
        if (lider) byLider[lider] = (byLider[lider] ?? 0) + 1
        if (row.operator_id) byNerite[row.operator_id] = (byNerite[row.operator_id] ?? 0) + 1
      })

    setFichasByCoord(byCoord)
    setFichasByLider(byLider)
    setFichasByNerite(byNerite)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [filterDiretoria, diretoriaId, isAdmin])

  const q = search.trim().toLowerCase()

  const selectedCoord = useMemo(
    () => coordenadores.find((c) => c.id === coordenadorFromUrl) ?? null,
    [coordenadores, coordenadorFromUrl],
  )
  const selectedLider = useMemo(
    () => lideres.find((l) => l.id === liderFromUrl) ?? null,
    [lideres, liderFromUrl],
  )

  const filteredNerites = useMemo(
    () =>
      nerites.filter((n) => {
        if (coordenadorFromUrl && n.coordenador_id !== coordenadorFromUrl) return false
        if (liderFromUrl && n.lider_id !== liderFromUrl) return false
        if (!q) return true
        return n.nome.toLowerCase().includes(q) || n.email.toLowerCase().includes(q)
      }),
    [nerites, q, coordenadorFromUrl, liderFromUrl],
  )
  const filteredCoords = useMemo(
    () => coordenadores.filter((c) => !q || c.nome.toLowerCase().includes(q)),
    [coordenadores, q],
  )
  const filteredLideres = useMemo(
    () =>
      lideres.filter((l) => {
        if (coordenadorFromUrl && l.coordenador_id !== coordenadorFromUrl) return false
        if (!q) return true
        return l.nome.toLowerCase().includes(q)
      }),
    [lideres, q, coordenadorFromUrl],
  )

  const lideresCount = useMemo(
    () =>
      coordenadorFromUrl
        ? lideres.filter((l) => l.coordenador_id === coordenadorFromUrl).length
        : lideres.length,
    [lideres, coordenadorFromUrl],
  )
  const neritesCount = useMemo(
    () =>
      nerites.filter((n) => {
        if (coordenadorFromUrl && n.coordenador_id !== coordenadorFromUrl) return false
        if (liderFromUrl && n.lider_id !== liderFromUrl) return false
        return true
      }).length,
    [nerites, coordenadorFromUrl, liderFromUrl],
  )

  const coordOptionsForForm = useMemo(() => {
    const dir = isAdmin
      ? (neriteForm.diretoria_id || coordForm.diretoria_id || liderForm.diretoria_id)
      : diretoriaId
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

  function openNewCoord() {
    setError(null)
    setEditingCoordId(null)
    setCoordForm({ nome: '', diretoria_id: diretoriaId ?? '' })
    setCoordOpen(true)
  }

  function openEditCoord(c: Coordenador) {
    setError(null)
    setEditingCoordId(c.id)
    setCoordForm({ nome: c.nome, diretoria_id: c.diretoria_id })
    setCoordOpen(true)
  }

  function openNewLider() {
    setError(null)
    setEditingLiderId(null)
    setLiderForm({
      nome: '',
      diretoria_id: diretoriaId ?? filterDiretoria ?? '',
      coordenador_id: coordenadorFromUrl || '',
    })
    setLiderOpen(true)
  }

  function openEditLider(l: Lider) {
    setError(null)
    setEditingLiderId(l.id)
    setLiderForm({
      nome: l.nome,
      diretoria_id: l.diretoria_id,
      coordenador_id: l.coordenador_id ?? '',
    })
    setLiderOpen(true)
  }

  function openNewNerite() {
    setError(null)
    setEditingNeriteId(null)
    setNeriteForm({
      nome: '',
      email: '',
      password: '',
      confirm: '',
      diretoria_id: diretoriaId ?? filterDiretoria ?? '',
      coordenador_id: coordenadorFromUrl || '',
      lider_id: liderFromUrl || '',
      ativo: true,
    })
    setNeriteOpen(true)
  }

  function openEditNerite(n: Profile) {
    setError(null)
    setEditingNeriteId(n.id)
    setNeriteForm({
      nome: n.nome,
      email: n.email,
      password: '',
      confirm: '',
      diretoria_id: n.diretoria_id ?? '',
      coordenador_id: n.coordenador_id ?? '',
      lider_id: n.lider_id ?? '',
      ativo: n.ativo,
    })
    setNeriteOpen(true)
  }

  async function manageNeriteRequest(method: 'POST' | 'DELETE', body: Record<string, unknown>) {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return { error: 'Sessão expirada.' }
    const res = await fetch('/api/manage-nerite', {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) return { error: payload.error || 'Não foi possível concluir a operação.' }
    return { error: null }
  }

  async function handleSaveNerite() {
    setError(null)
    const targetDir = isAdmin ? neriteForm.diretoria_id : diretoriaId
    if (!neriteForm.nome.trim() || !targetDir) {
      setError('Informe o nome e a diretoria.')
      return
    }

    if (editingNeriteId) {
      if (neriteForm.password || neriteForm.confirm) {
        if (neriteForm.password !== neriteForm.confirm) {
          setError('As senhas não coincidem.')
          return
        }
        if (neriteForm.password.length < 8) {
          setError('A nova senha precisa ter no mínimo 8 caracteres.')
          return
        }
      }
      setSaving(true)
      const { error: err } = await manageNeriteRequest('POST', {
        id: editingNeriteId,
        nome: neriteForm.nome.trim(),
        diretoria_id: targetDir,
        coordenador_id: neriteForm.coordenador_id || null,
        lider_id: neriteForm.lider_id || null,
        ativo: neriteForm.ativo,
        password: neriteForm.password || undefined,
      })
      setSaving(false)
      if (err) {
        setError(err)
        return
      }
    } else {
      if (neriteForm.password !== neriteForm.confirm) {
        setError('As senhas não coincidem.')
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
    }

    setNeriteOpen(false)
    setEditingNeriteId(null)
    setNeriteForm({
      nome: '', email: '', password: '', confirm: '', diretoria_id: '', coordenador_id: '', lider_id: '', ativo: true,
    })
    await load()
  }

  async function handleDeleteNerite() {
    if (!deleteNeriteId) return
    setSaving(true)
    const { error: err } = await manageNeriteRequest('DELETE', { id: deleteNeriteId })
    setSaving(false)
    if (err) {
      setError(err)
      setDeleteNeriteId(null)
      return
    }
    setDeleteNeriteId(null)
    await load()
  }

  async function handleSaveCoord() {
    setError(null)
    const targetDir = isAdmin ? coordForm.diretoria_id : diretoriaId
    if (!coordForm.nome.trim() || !targetDir) {
      setError('Informe o nome e a diretoria.')
      return
    }
    setSaving(true)
    const payload = {
      nome: coordForm.nome.trim(),
      diretoria_id: targetDir,
    }
    const { error: err } = editingCoordId
      ? await supabase.from('coordenadores').update(payload).eq('id', editingCoordId)
      : await supabase.from('coordenadores').insert(payload)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setCoordOpen(false)
    setEditingCoordId(null)
    setCoordForm({ nome: '', diretoria_id: '' })
    await load()
  }

  async function handleSaveLider() {
    setError(null)
    const targetDir = isAdmin ? liderForm.diretoria_id : diretoriaId
    if (!liderForm.nome.trim() || !targetDir) {
      setError('Informe o nome e a diretoria.')
      return
    }
    setSaving(true)
    const payload = {
      nome: liderForm.nome.trim(),
      diretoria_id: targetDir,
      coordenador_id: liderForm.coordenador_id || null,
    }
    const { error: err } = editingLiderId
      ? await supabase.from('lideres').update(payload).eq('id', editingLiderId)
      : await supabase.from('lideres').insert(payload)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setLiderOpen(false)
    setEditingLiderId(null)
    setLiderForm({ nome: '', diretoria_id: '', coordenador_id: '' })
    await load()
  }

  async function handleDeleteCoord() {
    if (!deleteCoordId) return
    setSaving(true)
    const { error: err } = await supabase.from('coordenadores').delete().eq('id', deleteCoordId)
    setSaving(false)
    if (err) {
      setError(err.message)
      setDeleteCoordId(null)
      return
    }
    setDeleteCoordId(null)
    await load()
  }

  async function handleDeleteLider() {
    if (!deleteLiderId) return
    setSaving(true)
    const { error: err } = await supabase.from('lideres').delete().eq('id', deleteLiderId)
    setSaving(false)
    if (err) {
      setError(err.message)
      setDeleteLiderId(null)
      return
    }
    setDeleteLiderId(null)
    await load()
  }

  const dirName = (id: string | null | undefined) => diretorias.find((d) => d.id === id)?.nome ?? '—'
  const meta = TAB_META[tab]
  const deleteNeriteName = nerites.find((n) => n.id === deleteNeriteId)?.nome
  const deleteCoordName = coordenadores.find((c) => c.id === deleteCoordId)?.nome
  const deleteLiderName = lideres.find((l) => l.id === deleteLiderId)?.nome

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
            <Button onClick={openNewNerite}><UserPlus size={16} /> Nova nerite</Button>
          )}
          {tab === 'coordenadores' && (
            <Button onClick={openNewCoord}><Plus size={16} /> Novo coordenador</Button>
          )}
          {tab === 'lideres' && (
            <Button onClick={openNewLider}><Plus size={16} /> Nova liderança</Button>
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
              {key === 'nerites' ? neritesCount : key === 'coordenadores' ? coordenadores.length : lideresCount}
            </em>
          </button>
        ))}
      </div>

      {(selectedCoord || selectedLider) && (
        <div className="ficha-setup-banner" style={{ marginBottom: '0.85rem' }}>
          <strong>Filtro ativo</strong>
          <span>
            {selectedCoord ? `Coordenador: ${selectedCoord.nome}` : null}
            {selectedCoord && selectedLider ? ' · ' : null}
            {selectedLider ? `Liderança: ${selectedLider.nome}` : null}
            {tab === 'lideres' && selectedCoord ? ' — mostrando só as lideranças deste coordenador.' : null}
            {tab === 'nerites' && (selectedCoord || selectedLider) ? ' — mostrando só as nerites deste vínculo.' : null}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => patchParams({ coordenador: null, lider: null })}
          >
            Limpar
          </Button>
        </div>
      )}

      <Card>
        <div className="filters-grid filters-grid-nerites" style={{ marginBottom: '1rem' }}>
          <div className="search-field">
            <Search size={16} />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {isAdmin && (
            <Select
              value={filterDiretoria}
              onChange={(e) => setAdminDiretoria(e.target.value)}
              placeholder="Todas as diretorias"
              options={diretorias.map((d) => ({ value: d.id, label: d.nome }))}
            />
          )}
        </div>

        {tab === 'nerites' && (
          !filteredNerites.length ? (
            <EmptyState
              title="Nenhuma nerite"
              description={
                selectedLider || selectedCoord
                  ? 'Nenhuma nerite encontrada para este filtro. Cadastre uma nerite vinculada a este coordenador/liderança.'
                  : 'Crie a primeira nerite da sua diretoria. Ela ficará vinculada a você.'
              }
              action={<Button onClick={openNewNerite}><UserPlus size={16} /> Nova nerite</Button>}
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nerite</th>
                    <th>E-mail</th>
                    <th>Fichas</th>
                    {isAdmin && <th>Diretoria</th>}
                    <th>Status</th>
                    {canManageTeam && <th>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredNerites.map((n) => {
                    const fichas = fichasByNerite[n.id] ?? 0
                    return (
                    <tr key={n.id}>
                      <td>
                        <Link to={`/nerites/${n.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          <strong>{n.nome}</strong>
                        </Link>
                      </td>
                      <td>{n.email}</td>
                      <td>
                        <span className={`fichas-count${fichas ? '' : ' zero'}`}>{fichas}</span>
                      </td>
                      {isAdmin && <td>{dirName(n.diretoria_id)}</td>}
                      <td><span className={`badge ${n.ativo ? 'badge-success' : 'badge-danger'}`}>{n.ativo ? 'Ativa' : 'Inativa'}</span></td>
                      {canManageTeam && (
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {fichas > 0 ? (
                              <Link to={`/cadastros?operator=${encodeURIComponent(n.id)}`}>
                                <Button variant="ghost" size="sm" aria-label="Ver fichas">
                                  <ClipboardList size={16} />
                                </Button>
                              </Link>
                            ) : (
                              <Button variant="ghost" size="sm" aria-label="Sem fichas" disabled>
                                <ClipboardList size={16} />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => openEditNerite(n)}>
                              <Pencil size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Excluir"
                              onClick={() => { setError(null); setDeleteNeriteId(n.id) }}
                              disabled={!n.ativo}
                            >
                              <Trash2 size={16} color="var(--color-danger)" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    )
                  })}
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
              action={<Button onClick={openNewCoord}><Plus size={16} /> Novo coordenador</Button>}
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Coordenador</th>
                    <th>Lideranças</th>
                    {isAdmin && <th>Diretoria</th>}
                    {canManageTeam && <th>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredCoords.map((c) => {
                    const fichas = fichasByCoord[c.nome] ?? 0
                    return (
                    <tr key={c.id}>
                      <td>
                        <button
                          type="button"
                          className="equipe-drill-link"
                          onClick={() =>
                            patchParams({
                              tab: 'lideres',
                              coordenador: c.id,
                              lider: null,
                              ...(isAdmin ? { diretoria: c.diretoria_id } : {}),
                            })
                          }
                        >
                          <strong>{c.nome}</strong>
                          <span>Ver lideranças →</span>
                        </button>
                      </td>
                      <td>
                        <span className={`fichas-count${fichas ? '' : ' zero'}`}>{fichas}</span>
                      </td>
                      {isAdmin && <td>{dirName(c.diretoria_id)}</td>}
                      {canManageTeam && (
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {fichas > 0 ? (
                              <Link to={`/cadastros?coordenador=${encodeURIComponent(c.nome)}`}>
                                <Button variant="ghost" size="sm" aria-label="Ver fichas">
                                  <ClipboardList size={16} />
                                </Button>
                              </Link>
                            ) : (
                              <Button variant="ghost" size="sm" aria-label="Sem fichas" disabled>
                                <ClipboardList size={16} />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => openEditCoord(c)}>
                              <Pencil size={16} />
                            </Button>
                            <Button variant="ghost" size="sm" aria-label="Excluir" onClick={() => { setError(null); setDeleteCoordId(c.id) }}>
                              <Trash2 size={16} color="var(--color-danger)" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'lideres' && (
          !filteredLideres.length ? (
            <EmptyState
              title="Nenhuma liderança"
              description={
                selectedCoord
                  ? `Nenhuma liderança vinculada a ${selectedCoord.nome}. Cadastre uma liderança para este coordenador.`
                  : 'Cadastre as lideranças que vão aparecer para seleção na ficha das nerites.'
              }
              action={<Button onClick={openNewLider}><Plus size={16} /> Nova liderança</Button>}
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Liderança</th>
                    <th>Coordenador</th>
                    <th>Fichas</th>
                    {isAdmin && <th>Diretoria</th>}
                    {canManageTeam && <th>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredLideres.map((l) => {
                    const fichas = fichasByLider[l.nome] ?? 0
                    return (
                    <tr key={l.id}>
                      <td>
                        {fichas > 0 ? (
                          <Link
                            to={`/cadastros?lider=${encodeURIComponent(l.nome)}`}
                            className="equipe-drill-link"
                          >
                            <strong>{l.nome}</strong>
                          </Link>
                        ) : (
                          <strong>{l.nome}</strong>
                        )}
                      </td>
                      <td>{coordenadores.find((c) => c.id === l.coordenador_id)?.nome ?? '—'}</td>
                      <td>
                        <span className={`fichas-count${fichas ? '' : ' zero'}`}>{fichas}</span>
                      </td>
                      {isAdmin && <td>{dirName(l.diretoria_id)}</td>}
                      {canManageTeam && (
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {fichas > 0 ? (
                              <Link to={`/cadastros?lider=${encodeURIComponent(l.nome)}`}>
                                <Button variant="ghost" size="sm" aria-label="Ver fichas">
                                  <ClipboardList size={16} />
                                </Button>
                              </Link>
                            ) : (
                              <Button variant="ghost" size="sm" aria-label="Sem fichas" disabled>
                                <ClipboardList size={16} />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => openEditLider(l)}>
                              <Pencil size={16} />
                            </Button>
                            <Button variant="ghost" size="sm" aria-label="Excluir" onClick={() => { setError(null); setDeleteLiderId(l.id) }}>
                              <Trash2 size={16} color="var(--color-danger)" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>

      <Modal
        open={neriteOpen}
        title={editingNeriteId ? 'Editar nerite' : 'Nova nerite'}
        onClose={() => !saving && setNeriteOpen(false)}
        onConfirm={handleSaveNerite}
        confirmLabel="Salvar"
        loading={saving}
      >
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
          <Input
            label="E-mail"
            type="email"
            value={neriteForm.email}
            onChange={(e) => setNeriteForm((f) => ({ ...f, email: e.target.value }))}
            disabled={Boolean(editingNeriteId)}
          />
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
          {editingNeriteId && (
            <Select
              label="Status"
              value={neriteForm.ativo ? '1' : '0'}
              onChange={(e) => setNeriteForm((f) => ({ ...f, ativo: e.target.value === '1' }))}
              options={[
                { value: '1', label: 'Ativa' },
                { value: '0', label: 'Inativa' },
              ]}
            />
          )}
          <Input
            label={editingNeriteId ? 'Nova senha (opcional)' : 'Senha'}
            type="password"
            value={neriteForm.password}
            onChange={(e) => setNeriteForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={editingNeriteId ? 'Deixe em branco para manter' : undefined}
          />
          <Input
            label={editingNeriteId ? 'Confirmar nova senha' : 'Confirmar senha'}
            type="password"
            value={neriteForm.confirm}
            onChange={(e) => setNeriteForm((f) => ({ ...f, confirm: e.target.value }))}
          />
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      </Modal>

      <Modal
        open={coordOpen}
        title={editingCoordId ? 'Editar coordenador' : 'Novo coordenador'}
        onClose={() => !saving && setCoordOpen(false)}
        onConfirm={handleSaveCoord}
        confirmLabel="Salvar"
        loading={saving}
      >
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

      <Modal
        open={liderOpen}
        title={editingLiderId ? 'Editar liderança' : 'Nova liderança'}
        onClose={() => !saving && setLiderOpen(false)}
        onConfirm={handleSaveLider}
        confirmLabel="Salvar"
        loading={saving}
      >
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

      <Modal
        open={Boolean(deleteNeriteId)}
        title="Excluir nerite?"
        description={`Remover o acesso de "${deleteNeriteName ?? 'esta nerite'}". Os cadastros feitos por ela permanecem no sistema.`}
        onClose={() => !saving && setDeleteNeriteId(null)}
        onConfirm={handleDeleteNerite}
        confirmLabel="Excluir"
        confirmVariant="danger"
        loading={saving}
      />

      <Modal
        open={Boolean(deleteCoordId)}
        title="Excluir coordenador?"
        description={`Remover "${deleteCoordName ?? 'este coordenador'}" da lista. As fichas já cadastradas mantêm o nome salvo.`}
        onClose={() => !saving && setDeleteCoordId(null)}
        onConfirm={handleDeleteCoord}
        confirmLabel="Excluir"
        confirmVariant="danger"
        loading={saving}
      />

      <Modal
        open={Boolean(deleteLiderId)}
        title="Excluir liderança?"
        description={`Remover "${deleteLiderName ?? 'esta liderança'}" da lista. As fichas já cadastradas mantêm o nome salvo.`}
        onClose={() => !saving && setDeleteLiderId(null)}
        onConfirm={handleDeleteLider}
        confirmLabel="Excluir"
        confirmVariant="danger"
        loading={saving}
      />
    </div>
  )
}
