import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchTvDashboardStats,
  formatTvNumber,
  formatTvPct,
  speakTvProgress,
  stopTvSpeech,
  type TvDashboardStats,
} from '../lib/tvDashboard'

/** Poll mais lento: a TV só precisa de contagens; 45s basta e reduz carga no Postgres. */
const POLL_MS = 45_000
/** Padrão: 30 minutos entre narrações. */
const NARRATE_DEFAULT_MS = 30 * 60 * 1000
/** Mínimo no modo teste (?narra=): 60 segundos — evita repetir sem parar. */
const NARRATE_TEST_MIN_SEC = 60

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

function formatClock(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDateLong(d: Date) {
  return d.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function TvDashboardPage() {
  const [params] = useSearchParams()
  const metaParam = Number(params.get('meta') || 0)
  const narraSec = Number(params.get('narra') || 0)
  const narrateMs = narraSec > 0
    ? Math.max(NARRATE_TEST_MIN_SEC, narraSec) * 1000
    : NARRATE_DEFAULT_MS
  const now = useClock()

  const [stats, setStats] = useState<TvDashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [pulse, setPulse] = useState(false)

  const prevTotal = useRef<number | null>(null)
  const soundOnRef = useRef(false)
  const statsRef = useRef<TvDashboardStats | null>(null)

  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])

  useEffect(() => {
    statsRef.current = stats
  }, [stats])

  async function refresh() {
    try {
      const next = await fetchTvDashboardStats(metaParam > 0 ? metaParam : undefined)
      setStats(next)
      setLive(true)
      setError(null)

      if (prevTotal.current != null && next.total !== prevTotal.current) {
        setPulse(true)
        window.setTimeout(() => setPulse(false), 900)
      }
      prevTotal.current = next.total
    } catch (e) {
      setLive(false)
      setError(e instanceof Error ? e.message : 'Falha ao atualizar o painel.')
    }
  }

  useEffect(() => {
    void refresh()
    const poll = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(poll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaParam])

  // Atualiza ao voltar o foco (sem Realtime — conexão persistente consome RAM no nano)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaParam])

  // Agenda próxima narração — NÃO fala de novo na hora (o botão já fala 1x)
  useEffect(() => {
    if (!soundOn) return
    const id = window.setInterval(() => {
      const s = statsRef.current
      if (!s || !soundOnRef.current) return
      speakTvProgress(s.total, s.meta)
    }, narrateMs)
    return () => window.clearInterval(id)
  }, [soundOn, narrateMs])

  // Pré-carrega vozes do Google/Chrome
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const warm = () => { window.speechSynthesis.getVoices() }
    warm()
    window.speechSynthesis.addEventListener('voiceschanged', warm)
    // Workaround Chrome: fila trava em "paused"
    const keepAlive = window.setInterval(() => {
      try {
        if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
          window.speechSynthesis.resume()
        }
      } catch {
        /* ignore */
      }
    }, 5_000)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', warm)
      window.clearInterval(keepAlive)
    }
  }, [])

  const total = stats?.total ?? 0
  const meta = stats?.meta ?? 6000
  const hoje = stats?.hoje ?? 0
  const restante = Math.max(0, meta - total)
  const pctLabel = formatTvPct(total, meta)
  const pctWidth = Math.min(100, (total / Math.max(1, meta)) * 100)

  const headline = useMemo(() => formatTvNumber(total), [total])

  function enableSound() {
    setSoundOn(true)
    const s = statsRef.current
    if (s) {
      // fala só uma vez ao ativar
      window.setTimeout(() => speakTvProgress(s.total, s.meta), 100)
    }
  }

  return (
    <div className="tv-dash">
      <div className="tv-dash-bg" aria-hidden />
      <div className="tv-dash-veil" aria-hidden />

      <header className="tv-dash-top">
        <div className={`tv-dash-live${live ? ' is-on' : ''}`}>
          <i />
          <span>Ao vivo</span>
        </div>
        <div className="tv-dash-clock">
          <strong>{formatClock(now)}</strong>
          <em>{formatDateLong(now)}</em>
        </div>
      </header>

      <main className="tv-dash-main">
        <section className={`tv-dash-hero${pulse ? ' is-pulse' : ''}`}>
          <h1>Cadastros em Tempo Real</h1>
          <p className="tv-dash-sub">
            Acompanhe em tempo real a evolução dos cadastros realizados.
          </p>

          <div className="tv-dash-hero-metric">
            <strong className="tv-dash-big">{headline}</strong>
            <span>CADASTROS REALIZADOS</span>
          </div>

          <div className="tv-dash-goal-row">
            <span>
              Objetivo: <b>{formatTvNumber(meta)}</b>
            </span>
          </div>

          <div className="tv-dash-bar-wrap">
            <div className="tv-dash-bar" aria-hidden>
              <i style={{ width: `${pctWidth}%` }} />
            </div>
            <em>{pctLabel}</em>
          </div>

          <p className="tv-dash-rest">
            {restante === 0
              ? 'Meta alcançada'
              : `Faltam ${formatTvNumber(restante)} para o objetivo`}
          </p>

          <p className="tv-dash-foot">Atualização automática a cada mudança</p>
        </section>

        <aside className="tv-dash-side">
          <article className="tv-dash-card">
            <span>Cadastros hoje</span>
            <strong>{formatTvNumber(hoje)}</strong>
            <em className="tone-up">cadastrados neste dia</em>
          </article>
          <article className="tv-dash-card">
            <span>Meta</span>
            <strong>{formatTvNumber(meta)}</strong>
            <em>Cadastros previstos</em>
          </article>
          <article className="tv-dash-card">
            <span>Progresso</span>
            <strong>{pctLabel}</strong>
            <em>da meta alcançada</em>
          </article>
        </aside>
      </main>

      {error && <div className="tv-dash-error">{error}</div>}

      {!soundOn && (
        <button type="button" className="tv-dash-sound" onClick={enableSound}>
          Ativar narração {narraSec > 0 ? `(teste a cada ${Math.max(NARRATE_TEST_MIN_SEC, narraSec)}s)` : '(a cada 30 min)'}
        </button>
      )}

      {soundOn && (
        <button
          type="button"
          className="tv-dash-sound is-on"
          onClick={() => {
            setSoundOn(false)
            stopTvSpeech()
          }}
        >
          Narração ativa · toque para pausar
        </button>
      )}
    </div>
  )
}
