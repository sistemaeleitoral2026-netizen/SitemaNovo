import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import type { MapMarkerData } from '../../types'
import { EmptyState } from '../ui/EmptyState'

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
  layerMode = 'markers',
}: CadastrosMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [-5.2, -45.3],
      zoom: 7,
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

    const heatPoints: [number, number, number][] = markers.map((m) => [
      m.lat,
      m.lng,
      m.count / maxCount,
    ])

    const heat = (L as typeof L & {
      heatLayer: (
        latlngs: [number, number, number][],
        options?: Record<string, unknown>,
      ) => L.Layer
    }).heatLayer(heatPoints, {
      radius: 28,
      blur: 22,
      maxZoom: 16,
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

    if (layerMode === 'markers') {
      markers.forEach((m) => {
        const radius = 8 + Math.round((m.count / maxCount) * 18)
        const circle = L.circleMarker([m.lat, m.lng], {
          radius,
          color: '#0f172a',
          weight: 1,
          fillColor: heatColor(m.count),
          fillOpacity: 0.85,
        })

        circle.bindPopup(
          `<strong>Zona eleitoral ${m.zona}</strong><br/>` +
            `Pessoas nesta zona: <b>${m.count}</b>` +
            (m.secao ? `<br/>Seção ${m.secao}` : ''),
        )
        layer.addLayer(circle)
      })
    }

    map.addLayer(layer)

    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 })
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
    map.flyTo([focus.lat, focus.lng], 13, { duration: 0.6 })
  }, [focus])

  useEffect(() => {
    const map = mapRef.current
    if (!map || resetKey === 0) return
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 })
    } else {
      map.fitBounds(MA_BOUNDS)
    }
  }, [resetKey, markers])

  if (!markers.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          title="Nenhum ponto no mapa"
          description="As zonas aparecem conforme os cadastros com zona eleitoral forem registrados."
        />
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{ height, width: '100%' }}
      />
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
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '.72rem' }}>Cadastros por zona</div>
          {LEGEND.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <i style={{ width: 10, height: 10, borderRadius: 99, background: item.color, display: 'block' }} />
              <span style={{ color: '#4e5d73' }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
