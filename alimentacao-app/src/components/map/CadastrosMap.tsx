import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import type { MapMarkerData } from '../../types'
import { EmptyState } from '../ui/EmptyState'
import { convexHull, getZonaArea, scatterHeatPoints } from '../../lib/zonaAreas'

const MA_BOUNDS: L.LatLngBoundsExpression = [[-1.05, -48.9], [-10.35, -41.65]]

interface CadastrosMapProps {
  markers: MapMarkerData[]
  height?: number
  focus?: { lat: number; lng: number } | null
  resetKey?: number
  showLegend?: boolean
  layerMode?: 'markers' | 'density'
}

function heatColor(count: number): string {
  if (count <= 5) return '#3b82f6'
  if (count <= 20) return '#22d3ee'
  if (count <= 50) return '#fbbf24'
  if (count <= 100) return '#f97316'
  return '#ef4444'
}

const LEGEND = [
  { label: '1–5', color: '#3b82f6' },
  { label: '6–20', color: '#22d3ee' },
  { label: '21–50', color: '#fbbf24' },
  { label: '51–100', color: '#f97316' },
  { label: '100+', color: '#ef4444' },
]

export function CadastrosMap({
  markers,
  height = 400,
  focus = null,
  resetKey = 0,
  showLegend = true,
  layerMode = 'density',
}: CadastrosMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [-2.53, -44.3],
      zoom: 11,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const maxCount = Math.max(...markers.map((m) => m.count), 1)
    const layer = L.layerGroup()
    const heatPoints: [number, number, number][] = []
    const allBounds: L.LatLngExpression[] = []

    markers.forEach((m) => {
      const area = getZonaArea(m.zona, { lat: m.lat, lng: m.lng })
      if (!area) return

      const intensity = m.count / maxCount
      const color = heatColor(m.count)
      const fillOpacity = 0.22 + intensity * 0.35

      // Mancha cobrindo os bairros da zona
      const hull = convexHull(area.bairros)
      if (hull.length >= 3) {
        const polygon = L.polygon(
          hull.map((p) => [p.lat, p.lng] as [number, number]),
          {
            color,
            weight: 2,
            opacity: 0.85,
            fillColor: color,
            fillOpacity,
          },
        )
        polygon.bindPopup(
          `<strong>Zona eleitoral ${m.zona}</strong><br/>` +
            `Mancha cobrindo os bairros da zona<br/>` +
            `Cadastros: <b>${m.count}</b>`,
        )
        layer.addLayer(polygon)
        hull.forEach((p) => allBounds.push([p.lat, p.lng]))
      } else {
        const circle = L.circle([m.lat, m.lng], {
          radius: area.radiusMeters,
          color,
          weight: 2,
          opacity: 0.85,
          fillColor: color,
          fillOpacity,
        })
        circle.bindPopup(
          `<strong>Zona eleitoral ${m.zona}</strong><br/>` +
            `Mancha da zona<br/>` +
            `Cadastros: <b>${m.count}</b>`,
        )
        layer.addLayer(circle)
        allBounds.push([m.lat, m.lng])
      }

      // Heat denso sobre os bairros (efeito mancha)
      heatPoints.push(...scatterHeatPoints(area, intensity))

      if (layerMode === 'markers') {
        const marker = L.circleMarker([m.lat, m.lng], {
          radius: 7 + Math.round(intensity * 10),
          color: '#0f172a',
          weight: 1,
          fillColor: color,
          fillOpacity: 0.95,
        })
        marker.bindPopup(
          `<strong>Zona ${m.zona}</strong><br/>Cadastros: <b>${m.count}</b>`,
        )
        layer.addLayer(marker)
      }
    })

    if (heatPoints.length) {
      const heat = (L as typeof L & {
        heatLayer: (
          latlngs: [number, number, number][],
          options?: Record<string, unknown>,
        ) => L.Layer
      }).heatLayer(heatPoints, {
        radius: 42,
        blur: 32,
        maxZoom: 15,
        max: 1,
        gradient: {
          0.2: '#3b82f6',
          0.4: '#22d3ee',
          0.6: '#fbbf24',
          0.8: '#f97316',
          1.0: '#ef4444',
        },
      })
      layer.addLayer(heat)
    }

    map.addLayer(layer)

    if (allBounds.length > 0) {
      const bounds = L.latLngBounds(allBounds)
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
    } else if (markers.length > 0) {
      map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])), {
        padding: [40, 40],
        maxZoom: 13,
      })
    } else {
      map.fitBounds(MA_BOUNDS)
    }

    return () => {
      map.removeLayer(layer)
    }
  }, [markers, layerMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    map.flyTo([focus.lat, focus.lng], 12, { duration: 0.6 })
  }, [focus])

  useEffect(() => {
    const map = mapRef.current
    if (!map || resetKey === 0) return
    if (markers.length > 0) {
      const areas = markers
        .map((m) => getZonaArea(m.zona, { lat: m.lat, lng: m.lng }))
        .filter(Boolean)
      const pts = areas.flatMap((a) => a!.bairros.map((b) => [b.lat, b.lng] as [number, number]))
      if (pts.length) {
        map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 13 })
      }
    } else {
      map.fitBounds(MA_BOUNDS)
    }
  }, [resetKey, markers])

  if (!markers.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          title="Nenhuma mancha no mapa"
          description="Cadastre fichas com zona eleitoral para ver a cobertura dos bairros."
        />
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ height, width: '100%' }} />
      {showLegend && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            zIndex: 500,
            background: 'rgba(255,255,255,0.96)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '0.65rem 0.8rem',
            fontSize: '0.7rem',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '.72rem' }}>Mancha por zona</div>
          {LEGEND.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <i style={{ width: 10, height: 10, borderRadius: 99, background: item.color, display: 'block' }} />
              <span style={{ color: '#4e5d73' }}>{item.label} cadastros</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
