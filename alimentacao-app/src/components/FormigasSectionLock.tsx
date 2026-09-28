import { formatDate } from '../lib/format'

/** Qualquer formiga pode editar qualquer parte; o aviso só mostra quem preencheu. */
export function canEditFormigasSection(
  _ownerId?: string | null,
  _userId?: string | null,
  _canOverride?: boolean,
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
  canOverride?: boolean
}) {
  if (!ownerId) return null
  const mine = Boolean(userId && ownerId === userId)
  const nome = ownerLabel(ownerNome)
  return (
    <span
      className={`fl-lock-chip${mine ? ' is-mine' : ''}`}
      title={mine ? 'Você editou esta parte' : `Já editado por ${nome}`}
    >
      {mine ? 'Você' : nome}
    </span>
  )
}

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
  canOverride?: boolean
}) {
  if (!ownerId) return null
  const mine = Boolean(userId && ownerId === userId)
  const nome = ownerLabel(ownerNome)
  const dia = at ? formatDate(at) : null
  return (
    <p className={`fl-stamp${mine ? '' : ' is-prior'}`}>
      <span>
        {mine ? (
          'Você editou esta parte'
        ) : (
          <>
            Já editado por
            {' '}
            <strong>{nome}</strong>
          </>
        )}
        {dia ? ` · ${dia}` : ''}
      </span>
    </p>
  )
}
