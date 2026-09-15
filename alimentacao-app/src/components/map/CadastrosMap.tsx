import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import type { MapMarkerData } from '../../types'
import { EmptyState } from '../ui/EmptyState'

interface CadastrosMapProps {
  markers: MapMarkerData[]
  height?: number
}

function heatColor(ratio: number): string {
  // frio → quente: azul → ciano → amarelo → laranja → vermelho
  if (ratio <= 0.25) return '#3b82f6'
  if (ratio <= 0.5) return '#22d3ee'
  if (ratio <= 0.75) return '#fbbf24'
  if (ratio < 1) return '#f97316'
  return '#ef4444'
}

function formatCep(cep: string): string {
  return cep.replace(/(\d{5})(\d{3})/, '$1-$2')
}

export function CadastrosMap({ markers, height = 400 }: CadastrosMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [-2.53, -44.3],
      zoom: 12,
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

    // Camada de calor: intensidade = quantidade de pessoas no CEP
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

    markers.forEach((m) => {
      const ratio = m.count / maxCount
      const radius = 8 + Math.round((m.count / maxCount) * 18)
      const circle = L.circleMarker([m.lat, m.lng], {
        radius,
        color: '#0f172a',
        weight: 1,
        fillColor: heatColor(ratio),
        fillOpacity: 0.85,
      })

      circle.bindPopup(
        `<strong>CEP ${formatCep(m.cep)}</strong><br/>` +
          `Pessoas neste CEP: <b>${m.count}</b><br/>` +
          `Zona eleitoral ${m.zona}<br/>` +
          `Seção ${m.secao}`,
      )
      layer.addLayer(circle)
    })

    map.addLayer(layer)

    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 })
    }

    return () => {
      map.removeLayer(layer)
    }
  }, [markers])

  if (!markers.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
        <EmptyState
          title="Sem calor por CEP"
          description="Nenhum cadastro com CEP geolocalizado para os filtros selecionados."
        />
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{ height, width: '100%', borderRadius: 'var(--radius)', overflow: 'hidden' }}
      />
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          zIndex: 500,
          background: 'rgba(255,255,255,0.95)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '0.5rem 0.75rem',
          fontSize: '0.75rem',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Calor por CEP</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Poucas</span>
          <div
            style={{
              width: 88,
              height: 10,
              borderRadius: 999,
              background: 'linear-gradient(90deg, #3b82f6, #22d3ee, #fbbf24, #f97316, #ef4444)',
            }}
          />
          <span>Muitas</span>
        </div>
      </div>
    </div>
  )
}
