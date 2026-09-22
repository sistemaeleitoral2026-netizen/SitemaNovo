import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2, UserPlus, Users, UserCog, Crown, ClipboardList, Megaphone, Briefcase } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { WhatsAppLink } from '../components/ui/WhatsAppLink'
import { EquipeMemberModal } from '../components/equipe/EquipeMemberModal'
import { formatPhone } from '../lib/normalize'
import { fetchCadastroFichaStats, fetchOperatorCadastroStats } from '../lib/cadastros'
import { resolveLimiteFichas, resolveLimiteLiderancas } from '../lib/liderFichas'
import { META_COORDENADOR_LIDERANCAS, META_LIDERANCA_FICHAS } from '../lib/meta'
import { supabase } from '../lib/supabase'
import type { Coordenador, Lider, Profile, UserRole } from '../types'
import { labelRole, normalizeExtraRoles } from '../lib/roles'

type Tab = 'nerites' | 'coordenadores' | 'lideres' | 'mobilizadores' | 'administrativos'

const TAB_META: Record<Tab, { title: string; subtitle: string }> = {
  nerites: {
    title: 'Nerites',
    subtitle: 'Cadastre, edite ou exclua as nerites da sua diretoria.',
  },
  coordenadores: {
    title: 'Coordenadores',
    subtitle: `Cadastre, edite ou exclua os coordenadores. Meta padrão: ${META_COORDENADOR_LIDERANCAS} lideranças (editável; pode passar da meta).`,
  },
  lideres: {
    title: 'Lideranças',
    subtitle: `Cadastre, edite ou exclua as lideranças. Meta padrão: ${META_LIDERANCA_FICHAS} fichas (editável; pode passar da meta).`,
  },
  mobilizadores: {
    title: 'Formigas',
    subtitle: 'Cadastre quem lança Formigas na sua diretoria.',
  },
  administrativos: {
    title: 'Administrativos',
    subtitle: 'Equipe que lança e acompanha Demandas (sem liberar conclusão).',
  },
}

function ExtraRolesBadges({ roles }: { roles?: UserRole[] | null }) {
  const extras = (roles ?? []).filter(Boolean)
  if (!extras.length) return null
  return (
    <span className="eq-extra-roles">
      {extras.map((r) => (
        <em key={r} className="eq-extra-pill">{labelRole(r)}</em>
      ))}
    </span>
  )
}

