import { normalizeCep } from './normalize'

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
