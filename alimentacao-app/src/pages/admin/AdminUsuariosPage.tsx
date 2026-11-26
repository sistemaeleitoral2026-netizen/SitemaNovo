import { useEffect, useMemo, useState } from 'react'
import { Search, UserPlus } from './adminIcons'
import { useAuth } from '../../contexts/AuthContext'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { supabase } from '../../lib/supabase'
import { labelRole } from '../../lib/roles'
import { SITES } from '../../lib/sites'
import type { Profile, UserRole } from '../../types'

const PAGE_SIZE = 15
const AVATARS = ['avatar-blue', 'avatar-green', 'avatar-purple', 'avatar-orange', 'avatar-teal']
const SISTEMAS_EXTERNOS = SITES.filter((s) => s.id !== 'nerites')
const ROLE_FILTROS: UserRole[] = [
  'admin', 'diretoria', 'operador', 'mobilizador', 'administrativo', 'coordenador', 'auxiliar', 'visualizador', 'externo',
]

type Nivel = '' | 'editor' | 'admin'
type NovoCargo = 'externo' | 'visualizador'
type AcessosForm = Record<string, Nivel>

function acessosVazios(): AcessosForm {
  const out: AcessosForm = {}
  for (const s of SISTEMAS_EXTERNOS) out[s.id] = ''
  return out
}

function acessosDoUsuario(u: Profile): AcessosForm {
  const out = acessosVazios()
  for (const s of SISTEMAS_EXTERNOS) {
    const nivel = u.acessos_externos?.[s.id]
    if (nivel === 'admin' || nivel === 'editor') out[s.id] = nivel
  }
  return out
}

function acessosParaSalvar(form: AcessosForm): Record<string, 'admin' | 'editor'> {
  const out: Record<string, 'admin' | 'editor'> = {}
  for (const [site, nivel] of Object.entries(form)) {
    if (nivel === 'admin' || nivel === 'editor') out[site] = nivel
  }
  return out
}

function resumoAcessos(u: Profile): string {
  const partes = SISTEMAS_EXTERNOS
    .map((s) => {
      const nivel = u.acessos_externos?.[s.id]
      if (nivel !== 'admin' && nivel !== 'editor') return null
      return `${s.nome} (${nivel === 'admin' ? 'admin' : 'editor'})`
    })
    .filter((v): v is string => Boolean(v))
  return partes.length ? partes.join(' · ') : '—'
}

