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

/** Paleta clara e profissional (não cobre o mapa-base). */
function zoneStyle(count: number, maxCount: number) {
  const t = maxCount ? count / maxCount : 0
  if (t <= 0.2) return { stroke: '#5b8def', fill: '#93c5fd' }
  if (t <= 0.45) return { stroke: '#3b82f6', fill: '#60a5fa' }
  if (t <= 0.7) return { stroke: '#2563eb', fill: '#3b82f6' }
  return { stroke: '#1d4ed8', fill: '#2563eb' }
}

const LEGEND = [
  { label: 'Baixa', color: '#93c5fd' },
  { label: 'Média', color: '#60a5fa' },
  { label: 'Alta', color: '#3b82f6' },
  { label: 'Muito alta', color: '#2563eb' },
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
      center: [-2.55, -44.25],
      zoom: 11,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
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
      const colors = zoneStyle(m.count, maxCount)
      // Mancha bem clara para ler nomes do mapa-base / bairros
      const fillOpacity = 0.10 + intensity * 0.12
      const strokeOpacity = 0.55 + intensity * 0.2

      const popupHtml = `
        <div style="min-width:200px;max-width:280px;font-family:Inter,system-ui,sans-serif">
          <div style="font-weight:750;font-size:13px;color:#172033;margin-bottom:4px">${area.titulo}</div>
          <div style="font-size:11px;color:#657084;margin-bottom:6px">Sede: <b style="color:#253046">${area.sede}</b></div>
          ${area.municipios.length ? `<div style="font-size:11px;color:#657084;margin-bottom:6px">Município(s): ${area.municipios.join(', ')}</div>` : ''}
          ${area.bairroNomes.length ? `<div style="font-size:11px;color:#475569;line-height:1.4;margin-bottom:8px"><b style="color:#172033">Bairros:</b><br/>${area.bairroNomes.join(', ')}</div>` : ''}
          <div style="font-size:12px;color:#172033">Cadastros: <b>${m.count}</b></div>
        </div>
      `

      const hull = convexHull(area.bairros)
      if (hull.length >= 3) {
        const polygon = L.polygon(
          hull.map((p) => [p.lat, p.lng] as [number, number]),
          {
            color: colors.stroke,
            weight: 1.5,
            opacity: strokeOpacity,
            fillColor: colors.fill,
            fillOpacity,
          },
        )
        polygon.bindPopup(popupHtml)
        layer.addLayer(polygon)
        hull.forEach((p) => allBounds.push([p.lat, p.lng]))
      } else {
        const circle = L.circle([m.lat, m.lng], {
          radius: area.radiusMeters,
          color: colors.stroke,
          weight: 1.5,
          opacity: strokeOpacity,
          fillColor: colors.fill,
          fillOpacity,
        })
        circle.bindPopup(popupHtml)
        layer.addLayer(circle)
        allBounds.push([m.lat, m.lng])
      }

      // Rótulo discreto da zona no centro
      const label = L.marker([m.lat, m.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'zona-map-label',
          html: `<span style="
            display:inline-block;
            background:rgba(255,255,255,.88);
            border:1px solid ${colors.stroke};
            color:#1e3a5f;
            font:650 11px/1 Inter,system-ui,sans-serif;
            padding:3px 7px;
            border-radius:6px;
            box-shadow:0 1px 4px rgba(15,23,42,.12);
            white-space:nowrap;
          ">${area.titulo}</span>`,
          iconSize: [90, 22],
          iconAnchor: [45, 11],
        }),
      })
      layer.addLayer(label)

      heatPoints.push(...scatterHeatPoints(area, intensity))

      if (layerMode === 'markers') {
        const marker = L.circleMarker([m.lat, m.lng], {
          radius: 5,
          color: colors.stroke,
          weight: 1,
          fillColor: '#fff',
          fillOpacity: 0.95,
        })
        marker.bindPopup(popupHtml)
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
        radius: 28,
        blur: 26,
        maxZoom: 16,
        max: 1,
        minOpacity: 0.12,
        gradient: {
          0.2: 'rgba(147,197,253,0.35)',
          0.5: 'rgba(96,165,250,0.4)',
          0.8: 'rgba(59,130,246,0.45)',
          1.0: 'rgba(37,99,235,0.5)',
        },
      })
      layer.addLayer(heat)
    }

    map.addLayer(layer)

    if (allBounds.length > 0) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [48, 48], maxZoom: 13 })
    } else if (markers.length > 0) {
      map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])), {
        padding: [48, 48],
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
    map.flyTo([focus.lat, focus.lng], 13, { duration: 0.55 })
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
        map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 13 })
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
          description="Cadastre fichas com zona eleitoral para ver a cobertura oficial da zona."
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
            background: 'rgba(255,255,255,.94)',
            border: '1px solid #e2e7ee',
            borderRadius: 8,
            padding: '0.6rem 0.75rem',
            fontSize: '0.68rem',
            boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 6px 16px rgba(15,23,42,.06)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '.7rem', color: '#172033' }}>
            Intensidade da zona
          </div>
          {LEGEND.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <i style={{ width: 12, height: 8, borderRadius: 3, background: item.color, opacity: 0.75, display: 'block' }} />
              <span style={{ color: '#566176' }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
