import { describe, expect, test } from 'vitest'
import {
  buildSearchParams,
  SURFACE_TEXTURE_TO_CATALOG_SECTIONS,
  SHANK_GROUP_TO_DB_CODES,
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
  test('CA_HP + pxPerMm=11.91 + head.diameter_px=40 → headMm ~3.36', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.headMm).toBeCloseTo(3.36)
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

  test('CA_HP → shankCodes ["204","205"]', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.shankCodes).toEqual(['204', '205'])
  })

  test('FG → shankCodes ["314"]', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'FG', diameter_px: 16, length_px: 100 },
    }
    const params = buildSearchParams(desc, 10.0)
    expect(params.shankCodes).toEqual(['314'])
  })

  test('HPT → shankCodes ["104"]', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'HPT', diameter_px: 30, length_px: 100 },
    }
    const params = buildSearchParams(desc, 10.0)
    expect(params.shankCodes).toEqual(['104'])
  })

  test('Handle_S → shankCodes ["000"]', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'Handle_S', diameter_px: 48, length_px: 0 },
    }
    const params = buildSearchParams(desc, 12.0)
    expect(params.shankCodes).toEqual(['000'])
  })

  test('unknown shank → shankCodes null', () => {
    const desc: InstrumentDescriptor = {
      ...BASE_DESCRIPTOR,
      shank: { diameter_group: 'unknown', diameter_px: 0, length_px: 0 },
    }
    const params = buildSearchParams(desc, null)
    expect(params.shankCodes).toBeNull()
  })

  test('diamond_grit → catalogSections diamond_studio + diamond_lab', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
    expect(params.catalogSections).toEqual(['diamond_studio', 'diamond_lab'])
  })

  test('carbide_blades → catalogSections carbide_studio + carbide_lab', () => {
    const desc: InstrumentDescriptor = { ...BASE_DESCRIPTOR, surface_texture: 'carbide_blades' }
    const params = buildSearchParams(desc, 11.91)
    expect(params.catalogSections).toEqual(['carbide_studio', 'carbide_lab'])
  })

  test('ring_color + red → gritColor "red"', () => {
    const params = buildSearchParams(BASE_DESCRIPTOR, 11.91)
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
  })
})

describe('SURFACE_TEXTURE_TO_CATALOG_SECTIONS', () => {
  test('ogni SurfaceTexture mappa alle catalog_section corrette', () => {
    expect(SURFACE_TEXTURE_TO_CATALOG_SECTIONS).toEqual({
      diamond_grit:    ['diamond_studio', 'diamond_lab'],
      carbide_blades:  ['carbide_studio', 'carbide_lab'],
      ceramic:         ['ceramics', 'ceramics_lab'],
      rubber_polisher: ['polisher_studio', 'polisher_lab'],
      abrasive_wheel:  ['separating_discs'],
      disc_slotted:    ['separating_discs'],
      disc_perforated: ['separating_discs'],
      steel_smooth:    ['endodontics', 'root_posts'],
      sonic_tip:       ['sonic_perio', 'sonic_endo', 'sonic_quick'],
      other:           null,
    })
  })
})

describe('SHANK_GROUP_TO_DB_CODES', () => {
  test('FG → ["314"]',       () => { expect(SHANK_GROUP_TO_DB_CODES.FG).toEqual(['314']) })
  test('CA_HP → ["204","205"]', () => { expect(SHANK_GROUP_TO_DB_CODES.CA_HP).toEqual(['204', '205']) })
  test('HPT → ["104"]',      () => { expect(SHANK_GROUP_TO_DB_CODES.HPT).toEqual(['104']) })
  test('Handle_S e Handle_L → ["000"]', () => {
    expect(SHANK_GROUP_TO_DB_CODES.Handle_S).toEqual(['000'])
    expect(SHANK_GROUP_TO_DB_CODES.Handle_L).toEqual(['000'])
  })
})