function initials(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

export function AdminUsuariosPage() {
  const { createNerite, criarUsuarioExterno, editarUsuarioExterno, excluirUsuarioExterno } = useAuth()

  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [page, setPage] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    cargo: 'visualizador' as NovoCargo, nome: '', email: '', password: '', confirm: '', acessos: acessosVazios(),
  })

  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ nome: '', ativo: true, password: '', acessos: acessosVazios() })

  const [deleteUser, setDeleteUser] = useState<Profile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, email, role, extra_roles, ativo, acessos_externos, created_at')
      .order('nome')
    if (error) {
      setLoadError(error.message)
    } else {
      setLoadError(null)
      setUsers((data ?? []) as Profile[])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => setPage(0), [search, roleFilter])

  const filtered = useMemo(() => {
    const termo = search.trim().toLowerCase()
    return users.filter((u) => {
      if (termo && !u.nome.toLowerCase().includes(termo) && !u.email.toLowerCase().includes(termo)) return false
      if (roleFilter && u.role !== roleFilter) return false
      return true
    })
  }, [users, search, roleFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function abrirEdicao(u: Profile) {
    setEditUser(u)
    setEditError(null)
    setEditForm({ nome: u.nome, ativo: u.ativo, password: '', acessos: acessosDoUsuario(u) })
  }

  async function handleCreate() {
    setCreateError(null)
    if (!createForm.nome.trim()) return setCreateError('Informe o nome.')
    if (!createForm.email.trim()) return setCreateError('Informe o e-mail de acesso.')
    if (createForm.password.length < 8) return setCreateError('A senha deve ter pelo menos 8 caracteres.')
    if (createForm.password !== createForm.confirm) return setCreateError('As senhas não coincidem.')
    setCreating(true)
    const error = createForm.cargo === 'visualizador'
      ? (await createNerite({
          nome: createForm.nome,
          email: createForm.email,
          password: createForm.password,
          role: 'visualizador',
        })).error
      : await (async () => {
          const acessos_externos = acessosParaSalvar(createForm.acessos)
          if (!Object.keys(acessos_externos).length) {
            return 'Marque pelo menos um sistema para liberar o acesso.'
          }
          return (await criarUsuarioExterno({
            nome: createForm.nome,
            email: createForm.email,
            password: createForm.password,
            acessos_externos,
          })).error
        })()
    setCreating(false)
    if (error) return setCreateError(error)

    setCreateOpen(false)
    setCreateForm({ cargo: 'visualizador', nome: '', email: '', password: '', confirm: '', acessos: acessosVazios() })
    await load()
  }

  async function handleSalvarEdicao() {
    if (!editUser) return
    setEditError(null)

    const acessos_externos = acessosParaSalvar(editForm.acessos)

    if (editUser.role === 'externo') {
      if (!editForm.nome.trim()) return setEditError('Informe o nome.')
      if (editForm.password && editForm.password.length < 8) {
        return setEditError('A nova senha precisa ter pelo menos 8 caracteres.')
      }
      if (!Object.keys(acessos_externos).length) {
        return setEditError('Marque pelo menos um sistema, ou exclua o usuário.')
      }
      setEditing(true)
      const { error } = await editarUsuarioExterno({
        id: editUser.id,
        nome: editForm.nome,
        ativo: editForm.ativo,
        password: editForm.password || undefined,
        acessos_externos,
      })
      setEditing(false)
      if (error) return setEditError(error)
    } else {
      // Usuário do Nerites: aqui só se mexe no acesso extra aos outros sistemas.
      // Nome, senha, cargo e hierarquia continuam só na gestão do próprio Nerites.
      setEditing(true)
      const { error } = await supabase
        .from('profiles')
        .update({ acessos_externos })
        .eq('id', editUser.id)
      setEditing(false)
      if (error) return setEditError(error.message)
    }

    setEditUser(null)
    await load()
  }

  async function handleExcluir() {
    if (!deleteUser) return
    setDeleteError(null)
    setDeleting(true)
    const { error } = await excluirUsuarioExterno(deleteUser.id)
    setDeleting(false)
    if (error) return setDeleteError(error)
    setDeleteUser(null)
    await load()
  }

  function renderAcessosFields(
    acessos: AcessosForm,
    onChange: (site: string, nivel: Nivel) => void,
  ) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span className="ui-field-label">Acesso aos outros sistemas</span>
        {SISTEMAS_EXTERNOS.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ flex: 1, fontSize: '.85rem' }}>{s.nome}</span>
            <Select
              value={acessos[s.id] ?? ''}
              onChange={(e) => onChange(s.id, e.target.value as Nivel)}
              options={[
                { value: 'editor', label: 'Editor' },
                { value: 'admin', label: 'Admin' },
              ]}
              placeholder="Sem acesso"
              style={{ minWidth: '140px' }}
              aria-label={`Acesso a ${s.nome}`}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="admin-users-page">
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Usuários</h1>
            <p className="page-subtitle">
              Lista todos os usuários e permite criar o cargo Visualizador do Nerites ou logins
              exclusivos para os outros sistemas.
            </p>
          </div>
          <div className="page-header-actions">
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus size={16} /> Novo login
            </Button>
          </div>
        </div>

        <Card>
          <div className="filters-grid" style={{ gridTemplateColumns: 'minmax(200px, 1fr) 220px' }}>
            <div className="search-field">
              <Search size={16} />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar usuário"
              />
            </div>
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              options={ROLE_FILTROS.map((r) => ({ value: r, label: labelRole(r) }))}
              placeholder="Todos os cargos"
              aria-label="Cargo"
            />
          </div>

          <div className="filter-results">
            <strong>{filtered.length}</strong> de {users.length} usuários
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <Spinner size={32} />
            </div>
          ) : loadError ? (
            <div className="alert alert-error">{loadError}</div>
          ) : !pageItems.length ? (
            <EmptyState
              title="Nenhum usuário encontrado"
              description="Ajuste a busca ou o filtro de cargo."
            />
          ) : (
            <>
              <div className="table-wrapper desktop-only">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>E-mail</th>
                      <th>Cargo</th>
                      <th>Acesso extra</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((u, index) => (
                      <tr key={u.id}>
                        <td>
                          <div className="person-cell">
                            <div className={`avatar-pill ${AVATARS[index % AVATARS.length]}`}>{initials(u.nome)}</div>
                            <strong style={{ fontSize: '.8rem', fontWeight: 650 }}>{u.nome}</strong>
                          </div>
                        </td>
                        <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{u.email}</span></td>
                        <td>
                          <span className={`badge ${u.role === 'externo' ? 'badge-neutral' : 'badge-warning'}`}>
                            {labelRole(u.role)}
                          </span>
                        </td>
                        <td><span style={{ color: '#6c788d', fontSize: '.78rem' }}>{resumoAcessos(u)}</span></td>
                        <td>
                          <span className={`badge ${u.ativo ? 'badge-success' : 'badge-danger'}`}>
                            {u.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                            <Button variant="secondary" size="sm" onClick={() => abrirEdicao(u)}>
                              Editar acesso
                            </Button>
                            {u.role === 'externo' && (
                              <Button variant="danger" size="sm" onClick={() => { setDeleteError(null); setDeleteUser(u) }}>
                                Excluir
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mobile-cards">
                {pageItems.map((u, index) => (
                  <div className="mobile-card" key={u.id}>
                    <div className="mobile-card-top">
                      <div className={`avatar-pill ${AVATARS[index % AVATARS.length]}`}>{initials(u.nome)}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ display: 'block', fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.nome}</strong>
                        <span style={{ display: 'block', color: '#8a95a7', fontSize: '.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
                      </div>
                      <span className={`badge ${u.ativo ? 'badge-success' : 'badge-danger'}`}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div style={{ margin: '.5rem 0', fontSize: '.78rem', color: '#6c788d' }}>
                      <div><strong style={{ color: '#182437' }}>{labelRole(u.role)}</strong></div>
                      <div>{resumoAcessos(u)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                      <Button variant="secondary" size="sm" onClick={() => abrirEdicao(u)} style={{ flex: 1 }}>
                        Editar acesso
                      </Button>
                      {u.role === 'externo' && (
                        <Button variant="danger" size="sm" onClick={() => { setDeleteError(null); setDeleteUser(u) }}>
                          Excluir
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          )}
        </Card>
      </div>

      <Modal
        open={createOpen}
        title="Novo login"
        description="Escolha Visualizador para acesso somente leitura às lideranças e fichas do Nerites."
        onClose={() => !creating && setCreateOpen(false)}
        onConfirm={handleCreate}
        confirmLabel="Criar login"
        loading={creating}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Select
            label="Acesso principal"
            value={createForm.cargo}
            onChange={(e) => setCreateForm((f) => ({ ...f, cargo: e.target.value as NovoCargo }))}
            options={[
              { value: 'visualizador', label: 'Sistema Nerites — Visualizador' },
              { value: 'externo', label: 'Acesso externo — outros sistemas' },
            ]}
          />
          {createForm.cargo === 'visualizador' && (
            <div className="alert alert-info">
              <strong>Cargo: Visualizador</strong><br />
              Poderá consultar lideranças e todas as fichas, sem criar, editar ou excluir.
            </div>
          )}
          <Input label="Nome completo" value={createForm.nome} onChange={(e) => setCreateForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome de quem vai acessar" />
          <Input label="E-mail de acesso" type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} placeholder="pessoa@exemplo.com" />
          <Input label="Senha" type="password" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mínimo 8 caracteres" />
          <Input label="Confirmar senha" type="password" value={createForm.confirm} onChange={(e) => setCreateForm((f) => ({ ...f, confirm: e.target.value }))} />
          {createForm.cargo === 'externo' && renderAcessosFields(createForm.acessos, (site, nivel) => setCreateForm((f) => ({ ...f, acessos: { ...f.acessos, [site]: nivel } })))}
          {createError && <div className="alert alert-error">{createError}</div>}
        </div>
      </Modal>

      <Modal
        open={Boolean(editUser)}
        title={editUser ? `Editar acesso · ${editUser.nome}` : 'Editar acesso'}
        description={
          editUser?.role === 'externo'
            ? 'Esse login só existe para os outros sistemas — pode editar nome, status e senha.'
            : 'Usuário do Sistema Nerites: aqui só se libera (ou tira) o acesso extra aos outros sistemas.'
        }
        onClose={() => !editing && setEditUser(null)}
        onConfirm={handleSalvarEdicao}
        confirmLabel="Salvar"
        loading={editing}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {editUser?.role === 'externo' && (
            <>
              <Input label="Nome completo" value={editForm.nome} onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem' }}>
                <input
                  type="checkbox"
                  checked={editForm.ativo}
                  onChange={(e) => setEditForm((f) => ({ ...f, ativo: e.target.checked }))}
                />
                Login ativo
              </label>
              <Input
                label="Nova senha (opcional)"
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Deixe em branco para manter a atual"
              />
            </>
          )}
          {renderAcessosFields(editForm.acessos, (site, nivel) => setEditForm((f) => ({ ...f, acessos: { ...f.acessos, [site]: nivel } })))}
          {editError && <div className="alert alert-error">{editError}</div>}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteUser)}
        title="Excluir login"
        description={deleteUser ? `Isso apaga o acesso de "${deleteUser.nome}" (${deleteUser.email}) para sempre. Não dá pra desfazer.` : ''}
        onClose={() => !deleting && setDeleteUser(null)}
        onConfirm={handleExcluir}
        confirmLabel="Excluir"
        confirmVariant="danger"
        loading={deleting}
      >
        {deleteError && <div className="alert alert-error">{deleteError}</div>}
      </Modal>
    </div>
  )
}
