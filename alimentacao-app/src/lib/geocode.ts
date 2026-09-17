import { normalizeCep, normalizeZona } from './normalize'

export interface GeocodeResult {
  lat: number
  lng: number
}

interface ViaCepResponse {
  erro?: boolean
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
}

/** Coordenadas de referência por zona eleitoral no Maranhão (centros aproximados). */
const ZONA_COORDS_MA: Record<string, GeocodeResult> = {
  '001': { lat: -2.5297, lng: -44.3028 },
  '002': { lat: -2.5450, lng: -44.2800 },
  '003': { lat: -2.5600, lng: -44.2600 },
  '010': { lat: -2.5100, lng: -44.2900 },
  '020': { lat: -2.5000, lng: -44.3200 },
  '030': { lat: -2.4800, lng: -44.2500 },
  '040': { lat: -2.5500, lng: -44.3500 },
  '050': { lat: -2.5800, lng: -44.3000 },
  '060': { lat: -2.5200, lng: -44.3600 },
  '070': { lat: -2.4900, lng: -44.2700 },
  '080': { lat: -2.5400, lng: -44.2400 },
  '089': { lat: -2.5307, lng: -44.3068 }, // São Luís (maior volume)
  '090': { lat: -2.5700, lng: -44.2200 },
  '100': { lat: -2.4500, lng: -44.4000 },
  '110': { lat: -4.8600, lng: -43.3600 }, // Caxias
  '120': { lat: -5.5200, lng: -45.2500 }, // Balsas região
  '130': { lat: -2.5300, lng: -44.1000 },
  '140': { lat: -1.4500, lng: -45.4500 }, // Pinheiro / Baixada
  '150': { lat: -5.0900, lng: -42.8200 }, // Teresina border / Imperatriz area approx
  '160': { lat: -5.5200, lng: -47.4800 }, // Imperatriz
  '170': { lat: -4.2500, lng: -44.7800 },
  '180': { lat: -3.2700, lng: -45.0000 },
  '190': { lat: -2.9000, lng: -41.8000 },
  '200': { lat: -7.5300, lng: -46.0400 },
}

const SAO_LUIS = { lat: -2.5307, lng: -44.3068 }

function fallbackZonaCoords(zona: string): GeocodeResult {
  const n = Number.parseInt(zona.replace(/\D/g, ''), 10) || 0
  const angle = ((n % 36) * 10 * Math.PI) / 180
  const dist = 0.12 + (n % 25) * 0.05
  return {
    lat: Number((SAO_LUIS.lat + Math.cos(angle) * dist).toFixed(6)),
    lng: Number((SAO_LUIS.lng + Math.sin(angle) * dist).toFixed(6)),
  }
}

/** Localiza a zona eleitoral no Maranhão (tabela + fallback estável). */
export function coordsFromZona(zona: string): GeocodeResult | null {
  const z = normalizeZona(zona)
  if (!z) return null
  if (ZONA_COORDS_MA[z]) return ZONA_COORDS_MA[z]
  // tenta sem zeros à esquerda
  const bare = String(Number.parseInt(z, 10))
  if (bare !== z && ZONA_COORDS_MA[bare.padStart(3, '0')]) {
    return ZONA_COORDS_MA[bare.padStart(3, '0')]
  }
  return fallbackZonaCoords(z)
}

export async function geocodeFromZona(zona: string): Promise<GeocodeResult | null> {
  const local = coordsFromZona(zona)
  if (local) return local

  const z = normalizeZona(zona)
  if (!z) return null

  try {
    const query = encodeURIComponent(`Zona Eleitoral ${z}, Maranhão, Brasil`)
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`,
      { headers: { 'Accept-Language': 'pt-BR' } },
    )
    if (!nomRes.ok) return fallbackZonaCoords(z)

    const nomData = (await nomRes.json()) as Array<{ lat: string; lon: string }>
    if (!nomData.length) return fallbackZonaCoords(z)

    const lat = parseFloat(nomData[0].lat)
    const lng = parseFloat(nomData[0].lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return fallbackZonaCoords(z)
    return { lat, lng }
  } catch {
    return fallbackZonaCoords(z)
  }
}

export async function geocodeFromCep(cep: string): Promise<GeocodeResult | null> {
  const normalized = normalizeCep(cep)
  if (normalized.length !== 8) return null

  try {
    const viaRes = await fetch(`https://viacep.com.br/ws/${normalized}/json/`)
    if (!viaRes.ok) return null

    const viaData = (await viaRes.json()) as ViaCepResponse
    if (viaData.erro || !viaData.localidade || !viaData.uf) return null

    const addressParts = [
      viaData.logradouro,
      viaData.bairro,
      viaData.localidade,
      viaData.uf,
      'Brasil',
    ].filter(Boolean)

    const query = encodeURIComponent(addressParts.join(', '))
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`,
      { headers: { 'Accept-Language': 'pt-BR' } },
    )
    if (!nomRes.ok) return null

    const nomData = (await nomRes.json()) as Array<{ lat: string; lon: string }>
    if (!nomData.length) return null

    const lat = parseFloat(nomData[0].lat)
    const lng = parseFloat(nomData[0].lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null

    return { lat, lng }
  } catch {
    return null
  }
}
