import { normalizeZona } from './normalize'
import type { GeocodeResult } from './geocode'
import { getZonaEleitoral } from './zonasMa'

export interface ZonaArea {
  zona: string
  titulo: string
  sede: string
  municipios: string[]
  bairroNomes: string[]
  bairros: GeocodeResult[]
  radiusMeters: number
}

function expandAround(center: GeocodeResult, radiusDeg = 0.028): GeocodeResult[] {
  const offsets = [
    [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7],
  ]
  return offsets.map(([dy, dx]) => ({
    lat: Number((center.lat + dy * radiusDeg).toFixed(6)),
    lng: Number((center.lng + dx * radiusDeg).toFixed(6)),
  }))
}

export function getZonaArea(zona: string, center?: GeocodeResult | null): ZonaArea | null {
  const z = normalizeZona(zona)
  if (!z) return null

  const meta = getZonaEleitoral(z)
  if (meta) {
    const pontos = meta.pontos?.length
      ? meta.pontos.map((p) => ({ lat: p.lat, lng: p.lng }))
      : expandAround({ lat: meta.lat, lng: meta.lng }, meta.radiusMeters / 120000)

    return {
      zona: meta.numero,
      titulo: meta.titulo,
      sede: meta.sede,
      municipios: meta.municipios,
      bairroNomes: meta.bairros,
      bairros: pontos,
      radiusMeters: meta.radiusMeters,
    }
  }

  if (!center) return null
  return {
    zona: z,
    titulo: `Zona ${Number(z)}`,
    sede: '—',
    municipios: [],
    bairroNomes: [],
    radiusMeters: 3500,
    bairros: expandAround(center),
  }
}

/** Pontos suaves para heat — um núcleo por bairro + anel para cobrir a área. */
export function scatterHeatPoints(
  area: ZonaArea,
  intensity: number,
): [number, number, number][] {
  const points: [number, number, number][] = []
  const weight = Math.max(0.08, Math.min(0.35, intensity * 0.35))

  area.bairros.forEach((b) => {
    points.push([b.lat, b.lng, weight])
    for (let ring = 0; ring < 2; ring++) {
      const r = 0.004 + ring * 0.005
      const n = 4 + ring * 2
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        points.push([
          b.lat + Math.cos(a) * r,
          b.lng + Math.sin(a) * r,
          weight * (ring === 0 ? 0.65 : 0.4),
        ])
      }
    }
  })

  return points
}

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
