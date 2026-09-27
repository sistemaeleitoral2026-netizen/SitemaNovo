import { describe, expect, it } from 'vitest'
import { formatMapsUrl, mapsLinkError, parseGoogleMapsUrl } from './mapsLink'

describe('parseGoogleMapsUrl', () => {
  it('lê o link com q=lat,lng e rótulo', () => {
    expect(
      parseGoogleMapsUrl('http://maps.google.com/maps?q=-2.5310959,-44.2911676+(My+Point)&z=14'),
    ).toEqual({ lat: -2.5310959, lng: -44.2911676 })
  })

  it('lê @lat,lng e query encoded', () => {
    expect(parseGoogleMapsUrl('https://www.google.com/maps/@-2.53,-44.29,14z')).toEqual({
      lat: -2.53,
      lng: -44.29,
    })
    expect(parseGoogleMapsUrl('https://www.google.com/maps?q=-2.5310959%2C-44.2911676')).toEqual({
      lat: -2.5310959,
      lng: -44.2911676,
    })
  })

  it('rejeita vazio ou sem coordenadas', () => {
    expect(parseGoogleMapsUrl('')).toBeNull()
    expect(parseGoogleMapsUrl('https://maps.google.com')).toBeNull()
    expect(mapsLinkError('')).toMatch(/Cole/)
  })

  it('monta o mesmo formato do Mapear', () => {
    expect(formatMapsUrl(-2.5310959, -44.2911676)).toContain('q=-2.5310959,-44.2911676')
  })
})
