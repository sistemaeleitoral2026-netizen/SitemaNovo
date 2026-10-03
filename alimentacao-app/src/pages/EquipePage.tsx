import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2, UserPlus, Users, UserCog, Crown, ClipboardList, Megaphone, Briefcase, Handshake, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
import { cadastrosLinkForLider, countFichasForLider, resolveLimiteFichas, resolveLimiteLiderancas } from '../lib/liderFichas'
import { META_COORDENADOR_LIDERANCAS, META_DIRETORIA_LIDERANCAS, META_LIDERANCA_FICHAS } from '../lib/meta'
import { fetchAuxiliarLiderIds, fetchVotacaoStatsPorLideres, type VotacaoProgressoLider } from '../lib/votacao'
import { supabase } from '../lib/supabase'
import type { Coordenador, Lider, Profile, UserRole } from '../types'
import { FORMIGAS_WHATSAPP_EMAILS } from '../lib/formigasWhatsapp'
import { hasRole, labelRole, normalizeExtraRoles } from '../lib/roles'

type Tab = 'nerites' | 'coordenadores' | 'lideres' | 'mobilizadores' | 'administrativos' | 'auxiliares'

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
    subtitle: 'Demandas. Marque também Formiga no popup se a pessoa precisa lançar Formigas (ex.: Aianka).',
  },
  auxiliares: {
    title: 'Auxiliares',
    subtitle: 'Cada coordenador cadastra auxiliares e escolhe quais lideranças eles lançam na votação.',
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
  const navigate = useNavigate()
  const isAdmin = hasRole(profile, 'admin')
  const isDiretoria = hasRole(profile, 'diretoria') && !isAdmin
  const isCoordenador = hasRole(profile, 'coordenador') && !isAdmin && !isDiretoria
  const canManageTeam = isAdmin || isDiretoria
  const canManageAuxiliares = canManageTeam || isCoordenador
  const diretoriaId = isDiretoria ? (profile?.id ?? null) : null
  const [searchParams, setSearchParams] = useSearchParams()
  const [myCoordenadorId, setMyCoordenadorId] = useState<string | null>(
    profile?.coordenador_id ?? null,
  )

  const tabParam = searchParams.get('tab')
  const tab: Tab =
    tabParam === 'coordenadores'
    || tabParam === 'lideres'
    || tabParam === 'nerites'
    || tabParam === 'mobilizadores'
    || tabParam === 'auxiliares'
    || (tabParam === 'administrativos' && isAdmin)
      ? (tabParam as Tab)
      : isCoordenador
        ? 'auxiliares'
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
  const [auxiliares, setAuxiliares] = useState<Profile[]>([])
  const [coordLogins, setCoordLogins] = useState<Record<string, { id: string; email: string }>>({})
  const [auxiliarLiderMap, setAuxiliarLiderMap] = useState<Record<string, string[]>>({})
  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [fichasByCoord, setFichasByCoord] = useState<Record<string, number>>({})
  const [fichaStats, setFichaStats] = useState<{
    lider: string | null
    coordenador: string | null
    diretoria_id: string | null
    total: number
  }[]>([])
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
  const [auxOpen, setAuxOpen] = useState(false)
  const [editingNeriteId, setEditingNeriteId] = useState<string | null>(null)
  const [editingMobId, setEditingMobId] = useState<string | null>(null)
  const [editingAdmId, setEditingAdmId] = useState<string | null>(null)
  const [editingCoordId, setEditingCoordId] = useState<string | null>(null)
  const [editingLiderId, setEditingLiderId] = useState<string | null>(null)
  const [editingAuxId, setEditingAuxId] = useState<string | null>(null)
  const [deleteNeriteId, setDeleteNeriteId] = useState<string | null>(null)
  const [deleteMobId, setDeleteMobId] = useState<string | null>(null)
  const [deleteAdmId, setDeleteAdmId] = useState<string | null>(null)
  const [deleteCoordId, setDeleteCoordId] = useState<string | null>(null)
  const [deleteLiderId, setDeleteLiderId] = useState<string | null>(null)
  const [deleteAuxId, setDeleteAuxId] = useState<string | null>(null)
  /** Popup: lideranças do auxiliar ao clicar no nome. */
  const [viewAuxLideresId, setViewAuxLideresId] = useState<string | null>(null)
  const [auxLiderStats, setAuxLiderStats] = useState<Record<string, VotacaoProgressoLider>>({})
  const [auxLiderStatsLoading, setAuxLiderStatsLoading] = useState(false)
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
    email: '',
    password: '',
    confirm: '',
    user_id: '' as string,
  })
  const [liderForm, setLiderForm] = useState({
    nome: '',
    telefone: '',
    diretoria_id: '',
    coordenador_id: '',
    limite_fichas: String(META_LIDERANCA_FICHAS),
  })
  const [auxForm, setAuxForm] = useState({
    nome: '',
    email: '',
    password: '',
    confirm: '',
    coordenador_id: '',
    diretoria_id: '',
    ativo: true,
    lider_ids: [] as string[],
  })

  async function load() {
    setLoading(true)
    const dirs = await supabase.from('profiles').select('*').eq('role', 'diretoria').order('nome')
    setDiretorias((dirs.data ?? []) as Profile[])

    let neritesQuery = supabase.from('profiles').select('*').eq('role', 'operador').order('nome')
    let mobsQuery = supabase.from('profiles').select('*').eq('role', 'mobilizador').order('nome')
    const admsQuery = supabase.from('profiles').select('*').eq('role', 'administrativo').order('nome')
    let auxQuery = supabase.from('profiles').select('*').eq('role', 'auxiliar').order('nome')
    let coordsQuery = supabase.from('coordenadores').select('*').order('nome')
    let lideresQuery = supabase.from('lideres').select('*').order('nome')

    let resolvedMyCoord = myCoordenadorId
    if (isCoordenador && profile?.id) {
      const mine = await supabase
        .from('coordenadores')
        .select('id,diretoria_id')
        .or(`user_id.eq.${profile.id}${profile.coordenador_id ? `,id.eq.${profile.coordenador_id}` : ''}`)
        .limit(1)
        .maybeSingle()
      if (mine.data?.id) {
        resolvedMyCoord = mine.data.id
        setMyCoordenadorId(mine.data.id)
        coordsQuery = coordsQuery.eq('id', mine.data.id)
        lideresQuery = lideresQuery.eq('coordenador_id', mine.data.id)
        auxQuery = auxQuery.eq('coordenador_id', mine.data.id)
        neritesQuery = neritesQuery.eq('coordenador_id', mine.data.id)
      }
    }

    const scope = isAdmin ? filterDiretoria : diretoriaId
    if (scope && !isCoordenador) {
      neritesQuery = neritesQuery.eq('diretoria_id', scope)
      mobsQuery = mobsQuery.eq('diretoria_id', scope)
      coordsQuery = coordsQuery.eq('diretoria_id', scope)
      lideresQuery = lideresQuery.eq('diretoria_id', scope)
      auxQuery = auxQuery.eq('diretoria_id', scope)
    }

    const [n, m, a, aux, c, l, fRows] = await Promise.all([
      isCoordenador ? Promise.resolve({ data: [] as Profile[] }) : neritesQuery,
      isCoordenador ? Promise.resolve({ data: [] as Profile[] }) : mobsQuery,
      isCoordenador ? Promise.resolve({ data: [] as Profile[] }) : admsQuery,
      auxQuery,
      coordsQuery,
      lideresQuery,
      fetchCadastroFichaStats(),
    ])
    const neriteRows = (n.data ?? []) as Profile[]
    const mobRows = (m.data ?? []) as Profile[]
    const admRows = (a.data ?? []) as Profile[]
    const auxRows = (aux.data ?? []) as Profile[]
    const coordRows = (c.data ?? []) as Coordenador[]
    const liderRows = (l.data ?? []) as Lider[]
    setNerites(neriteRows)
    setMobilizadores(mobRows)
    setAdministrativos(admRows)
    setAuxiliares(auxRows)
    setCoordenadores(coordRows)
    setLideres(liderRows)

    const loginIds = coordRows.map((r) => r.user_id).filter((id): id is string => Boolean(id))
    if (loginIds.length) {
      const { data: loginRows } = await supabase
        .from('profiles')
        .select('id,email')
        .in('id', loginIds)
      const map: Record<string, { id: string; email: string }> = {}
      for (const row of loginRows ?? []) {
        map[row.id] = { id: row.id, email: row.email }
      }
      setCoordLogins(map)
    } else {
      setCoordLogins({})
    }

    const liderMap: Record<string, string[]> = {}
    await Promise.all(
      auxRows.map(async (auxRow) => {
        try {
          liderMap[auxRow.id] = await fetchAuxiliarLiderIds(auxRow.id)
        } catch {
          liderMap[auxRow.id] = []
        }
      }),
    )
    setAuxiliarLiderMap(liderMap)

    const { counts: byNeriteExact } = await fetchOperatorCadastroStats(neriteRows.map((r) => r.id))

    const neriteIds = new Set(neriteRows.map((row) => row.id))
    const byCoord: Record<string, number> = {}
    const stats: {
      lider: string | null
      coordenador: string | null
      diretoria_id: string | null
      total: number
    }[] = []
    const myCoordNome = resolvedMyCoord
      ? (coordRows.find((r) => r.id === resolvedMyCoord)?.nome ?? '').trim()
      : ''

    fRows.forEach((row) => {
      if (isCoordenador && myCoordNome) {
        if ((row.coordenador ?? '').trim() !== myCoordNome) return
      } else if (scope) {
        const inScope =
          row.diretoria_id === scope || (row.operator_id != null && neriteIds.has(row.operator_id))
        if (!inScope) return
      }
      const rawTotal = Number((row as { total?: number }).total)
      const n = Number.isFinite(rawTotal) && rawTotal > 0 ? Math.floor(rawTotal) : 1
      const coord = (row.coordenador ?? '').trim()
      if (coord) byCoord[coord] = (byCoord[coord] ?? 0) + n
      stats.push({
        lider: row.lider ?? null,
        coordenador: row.coordenador ?? null,
        diretoria_id: row.diretoria_id ?? null,
        total: n,
      })
    })

    setFichasByCoord(byCoord)
    setFichaStats(stats)
    setFichasByNerite(byNeriteExact)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [filterDiretoria, diretoriaId, isAdmin, isCoordenador, profile?.id])

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
        // Sem coordenador_id: aparece para a nerite em qualquer coordenação —
        // no admin também precisa listar (senão “some” ao filtrar por coordenador).
        if (coordenadorFromUrl && l.coordenador_id && l.coordenador_id !== coordenadorFromUrl) {
          return false
        }
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
  const filteredAuxiliares = useMemo(
    () =>
      auxiliares.filter((a) => {
        if (coordenadorFromUrl && a.coordenador_id !== coordenadorFromUrl) return false
        if (isCoordenador && myCoordenadorId && a.coordenador_id !== myCoordenadorId) return false
        if (!q) return true
        return a.nome.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      }),
    [auxiliares, q, coordenadorFromUrl, isCoordenador, myCoordenadorId],
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
        ? lideres.filter((l) => !l.coordenador_id || l.coordenador_id === coordenadorFromUrl).length
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
      email: '',
      password: '',
      confirm: '',
      user_id: '',
    })
    setCoordOpen(true)
  }

  function openEditCoord(c: Coordenador) {
    setError(null)
    setEditingCoordId(c.id)
    const login = c.user_id ? coordLogins[c.user_id] : null
    setCoordForm({
      nome: c.nome,
      diretoria_id: c.diretoria_id,
      limite_liderancas: String(resolveLimiteLiderancas(c.limite_liderancas)),
      email: login?.email ?? '',
      password: '',
      confirm: '',
      user_id: c.user_id ?? '',
    })
    setCoordOpen(true)
  }

  function openNewAux() {
    setError(null)
    setEditingAuxId(null)
    const defaultCoord = isCoordenador
      ? (myCoordenadorId ?? '')
      : (coordenadorFromUrl || '')
    const coordRow = coordenadores.find((c) => c.id === defaultCoord)
    setAuxForm({
      nome: '',
      email: '',
      password: '',
      confirm: '',
      coordenador_id: defaultCoord,
      diretoria_id: coordRow?.diretoria_id || diretoriaId || filterDiretoria || '',
      ativo: true,
      lider_ids: [],
    })
    setAuxOpen(true)
  }

  async function openEditAux(a: Profile) {
    setError(null)
    setEditingAuxId(a.id)
    const liderIds = auxiliarLiderMap[a.id] ?? await fetchAuxiliarLiderIds(a.id).catch(() => [])
    setAuxForm({
      nome: a.nome,
      email: a.email,
      password: '',
      confirm: '',
      coordenador_id: a.coordenador_id ?? '',
      diretoria_id: a.diretoria_id ?? '',
      ativo: a.ativo,
      lider_ids: liderIds,
    })
    setAuxOpen(true)
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
    const { data: refreshed } = await supabase.auth.refreshSession()
    const token = refreshed.session?.access_token
      ?? (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return { error: 'Sessão expirada. Saia e entre novamente.' }

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

  function admExtraRolesForSave(email: string, selected: UserRole[]): UserRole[] {
    let extras = normalizeExtraRoles('administrativo', selected)
    const mail = email.trim().toLowerCase()
    // Chefe WhatsApp precisa Formiga para lançar no app (RLS + menu)
    if (FORMIGAS_WHATSAPP_EMAILS.includes(mail) && !extras.includes('mobilizador')) {
      extras = [...extras, 'mobilizador']
    }
    return extras
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
        extra_roles: admExtraRolesForSave(admForm.email, admForm.extra_roles),
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
        extra_roles: admExtraRolesForSave(admForm.email, admForm.extra_roles),
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
    const creatingLogin = !coordForm.user_id && Boolean(coordForm.email.trim() || coordForm.password)
    if (creatingLogin) {
      if (!coordForm.email.trim() || coordForm.password.length < 8) {
        setError('Para criar o login: e-mail e senha (mín. 8).')
        return
      }
      if (coordForm.password !== coordForm.confirm) {
        setError('As senhas não coincidem.')
        return
      }
    }
    if (coordForm.user_id && coordForm.password) {
      if (coordForm.password.length < 8) {
        setError('A nova senha precisa ter no mínimo 8 caracteres.')
        return
      }
      if (coordForm.password !== coordForm.confirm) {
        setError('As senhas não coincidem.')
        return
      }
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
    let coordId = editingCoordId
    if (editingCoordId) {
      const { error: err } = await supabase.from('coordenadores').update(payload).eq('id', editingCoordId)
      if (err) {
        setSaving(false)
        setError(err.message)
        return
      }
    } else {
      const { data: inserted, error: err } = await supabase
        .from('coordenadores')
        .insert(payload)
        .select('id')
        .maybeSingle()
      if (err || !inserted?.id) {
        setSaving(false)
        setError(err?.message || 'Não foi possível criar o coordenador.')
        return
      }
      coordId = inserted.id
    }

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

    if (creatingLogin && coordId) {
      const { error: loginErr } = await createNerite({
        nome: newNome,
        email: coordForm.email.trim().toLowerCase(),
        password: coordForm.password,
        role: 'coordenador',
        diretoria_id: targetDir,
        coordenador_id: coordId,
      })
      if (loginErr) {
        setSaving(false)
        const hint = /role|coordenador|user_id|check|constraint|profiles/i.test(loginErr)
          ? ' Rode o SQL coordenador_auxiliar_votacao_run.sql no Supabase e tente de novo.'
          : ''
        setError(`Coordenador salvo, mas o login falhou: ${loginErr}.${hint}`)
        await load()
        return
      }
    } else if (coordForm.user_id && (coordForm.password || newNome)) {
      const { error: manageErr } = await manageNeriteRequest('POST', {
        id: coordForm.user_id,
        nome: newNome,
        password: coordForm.password || undefined,
        diretoria_id: targetDir,
        coordenador_id: coordId,
        ativo: true,
      })
      if (manageErr) {
        setSaving(false)
        setError(`Coordenador salvo, mas a senha/login falhou: ${manageErr}`)
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
      email: '',
      password: '',
      confirm: '',
      user_id: '',
    })
    await load()
  }

  async function handleSaveAux() {
    setError(null)
    const coordId = isCoordenador ? (myCoordenadorId ?? '') : auxForm.coordenador_id
    const coordRow = coordenadores.find((c) => c.id === coordId)
    const targetDir = isAdmin
      ? (auxForm.diretoria_id || coordRow?.diretoria_id || '')
      : (isCoordenador ? (coordRow?.diretoria_id || profile?.diretoria_id || '') : (diretoriaId || ''))
    if (isCoordenador && !coordId) {
      setError('Coordenação não vinculada ao login. Peça à diretoria para vincular seu usuário.')
      return
    }
    if (!auxForm.nome.trim() || !coordId) {
      setError('Informe o nome e o coordenador.')
      return
    }
    if (!editingAuxId) {
      if (!auxForm.email.trim() || auxForm.password.length < 8) {
        setError('E-mail e senha (mín. 8) são obrigatórios.')
        return
      }
      if (auxForm.password !== auxForm.confirm) {
        setError('As senhas não coincidem.')
        return
      }
    } else if (auxForm.password) {
      if (auxForm.password.length < 8) {
        setError('A nova senha precisa ter no mínimo 8 caracteres.')
        return
      }
      if (auxForm.password !== auxForm.confirm) {
        setError('As senhas não coincidem.')
        return
      }
    }
    setSaving(true)
    if (editingAuxId) {
      const { error: err } = await manageNeriteRequest('POST', {
        id: editingAuxId,
        nome: auxForm.nome.trim(),
        password: auxForm.password || undefined,
        diretoria_id: targetDir || null,
        coordenador_id: coordId,
        ativo: auxForm.ativo,
        lider_ids: auxForm.lider_ids,
      })
      setSaving(false)
      if (err) {
        setError(err)
        return
      }
    } else {
      const { error: err } = await createNerite({
        nome: auxForm.nome.trim(),
        email: auxForm.email.trim().toLowerCase(),
        password: auxForm.password,
        role: 'auxiliar',
        diretoria_id: targetDir || null,
        coordenador_id: coordId,
        lider_ids: auxForm.lider_ids,
      })
      setSaving(false)
      if (err) {
        const hint = /auxiliar|coordenador|constraint|check|role|SQL|permiss|column|schema/i.test(err)
          && !/coordenador_auxiliar_votacao_run/i.test(err)
          ? ' Rode o SQL coordenador_auxiliar_votacao_run.sql no Supabase e tente de novo.'
          : ''
        setError(`${err}${hint}`)
        return
      }
    }
    setAuxOpen(false)
    setEditingAuxId(null)
    await load()
  }

  async function handleDeleteAux() {
    if (!deleteAuxId) return
    setSaving(true)
    const { error: err } = await manageNeriteRequest('DELETE', { id: deleteAuxId })
    setSaving(false)
    if (err) {
      setError(err)
      setDeleteAuxId(null)
      return
    }
    setDeleteAuxId(null)
    await load()
  }

  async function handleDeactivateAux() {
    if (!editingAuxId || !auxForm.ativo) return
    setError(null)
    setSaving(true)
    const coordId = isCoordenador ? (myCoordenadorId ?? '') : auxForm.coordenador_id
    const coordRow = coordenadores.find((c) => c.id === coordId)
    const targetDir = isAdmin
      ? (auxForm.diretoria_id || coordRow?.diretoria_id || '')
      : (isCoordenador ? (coordRow?.diretoria_id || profile?.diretoria_id || '') : (diretoriaId || ''))
    const { error: err } = await manageNeriteRequest('POST', {
      id: editingAuxId,
      nome: auxForm.nome.trim(),
      diretoria_id: targetDir || null,
      coordenador_id: coordId || null,
      ativo: false,
      lider_ids: auxForm.lider_ids,
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setAuxOpen(false)
    setEditingAuxId(null)
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

  const somaLiderancasCoords = useMemo(
    () => filteredCoords.reduce((n, c) => n + (lideresByCoord[c.id] ?? 0), 0),
    [filteredCoords, lideresByCoord],
  )

  const metasDiretoria = useMemo(() => {
    const scoped = filterDiretoria
      ? diretorias.filter((d) => d.id === filterDiretoria)
      : diretorias
    return META_DIRETORIA_LIDERANCAS.map((meta) => {
      const dir = scoped.find((d) => meta.keys.some((k) => d.nome.toLowerCase().includes(k)))
      const atual = dir
        ? coordenadores
          .filter((c) => c.diretoria_id === dir.id)
          .reduce((n, c) => n + (lideresByCoord[c.id] ?? 0), 0)
        : 0
      return {
        key: meta.label,
        label: meta.label,
        nome: dir?.nome ?? meta.label,
        meta: meta.meta,
        atual,
        restante: Math.max(0, meta.meta - atual),
        pct: Math.min(100, Math.round((atual / Math.max(1, meta.meta)) * 100)),
        found: Boolean(dir),
      }
    }).filter((m) => (isAdmin && !filterDiretoria ? true : m.found))
  }, [diretorias, coordenadores, lideresByCoord, filterDiretoria, isAdmin])

  const dirName = (id: string | null | undefined) => diretorias.find((d) => d.id === id)?.nome ?? '—'
  const meta = TAB_META[tab]
  const deleteNeriteName = nerites.find((n) => n.id === deleteNeriteId)?.nome
  const deleteNeriteFichas = deleteNeriteId ? (fichasByNerite[deleteNeriteId] ?? 0) : 0
  const deleteMobName = mobilizadores.find((m) => m.id === deleteMobId)?.nome
  const deleteAdmName = administrativos.find((m) => m.id === deleteAdmId)?.nome
  const deleteCoordName = coordenadores.find((c) => c.id === deleteCoordId)?.nome
  const deleteLiderName = lideres.find((l) => l.id === deleteLiderId)?.nome
  const deleteAuxName = auxiliares.find((a) => a.id === deleteAuxId)?.nome
  const viewAuxLideres = useMemo(() => {
    if (!viewAuxLideresId) return null
    const aux = auxiliares.find((a) => a.id === viewAuxLideresId)
    if (!aux) return null
    const liderIds = auxiliarLiderMap[aux.id] ?? []
    const liderNomes = liderIds
      .map((id) => lideres.find((l) => l.id === id)?.nome)
      .filter((n): n is string => Boolean(n))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return {
      aux,
      liderNomes,
      coordNome: coordenadores.find((c) => c.id === aux.coordenador_id)?.nome ?? null,
    }
  }, [viewAuxLideresId, auxiliares, auxiliarLiderMap, lideres, coordenadores])

  useEffect(() => {
    if (!viewAuxLideres?.liderNomes.length) {
      setAuxLiderStats({})
      setAuxLiderStatsLoading(false)
      return
    }
    let cancelled = false
    setAuxLiderStatsLoading(true)
    void (async () => {
      try {
        const stats = await fetchVotacaoStatsPorLideres({
          liderNomes: viewAuxLideres.liderNomes,
          coordenadorNome: viewAuxLideres.coordNome,
        })
        if (!cancelled) setAuxLiderStats(stats)
      } catch {
        if (!cancelled) setAuxLiderStats({})
      } finally {
        if (!cancelled) setAuxLiderStatsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [viewAuxLideres])

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
          <h1 className="page-title">{isAdmin || isCoordenador ? 'Equipe' : meta.title}</h1>
          <p className="page-subtitle">
            {isAdmin
              ? 'Gerencie diretorias, nerites, líderes e coordenadores.'
              : isCoordenador
                ? 'Suas lideranças, auxiliares e fichas da coordenação.'
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
          {tab === 'coordenadores' && canManageTeam && (
            <Button onClick={openNewCoord}><Plus size={16} /> Novo coordenador</Button>
          )}
          {tab === 'lideres' && canManageTeam && (
            <Button onClick={openNewLider}><Plus size={16} /> Nova liderança</Button>
          )}
          {tab === 'auxiliares' && canManageAuxiliares && (
            <Button onClick={openNewAux}><UserPlus size={16} /> Novo auxiliar</Button>
          )}
        </div>
      </div>

      {!isAdmin && !isCoordenador && (
        <div className="ficha-setup-banner">
          <strong>Fluxo da ficha</strong>
          <span>1) Cadastre coordenadores → 2) Cadastre lideranças → 3) Cadastre nerites. Na ficha, a nerite só seleciona esses nomes.</span>
        </div>
      )}
      {isCoordenador && (
        <div className="ficha-setup-banner">
          <strong>Sua coordenação</strong>
          <span>
            {myCoordenadorId
              ? 'Cadastre auxiliares e escolha quais lideranças cada um lança no dia da votação. Você também vê suas lideranças e fichas.'
              : 'Coordenação não vinculada ao login. Peça à diretoria para vincular seu usuário ao coordenador antes de cadastrar auxiliares.'}
          </span>
        </div>
      )}

      <div className="views-row">
        {(
          isCoordenador
            ? [
                { key: 'lideres' as const, label: 'Lideranças', Icon: Crown, count: lideresCount },
                { key: 'auxiliares' as const, label: 'Auxiliares', Icon: Handshake, count: filteredAuxiliares.length },
              ]
            : [
            { key: 'coordenadores' as const, label: 'Coordenadores', Icon: UserCog, count: coordenadores.length },
            { key: 'lideres' as const, label: 'Lideranças', Icon: Crown, count: lideresCount },
            { key: 'nerites' as const, label: 'Nerites', Icon: Users, count: neritesCount },
            { key: 'auxiliares' as const, label: 'Auxiliares', Icon: Handshake, count: filteredAuxiliares.length },
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
                    <th>Login</th>
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
                    const login = c.user_id ? coordLogins[c.user_id] : null
                    return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.nome}</strong>
                      </td>
                      <td>
                        {login?.email ? (
                          <span style={{ fontSize: '.8rem', color: '#166534' }}>{login.email}</span>
                        ) : (
                          <span style={{ fontSize: '.8rem', color: '#94a3b8' }}>Sem login</span>
                        )}
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

        {tab === 'coordenadores' && (
          <div className="equipe-lider-resumo">
            <div className="equipe-lider-soma">
              Soma: <strong>{somaLiderancasCoords}</strong> liderança{somaLiderancasCoords === 1 ? '' : 's'}
              {q ? ' (filtro atual)' : ''}
            </div>
            {metasDiretoria.length > 0 && (
              <div className="equipe-dir-metas">
                {metasDiretoria.map((m) => (
                  <div key={m.key} className={`equipe-dir-meta${m.atual >= m.meta ? ' done' : ''}`}>
                    <span className="equipe-dir-meta-label">{m.label}</span>
                    <strong>{m.atual}/{m.meta}</strong>
                    <em>
                      {m.atual >= m.meta
                        ? 'Meta batida'
                        : `faltam ${m.restante}`}
                    </em>
                    <div className="equipe-dir-meta-bar" aria-hidden>
                      <i style={{ width: `${m.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
              action={canManageTeam ? <Button onClick={openNewLider}><Plus size={16} /> Nova liderança</Button> : undefined}
            />
          ) : (
            <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Liderança</th>
                    <th>Contato</th>
                    {!isCoordenador && <th>Coordenador</th>}
                    <th>Fichas</th>
                    {isAdmin && <th>Diretoria</th>}
                    {canManageTeam && <th>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredLideres.map((l) => {
                    const coordNome = coordenadores.find((c) => c.id === l.coordenador_id)?.nome ?? ''
                    const fichas = countFichasForLider(fichaStats, {
                      nome: l.nome,
                      coordenadorNome: coordNome,
                      diretoriaId: l.diretoria_id,
                    })
                    const limite = resolveLimiteFichas(l.limite_fichas)
                    return (
                    <tr key={l.id}>
                      <td>
                        {fichas > 0 ? (
                          <Link
                            to={cadastrosLinkForLider({
                              nome: l.nome,
                              coordenador: coordNome,
                              diretoriaId: l.diretoria_id,
                            })}
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
                      {!isCoordenador && (
                        <td>{coordenadores.find((c) => c.id === l.coordenador_id)?.nome ?? '—'}</td>
                      )}
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
                              <Link
                                to={cadastrosLinkForLider({
                                  nome: l.nome,
                                  coordenador: coordNome,
                                  diretoriaId: l.diretoria_id,
                                })}
                              >
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
            </>
          )
        )}

        {tab === 'auxiliares' && canManageAuxiliares && (
          !filteredAuxiliares.length ? (
            <EmptyState
              title="Nenhum auxiliar"
              description="Cadastre auxiliares e escolha as lideranças que cada um poderá lançar na votação."
              action={<Button onClick={openNewAux}><UserPlus size={16} /> Novo auxiliar</Button>}
            />
          ) : (
            <div className="cadastros-table-card eq-aux-list-card">
              <div className="table-wrapper desktop-only">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Email</th>
                      {!isCoordenador && <th>Coordenador</th>}
                      <th>Lideranças</th>
                      <th>Status</th>
                      <th className="sticky-actions-head">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuxiliares.map((a) => {
                      const liderIds = auxiliarLiderMap[a.id] ?? []
                      const liderCount = liderIds.length
                      return (
                        <tr key={a.id}>
                          <td>
                            <button
                              type="button"
                              className="eq-aux-name-btn"
                              onClick={() => setViewAuxLideresId(a.id)}
                              title="Ver lideranças"
                            >
                              <strong>{a.nome}</strong>
                            </button>
                          </td>
                          <td>{a.email}</td>
                          {!isCoordenador && (
                            <td>{coordenadores.find((c) => c.id === a.coordenador_id)?.nome ?? '—'}</td>
                          )}
                          <td>
                            <button
                              type="button"
                              className={`eq-aux-lider-count${liderCount ? '' : ' is-empty'}`}
                              onClick={() => setViewAuxLideresId(a.id)}
                            >
                              {liderCount
                                ? `${liderCount} liderança${liderCount === 1 ? '' : 's'}`
                                : 'Nenhuma'}
                            </button>
                          </td>
                          <td>
                            <span className={`status-pill${a.ativo ? ' active' : ''}`}>
                              {a.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="sticky-actions-cell">
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => void openEditAux(a)}>
                                <Pencil size={16} />
                              </Button>
                              <Button variant="ghost" size="sm" aria-label="Excluir" onClick={() => { setError(null); setDeleteAuxId(a.id) }}>
                                <Trash2 size={16} color="var(--color-danger)" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mobile-cards">
                {filteredAuxiliares.map((a) => {
                  const liderIds = auxiliarLiderMap[a.id] ?? []
                  const liderCount = liderIds.length
                  return (
                    <div className="mobile-card" key={a.id}>
                      <div className="mobile-card-top">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <button
                            type="button"
                            className="eq-aux-name-btn"
                            onClick={() => setViewAuxLideresId(a.id)}
                          >
                            <strong style={{ fontSize: '.9rem' }}>{a.nome}</strong>
                          </button>
                          <span style={{ display: 'block', color: '#8a95a7', fontSize: '.72rem', marginTop: '.15rem' }}>
                            {a.email}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '.3rem' }}>
                          <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => void openEditAux(a)}>
                            <Pencil size={16} />
                          </Button>
                          <Button variant="ghost" size="sm" aria-label="Excluir" onClick={() => { setError(null); setDeleteAuxId(a.id) }}>
                            <Trash2 size={16} color="var(--color-danger)" />
                          </Button>
                        </div>
                      </div>
                      <div className="mobile-card-meta" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem .75rem', marginTop: '.8rem', paddingTop: '.7rem', borderTop: '1px solid #e9edf4' }}>
                        {!isCoordenador && (
                          <div>
                            <span>Coordenador</span>
                            <strong>{coordenadores.find((c) => c.id === a.coordenador_id)?.nome ?? '—'}</strong>
                          </div>
                        )}
                        <div>
                          <span>Lideranças</span>
                          <button
                            type="button"
                            className={`eq-aux-lider-count${liderCount ? '' : ' is-empty'}`}
                            onClick={() => setViewAuxLideresId(a.id)}
                          >
                            {liderCount
                              ? `${liderCount} liderança${liderCount === 1 ? '' : 's'}`
                              : 'Nenhuma'}
                          </button>
                        </div>
                        <div>
                          <span>Status</span>
                          <strong>{a.ativo ? 'Ativo' : 'Inativo'}</strong>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
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
          <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '.25rem 0' }} />
          <p style={{ margin: 0, fontSize: '.8rem', fontWeight: 700, color: '#0f172a' }}>
            {coordForm.user_id ? 'Login do coordenador' : 'Criar login (opcional)'}
          </p>
          <Input
            label="E-mail"
            type="email"
            value={coordForm.email}
            disabled={Boolean(coordForm.user_id)}
            onChange={(e) => setCoordForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="coordenador@email.com"
          />
          <Input
            label={coordForm.user_id ? 'Nova senha (opcional)' : 'Senha'}
            type="password"
            value={coordForm.password}
            onChange={(e) => setCoordForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={coordForm.user_id ? 'Deixe em branco para manter' : 'Mínimo 8 caracteres'}
          />
          <Input
            label="Confirmar senha"
            type="password"
            value={coordForm.confirm}
            onChange={(e) => setCoordForm((f) => ({ ...f, confirm: e.target.value }))}
            placeholder="Repita a senha"
          />
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      </Modal>

      {viewAuxLideres && (
        <>
          <div
            className="eq-aux-pop-overlay"
            onClick={() => setViewAuxLideresId(null)}
            aria-hidden
          />
          <div
            className="eq-aux-pop"
            role="dialog"
            aria-modal
            aria-labelledby="eq-aux-pop-title"
          >
            <header className="eq-aux-pop-head">
              <div className="eq-aux-pop-avatar" aria-hidden>
                {(viewAuxLideres.aux.nome.trim().split(/\s+/).filter(Boolean).length > 1
                  ? `${viewAuxLideres.aux.nome.trim().split(/\s+/)[0][0]}${viewAuxLideres.aux.nome.trim().split(/\s+/).slice(-1)[0][0]}`
                  : viewAuxLideres.aux.nome.slice(0, 2)
                ).toUpperCase()}
              </div>
              <div className="eq-aux-pop-titles">
                <h2 id="eq-aux-pop-title">Lideranças de {viewAuxLideres.aux.nome.split(/\s+/)[0]}</h2>
                <p>
                  {viewAuxLideres.liderNomes.length
                    ? `${viewAuxLideres.liderNomes.length} liderança${viewAuxLideres.liderNomes.length === 1 ? '' : 's'} na votação`
                    : 'Nenhuma liderança atribuída'}
                  {viewAuxLideres.coordNome ? ` · Coord.: ${viewAuxLideres.coordNome}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="eq-aux-pop-close"
                onClick={() => setViewAuxLideresId(null)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </header>

            <div className="eq-aux-pop-body">
              {viewAuxLideres.liderNomes.length ? (
                <>
                  <p className="eq-aux-pop-hint">
                    Toque numa liderança para abrir no Progresso (filtrada).
                  </p>
                  {auxLiderStatsLoading && (
                    <div className="eq-aux-pop-loading">
                      <Spinner size={20} /> Carregando totais da votação…
                    </div>
                  )}
                  <ul className="eq-aux-pop-list">
                    {viewAuxLideres.liderNomes.map((nome) => {
                      const st = auxLiderStats[nome]
                      const total = st?.total ?? 0
                      const votou = st?.votou ?? 0
                      const params = new URLSearchParams()
                      params.set('lider', nome)
                      if (viewAuxLideres.coordNome) params.set('coordenador', viewAuxLideres.coordNome)
                      return (
                        <li key={nome}>
                          <button
                            type="button"
                            className="eq-aux-pop-lider-btn"
                            onClick={() => {
                              setViewAuxLideresId(null)
                              navigate(`/votacao/progresso?${params.toString()}`)
                            }}
                          >
                            <span className="eq-aux-pop-lider-main">
                              <Crown size={14} strokeWidth={2} aria-hidden />
                              <strong>{nome}</strong>
                            </span>
                            <span className="eq-aux-pop-lider-stats">
                              <em>{auxLiderStatsLoading ? '…' : total} na lista</em>
                              <em className="is-yes">{auxLiderStatsLoading ? '…' : votou} votaram</em>
                              {!auxLiderStatsLoading && st ? (
                                <em className="is-pend">{st.pendente} pend.</em>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : (
                <p className="eq-aux-pop-empty">
                  Este auxiliar ainda não tem lideranças. Use Editar para marcar.
                </p>
              )}
            </div>

            <footer className="eq-aux-pop-foot">
              <Button variant="secondary" onClick={() => setViewAuxLideresId(null)}>
                Fechar
              </Button>
              <Button
                onClick={() => {
                  const aux = viewAuxLideres.aux
                  setViewAuxLideresId(null)
                  void openEditAux(aux)
                }}
              >
                <Pencil size={15} /> Editar auxiliar
              </Button>
            </footer>
          </div>
        </>
      )}

      <EquipeMemberModal
        open={auxOpen}
        mode={editingAuxId ? 'edit' : 'create'}
        kind="auxiliar"
        form={{ ...auxForm, extra_roles: [] }}
        showDiretoria={false}
        showCoordenador={!isCoordenador}
        diretorias={[]}
        coordOptions={coordenadores.map((c) => ({ value: c.id, label: c.nome }))}
        liderMultiOptions={lideres
          .filter((l) => !auxForm.coordenador_id || !l.coordenador_id || l.coordenador_id === auxForm.coordenador_id)
          .map((l) => ({ value: l.id, label: l.nome }))}
        allowAdminRole={false}
        error={error}
        saving={saving}
        onClose={() => !saving && setAuxOpen(false)}
        onSave={() => void handleSaveAux()}
        onChange={(patch) => {
          setAuxForm((f) => {
            const next = { ...f, ...patch }
            if (patch.coordenador_id !== undefined) {
              const row = coordenadores.find((c) => c.id === patch.coordenador_id)
              next.diretoria_id = row?.diretoria_id || f.diretoria_id
              if (patch.lider_ids === undefined) next.lider_ids = []
            }
            if (patch.lider_ids !== undefined) next.lider_ids = patch.lider_ids
            return next
          })
        }}
        onDeactivate={() => void handleDeactivateAux()}
      />

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

      <Modal
        open={Boolean(deleteAuxId)}
        title="Excluir auxiliar?"
        description={`Remover o acesso de "${deleteAuxName ?? 'este auxiliar'}".`}
        onClose={() => !saving && setDeleteAuxId(null)}
        onConfirm={() => void handleDeleteAux()}
        confirmLabel="Excluir"
        confirmVariant="danger"
        loading={saving}
      />
    </div>
  )
}
