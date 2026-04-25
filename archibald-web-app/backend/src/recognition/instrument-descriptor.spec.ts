import { describe, expect, test } from 'vitest'
import { parseDescriptorJson, computePxPerMm, INSTRUMENT_DESCRIPTOR_MODEL } from './instrument-descriptor'
import type { InstrumentDescriptor } from './types'

const VALID_DESCRIPTOR: InstrumentDescriptor = {
  shank:           { diameter_group: 'CA_HP', diameter_px: 28, length_px: 140 },
  head:            { diameter_px: 40, length_px: 80 },
  shape_class:     'cono_tondo',
  grit_indicator:  { type: 'ring_color', color: 'red', blade_density: null },
  surface_texture: 'diamond_grit',
  confidence:      0.88,
}

describe('parseDescriptorJson', () => {
  test('valid JSON string → parsed InstrumentDescriptor', () => {
    expect(parseDescriptorJson(JSON.stringify(VALID_DESCRIPTOR))).toEqual(VALID_DESCRIPTOR)
  })

  test('JSON embedded in prose → estrae oggetto correttamente', () => {
    const raw = `Ecco la risposta:\n${JSON.stringify(VALID_DESCRIPTOR)}\nFine.`
    expect(parseDescriptorJson(raw)).toEqual(VALID_DESCRIPTOR)
  })

  test('JSON non valido → descriptor fallback con confidence=0 e group=unknown', () => {
    const result = parseDescriptorJson('not valid json')
    expect(result.confidence).toBe(0)
    expect(result.shank.diameter_group).toBe('unknown')
    expect(result.shape_class).toBe('altro')
    expect(result.surface_texture).toBe('other')
  })

  test('stringa vuota → descriptor fallback', () => {
    const result = parseDescriptorJson('')
    expect(result.confidence).toBe(0)
  })

  test('JSON seguita da nota con graffe → estrae solo il JSON', () => {
    const raw = `${JSON.stringify(VALID_DESCRIPTOR)}\nNote: {use carefully}`
    expect(parseDescriptorJson(raw)).toEqual(VALID_DESCRIPTOR)
  })
})

describe('computePxPerMm', () => {
  test('arucoMm presente → restituisce il valore ARUco (ignora shank)', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'FG', diameter_px: 10, length_px: 0 },
    }
    expect(computePxPerMm(desc, 7.5)).toBe(7.5)
  })

  test('arucoMm=null + FG (1.60mm) → px/mm dal gambo', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'FG', diameter_px: 16, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeCloseTo(10.0) // 16 / 1.60
  })

  test('arucoMm=null + CA_HP (2.35mm) → px/mm dal gambo', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'CA_HP', diameter_px: 28, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeCloseTo(11.91) // 28 / 2.35
  })

  test('arucoMm=null + HPT (3.00mm) → px/mm dal gambo', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'HPT', diameter_px: 30, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeCloseTo(10.0) // 30 / 3.00
  })

  test('arucoMm=null + unknown → null', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'unknown', diameter_px: 20, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeNull()
  })

  test('arucoMm=null + none → null (strumento non montato)', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'none', diameter_px: 0, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeNull()
  })

  test('arucoMm=null + diameter_px=0 → null', () => {
    const desc: InstrumentDescriptor = {
      ...VALID_DESCRIPTOR,
      shank: { diameter_group: 'FG', diameter_px: 0, length_px: 0 },
    }
    expect(computePxPerMm(desc, null)).toBeNull()
  })
})

describe('INSTRUMENT_DESCRIPTOR_MODEL', () => {
  test('default è claude-haiku-4-5-20251001 quando env non è impostata', () => {
    expect(INSTRUMENT_DESCRIPTOR_MODEL).toBe('claude-haiku-4-5-20251001')
  })
})
