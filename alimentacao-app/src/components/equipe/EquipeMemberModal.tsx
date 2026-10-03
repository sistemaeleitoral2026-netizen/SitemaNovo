import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Copy, Lock, Search, Trash2, X } from 'lucide-react'
import { Spinner } from '../ui/Spinner'
import type { UserRole } from '../../types'
import { ATRIBUICAO_OPTIONS, labelRole } from '../../lib/roles'

export type MemberKind = 'operador' | 'mobilizador' | 'administrativo' | 'auxiliar'

type Option = { value: string; label: string }

export type MemberFormState = {
  nome: string
  email: string
  password: string
  confirm: string
  diretoria_id: string
  coordenador_id?: string
  lider_id?: string
  lider_ids?: string[]
  ativo: boolean
  extra_roles: UserRole[]
}

interface EquipeMemberModalProps {
  open: boolean
  mode: 'create' | 'edit'
  kind: MemberKind
  form: MemberFormState
  showDiretoria: boolean
  diretoriaLocked?: boolean
  /** Auxiliar: mostra select de coordenador (admin/diretoria). */
  showCoordenador?: boolean
  diretorias: Option[]
  coordOptions?: Option[]
  liderOptions?: Option[]
  /** Auxiliar: lideranças multi-select (cards). */
  liderMultiOptions?: Option[]
  allowAdminRole: boolean
  error?: string | null
  saving?: boolean
  onClose: () => void
  onSave: () => void
  onChange: (patch: Partial<MemberFormState>) => void
  onDeactivate?: () => void
}

