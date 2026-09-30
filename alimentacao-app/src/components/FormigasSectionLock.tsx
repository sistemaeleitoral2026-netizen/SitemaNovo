import { Lock } from 'lucide-react'
import { formatDate } from '../lib/format'

/** Qualquer formiga pode editar — o “cadeado” só mostra quem preencheu por último. */
export function canEditFormigasSection(
  _ownerId?: string | null,
  _userId?: string | null,
  _unlocked?: boolean,
) {
  return true
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
      title={mine ? 'Você editou esta parte por último' : `Última edição: ${nome}`}
    >
      <Lock size={11} strokeWidth={2.5} aria-hidden />
      {mine ? 'Você' : nome}
    </span>
  )
}

/** Só informativo: quem preencheu por último (não bloqueia edição). */
export function FormigasSectionLock({
  ownerId,
  ownerNome,
  at,
  userId,
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

  return (
    <div className={`fl-stamp${mine ? '' : ' is-prior'}`}>
      <p>
        <Lock size={14} strokeWidth={2.25} aria-hidden />
        <span>
          {mine ? (
            'Você editou esta parte por último'
          ) : (
            <>
              Última edição:
              {' '}
              <strong>{nome}</strong>
              {' '}
              — qualquer formiga pode alterar
            </>
          )}
          {dia ? ` · ${dia}` : ''}
        </span>
      </p>
    </div>
  )
}

/** Mantido por compatibilidade — não usado (edição livre). */
export function FormigasUnlockConfirm({
  open,
  onCancel,
}: {
  open: boolean
  ownerNome?: string | null
  sectionLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div className="fl-unlock-overlay" role="presentation" onClick={onCancel}>
      <div className="fl-unlock-dialog" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <p>Edição liberada para todas as formigas.</p>
        <button type="button" className="fl-unlock-cancel" onClick={onCancel}>Fechar</button>
      </div>
    </div>
  )
}
