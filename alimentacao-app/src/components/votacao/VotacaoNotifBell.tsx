import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { hasRole } from '../../lib/roles'
import {
  countNotifVotacaoNaoLidas,
  fetchNotifVotacao,
  fetchVotacaoNotifVistoEm,
  marcarVotacaoNotifVisto,
  type VotacaoNotif,
} from '../../lib/votacaoNotif'

const POLL_MS = 60_000
const SOUND_SRC = '/sounds/toque-notificacao.mp3'

function fmtWhen(iso: string) {
  try {
    const d = new Date(iso)
    const now = new Date()
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    if (d.toDateString() === now.toDateString()) return `Hoje, ${hh}:${mi}`
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm} ${hh}:${mi}`
  } catch {
    return ''
  }
}

function playToque() {
  try {
    const audio = new Audio(SOUND_SRC)
    audio.volume = 0.85
    void audio.play().catch(() => { /* autoplay bloqueado */ })
  } catch {
    /* ignore */
  }
}

export function VotacaoNotifBell() {
  const { profile } = useAuth()
  const canSee = hasRole(profile, ['admin', 'diretoria'])
  const isAdmin = hasRole(profile, 'admin')
  const diretoriaId = hasRole(profile, 'diretoria') ? profile?.id ?? null : null

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<VotacaoNotif[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const baselineRef = useRef(false)
  const lastUnreadRef = useRef(0)
  /** undefined = ainda não carregou; null = nunca marcou como visto */
  const vistoEmRef = useRef<string | null | undefined>(undefined)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async (opts?: { playSound?: boolean }) => {
    if (!profile?.id || !canSee) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      if (vistoEmRef.current === undefined) {
        vistoEmRef.current = await fetchVotacaoNotifVistoEm(profile.id)
      }
      const [list, count] = await Promise.all([
        fetchNotifVotacao({
          isAdmin,
          diretoriaId: isAdmin ? null : diretoriaId,
          limit: 20,
        }),
        countNotifVotacaoNaoLidas({
          vistoEm: vistoEmRef.current,
          isAdmin,
          diretoriaId: isAdmin ? null : diretoriaId,
        }),
      ])
      setItems(list)
      setUnread(count)
      if (opts?.playSound !== false && baselineRef.current && count > lastUnreadRef.current) {
        playToque()
      }
      lastUnreadRef.current = count
      baselineRef.current = true
    } catch {
      /* silencioso — SQL pode não ter rodado */
    }
  }, [profile?.id, canSee, isAdmin, diretoriaId])

  useEffect(() => {
    if (!canSee) return
    void refresh({ playSound: false })
    const id = window.setInterval(() => void refresh(), POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [canSee, refresh])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next && profile?.id) {
      setLoading(true)
      try {
        await refresh({ playSound: false })
        const agora = await marcarVotacaoNotifVisto(profile.id)
        vistoEmRef.current = agora
        setUnread(0)
        lastUnreadRef.current = 0
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    }
  }

  if (!canSee) return null

  return (
    <div className="vot-notif" ref={panelRef}>
      <button
        type="button"
        className={`vot-notif-btn${open ? ' is-open' : ''}${unread ? ' has-unread' : ''}`}
        onClick={() => void toggleOpen()}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Quem votou (lançamentos dos auxiliares)"
      >
        <span className="vot-notif-label">Quem votou</span>
        {unread > 0 ? (
          <span className="vot-notif-badge" aria-label={`${unread} novos`}>
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open && (
        <div className="vot-notif-panel" role="dialog" aria-label="Lançamentos dos auxiliares">
          <div className="vot-notif-head">
            <strong>Quem votou</strong>
            <span>Auxiliares · últimos lançamentos</span>
          </div>
          {loading && !items.length ? (
            <p className="vot-notif-empty">Carregando…</p>
          ) : !items.length ? (
            <p className="vot-notif-empty">
              Nenhum voto lançado por auxiliar ainda.
              {` `}
              Se acabou de configurar, rode o SQL votacao_notif_run.sql.
            </p>
          ) : (
            <ul className="vot-notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    to={`/votacao/lancar?edit=${encodeURIComponent(n.cadastro_id)}`}
                    className="vot-notif-item"
                    onClick={() => setOpen(false)}
                  >
                    <strong className="vot-notif-eleitor">{n.eleitor_nome}</strong>
                    <span className="vot-notif-meta">
                      Auxiliar: {n.auxiliar_nome || '—'}
                      {n.lider ? ` · ${n.lider}` : ''}
                    </span>
                    <time className="vot-notif-when">{fmtWhen(n.created_at)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/votacao/historico" className="vot-notif-footer" onClick={() => setOpen(false)}>
            Abrir histórico
          </Link>
        </div>
      )}
    </div>
  )
}
