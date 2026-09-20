import { useEffect, useMemo, useRef, useState } from 'react'
import { hasRole, labelRole } from '../../lib/roles'
import type { Profile } from '../../types'
import type { PresenceUser } from '../../hooks/usePresence'

interface OnlinePresenceProps {
  profile: Profile | null
  online: PresenceUser[]
}

export function OnlinePresence({ profile, online }: OnlinePresenceProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const canSee = hasRole(profile, ['admin', 'diretoria'])

  const visible = useMemo(() => {
    if (!profile || !canSee) return []
    if (hasRole(profile, 'admin')) return online
    const dirId = profile.id
    return online.filter(
      (u) => u.user_id === dirId || u.diretoria_id === dirId,
    )
  }, [online, profile, canSee])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!canSee) return null

  const count = visible.length

  return (
    <div className="online-desktop-only" ref={rootRef}>
      <button
        type="button"
        className="online-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="header-live-dot" aria-hidden />
        <span>Online · {count}</span>
      </button>

      {open && (
        <div className="online-panel" role="listbox" aria-label="Pessoas online">
          {count === 0 ? (
            <p className="online-empty">Ninguém online no momento.</p>
          ) : (
            <ul className="online-list">
              {visible.map((u) => (
                <li key={u.user_id} className="online-row">
                  <span className="online-name">{u.nome}</span>
                  <span className="online-role">{labelRole(u.role)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