function initials(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function firstName(nome: string) {
  return nome.trim().split(/\s+/)[0] || 'este membro'
}

function toggleExtra(
  current: UserRole[],
  value: UserRole,
  primary: UserRole,
  allowAdmin: boolean,
): UserRole[] {
  if (value === primary) return current
  if (!allowAdmin && value === 'administrativo') return current
  if (current.includes(value)) return current.filter((r) => r !== value)
  return [...current, value]
}

function toggleLider(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
}

export function EquipeMemberModal({
  open,
  mode,
  kind,
  form,
  showDiretoria,
  diretoriaLocked,
  showCoordenador = false,
  diretorias,
  coordOptions = [],
  liderOptions = [],
  liderMultiOptions = [],
  allowAdminRole,
  error,
  saving,
  onClose,
  onSave,
  onChange,
  onDeactivate,
}: EquipeMemberModalProps) {
  const [pwdOpen, setPwdOpen] = useState(mode === 'create')
  const [copied, setCopied] = useState(false)
  const [liderSearch, setLiderSearch] = useState('')
  /** Selecionadas ficam fora da lista de escolha (não atrapalham). */
  const [showSelectedLideres, setShowSelectedLideres] = useState(false)

  useEffect(() => {
    if (open) {
      setPwdOpen(mode === 'create')
      setLiderSearch('')
      setShowSelectedLideres(false)
    }
  }, [open, mode])

  const liderIds = form.lider_ids ?? []
  const selectedSet = useMemo(() => new Set(liderIds), [liderIds])

  const selectedLideres = useMemo(
    () => liderMultiOptions.filter((l) => selectedSet.has(l.value)),
    [liderMultiOptions, selectedSet],
  )

  const availableLideres = useMemo(() => {
    const q = liderSearch.trim().toLowerCase()
    return liderMultiOptions.filter((l) => {
      if (selectedSet.has(l.value)) return false
      if (!q) return true
      return l.label.toLowerCase().includes(q)
    })
  }, [liderMultiOptions, selectedSet, liderSearch])

  if (!open) return null

  const isEdit = mode === 'edit'
  const isAuxiliar = kind === 'auxiliar'
  const roleLabel = labelRole(kind)
  const totalLideres = liderMultiOptions.length
  const selectedCount = liderIds.length
  const roleOptions = ATRIBUICAO_OPTIONS.filter((opt) => {
    if (opt.value === kind) return true
    if (!allowAdminRole && opt.value === 'administrativo') return false
    return true
  })

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(form.email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className="eqm-overlay" onClick={() => !saving && onClose()} aria-hidden />
      <div className="eqm-modal" role="dialog" aria-modal aria-labelledby="eqm-title">
        <header className="eqm-head">
          <div className="eqm-avatar-wrap">
            <div className="eqm-avatar">{initials(form.nome)}</div>
            <span className={`eqm-avatar-dot${form.ativo ? ' is-on' : ''}`} />
          </div>
          <div className="eqm-head-text">
            <div className="eqm-title-row">
              <h2 id="eqm-title">
                {isAuxiliar
                  ? (isEdit ? 'Editar auxiliar' : 'Novo auxiliar')
                  : (isEdit ? 'Editar Membro da Equipe' : 'Novo Membro da Equipe')}
              </h2>
              <span className="eqm-role-badge">{roleLabel}</span>
            </div>
            <p className="eqm-sub">
              {isAuxiliar
                ? (isEdit
                  ? <>Atualize acesso e lideranças de <strong>{firstName(form.nome)}</strong></>
                  : <>Cadastre o auxiliar e marque as lideranças que ele lança na votação</>)
                : (isEdit
                  ? <>Atualize diretoria, dados de acesso e permissões de <strong>{firstName(form.nome)}</strong></>
                  : <>Preencha os dados e as atribuições do novo membro</>)}
            </p>
          </div>
          <button type="button" className="eqm-close" onClick={onClose} disabled={Boolean(saving)} aria-label="Fechar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="eqm-body">
          <section className="eqm-section">
            <h3 className="eqm-section-title">Informações principais</h3>
            <div className="eqm-grid">
              <div className="eqm-field">
                <label htmlFor="eqm-nome">
                  Nome completo <span className="eqm-req">*</span>
                </label>
                <input
                  id="eqm-nome"
                  className="eqm-input"
                  value={form.nome}
                  onChange={(e) => onChange({ nome: e.target.value })}
                  autoComplete="name"
                />
              </div>

              <div className="eqm-field">
                <label htmlFor="eqm-status">Status no sistema</label>
                <div className="eqm-select-wrap">
                  <select
                    id="eqm-status"
                    className="eqm-input eqm-select"
                    value={form.ativo ? '1' : '0'}
                    onChange={(e) => onChange({ ativo: e.target.value === '1' })}
                    disabled={!isEdit}
                  >
                    <option value="1">Ativo</option>
                    <option value="0">Inativo</option>
                  </select>
                  <span className={`eqm-status-dot${form.ativo ? ' is-on' : ''}`} />
                </div>
              </div>

              {showDiretoria && kind !== 'administrativo' && kind !== 'auxiliar' && (
                <div className="eqm-field">
                  <label htmlFor="eqm-dir">
                    Diretoria vinculada <span className="eqm-req">*</span>
                  </label>
                  <select
                    id="eqm-dir"
                    className="eqm-input eqm-select"
                    value={form.diretoria_id}
                    disabled={diretoriaLocked}
                    onChange={(e) => onChange({
                      diretoria_id: e.target.value,
                      coordenador_id: '',
                      lider_id: '',
                    })}
                  >
                    <option value="">Selecione</option>
                    {diretorias.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {isAuxiliar && showCoordenador && (
                <div className="eqm-field eqm-field-full">
                  <label htmlFor="eqm-coord-aux">
                    Coordenador <span className="eqm-req">*</span>
                  </label>
                  <select
                    id="eqm-coord-aux"
                    className="eqm-input eqm-select"
                    value={form.coordenador_id ?? ''}
                    onChange={(e) => onChange({
                      coordenador_id: e.target.value,
                      lider_ids: [],
                    })}
                  >
                    <option value="">Selecione</option>
                    {coordOptions.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="eqm-field">
                <label htmlFor="eqm-email" className="eqm-label-row">
                  <span>E-mail institucional</span>
                  {isEdit && (
                    <span className="eqm-login-tag">
                      <Lock size={11} strokeWidth={2} /> Login principal
                    </span>
                  )}
                </label>
                <div className="eqm-email-wrap">
                  <input
                    id="eqm-email"
                    className="eqm-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => onChange({ email: e.target.value })}
                    disabled={isEdit}
                    autoComplete="email"
                  />
                  {isEdit && (
                    <button type="button" className="eqm-copy" onClick={() => void copyEmail()} title="Copiar e-mail">
                      {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.75} />}
                    </button>
                  )}
                </div>
              </div>

              {kind === 'operador' && (
                <>
                  <div className="eqm-field">
                    <label htmlFor="eqm-coord">Coordenador</label>
                    <select
                      id="eqm-coord"
                      className="eqm-input eqm-select"
                      value={form.coordenador_id ?? ''}
                      onChange={(e) => onChange({ coordenador_id: e.target.value, lider_id: '' })}
                    >
                      <option value="">Opcional</option>
                      {coordOptions.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="eqm-field">
                    <label htmlFor="eqm-lider">Liderança</label>
                    <select
                      id="eqm-lider"
                      className="eqm-input eqm-select"
                      value={form.lider_id ?? ''}
                      onChange={(e) => onChange({ lider_id: e.target.value })}
                    >
                      <option value="">Opcional</option>
                      {liderOptions.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </section>

          {isAuxiliar && (
            <section className="eqm-section">
              <div className="eqm-section-head">
                <h3 className="eqm-section-title">Lideranças da votação</h3>
                <span className={`eqm-lider-count${selectedCount ? ' has-sel' : ''}`}>
                  {selectedCount
                    ? `${selectedCount} de ${totalLideres} selecionada${selectedCount === 1 ? '' : 's'}`
                    : `0 de ${totalLideres}`}
                </span>
              </div>
              <p className="eqm-hint">
                Toque para escolher. As marcadas saem da lista e ficam em “Selecionadas”, pra não atrapalhar.
              </p>

              {selectedCount > 0 && (
                <div className="eqm-lider-selected">
                  <button
                    type="button"
                    className="eqm-lider-selected-toggle"
                    onClick={() => setShowSelectedLideres((v) => !v)}
                    aria-expanded={showSelectedLideres}
                  >
                    <span>
                      <Check size={14} strokeWidth={2.4} />
                      <strong>{selectedCount}</strong> selecionada{selectedCount === 1 ? '' : 's'}
                      <em>(ocultas na lista)</em>
                    </span>
                    {showSelectedLideres ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {showSelectedLideres && (
                    <div className="eqm-lider-chips">
                      {selectedLideres.map((l) => (
                        <button
                          key={l.value}
                          type="button"
                          className="eqm-lider-chip"
                          title="Remover desta seleção"
                          onClick={() => onChange({ lider_ids: toggleLider(liderIds, l.value) })}
                        >
                          <span>{l.label}</span>
                          <X size={13} strokeWidth={2.2} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {totalLideres > 4 && availableLideres.length > 0 && (
                <div className="eqm-lider-search">
                  <Search size={15} aria-hidden />
                  <input
                    value={liderSearch}
                    onChange={(e) => setLiderSearch(e.target.value)}
                    placeholder="Buscar liderança disponível…"
                    autoComplete="off"
                  />
                </div>
              )}

              {!totalLideres ? (
                <p className="eqm-hint" style={{ marginTop: 0 }}>
                  Nenhuma liderança nesta coordenação. Cadastre lideranças antes.
                </p>
              ) : !availableLideres.length ? (
                <p className="eqm-lider-empty">
                  {selectedCount === totalLideres
                    ? 'Todas as lideranças já foram selecionadas.'
                    : 'Nenhuma liderança disponível com esse nome.'}
                </p>
              ) : (
                <div className="eqm-lideres">
                  {availableLideres.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      className="eqm-lider-card"
                      onClick={() => onChange({ lider_ids: toggleLider(liderIds, l.value) })}
                    >
                      <span className="eqm-check" />
                      <strong>{l.label}</strong>
                    </button>
                  ))}
                </div>
              )}

              {totalLideres > 0 && (
                <div className="eqm-lider-actions">
                  <button
                    type="button"
                    className="eqm-btn-ghost eqm-btn-sm"
                    onClick={() => {
                      onChange({ lider_ids: liderMultiOptions.map((l) => l.value) })
                      setShowSelectedLideres(true)
                    }}
                    disabled={selectedCount === totalLideres}
                  >
                    Marcar todas
                  </button>
                  <button
                    type="button"
                    className="eqm-btn-ghost eqm-btn-sm"
                    onClick={() => {
                      onChange({ lider_ids: [] })
                      setShowSelectedLideres(false)
                    }}
                    disabled={!selectedCount}
                  >
                    Limpar seleção
                  </button>
                </div>
              )}
            </section>
          )}

          {!isAuxiliar && (
            <section className="eqm-section">
              <div className="eqm-section-head">
                <h3 className="eqm-section-title">Atribuições e cargos</h3>
                <span className="eqm-section-note">Libera módulos no menu lateral</span>
              </div>
              <p className="eqm-hint">
                {kind === 'administrativo'
                  ? 'Demandas já vem com o cargo. Marque Formiga se a pessoa também lança Formigas (ex.: Aianka).'
                  : 'Selecione as atribuições ativas deste usuário no sistema:'}
              </p>
              <div className="eqm-roles">
                {roleOptions.map((opt) => {
                  const isPrimary = opt.value === kind
                  const checked = isPrimary || form.extra_roles.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`eqm-role-card${checked ? ' is-on' : ''}${isPrimary ? ' is-base' : ''}`}
                      disabled={isPrimary}
                      onClick={() => onChange({
                        extra_roles: toggleExtra(form.extra_roles, opt.value, kind, allowAdminRole),
                      })}
                    >
                      <span className={`eqm-check${checked ? ' is-on' : ''}`}>
                        {checked ? <Check size={12} strokeWidth={2.5} /> : null}
                      </span>
                      <strong>{opt.label}</strong>
                      {isPrimary && <em className="eqm-base-tag">Base</em>}
                      <span>{isPrimary ? 'Cargo principal ativo' : opt.hint}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          <section className="eqm-section">
            <button
              type="button"
              className={`eqm-pwd-toggle${pwdOpen ? ' is-open' : ''}`}
              onClick={() => setPwdOpen((v) => !v)}
            >
              <div>
                <strong>Segurança e redefinição de senha</strong>
                <span>
                  {isEdit
                    ? 'Deixe recolhido caso não queira alterar a senha atual'
                    : 'Defina a senha de acesso deste membro'}
                </span>
              </div>
              <em>
                {pwdOpen ? 'Ocultar' : isEdit ? 'Alterar senha' : 'Definir senha'}
                <ChevronDown size={14} strokeWidth={2} />
              </em>
            </button>
            {pwdOpen && (
              <div className="eqm-pwd-fields">
                <div className="eqm-field">
                  <label htmlFor="eqm-pass">{isEdit ? 'Nova senha' : 'Senha'} <span className="eqm-req">*</span></label>
                  <input
                    id="eqm-pass"
                    className="eqm-input"
                    type="password"
                    value={form.password}
                    onChange={(e) => onChange({ password: e.target.value })}
                    placeholder={isEdit ? 'Mínimo 8 caracteres' : undefined}
                    autoComplete="new-password"
                  />
                </div>
                <div className="eqm-field">
                  <label htmlFor="eqm-confirm">Confirmar senha <span className="eqm-req">*</span></label>
                  <input
                    id="eqm-confirm"
                    className="eqm-input"
                    type="password"
                    value={form.confirm}
                    onChange={(e) => onChange({ confirm: e.target.value })}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}
          </section>

          {error && <div className="alert alert-error">{error}</div>}
        </div>

        <footer className="eqm-foot">
          {isEdit && onDeactivate ? (
            <button type="button" className="eqm-deactivate" onClick={onDeactivate} disabled={Boolean(saving) || !form.ativo}>
              <Trash2 size={14} strokeWidth={1.75} />
              Desativar membro
            </button>
          ) : (
            <span />
          )}
          <div className="eqm-foot-actions">
            <button type="button" className="eqm-btn-ghost" onClick={onClose} disabled={Boolean(saving)}>
              Cancelar
            </button>
            <button type="button" className="eqm-btn-primary" onClick={onSave} disabled={Boolean(saving)}>
              {saving ? <Spinner size={16} /> : <Check size={15} strokeWidth={2.25} />}
              {isEdit ? 'Salvar alterações' : 'Criar membro'}
            </button>
          </div>
        </footer>
      </div>
    </>
  )
}