export function EquipePage() {
  const { profile, createNerite } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const canManageTeam = isAdmin || profile?.role === 'diretoria'
  const diretoriaId = profile?.role === 'diretoria' ? profile.id : null
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const tab: Tab =
    tabParam === 'coordenadores'
    || tabParam === 'lideres'
    || tabParam === 'nerites'
    || tabParam === 'mobilizadores'
    || (tabParam === 'administrativos' && isAdmin)
      ? (tabParam as Tab)
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
  const [mobilizadores, setMobilizadores] = useState<Profile[]>([])
  const [administrativos, setAdministrativos] = useState<Profile[]>([])
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
  const [mobOpen, setMobOpen] = useState(false)
  const [admOpen, setAdmOpen] = useState(false)
  const [coordOpen, setCoordOpen] = useState(false)
  const [liderOpen, setLiderOpen] = useState(false)
  const [editingNeriteId, setEditingNeriteId] = useState<string | null>(null)
  const [editingMobId, setEditingMobId] = useState<string | null>(null)
  const [editingAdmId, setEditingAdmId] = useState<string | null>(null)
  const [editingCoordId, setEditingCoordId] = useState<string | null>(null)
  const [editingLiderId, setEditingLiderId] = useState<string | null>(null)
  const [deleteNeriteId, setDeleteNeriteId] = useState<string | null>(null)
  const [deleteMobId, setDeleteMobId] = useState<string | null>(null)
  const [deleteAdmId, setDeleteAdmId] = useState<string | null>(null)
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
    extra_roles: [] as UserRole[],
  })
  const [mobForm, setMobForm] = useState({
    nome: '',
    email: '',
    password: '',
    confirm: '',
    diretoria_id: '',
    ativo: true,
    extra_roles: [] as UserRole[],
  })
  const [admForm, setAdmForm] = useState({
    nome: '',
    email: '',
    password: '',
    confirm: '',
    diretoria_id: '',
    ativo: true,
    extra_roles: [] as UserRole[],
  })
  const [coordForm, setCoordForm] = useState({
    nome: '',
    diretoria_id: '',
    limite_liderancas: String(META_COORDENADOR_LIDERANCAS),
  })
  const [liderForm, setLiderForm] = useState({
    nome: '',
    telefone: '',
    diretoria_id: '',
    coordenador_id: '',
    limite_fichas: String(META_LIDERANCA_FICHAS),
  })

  async function load() {
    setLoading(true)
    const dirs = await supabase.from('profiles').select('*').eq('role', 'diretoria').order('nome')
    setDiretorias((dirs.data ?? []) as Profile[])

    let neritesQuery = supabase.from('profiles').select('*').eq('role', 'operador').order('nome')
    let mobsQuery = supabase.from('profiles').select('*').eq('role', 'mobilizador').order('nome')
    const admsQuery = supabase.from('profiles').select('*').eq('role', 'administrativo').order('nome')
    let coordsQuery = supabase.from('coordenadores').select('*').order('nome')
    let lideresQuery = supabase.from('lideres').select('*').order('nome')

    const scope = isAdmin ? filterDiretoria : diretoriaId
    if (scope) {
      neritesQuery = neritesQuery.eq('diretoria_id', scope)
      mobsQuery = mobsQuery.eq('diretoria_id', scope)
      coordsQuery = coordsQuery.eq('diretoria_id', scope)
      lideresQuery = lideresQuery.eq('diretoria_id', scope)
    }

    const [n, m, a, c, l, fRows] = await Promise.all([
      neritesQuery,
      mobsQuery,
      admsQuery,
      coordsQuery,
      lideresQuery,
      fetchCadastroFichaStats(),
    ])
    const neriteRows = (n.data ?? []) as Profile[]
    const mobRows = (m.data ?? []) as Profile[]
    const admRows = (a.data ?? []) as Profile[]
    const coordRows = (c.data ?? []) as Coordenador[]
    const liderRows = (l.data ?? []) as Lider[]
    setNerites(neriteRows)
    setMobilizadores(mobRows)
    setAdministrativos(admRows)
    setCoordenadores(coordRows)
    setLideres(liderRows)

    const { counts: byNeriteExact } = await fetchOperatorCadastroStats(neriteRows.map((r) => r.id))

    const neriteIds = new Set(neriteRows.map((row) => row.id))
    const byCoord: Record<string, number> = {}
    const byLider: Record<string, number> = {}

    fRows.forEach((row) => {
      if (scope) {
        const inScope =
          row.diretoria_id === scope || (row.operator_id != null && neriteIds.has(row.operator_id))
        if (!inScope) return
      }
      const rawTotal = Number((row as { total?: number }).total)
      const n = Number.isFinite(rawTotal) && rawTotal > 0 ? Math.floor(rawTotal) : 1
      const coord = (row.coordenador ?? '').trim()
      const lider = (row.lider ?? '').trim()
      if (coord) byCoord[coord] = (byCoord[coord] ?? 0) + n
      if (lider) byLider[lider] = (byLider[lider] ?? 0) + n
    })

    setFichasByCoord(byCoord)
    setFichasByLider(byLider)
    setFichasByNerite(byNeriteExact)
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
  const filteredMobilizadores = useMemo(
    () =>
      mobilizadores.filter((m) => {
        if (!q) return true
        return m.nome.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
      }),
    [mobilizadores, q],
  )
  const filteredAdministrativos = useMemo(
    () =>
      administrativos.filter((m) => {
        if (!q) return true
        return m.nome.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
      }),
    [administrativos, q],
  )

  const lideresCount = useMemo(
    () =>
      coordenadorFromUrl
        ? lideres.filter((l) => l.coordenador_id === coordenadorFromUrl).length
        : lideres.length,
    [lideres, coordenadorFromUrl],
  )
  const lideresByCoord = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of lideres) {
      if (!l.coordenador_id) continue
      counts[l.coordenador_id] = (counts[l.coordenador_id] ?? 0) + 1
    }
    return counts
  }, [lideres])
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
    // Usa a diretoria do modal aberto — senão sobra diretoria de outro formulário e a lista fica vazia/errada.
    const dir = isAdmin
      ? (liderOpen
          ? liderForm.diretoria_id
          : neriteOpen
            ? neriteForm.diretoria_id
            : coordOpen
              ? coordForm.diretoria_id
              : (neriteForm.diretoria_id || coordForm.diretoria_id || liderForm.diretoria_id))
      : diretoriaId

    const selectedId = liderOpen
      ? liderForm.coordenador_id
      : neriteOpen
        ? neriteForm.coordenador_id
        : ''

    return coordenadores.filter((c) => {
      if (dir && c.diretoria_id !== dir) return false
      if (c.ativo === false && c.id !== selectedId) return false
      return true
    })
  }, [
    coordenadores,
    isAdmin,
    diretoriaId,
    liderOpen,
    neriteOpen,
    coordOpen,
    liderForm.diretoria_id,
    liderForm.coordenador_id,
    neriteForm.diretoria_id,
    neriteForm.coordenador_id,
    coordForm.diretoria_id,
  ])

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
    setCoordForm({
      nome: '',
      diretoria_id: diretoriaId ?? '',
      limite_liderancas: String(META_COORDENADOR_LIDERANCAS),
    })
    setCoordOpen(true)
  }

  function openEditCoord(c: Coordenador) {
    setError(null)
    setEditingCoordId(c.id)
    setCoordForm({
      nome: c.nome,
      diretoria_id: c.diretoria_id,
      limite_liderancas: String(resolveLimiteLiderancas(c.limite_liderancas)),
    })
    setCoordOpen(true)
  }

  function openNewLider() {
    setError(null)
    setEditingLiderId(null)
    setLiderForm({
      nome: '',
      telefone: '',
      diretoria_id: diretoriaId ?? filterDiretoria ?? '',
      coordenador_id: coordenadorFromUrl || '',
      limite_fichas: String(META_LIDERANCA_FICHAS),
    })
    setLiderOpen(true)
  }

  function openEditLider(l: Lider) {
    setError(null)
    setEditingLiderId(l.id)
    setLiderForm({
      nome: l.nome,
      telefone: formatPhone(l.telefone ?? ''),
      diretoria_id: l.diretoria_id,
      coordenador_id: l.coordenador_id ?? '',
      limite_fichas: String(resolveLimiteFichas(l.limite_fichas)),
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
      extra_roles: [],
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
      extra_roles: normalizeExtraRoles('operador', n.extra_roles ?? []),
    })
    setNeriteOpen(true)
  }

  function openNewMob() {
    setError(null)
    setEditingMobId(null)
    setMobForm({
      nome: '',
      email: '',
      password: '',
      confirm: '',
      diretoria_id: diretoriaId ?? filterDiretoria ?? '',
      ativo: true,
      extra_roles: [],
    })
    setMobOpen(true)
  }

  function openEditMob(m: Profile) {
    setError(null)
    setEditingMobId(m.id)
    setMobForm({
      nome: m.nome,
      email: m.email,
      password: '',
      confirm: '',
      diretoria_id: m.diretoria_id ?? '',
      ativo: m.ativo,
      extra_roles: normalizeExtraRoles('mobilizador', m.extra_roles ?? []),
    })
    setMobOpen(true)
  }

  function openNewAdm() {
    setError(null)
    setEditingAdmId(null)
    setAdmForm({ nome: '', email: '', password: '', confirm: '', diretoria_id: '', ativo: true, extra_roles: [] })
    setAdmOpen(true)
  }

  function openEditAdm(m: Profile) {
    setError(null)
    setEditingAdmId(m.id)
    setAdmForm({
      nome: m.nome,
      email: m.email,
      password: '',
      confirm: '',
      diretoria_id: '',
      ativo: m.ativo,
      extra_roles: normalizeExtraRoles('administrativo', m.extra_roles ?? []),
    })
    setAdmOpen(true)
  }

  async function manageNeriteRequest(method: 'POST' | 'DELETE', body: Record<string, unknown>) {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return { error: 'Sessão expirada.' }

    try {
      const res = await fetch('/api/manage-nerite', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      if (res.ok) return { error: null }
      const payload = await res.json().catch(() => ({}))
      // Em dev local a API serverless pode não existir — fallback admin via RLS.
      if (res.status !== 404 && res.status !== 500 && payload.error) {
        return { error: payload.error || 'Não foi possível concluir a operação.' }
      }
    } catch {
      /* fallback abaixo */
    }

    const neriteId = String(body.id || '')
    if (!neriteId) return { error: 'Informe a nerite.' }

    if (method === 'DELETE') {
      // Fallback local: sem API serverless não dá para apagar auth.users com segurança.
      // Mobilizador: exclui o profile sem checagem de fichas.
      // Diretoria só desativa nerite com fichas; admin com fichas desvincula e remove o profile se RLS permitir.
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', neriteId)
        .maybeSingle()
      const isMobilizador = (targetProfile as { role?: string } | null)?.role === 'mobilizador'

      if (!isMobilizador) {
        const { count } = await supabase
          .from('cadastros')
          .select('id', { count: 'exact', head: true })
          .eq('operator_id', neriteId)
        const fichasCount = count ?? 0
        if (fichasCount > 0 && profile?.role !== 'admin') {
          return { error: 'Só o administrador pode excluir nerite que já tem fichas. As fichas não são apagadas.' }
        }
        if (fichasCount > 0) {
          await supabase.from('cadastros').update({ operator_id: null }).eq('operator_id', neriteId)
        }
      }
      const { error } = await supabase.from('profiles').delete().eq('id', neriteId)
      if (error) {
        // Se não puder hard-delete localmente, pelo menos desativa
        const soft = await supabase.from('profiles').update({ ativo: false }).eq('id', neriteId)
        return { error: soft.error?.message || error.message }
      }
      return { error: null }
    }

    const patch: Record<string, unknown> = {
      nome: body.nome,
      diretoria_id: body.diretoria_id || null,
      ativo: body.ativo == null ? true : Boolean(body.ativo),
    }
    // Só aplica coordenador/lider quando enviados (nerites); mobilizador edita sem esses campos.
    if ('coordenador_id' in body) patch.coordenador_id = body.coordenador_id || null
    if ('lider_id' in body) patch.lider_id = body.lider_id || null
    if ('extra_roles' in body) patch.extra_roles = body.extra_roles ?? []
    const { error } = await supabase.from('profiles').update(patch).eq('id', neriteId)
    return { error: error?.message || null }
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
        extra_roles: normalizeExtraRoles('operador', neriteForm.extra_roles),
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
        extra_roles: normalizeExtraRoles('operador', neriteForm.extra_roles),
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
      nome: '', email: '', password: '', confirm: '', diretoria_id: '', coordenador_id: '', lider_id: '', ativo: true, extra_roles: [],
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

  async function handleSaveMob() {
    setError(null)
    const targetDir = isAdmin ? mobForm.diretoria_id : diretoriaId
    if (!mobForm.nome.trim() || !targetDir) {
      setError('Informe o nome e a diretoria.')
      return
    }

    if (editingMobId) {
      if (mobForm.password || mobForm.confirm) {
        if (mobForm.password !== mobForm.confirm) {
          setError('As senhas não coincidem.')
          return
        }
        if (mobForm.password.length < 8) {
          setError('A nova senha precisa ter no mínimo 8 caracteres.')
          return
        }
      }
      setSaving(true)
      const { error: err } = await manageNeriteRequest('POST', {
        id: editingMobId,
        nome: mobForm.nome.trim(),
        diretoria_id: targetDir,
        ativo: mobForm.ativo,
        password: mobForm.password || undefined,
        extra_roles: normalizeExtraRoles('mobilizador', mobForm.extra_roles),
      })
      setSaving(false)
      if (err) {
        setError(err)
        return
      }
    } else {
      if (mobForm.password !== mobForm.confirm) {
        setError('As senhas não coincidem.')
        return
      }
      setSaving(true)
      const { error: err } = await createNerite({
        nome: mobForm.nome,
        email: mobForm.email,
        password: mobForm.password,
        role: 'mobilizador',
        extra_roles: normalizeExtraRoles('mobilizador', mobForm.extra_roles),
        diretoria_id: isAdmin ? mobForm.diretoria_id : diretoriaId,
      })
      setSaving(false)
      if (err) {
        setError(err)
        return
      }
    }

    setMobOpen(false)
    setEditingMobId(null)
    setMobForm({ nome: '', email: '', password: '', confirm: '', diretoria_id: '', ativo: true, extra_roles: [] })
    await load()
  }

  async function handleDeleteMob() {
    if (!deleteMobId) return
    setSaving(true)
    const { error: err } = await manageNeriteRequest('DELETE', { id: deleteMobId })
    setSaving(false)
    if (err) {
      setError(err)
      setDeleteMobId(null)
      return
    }
    setDeleteMobId(null)
    await load()
  }

  async function handleSaveAdm() {
    setError(null)
    if (!admForm.nome.trim()) {
      setError('Informe o nome.')
      return
    }

    if (editingAdmId) {
      if (admForm.password || admForm.confirm) {
        if (admForm.password !== admForm.confirm) {
          setError('As senhas não coincidem.')
          return
        }
        if (admForm.password.length < 8) {
          setError('A nova senha precisa ter no mínimo 8 caracteres.')
          return
        }
      }
      setSaving(true)
      const { error: err } = await manageNeriteRequest('POST', {
        id: editingAdmId,
        nome: admForm.nome.trim(),
        ativo: admForm.ativo,
        password: admForm.password || undefined,
        extra_roles: normalizeExtraRoles('administrativo', admForm.extra_roles),
      })
      setSaving(false)
      if (err) {
        setError(err)
        return
      }
    } else {
      if (admForm.password !== admForm.confirm) {
        setError('As senhas não coincidem.')
        return
      }
      setSaving(true)
      const { error: err } = await createNerite({
        nome: admForm.nome,
        email: admForm.email,
        password: admForm.password,
        role: 'administrativo',
        extra_roles: normalizeExtraRoles('administrativo', admForm.extra_roles),
      })
      setSaving(false)
      if (err) {
        setError(err)
        return
      }
    }

    setAdmOpen(false)
    setEditingAdmId(null)
    setAdmForm({ nome: '', email: '', password: '', confirm: '', diretoria_id: '', ativo: true, extra_roles: [] })
    await load()
  }

  async function handleDeactivateNerite() {
    if (!editingNeriteId || !neriteForm.ativo) return
    setError(null)
    setSaving(true)
    const targetDir = isAdmin ? neriteForm.diretoria_id : diretoriaId
    const { error: err } = await manageNeriteRequest('POST', {
      id: editingNeriteId,
      nome: neriteForm.nome.trim(),
      diretoria_id: targetDir,
      coordenador_id: neriteForm.coordenador_id || null,
      lider_id: neriteForm.lider_id || null,
      ativo: false,
      extra_roles: normalizeExtraRoles('operador', neriteForm.extra_roles),
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setNeriteOpen(false)
    setEditingNeriteId(null)
    await load()
  }

  async function handleDeactivateMob() {
    if (!editingMobId || !mobForm.ativo) return
    setError(null)
    setSaving(true)
    const targetDir = isAdmin ? mobForm.diretoria_id : diretoriaId
    const { error: err } = await manageNeriteRequest('POST', {
      id: editingMobId,
      nome: mobForm.nome.trim(),
      diretoria_id: targetDir,
      ativo: false,
      extra_roles: normalizeExtraRoles('mobilizador', mobForm.extra_roles),
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setMobOpen(false)
    setEditingMobId(null)
    await load()
  }

  async function handleDeactivateAdm() {
    if (!editingAdmId || !admForm.ativo) return
    setError(null)
    setSaving(true)
    const { error: err } = await manageNeriteRequest('POST', {
      id: editingAdmId,
      nome: admForm.nome.trim(),
      ativo: false,
      extra_roles: normalizeExtraRoles('administrativo', admForm.extra_roles),
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setAdmOpen(false)
    setEditingAdmId(null)
    await load()
  }

  async function handleDeleteAdm() {
    if (!deleteAdmId) return
    setSaving(true)
    const { error: err } = await manageNeriteRequest('DELETE', { id: deleteAdmId })
    setSaving(false)
    if (err) {
      setError(err)
      setDeleteAdmId(null)
      return
    }
    setDeleteAdmId(null)
    await load()
  }

  async function handleSaveCoord() {
    setError(null)
    const targetDir = isAdmin ? coordForm.diretoria_id : diretoriaId
    if (!coordForm.nome.trim() || !targetDir) {
      setError('Informe o nome e a diretoria.')
      return
    }
    const newNome = coordForm.nome.trim()
    const duplicate = coordenadores.find(
      (c) =>
        c.id !== editingCoordId
        && c.diretoria_id === targetDir
        && c.nome.trim().toLowerCase() === newNome.toLowerCase(),
    )
    if (duplicate) {
      setError(`Já existe um coordenador chamado "${duplicate.nome}" nesta diretoria.`)
      return
    }
    const oldNome = editingCoordId
      ? (coordenadores.find((c) => c.id === editingCoordId)?.nome ?? null)
      : null
    const limite = resolveLimiteLiderancas(coordForm.limite_liderancas)
    setSaving(true)
    const payload = {
      nome: newNome,
      diretoria_id: targetDir,
      limite_liderancas: limite,
    }
    const { error: err } = editingCoordId
      ? await supabase.from('coordenadores').update(payload).eq('id', editingCoordId)
      : await supabase.from('coordenadores').insert(payload)
    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }
    // Fichas guardam o nome em texto — ao renomear, atualiza as fichas da mesma diretoria
    if (editingCoordId && oldNome && oldNome !== newNome) {
      const { error: syncErr } = await supabase
        .from('cadastros')
        .update({ coordenador: newNome })
        .eq('diretoria_id', targetDir)
        .eq('coordenador', oldNome)
      if (syncErr) {
        setSaving(false)
        setError(`Coordenador salvo, mas as fichas não atualizaram: ${syncErr.message}`)
        await load()
        return
      }
    }
    setSaving(false)
    setCoordOpen(false)
    setEditingCoordId(null)
    setCoordForm({
      nome: '',
      diretoria_id: '',
      limite_liderancas: String(META_COORDENADOR_LIDERANCAS),
    })
    await load()
  }

  async function handleSaveLider() {
    setError(null)
    const targetDir = isAdmin ? liderForm.diretoria_id : diretoriaId
    if (!liderForm.nome.trim() || !targetDir) {
      setError('Informe o nome e a diretoria.')
      return
    }
    const newNome = liderForm.nome.trim()
    const newCoordId = liderForm.coordenador_id || null
    // Mesmo nome ok em coordenações diferentes; bloqueia só dentro do mesmo coordenador
    const duplicate = lideres.find(
      (l) =>
        l.id !== editingLiderId
        && l.diretoria_id === targetDir
        && (l.coordenador_id || null) === newCoordId
        && l.nome.trim().toLowerCase() === newNome.toLowerCase(),
    )
    if (duplicate) {
      setError(`Já existe uma liderança chamada "${duplicate.nome}" neste coordenador. Use um nome diferente.`)
      return
    }
    const editing = editingLiderId
      ? lideres.find((l) => l.id === editingLiderId)
      : null
    const oldNome = editing?.nome ?? null
    const oldCoordId = editing?.coordenador_id || null
    const oldCoordNome = oldCoordId
      ? (coordenadores.find((c) => c.id === oldCoordId)?.nome ?? null)
      : null
    const limite = resolveLimiteFichas(liderForm.limite_fichas)
    setSaving(true)
    const payload = {
      nome: newNome,
      telefone: liderForm.telefone.replace(/\D/g, '') || null,
      diretoria_id: targetDir,
      coordenador_id: newCoordId,
      limite_fichas: limite,
    }
    const { error: err } = editingLiderId
      ? await supabase.from('lideres').update(payload).eq('id', editingLiderId)
      : await supabase.from('lideres').insert(payload)
    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }
    // Fichas guardam lider+coordenador em texto — só sincroniza as da MESMA coordenação
    if (editingLiderId && oldNome && oldNome !== newNome) {
      let sync = supabase
        .from('cadastros')
        .update({ lider: newNome })
        .eq('diretoria_id', targetDir)
        .eq('lider', oldNome)
      if (oldCoordNome) {
        sync = sync.eq('coordenador', oldCoordNome)
      }
      const { error: syncErr } = await sync
      if (syncErr) {
        setSaving(false)
        setError(`Liderança salva, mas as fichas não atualizaram o nome: ${syncErr.message}`)
        await load()
        return
      }
    }
    setSaving(false)
    setLiderOpen(false)
    setEditingLiderId(null)
    setLiderForm({
      nome: '',
      telefone: '',
      diretoria_id: '',
      coordenador_id: '',
      limite_fichas: String(META_LIDERANCA_FICHAS),
    })
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
  const deleteNeriteFichas = deleteNeriteId ? (fichasByNerite[deleteNeriteId] ?? 0) : 0
  const deleteMobName = mobilizadores.find((m) => m.id === deleteMobId)?.nome
  const deleteAdmName = administrativos.find((m) => m.id === deleteAdmId)?.nome
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
          {tab === 'mobilizadores' && canManageTeam && (
            <Button onClick={openNewMob}><UserPlus size={16} /> Nova formiga</Button>
          )}
          {tab === 'administrativos' && isAdmin && (
            <Button onClick={openNewAdm}><UserPlus size={16} /> Novo administrativo</Button>
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
        {(
          [
            { key: 'coordenadores' as const, label: 'Coordenadores', Icon: UserCog, count: coordenadores.length },
            { key: 'lideres' as const, label: 'Lideranças', Icon: Crown, count: lideresCount },
            { key: 'nerites' as const, label: 'Nerites', Icon: Users, count: neritesCount },
            ...(canManageTeam
              ? [{ key: 'mobilizadores' as const, label: 'Formigas', Icon: Megaphone, count: mobilizadores.length }]
              : []),
            ...(isAdmin
              ? [{ key: 'administrativos' as const, label: 'Administrativos', Icon: Briefcase, count: administrativos.length }]
              : []),
          ]
        ).map(({ key, label, Icon, count }) => (
          <button key={key} type="button" className={`view-chip${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={14} /> {label}
            <em className="view-chip-count">{count}</em>
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
                        <ExtraRolesBadges roles={n.extra_roles} />
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
                              title={
                                fichas > 0 && !isAdmin
                                  ? 'Só o administrador pode excluir nerite com fichas'
                                  : 'Excluir nerite (fichas permanecem)'
                              }
                              onClick={() => {
                                if (fichas > 0 && !isAdmin) {
                                  setError('Só o administrador pode excluir nerite que já tem fichas. As fichas não são apagadas.')
                                  return
                                }
                                setError(null)
                                setDeleteNeriteId(n.id)
                              }}
                              disabled={fichas > 0 && !isAdmin}
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
                    const qtdLiderancas = lideresByCoord[c.id] ?? 0
                    const limiteLiderancas = resolveLimiteLiderancas(c.limite_liderancas)
                    return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.nome}</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`fichas-count equipe-drill-count${qtdLiderancas ? '' : ' zero'}${qtdLiderancas >= limiteLiderancas ? ' done' : ''}`}
                          onClick={() =>
                            patchParams({
                              tab: 'lideres',
                              coordenador: c.id,
                              lider: null,
                              ...(isAdmin ? { diretoria: c.diretoria_id } : {}),
                            })
                          }
                          aria-label={`Ver lideranças de ${c.nome}`}
                          title={`Meta: ${limiteLiderancas} lideranças (pode ultrapassar)`}
                        >
                          {qtdLiderancas}/{limiteLiderancas}
                        </button>
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
                    <th>Contato</th>
                    <th>Coordenador</th>
                    <th>Fichas</th>
                    {isAdmin && <th>Diretoria</th>}
                    {canManageTeam && <th>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredLideres.map((l) => {
                    const fichas = fichasByLider[l.nome] ?? 0
                    const limite = resolveLimiteFichas(l.limite_fichas)
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
                      <td>
                        <span className="phone-cell">
                          {formatPhone(l.telefone) || '—'}
                          {l.telefone ? <WhatsAppLink phone={l.telefone} className="whatsapp-link-inline" /> : null}
                        </span>
                      </td>
                      <td>{coordenadores.find((c) => c.id === l.coordenador_id)?.nome ?? '—'}</td>
                      <td>
                        <span
                          className={`fichas-count${fichas ? '' : ' zero'}${fichas >= limite ? ' done' : ''}`}
                          title={`Meta: ${limite} fichas (pode ultrapassar)`}
                        >
                          {fichas}/{limite}
                        </span>
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

        {tab === 'mobilizadores' && canManageTeam && (
          !filteredMobilizadores.length ? (
            <EmptyState
              title="Nenhuma formiga"
              description="Cadastre quem poderá lançar Formigas na sua diretoria."
              action={<Button onClick={openNewMob}><UserPlus size={16} /> Nova formiga</Button>}
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Status</th>
                    {isAdmin && <th>Diretoria</th>}
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMobilizadores.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.nome}</strong>
                        <ExtraRolesBadges roles={m.extra_roles} />
                      </td>
                      <td>{m.email}</td>
                      <td>
                        <span className={`badge ${m.ativo ? 'badge-success' : 'badge-danger'}`}>
                          {m.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      {isAdmin && <td>{dirName(m.diretoria_id)}</td>}
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => openEditMob(m)}>
                            <Pencil size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Excluir"
                            title="Excluir formiga"
                            onClick={() => { setError(null); setDeleteMobId(m.id) }}
                          >
                            <Trash2 size={16} color="var(--color-danger)" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'administrativos' && isAdmin && (
          !filteredAdministrativos.length ? (
            <EmptyState
              title="Nenhum administrativo"
              description="Cadastre quem lança e acompanha Demandas. A conclusão fica só com o admin."
              action={<Button onClick={openNewAdm}><UserPlus size={16} /> Novo administrativo</Button>}
            />
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdministrativos.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.nome}</strong>
                        <ExtraRolesBadges roles={m.extra_roles} />
                      </td>
                      <td>{m.email}</td>
                      <td>
                        <span className={`badge ${m.ativo ? 'badge-success' : 'badge-danger'}`}>
                          {m.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => openEditAdm(m)}>
                            <Pencil size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Excluir"
                            onClick={() => { setError(null); setDeleteAdmId(m.id) }}
                          >
                            <Trash2 size={16} color="var(--color-danger)" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>

      <EquipeMemberModal
        open={neriteOpen}
        mode={editingNeriteId ? 'edit' : 'create'}
        kind="operador"
        form={neriteForm}
        showDiretoria
        diretoriaLocked={!isAdmin}
        diretorias={diretorias.map((d) => ({ value: d.id, label: d.nome }))}
        coordOptions={coordOptionsForForm.map((c) => ({ value: c.id, label: c.nome }))}
        liderOptions={liderOptionsForForm.map((l) => ({ value: l.id, label: l.nome }))}
        allowAdminRole={isAdmin}
        error={error}
        saving={saving}
        onClose={() => !saving && setNeriteOpen(false)}
        onSave={() => void handleSaveNerite()}
        onChange={(patch) => setNeriteForm((f) => ({ ...f, ...patch }))}
        onDeactivate={() => void handleDeactivateNerite()}
      />

      <EquipeMemberModal
        open={mobOpen}
        mode={editingMobId ? 'edit' : 'create'}
        kind="mobilizador"
        form={mobForm}
        showDiretoria
        diretoriaLocked={!isAdmin}
        diretorias={diretorias.map((d) => ({ value: d.id, label: d.nome }))}
        allowAdminRole={isAdmin}
        error={error}
        saving={saving}
        onClose={() => !saving && setMobOpen(false)}
        onSave={() => void handleSaveMob()}
        onChange={(patch) => setMobForm((f) => ({ ...f, ...patch }))}
        onDeactivate={() => void handleDeactivateMob()}
      />

      <EquipeMemberModal
        open={admOpen}
        mode={editingAdmId ? 'edit' : 'create'}
        kind="administrativo"
        form={admForm}
        showDiretoria={false}
        diretorias={[]}
        allowAdminRole={isAdmin}
        error={error}
        saving={saving}
        onClose={() => !saving && setAdmOpen(false)}
        onSave={() => void handleSaveAdm()}
        onChange={(patch) => setAdmForm((f) => ({ ...f, ...patch }))}
        onDeactivate={() => void handleDeactivateAdm()}
      />

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
          <Input
            label="Meta de lideranças"
            inputMode="numeric"
            value={coordForm.limite_liderancas}
            onChange={(e) => setCoordForm((f) => ({
              ...f,
              limite_liderancas: e.target.value.replace(/\D/g, '').slice(0, 4),
            }))}
            placeholder={String(META_COORDENADOR_LIDERANCAS)}
          />
          <p style={{ margin: '-.35rem 0 0', fontSize: '.75rem', color: '#64748b' }}>
            Padrão {META_COORDENADOR_LIDERANCAS}. Aparece como <strong>atual/meta</strong> (ex.: 10/20).
            Não bloqueia novas lideranças — pode passar da meta.
          </p>
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
            placeholder={
              liderForm.diretoria_id
                ? (coordOptionsForForm.length ? 'Selecione o coordenador' : 'Nenhum coordenador nesta diretoria')
                : 'Selecione a diretoria primeiro'
            }
          />
          {liderOpen && liderForm.diretoria_id && coordOptionsForForm.length === 0 && (
            <p style={{ margin: 0, fontSize: '.8rem', color: '#b45309' }}>
              Cadastre um coordenador nesta diretoria (aba Coordenadores) e volte aqui para vincular.
            </p>
          )}
          <Input label="Nome da liderança" value={liderForm.nome} onChange={(e) => setLiderForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome que aparece na ficha" />
          <Input
            label="Meta de fichas"
            inputMode="numeric"
            value={liderForm.limite_fichas}
            onChange={(e) => setLiderForm((f) => ({
              ...f,
              limite_fichas: e.target.value.replace(/\D/g, '').slice(0, 4),
            }))}
            placeholder={String(META_LIDERANCA_FICHAS)}
          />
          <p style={{ margin: '-.35rem 0 0', fontSize: '.75rem', color: '#64748b' }}>
            Padrão {META_LIDERANCA_FICHAS}. Aparece como <strong>atual/meta</strong> (ex.: 20/40).
            Não bloqueia novas fichas — pode passar da meta.
          </p>
          <div className="ui-field">
            <label htmlFor="lider-telefone" className="ui-field-label">
              Contato (WhatsApp)
            </label>
            <div className="phone-with-whatsapp">
              <input
                id="lider-telefone"
                value={liderForm.telefone}
                onChange={(e) => setLiderForm((f) => ({ ...f, telefone: formatPhone(e.target.value) }))}
                placeholder="(98) 99123-4567"
                className="ui-input"
              />
              <WhatsAppLink phone={liderForm.telefone} />
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteNeriteId)}
        title="Excluir nerite?"
        description={
          deleteNeriteFichas > 0
            ? `Remover "${deleteNeriteName ?? 'esta nerite'}" do sistema. As ${deleteNeriteFichas} ficha(s) dela permanecem cadastradas.`
            : `Remover o acesso de "${deleteNeriteName ?? 'esta nerite'}". Não há fichas vinculadas.`
        }
        onClose={() => !saving && setDeleteNeriteId(null)}
        onConfirm={handleDeleteNerite}
        confirmLabel="Excluir"
        confirmVariant="danger"
        loading={saving}
      />

      <Modal
        open={Boolean(deleteMobId)}
        title="Excluir formiga?"
        description={`Remover o acesso de "${deleteMobName ?? 'esta formiga'}".`}
        onClose={() => !saving && setDeleteMobId(null)}
        onConfirm={handleDeleteMob}
        confirmLabel="Excluir"
        confirmVariant="danger"
        loading={saving}
      />

      <Modal
        open={Boolean(deleteAdmId)}
        title="Excluir administrativo?"
        description={`Remover o acesso de "${deleteAdmName ?? 'este administrativo'}".`}
        onClose={() => !saving && setDeleteAdmId(null)}
        onConfirm={handleDeleteAdm}
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
