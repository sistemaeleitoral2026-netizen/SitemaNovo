import { normalizeZona } from './normalize'
import type { GeocodeResult } from './geocode'

export interface ZonaArea {
  zona: string
  /** Pontos dos bairros cobertos pela zona (lat, lng). */
  bairros: GeocodeResult[]
  /** Raio da mancha em metros quando só há um ponto. */
  radiusMeters: number
}

/**
 * Áreas aproximadas das zonas eleitorais no Maranhão,
 * cobrindo os bairros/regiões da zona (mancha no mapa).
 */
const ZONA_AREAS: Record<string, Omit<ZonaArea, 'zona'>> = {
  // Zona 089 — São Luís (ilha / região metropolitana ampliada)
  '089': {
    radiusMeters: 4500,
    bairros: [
      { lat: -2.5297, lng: -44.3028 }, // Centro
      { lat: -2.5012, lng: -44.2901 }, // Cohama / Angelim
      { lat: -2.5480, lng: -44.2680 }, // Cohatrac
      { lat: -2.5605, lng: -44.2520 }, // Cidade Operária
      { lat: -2.5750, lng: -44.2350 }, // Turu
      { lat: -2.4900, lng: -44.2700 }, // São Francisco
      { lat: -2.5100, lng: -44.3200 }, // Renascença
      { lat: -2.5350, lng: -44.3400 }, // Anil
      { lat: -2.5550, lng: -44.3100 }, // João Paulo
      { lat: -2.5200, lng: -44.2500 }, // Calhau
      { lat: -2.4800, lng: -44.3000 }, // Ponta d'Areia
      { lat: -2.5650, lng: -44.2900 }, // Vinhais
      { lat: -2.5400, lng: -44.2200 }, // Maiobão / região
      { lat: -2.5000, lng: -44.2400 }, // Olho d'Água
      { lat: -2.5800, lng: -44.2700 }, // Tirirical
    ],
  },
  '001': {
    radiusMeters: 2800,
    bairros: [
      { lat: -2.5297, lng: -44.3028 },
      { lat: -2.5200, lng: -44.2950 },
      { lat: -2.5350, lng: -44.3100 },
      { lat: -2.5400, lng: -44.2900 },
    ],
  },
  '002': {
    radiusMeters: 2800,
    bairros: [
      { lat: -2.5450, lng: -44.2800 },
      { lat: -2.5550, lng: -44.2700 },
      { lat: -2.5350, lng: -44.2750 },
      { lat: -2.5500, lng: -44.2900 },
    ],
  },
  '080': {
    radiusMeters: 3200,
    bairros: [
      { lat: -2.5400, lng: -44.2400 },
      { lat: -2.5500, lng: -44.2300 },
      { lat: -2.5300, lng: -44.2500 },
      { lat: -2.5600, lng: -44.2450 },
    ],
  },
  '090': {
    radiusMeters: 3200,
    bairros: [
      { lat: -2.5700, lng: -44.2200 },
      { lat: -2.5800, lng: -44.2100 },
      { lat: -2.5600, lng: -44.2300 },
      { lat: -2.5750, lng: -44.2400 },
    ],
  },
  '160': {
    radiusMeters: 4000,
    bairros: [
      { lat: -5.5200, lng: -47.4800 },
      { lat: -5.5100, lng: -47.4700 },
      { lat: -5.5300, lng: -47.4900 },
      { lat: -5.5350, lng: -47.4600 },
    ],
  },
}

function expandAround(center: GeocodeResult, radiusDeg = 0.035): GeocodeResult[] {
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.7, 0.7],
    [0.7, -0.7],
    [-0.7, 0.7],
    [-0.7, -0.7],
    [1.2, 0.4],
    [-1.2, 0.4],
    [0.4, 1.2],
    [-0.4, -1.2],
  ]
  return offsets.map(([dy, dx]) => ({
    lat: Number((center.lat + dy * radiusDeg).toFixed(6)),
    lng: Number((center.lng + dx * radiusDeg).toFixed(6)),
  }))
}

export function getZonaArea(zona: string, center?: GeocodeResult | null): ZonaArea | null {
  const z = normalizeZona(zona)
  if (!z) return null

  const known = ZONA_AREAS[z] ?? ZONA_AREAS[String(Number.parseInt(z, 10)).padStart(3, '0')]
  if (known) {
    return { zona: z, ...known }
  }

  if (!center) return null
  return {
    zona: z,
    radiusMeters: 3500,
    bairros: expandAround(center),
  }
}

/** Gera pontos densos para o heat layer cobrir a mancha da zona. */
export function scatterHeatPoints(
  area: ZonaArea,
  intensity: number,
): [number, number, number][] {
  const points: [number, number, number][] = []
  const weight = Math.max(0.15, Math.min(1, intensity))

  area.bairros.forEach((b) => {
    points.push([b.lat, b.lng, weight])
    // micro-dispersão para “mancha” contínua
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      points.push([
        b.lat + Math.cos(a) * 0.008,
        b.lng + Math.sin(a) * 0.008,
        weight * 0.75,
      ])
    }
  })

  return points
}

/** Convex hull simples (Andrew) para desenhar o polígono da mancha. */
export function convexHull(points: GeocodeResult[]): GeocodeResult[] {
  const pts = [...points].sort((a, b) => a.lng - b.lng || a.lat - b.lat)
  if (pts.length <= 2) return pts

  const cross = (o: GeocodeResult, a: GeocodeResult, b: GeocodeResult) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng)

  const lower: GeocodeResult[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper: GeocodeResult[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  return lower.concat(upper)
}
