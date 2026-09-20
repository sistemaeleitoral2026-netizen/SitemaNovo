import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapMarkerData } from '../../types'
import { EmptyState } from '../ui/EmptyState'
import { convexHull, getZonaArea } from '../../lib/zonaAreas'

const MA_BOUNDS: L.LatLngBoundsExpression = [[-1.05, -48.9], [-10.35, -41.65]]

interface CadastrosMapProps {
  markers: MapMarkerData[]
  height?: number
  focus?: { lat: number; lng: number } | null
  resetKey?: number
  showLegend?: boolean
  layerMode?: 'markers' | 'density'
  /** Enquadra só os centros dos marcadores (melhor no dashboard; evita oceano vazio). */
  fitToMarkers?: boolean
}

function zoneStyle(count: number, maxCount: number) {
  const t = maxCount ? count / maxCount : 0
  if (t <= 0.25) {
    return { stroke: '#0d9488', fill: '#5eead4', label: '#0f766e' }
  }
  if (t <= 0.5) {
    return { stroke: '#ca8a04', fill: '#fde047', label: '#a16207' }
  }
  if (t <= 0.75) {
    return { stroke: '#ea580c', fill: '#fdba74', label: '#c2410c' }
  }
  return { stroke: '#dc2626', fill: '#f87171', label: '#b91c1c' }
}

const LEGEND = [
  { label: 'Baixa', color: '#5eead4' },
  { label: 'Média', color: '#fde047' },
  { label: 'Alta', color: '#fdba74' },
  { label: 'Muito alta', color: '#f87171' },
]

function mapAlive(map: L.Map) {
  try {
    const el = map.getContainer()
    return Boolean(el && el.isConnected && (map as unknown as { _mapPane?: unknown })._mapPane)
  } catch {
    return false
  }
}

function mapHasSize(map: L.Map) {
  if (!mapAlive(map)) return false
  const el = map.getContainer()
  return Boolean(el && el.clientWidth >= 8 && el.clientHeight >= 8)
}

function whenMapReady(map: L.Map, fn: () => void, attempts = 40) {
  if (!mapAlive(map)) return
  if (mapHasSize(map)) {
    try {
      map.invalidateSize({ animate: false })
      fn()
    } catch {
      /* mapa desmontado no meio do HMR */
    }
    return
  }
  if (attempts <= 0) return
  window.setTimeout(() => whenMapReady(map, fn, attempts - 1), 50)
}

/** Enquadra o mapa no cluster da zona com mais fichas (evita oceano / zoom estadual). */
function fitMapToActivity(map: L.Map, markers: MapMarkerData[]): () => void {
  let cancelled = false
  let timeoutId = 0

  const apply = () => {
    if (cancelled || !mapAlive(map)) return
    try {
      map.invalidateSize({ animate: false })
      if (!markers.length) {
        map.fitBounds(MA_BOUNDS, { animate: false })
        return
      }

      const sorted = [...markers].sort((a, b) => b.count - a.count)
      const primary = sorted[0]
      const total = sorted.reduce((sum, m) => sum + m.count, 0) || 1

      // Só zonas próximas da principal (~45 km) — ignora outliers no interior do MA
      const CLUSTER_DEG = 0.4
      const focus: MapMarkerData[] = []
      let covered = 0
      for (const m of sorted) {
        const near =
          Math.hypot(m.lat - primary.lat, m.lng - primary.lng) <= CLUSTER_DEG
        if (!near) continue
        focus.push(m)
        covered += m.count
        if (focus.length >= 6 || covered / total >= 0.88) break
      }
      if (!focus.length) focus.push(primary)

      if (focus.length === 1) {
        map.setView([focus[0].lat, focus[0].lng], 12, { animate: false })
        return
      }

      map.fitBounds(
        L.latLngBounds(focus.map((m) => [m.lat, m.lng] as [number, number])),
        { padding: [44, 44], maxZoom: 12, animate: false },
      )
    } catch {
      /* mapa desmontado no meio do HMR */
    }
  }

  apply()
  const raf = window.requestAnimationFrame(() => {
    apply()
    timeoutId = window.setTimeout(apply, 160)
  })

  return () => {
    cancelled = true
    window.cancelAnimationFrame(raf)
    if (timeoutId) window.clearTimeout(timeoutId)
  }
}

