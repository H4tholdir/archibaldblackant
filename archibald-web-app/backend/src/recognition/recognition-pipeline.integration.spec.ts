import { describe, expect, test, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { buildSearchParams, searchCatalog } from './catalog-searcher'
import { parseDescriptorJson, computePxPerMm } from './instrument-descriptor'
import type { InstrumentDescriptor } from './types'
import type { DbPool } from '../db/pool'

const CI      = process.env.CI === 'true'
const PG_HOST = process.env.PG_HOST

// Descriptor che simula H251 ACR: gambo CA_HP (Ø2.35mm), testa cono ~3.4mm, diamond, anello rosso
const H251_DESCRIPTOR: InstrumentDescriptor = {
  shank:           { diameter_group: 'CA_HP', diameter_px: 28, length_px: 140 },
  head:            { diameter_px: 40, length_px: 80 },   // 40 / 11.91 px/mm ≈ 3.36mm
  shape_class:     'cono_tondo',
  grit_indicator:  { type: 'ring_color', color: 'red', blade_density: null },
  surface_texture: 'diamond_grit',
  confidence:      0.92,
}

describe.skipIf(CI || !PG_HOST)('searchCatalog integration', () => {
  let pool: Pool

  beforeAll(() => {
    pool = new Pool({
      host:     process.env.PG_HOST,
      port:     parseInt(process.env.PG_PORT ?? '5432'),
      database: process.env.PG_DATABASE ?? 'archibald',
      user:     process.env.PG_USER ?? 'archibald',
      password: process.env.PG_PASSWORD,
    })
  })

  afterAll(() => pool.end())

  test('descriptor CA_HP + cono_tondo + diamond + red → almeno 1 candidato rotary_diamond', async () => {
    const pxPerMm  = computePxPerMm(H251_DESCRIPTOR, null)!   // 28/2.35 = 11.91
    const params   = buildSearchParams(H251_DESCRIPTOR, pxPerMm)
    const results  = await searchCatalog(pool as unknown as DbPool, params)

    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(5)
    expect(results.some(c => c.productType === 'diamond_studio' || c.productType === 'diamond_lab')).toBe(true)
  })

  test('head_px leggermente fuori tolleranza → ancora trova candidati (fallback ±0.4mm)', async () => {
    const descriptorOff: InstrumentDescriptor = {
      ...H251_DESCRIPTOR,
      head: { diameter_px: 50, length_px: 80 },   // 50/11.91 ≈ 4.2mm → fuori da ±0.3mm ma dentro ±0.4mm
    }
    const pxPerMm = computePxPerMm(descriptorOff, null)!
    const params  = buildSearchParams(descriptorOff, pxPerMm)
    const results = await searchCatalog(pool as unknown as DbPool, params)

    expect(results.length).toBeGreaterThan(0)
  })

  test('descriptor senza filtri (unknown/other) → max 5 risultati senza crash', async () => {
    const unknownDesc: InstrumentDescriptor = {
      shank:           { diameter_group: 'unknown', diameter_px: 0, length_px: 0 },
      head:            { diameter_px: 0, length_px: 0 },
      shape_class:     'altro',
      grit_indicator:  { type: 'unknown', color: null, blade_density: null },
      surface_texture: 'other',
      confidence:      0,
    }
    const params  = buildSearchParams(unknownDesc, null)
    const results = await searchCatalog(pool as unknown as DbPool, params)

    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeLessThanOrEqual(5)
  })
})

// Test unit (no DB) — sempre eseguiti
describe('parseDescriptorJson → computePxPerMm pipeline', () => {
  test('JSON valido → px_per_mm calcolato correttamente per CA_HP', () => {
    const parsed  = parseDescriptorJson(JSON.stringify(H251_DESCRIPTOR))
    const pxPerMm = computePxPerMm(parsed, null)
    expect(pxPerMm).toBeCloseTo(11.91)  // 28 / 2.35
  })

  test('JSON invalido → fallback → pxPerMm null (group=unknown)', () => {
    const parsed  = parseDescriptorJson('questa non è JSON')
    const pxPerMm = computePxPerMm(parsed, null)
    expect(pxPerMm).toBeNull()
  })

  test('ARUco 6.2 sovrascrive il calcolo dal gambo', () => {
    const parsed  = parseDescriptorJson(JSON.stringify(H251_DESCRIPTOR))
    const pxPerMm = computePxPerMm(parsed, 6.2)
    expect(pxPerMm).toBe(6.2)
  })
})
