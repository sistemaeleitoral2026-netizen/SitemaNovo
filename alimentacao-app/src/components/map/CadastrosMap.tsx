import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import type { MapMarkerData } from '../../types'
import { EmptyState } from '../ui/EmptyState'

interface CadastrosMapProps {
  markers: MapMarkerData[]
  height?: number
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

    const cluster = (L as typeof L & { markerClusterGroup: () => L.MarkerClusterGroup }).markerClusterGroup()

    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng])
      const cepLabel = m.cep.replace(/(\d{5})(\d{3})/, '$1-$2')
      marker.bindPopup(
        `<strong>CEP ${cepLabel}</strong><br/>Zona eleitoral ${m.zona}<br/>Seção ${m.secao}<br/>Cadastros: ${m.count}`,
      )
      cluster.addLayer(marker)
    })

    map.addLayer(cluster)

    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 })
    }

    return () => {
      map.removeLayer(cluster)
    }
  }, [markers])

  if (!markers.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
        <EmptyState
          title="Sem marcadores por CEP"
          description="Nenhum cadastro com CEP geolocalizado para os filtros selecionados."
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%', borderRadius: 'var(--radius)', overflow: 'hidden' }}
    />
  )
}
