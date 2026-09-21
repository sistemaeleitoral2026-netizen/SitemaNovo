import { supabase } from './supabase'
import { DEFAULT_META, getMetaFichas } from './meta'

export type TvDashboardStats = {
  total: number
  hoje: number
  meta: number
  updated_at?: string
}

export async function fetchTvDashboardStats(metaOverride?: number): Promise<TvDashboardStats> {
  const { data, error } = await supabase.rpc('tv_dashboard_stats')
  if (error) throw new Error(error.message)

  const raw = (data ?? {}) as Record<string, unknown>
  const total = Math.max(0, Math.floor(Number(raw.total) || 0))
  const hoje = Math.max(0, Math.floor(Number(raw.hoje) || 0))
  const fromDb = Math.max(1, Math.floor(Number(raw.meta) || DEFAULT_META))
  const local = getMetaFichas()
  const meta = Math.max(
    1,
    Math.floor(metaOverride && metaOverride > 0 ? metaOverride : (fromDb || local || DEFAULT_META)),
  )

  return {
    total,
    hoje,
    meta,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
  }
}

export async function persistMetaFichasRemote(value: number): Promise<{ error: string | null }> {
  const n = Math.max(1, Math.round(Number(value) || DEFAULT_META))
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: 'meta_fichas',
      value: n,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  return { error: error?.message ?? null }
}

export function formatTvNumber(n: number) {
  return n.toLocaleString('pt-BR')
}

export function formatTvPct(atual: number, meta: number) {
  const safeMeta = Math.max(1, meta)
  const pct = Math.min(100, (Math.max(0, atual) / safeMeta) * 100)
  return pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}

/** Número sem ponto/vírgula — o TTS do Chrome lê "2.421" errado. */
function speakNumber(n: number) {
  return String(Math.max(0, Math.floor(n)))
}

let speakBusy = false

function pickPtVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => /google/i.test(v.name) && /pt-BR/i.test(v.lang))
    || voices.find((v) => /microsoft/i.test(v.name) && /pt-BR/i.test(v.lang))
    || voices.find((v) => /pt-BR/i.test(v.lang))
    || voices.find((v) => /^pt/i.test(v.lang))
    || null
  )
}

/**
 * Narração curta e estável (sem % decimal — isso quebrava a voz).
 * Ignora novo pedido se ainda estiver falando.
 */
export function speakTvProgress(total: number, meta: number) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  if (speakBusy || window.speechSynthesis.speaking) return false

  const restante = Math.max(0, meta - total)
  const text =
    restante === 0
      ? `Atenção. Meta alcançada. Já temos ${speakNumber(total)} cadastros realizados. O objetivo era ${speakNumber(meta)}.`
      : `Atenção. Já temos ${speakNumber(total)} cadastros realizados. Ainda faltam ${speakNumber(restante)} para chegar ao objetivo de ${speakNumber(meta)}.`

  const run = () => {
    if (speakBusy) return
    speakBusy = true
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }

    window.setTimeout(() => {
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = 'pt-BR'
      utter.rate = 1
      utter.pitch = 1
      utter.volume = 1
      const voice = pickPtVoice()
      if (voice) utter.voice = voice

      const release = () => {
        speakBusy = false
      }
      utter.onend = release
      utter.onerror = release

      try {
        window.speechSynthesis.speak(utter)
        // Chrome às vezes "pausa" a fila — empurra resume
        window.setTimeout(() => {
          try {
            if (window.speechSynthesis.paused) window.speechSynthesis.resume()
          } catch {
            /* ignore */
          }
        }, 250)
      } catch {
        speakBusy = false
      }
    }, 60)
  }

  if (window.speechSynthesis.getVoices().length === 0) {
    const onVoices = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoices)
      run()
    }
    window.speechSynthesis.addEventListener('voiceschanged', onVoices)
    // fallback se voiceschanged não disparar
    window.setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoices)
      run()
    }, 400)
  } else {
    run()
  }

  return true
}

export function stopTvSpeech() {
  speakBusy = false
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
}