export function CadastrosMap({
  markers,
  height = 400,
  focus = null,
  resetKey = 0,
  showLegend = true,
  layerMode = 'density',
  fitToMarkers = false,
}: CadastrosMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const map = L.map(el, {
      center: [-2.55, -44.25],
      zoom: 11,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    mapRef.current = map
    overlayRef.current = L.layerGroup().addTo(map)

    const ro = new ResizeObserver(() => {
      if (!mapHasSize(map)) return
      map.invalidateSize({ animate: false })
    })
    ro.observe(el)

    whenMapReady(map, () => undefined)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const overlay = overlayRef.current
    if (!map || !overlay) return

    overlay.clearLayers()

    if (!markers.length) {
      whenMapReady(map, () => map.fitBounds(MA_BOUNDS))
      return
    }

    const maxCount = Math.max(...markers.map((m) => m.count), 1)
    const allBounds: L.LatLngExpression[] = []

    markers.forEach((m) => {
      const area = getZonaArea(m.zona, { lat: m.lat, lng: m.lng })
      if (!area) return

      const intensity = m.count / maxCount
      const colors = zoneStyle(m.count, maxCount)
      const fillOpacity = 0.22 + intensity * 0.28
      const strokeOpacity = 0.7 + intensity * 0.25

      const popupHtml = `
        <div style="min-width:200px;max-width:280px;font-family:inherit">
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
            weight: 1.75,
            opacity: strokeOpacity,
            fillColor: colors.fill,
            fillOpacity,
          },
        )
        polygon.bindPopup(popupHtml)
        overlay.addLayer(polygon)
        hull.forEach((p) => allBounds.push([p.lat, p.lng]))
      } else {
        const circle = L.circle([m.lat, m.lng], {
          radius: area.radiusMeters,
          color: colors.stroke,
          weight: 1.75,
          opacity: strokeOpacity,
          fillColor: colors.fill,
          fillOpacity,
        })
        circle.bindPopup(popupHtml)
        overlay.addLayer(circle)
        allBounds.push([m.lat, m.lng])
      }

      const label = L.marker([m.lat, m.lng], {
        interactive: false,
        icon: L.divIcon({
          className: 'zona-map-label',
          html: `<span style="
            display:inline-block;
            background:rgba(255,255,255,.92);
            border:1px solid ${colors.stroke};
            color:${colors.label};
            font:650 11px/1 inherit;
            padding:3px 7px;
            border-radius:6px;
            box-shadow:0 1px 4px rgba(15,23,42,.12);
            white-space:nowrap;
          ">${area.titulo}</span>`,
          iconSize: [90, 22],
          iconAnchor: [45, 11],
        }),
      })
      overlay.addLayer(label)

      if (layerMode === 'markers') {
        const marker = L.circleMarker([m.lat, m.lng], {
          radius: 5,
          color: colors.stroke,
          weight: 1,
          fillColor: '#fff',
          fillOpacity: 0.95,
        })
        marker.bindPopup(popupHtml)
        overlay.addLayer(marker)
      }
    })

    let cancelled = false
    let cancelFit: (() => void) | undefined
    whenMapReady(map, () => {
      if (cancelled) return
      if (fitToMarkers) {
        cancelFit = fitMapToActivity(map, markers)
        return
      }
      const centers = markers.map((m) => [m.lat, m.lng] as [number, number])
      if (allBounds.length > 0) {
        map.fitBounds(L.latLngBounds(allBounds), { padding: [48, 48], maxZoom: 13, animate: false })
      } else if (centers.length > 0) {
        map.fitBounds(L.latLngBounds(centers), {
          padding: [48, 48],
          maxZoom: 13,
          animate: false,
        })
      }
      window.requestAnimationFrame(() => {
        if (cancelled || !mapAlive(map)) return
        try {
          map.invalidateSize({ animate: false })
        } catch {
          /* ignore */
        }
      })
    })

    return () => {
      cancelled = true
      cancelFit?.()
    }
  }, [markers, layerMode, fitToMarkers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    whenMapReady(map, () => {
      map.flyTo([focus.lat, focus.lng], 13, { duration: 0.55 })
    })
  }, [focus])

  useEffect(() => {
    const map = mapRef.current
    if (!map || resetKey === 0) return
    whenMapReady(map, () => {
      if (markers.length > 0) {
        const areas = markers
          .map((m) => getZonaArea(m.zona, { lat: m.lat, lng: m.lng }))
          .filter(Boolean)
        const pts = areas.flatMap((a) => a!.bairros.map((b) => [b.lat, b.lng] as [number, number]))
        if (pts.length) {
          map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 13 })
          return
        }
      }
      map.fitBounds(MA_BOUNDS)
    })
  }, [resetKey, markers])

  return (
    <div style={{ position: 'relative', width: '100%', height, minHeight: height }}>
      <div
        ref={containerRef}
        style={{ height: '100%', width: '100%', minHeight: height }}
      />
      {!markers.length && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(248, 250, 252, 0.92)',
            pointerEvents: 'none',
          }}
        >
          <EmptyState
            title="Nenhuma mancha no mapa"
            description="Cadastre fichas com zona eleitoral para ver a cobertura oficial da zona."
          />
        </div>
      )}
      {showLegend && markers.length > 0 && (
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
              <i style={{ width: 12, height: 8, borderRadius: 3, background: item.color, display: 'block' }} />
              <span style={{ color: '#566176' }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
