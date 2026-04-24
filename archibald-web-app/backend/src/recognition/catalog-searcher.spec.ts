import { describe, expect, test } from 'vitest'
import {
  buildSearchParams,
  SURFACE_TEXTURE_TO_PRODUCT_TYPES,
  SHANK_GROUP_TO_DB_TYPES,
} from './catalog-searcher'
import type { InstrumentDescriptor } from './types'

const BASE_DESCRIPTOR: InstrumentDescriptor = {
  shank:           { diameter_group: 'CA_HP', diameter_px: 28, length_px: 140 },
  head:            { diameter_px: 40, length_px: 80 },
  shape_class:     'cono_tondo',
  grit_indicator:  { type: 'ring_color', color: 'red', blade_density: null },
  surface_texture: 'diamond_grit',
  confidence:      0.90,
}

describe('buildSearchParams', () => {
  test('confidence >= 0.7 → shapeClass incluso', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.shapeClass).toBe('cono_tondo')
  })

  test('confidence < 0.7 → shapeClass null', () => {
    const desc: InstrumentDescriptor = { ...BASE_DESCRIPTOR, confidence: 0.65 }
    const params = buildSearchParams(desc, 11.91)
    expect(params.shapeClass).toBeNull()
  })

  test('CA_HP + pxPerMm=11.91 + head.diameter_px=40 → headMm ~3.36', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.headMm).toBeCloseTo(3.36) // 40 / 11.91
  })

  test('pxPerMm null → headMm null', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, null)
    expect(params.headMm).toBeNull()
  })

  test('diameter_px=0 con pxPerMm non-null → headMm null', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      head: { diameter_px: 0, length_px: 80 },
    }
    const params = buildSearchParams(desc, 11.91)
    expect(params.headMm).toBeNull()
  })

  test('CA_HP → shankTypes ["ca","hp"]', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.shankTypes).toEqual(['ca', 'hp'])
  })

  test('FG → shankTypes ["fg"]', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'FG', diameter_px: 16, length_px: 100 },
    }
    const params = buildSearchParams(desc, 10.0)
    expect(params.shankTypes).toEqual(['fg'])
  })

  test('HPT → shankTypes ["hpt"]', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'HPT', diameter_px: 30, length_px: 100 },
    }
    const params = buildSearchParams(desc, 10.0)
    expect(params.shankTypes).toEqual(['hpt'])
  })

  test('Handle_S → shankTypes ["grip"]', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'Handle_S', diameter_px: 48, length_px: 0 },
    }
    const params = buildSearchParams(desc, 12.0)
    expect(params.shankTypes).toEqual(['grip'])
  })

  test('unknown shank → shankTypes null', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'unknown', diameter_px: 0, length_px: 0 },
    }
    const params = buildSearchParams(desc, null)
    expect(params.shankTypes).toBeNull()
  })

  test('diamond_grit → productTypes ["rotary_diamond"]', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.productTypes).toEqual(['rotary_diamond'])
  })

  test('carbide_blades → productTypes ["rotary_carbide","lab_carbide"]', () => {
    const desc: InstrumentDescriptor = { ...BASE_DESCRIPTOR, surface_texture: 'carbide_blades' }
    const params = buildSearchParams(desc, 11.91)
    expect(params.productTypes).toEqual(['rotary_carbide', 'lab_carbide'])
  })

  test('ring_color + red → gritColor "red", gritIndicatorType "ring_color"', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.gritIndicatorType).toBe('ring_color')
    expect(params.gritColor).toBe('red')
  })

  test('blade_count → gritColor null (dato non nel DB per carburi)', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      surface_texture: 'carbide_blades',
      grit_indicator:  { type: 'blade_count', color: null, blade_density: 'many_fine' },
    }
    const params = buildSearchParams(desc, 11.91)
    expect(params.gritColor).toBeNull()
    expect(params.gritIndicatorType).toBe('blade_count')
  })

  test('grit_indicator.type unknown → gritIndicatorType null', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      grit_indicator: { type: 'unknown', color: null, blade_density: null },
    }
    const params = buildSearchParams(desc, 11.91)
    expect(params.gritIndicatorType).toBeNull()
  })
})

describe('SURFACE_TEXTURE_TO_PRODUCT_TYPES', () => {
  test('ogni SurfaceTexture mappa ai product types corretti', () => {
    expect(SURFACE_TEXTURE_TO_PRODUCT_TYPES).toEqual({
      diamond_grit:    ['rotary_diamond'],
      carbide_blades:  ['rotary_carbide', 'lab_carbide'],
      ceramic:         ['polisher_ceramic'],
      rubber_polisher: ['polisher_composite', 'polisher_amalgam'],
      abrasive_wheel:  ['accessory', 'other'],
      disc_slotted:    ['accessory', 'other'],
      disc_perforated: ['accessory', 'other'],
      steel_smooth:    ['endodontic', 'root_post'],
      sonic_tip:       ['sonic'],
      other:           null,
    })
  })
})

describe('SHANK_GROUP_TO_DB_TYPES', () => {
  test('FG → ["fg"]', () => { expect(SHANK_GROUP_TO_DB_TYPES.FG).toEqual(['fg']) })
  test('CA_HP → ["ca","hp"]', () => { expect(SHANK_GROUP_TO_DB_TYPES.CA_HP).toEqual(['ca', 'hp']) })
  test('HPT → ["hpt"]', () => { expect(SHANK_GROUP_TO_DB_TYPES.HPT).toEqual(['hpt']) })
  test('Handle_S e Handle_L → ["grip"]', () => {
    expect(SHANK_GROUP_TO_DB_TYPES.Handle_S).toEqual(['grip'])
    expect(SHANK_GROUP_TO_DB_TYPES.Handle_L).toEqual(['grip'])
  })
})
