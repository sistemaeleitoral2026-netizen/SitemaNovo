import { normalizeCep, normalizeZona } from './normalize'
import { getZonaEleitoral } from './zonasMa'

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

/** Localiza a zona eleitoral pelo cadastro oficial TRE-MA. */
export function coordsFromZona(zona: string): GeocodeResult | null {
  const z = normalizeZona(zona)
  if (!z) return null
  const meta = getZonaEleitoral(z)
  if (meta) return { lat: meta.lat, lng: meta.lng }
  return null
}

export async function geocodeFromZona(zona: string): Promise<GeocodeResult | null> {
  return coordsFromZona(zona)
}

export interface ViaCepAddress {
  logradouro: string
  bairro: string
  localidade: string
  uf: string
}

/** Busca só o endereço no ViaCEP (rápido; não geocodifica). */
export async function lookupViaCep(cep: string): Promise<ViaCepAddress | null> {
  const normalized = normalizeCep(cep)
  if (normalized.length !== 8) return null

  try {
    const viaRes = await fetch(`https://viacep.com.br/ws/${normalized}/json/`)
    if (!viaRes.ok) return null
    const viaData = (await viaRes.json()) as ViaCepResponse
    if (viaData.erro) return null
    return {
      logradouro: viaData.logradouro?.trim() || '',
      bairro: viaData.bairro?.trim() || '',
      localidade: viaData.localidade?.trim() || '',
      uf: viaData.uf?.trim() || '',
    }
  } catch {
    return null
  }
}

export async function geocodeFromCep(cep: string): Promise<GeocodeResult | null> {
  const normalized = normalizeCep(cep)
  if (normalized.length !== 8) return null

  // BrasilAPI costuma devolver lat/lng direto e funciona no browser (CORS ok).
  try {
    const brRes = await fetch(`https://brasilapi.com.br/api/cep/v2/${normalized}`)
    if (brRes.ok) {
      const br = (await brRes.json()) as {
        location?: { coordinates?: { latitude?: number | string; longitude?: number | string } }
      }
      const lat = Number(br.location?.coordinates?.latitude)
      const lng = Number(br.location?.coordinates?.longitude)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng }
      }
    }
  } catch {
    // tenta fallback abaixo
  }

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

/** Geocodifica endereço completo (rua + nº + CEP) — mais preciso para o mapa. */
export async function geocodeFromAddress(parts: {
  endereco?: string
  numero?: string
  bairro?: string
  cidade?: string
  uf?: string
  cep?: string
}): Promise<GeocodeResult | null> {
  const endereco = (parts.endereco ?? '').trim()
  const numero = (parts.numero ?? '').trim()
  const bairro = (parts.bairro ?? '').trim()
  const cidade = (parts.cidade ?? '').trim()
  const uf = (parts.uf ?? '').trim()
  const cep = normalizeCep(parts.cep ?? '')

  const queryParts = [
    endereco && numero ? `${endereco}, ${numero}` : endereco || null,
    bairro,
    cidade,
    uf,
    cep.length === 8 ? cep.replace(/(\d{5})(\d{3})/, '$1-$2') : null,
    'Brasil',
  ].filter(Boolean)

  if (queryParts.length < 2) {
    return cep.length === 8 ? geocodeFromCep(cep) : null
  }

  try {
    const query = encodeURIComponent(queryParts.join(', '))
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${query}`,
      { headers: { 'Accept-Language': 'pt-BR' } },
    )
    if (nomRes.ok) {
      const nomData = (await nomRes.json()) as Array<{ lat: string; lon: string }>
      if (nomData.length) {
        const lat = parseFloat(nomData[0].lat)
        const lng = parseFloat(nomData[0].lon)
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
      }
    }
  } catch {
    // fallback CEP
  }

  return cep.length === 8 ? geocodeFromCep(cep) : null
}
