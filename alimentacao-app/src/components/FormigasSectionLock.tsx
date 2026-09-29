import { useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { formatDate } from '../lib/format'

/** Liberada no UI só se a seção estiver vazia, for sua, ou após confirmar o cadeado. */
export function canEditFormigasSection(
  ownerId?: string | null,
  userId?: string | null,
  unlocked?: boolean,
) {
  if (!ownerId) return true
  if (userId && ownerId === userId) return true
  return Boolean(unlocked)
}

function ownerLabel(ownerNome?: string | null) {
  return ownerNome?.trim() || 'Formiga'
}

export function FormigasLockChip({
  ownerId,
  ownerNome,
  userId,
}: {
  ownerId?: string | null
  ownerNome?: string | null
  userId?: string | null
}) {
  if (!ownerId) return null
  const mine = Boolean(userId && ownerId === userId)
  const nome = ownerLabel(ownerNome)
  return (
    <span
      className={`fl-lock-chip${mine ? ' is-mine' : ''}`}
      title={mine ? 'Você editou esta parte' : `Já editado por ${nome}`}
    >
      <Lock size={11} strokeWidth={2.5} aria-hidden />
      {mine ? 'Você' : nome}
    </span>
  )
}

export function FormigasSectionLock({
  ownerId,
  ownerNome,
  at,
  userId,
  unlocked,
  onRequestUnlock,
}: {
  ownerId?: string | null
  ownerNome?: string | null
  at?: string | null
  userId?: string | null
  unlocked?: boolean
  onRequestUnlock?: () => void
}) {
  if (!ownerId) return null
  const mine = Boolean(userId && ownerId === userId)
  const nome = ownerLabel(ownerNome)
  const dia = at ? formatDate(at) : null
  const lockedForMe = !mine && !unlocked

  return (
    <div className={`fl-stamp${mine ? '' : ' is-prior'}${lockedForMe ? ' is-locked' : ''}${unlocked && !mine ? ' is-unlocked' : ''}`}>
      <p>
        <Lock size={14} strokeWidth={2.25} aria-hidden />
        <span>
          {mine ? (
            'Você editou esta parte'
          ) : unlocked ? (
            <>
              Liberada — altere e salve
              {' '}
              <strong>(era de {nome})</strong>
            </>
          ) : (
            <>
              Cadeado —
              {' '}
              <strong>{nome}</strong>
              {' '}
              preencheu esta parte
            </>
          )}
          {dia ? ` · ${dia}` : ''}
        </span>
      </p>
      {lockedForMe && onRequestUnlock ? (
        <button type="button" className="fl-unlock-btn" onClick={onRequestUnlock}>
          <Unlock size={14} strokeWidth={2.25} />
          Editar mesmo assim
        </button>
      ) : null}
    </div>
  )
}

/** Modal de confirmação antes de abrir seção de outra formiga. */
export function FormigasUnlockConfirm({
  open,
  ownerNome,
  sectionLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean
  ownerNome?: string | null
  sectionLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const [busy, setBusy] = useState(false)
  if (!open) return null
  const nome = ownerLabel(ownerNome)

  return (
    <div className="fl-unlock-overlay" role="presentation" onClick={onCancel}>
      <div
        className="fl-unlock-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fl-unlock-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fl-unlock-icon" aria-hidden>
          <Lock size={22} strokeWidth={2.25} />
        </div>
        <h2 id="fl-unlock-title">Você realmente quer editar?</h2>
        <p>
          A parte <strong>{sectionLabel}</strong> já foi preenchida por
          {' '}
          <strong>{nome}</strong>
          .
        </p>
        <p className="fl-unlock-note">
          Só liberar o cadeado <strong>não grava nada</strong>.
          Você precisa alterar e tocar em <strong>Salvar</strong>.
          Aí sim o registro passa a constar no seu nome.
        </p>
        <div className="fl-unlock-actions">
          <button type="button" className="fl-unlock-cancel" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="fl-unlock-confirm"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              onConfirm()
              setBusy(false)
            }}
          >
            Sim, liberar para editar
          </button>
        </div>
      </div>
    </div>
  )
}
