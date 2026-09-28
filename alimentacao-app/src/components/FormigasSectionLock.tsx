import { Lock } from 'lucide-react'
import { formatDate } from '../lib/format'

export function canEditFormigasSection(
  ownerId: string | null | undefined,
  userId: string | null | undefined,
  canOverride: boolean,
) {
  if (!ownerId) return true
  if (canOverride) return true
  return Boolean(userId && ownerId === userId)
}

function ownerLabel(ownerNome?: string | null) {
  return ownerNome?.trim() || 'Formiga'
}

export function FormigasLockChip({
  ownerId,
  ownerNome,
  userId,
  canOverride,
}: {
  ownerId?: string | null
  ownerNome?: string | null
  userId?: string | null
  canOverride?: boolean
}) {
  if (!ownerId) return null
  const mine = Boolean(userId && ownerId === userId)
  const locked = !mine && !canOverride
  if (!locked) return null
  const nome = ownerLabel(ownerNome)
  return (
    <span className="fl-lock-chip" title={`${nome} preencheu esta parte`}>
      <Lock size={12} strokeWidth={2.4} aria-hidden />
      {nome}
    </span>
  )
}

export function FormigasSectionLock({
  ownerId,
  ownerNome,
  at,
  userId,
  canOverride,
}: {
  ownerId?: string | null
  ownerNome?: string | null
  at?: string | null
  userId?: string | null
  canOverride?: boolean
}) {
  if (!ownerId) return null
  const mine = Boolean(userId && ownerId === userId)
  const locked = !mine && !canOverride
  const nome = ownerLabel(ownerNome)
  const dia = at ? formatDate(at) : null
  return (
    <p className={`fl-stamp${locked ? ' is-locked' : ''}`}>
      {locked ? <Lock size={13} strokeWidth={2.25} aria-hidden /> : null}
      <span>
        {locked ? (
          <>
            <strong>{nome}</strong>
            {' '}
            preencheu esta parte
          </>
        ) : mine ? (
          'Você preencheu esta parte'
        ) : (
          <>
            Preenchido por
            {' '}
            <strong>{nome}</strong>
          </>
        )}
        {dia ? ` · ${dia}` : ''}
      </span>
    </p>
  )
}
