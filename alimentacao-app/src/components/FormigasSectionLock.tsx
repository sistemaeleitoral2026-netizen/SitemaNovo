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
  const nome = ownerNome?.trim() || 'Formiga'
  const dia = at ? formatDate(at) : null
  return (
    <p className={`fl-stamp${locked ? ' is-locked' : ''}`}>
      {locked ? <Lock size={13} strokeWidth={2.25} aria-hidden /> : null}
      <span>
        {locked
          ? `${nome} já registrou esta parte`
          : mine
            ? 'Você registrou esta parte'
            : `Registrado por ${nome}`}
        {dia ? ` · ${dia}` : ''}
      </span>
    </p>
  )
}
