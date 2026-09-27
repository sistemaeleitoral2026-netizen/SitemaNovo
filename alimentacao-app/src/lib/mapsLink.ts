export type MapsPoint = { lat: number; lng: number }

export const TITULO_MAPEAR_URL =
  'https://maps.google.com/maps?q=-2.5310959,-44.2911676+(My+Point)&z=14'

function validCoord(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function decodeMapsText(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value.replace(/\+/g, ' ')
  }
}

const PAIR =
  '(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)'

const PATTERNS = [
  new RegExp(`[?&]q=${PAIR}`, 'i'),
  new RegExp(`[?&]query=${PAIR}`, 'i'),
  new RegExp(`[?&]ll=${PAIR}`, 'i'),
  new RegExp(`@${PAIR}`),
  /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  new RegExp(`^${PAIR}$`),
]

export function parseGoogleMapsUrl(raw: string): MapsPoint | null {
  const text = raw.trim()
  if (!text) return null
  const decoded = decodeMapsText(text)
  for (const src of [text, decoded]) {
    for (const re of PATTERNS) {
      const match = src.match(re)
      if (!match) continue
      const lat = Number(match[1])
      const lng = Number(match[2])
      if (validCoord(lat, lng)) return { lat, lng }
    }
  }
  return null
}

export function formatMapsUrl(lat: number, lng: number) {
  return `https://maps.google.com/maps?q=${lat},${lng}+(My+Point)&z=14`
}

export function mapsLinkError(raw: string): string | null {
  if (!raw.trim()) return 'Cole o link do Google Maps.'
  if (!parseGoogleMapsUrl(raw)) return 'Esse link não tem um ponto no mapa. Cole o endereço do Google Maps.'
  return null
}
