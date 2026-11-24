import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { touchAdminPresence } from '../lib/adminPresenca'

const HEARTBEAT_MS = 60_000
const ACTIVITY_THROTTLE_MS = 30_000

export function PresenceHeartbeat() {
  const { profile } = useAuth()
  const location = useLocation()
  const lastTouch = useRef(0)

  useEffect(() => {
    if (!profile?.id) return
    const path = `${location.pathname}${location.search}`
    const touch = (force = false) => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (!force && now - lastTouch.current < ACTIVITY_THROTTLE_MS) return
      lastTouch.current = now
      void touchAdminPresence(profile.id, path)
    }
    touch(true)
    const interval = window.setInterval(() => touch(true), HEARTBEAT_MS)
    const onActivity = () => touch(false)
    const onVisibility = () => { if (document.visibilityState === 'visible') touch(true) }
    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [profile?.id, location.pathname, location.search])

  return null
}
