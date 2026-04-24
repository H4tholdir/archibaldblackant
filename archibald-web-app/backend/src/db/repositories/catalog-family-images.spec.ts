import { describe, test, expect, vi } from 'vitest'
import {
  upsertFamilyImage,
  getBestRowsByFamilyCodes,
  getFallbackFamilies,
} from './catalog-family-images'

function makePool(rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as import('../pool').DbPool
}

describe('upsertFamilyImage', () => {
  test('returns id from insert result', async () => {
    const pool = makePool([{ id: 42 }])
    const id   = await upsertFamilyImage(pool, {
      family_code: '879',
      source_type: 'campionario',
      source_url:  null,
      local_path:  '/app/komet-campionari/strip.jpg',
      priority:    3,
      metadata:    { strip_family_index: 2, strip_family_count: 11 },
    })
    expect(id).toBe(42)
  })

  test('serialises metadata as JSON string', async () => {
    const pool = makePool([{ id: 1 }])
    await upsertFamilyImage(pool, {
      family_code: '879', source_type: 'campionario', source_url: null,
      local_path: '/app/strip.jpg', priority: 3,
      metadata: { strip_family_index: 0, strip_family_count: 5 },
    })
    const [, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(typeof params[5]).toBe('string')
    expect(JSON.parse(params[5])).toMatchObject({ strip_family_index: 0 })
  })
})

describe('getBestRowsByFamilyCodes', () => {
  test('returns empty array when familyCodes is empty', async () => {
    const pool = makePool()
    const result = await getBestRowsByFamilyCodes(pool, [])
    expect(result).toEqual([])
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })

  test('returns FamilyImageRow array for matching codes', async () => {
    const fakeRows = [
      { family_code: '863', local_path: '/p1.jpg', source_type: 'campionario', metadata: null },
      { family_code: '879', local_path: '/p2.jpg', source_type: 'campionario', metadata: { strip_family_index: 1 } },
    ]
    const pool   = makePool(fakeRows)
    const result = await getBestRowsByFamilyCodes(pool, ['863', '879'])
    expect(result).toEqual(fakeRows)
  })

  test('passes family codes array as query parameter', async () => {
    const pool   = makePool([])
    const codes  = ['860', '879']
    await getBestRowsByFamilyCodes(pool, codes)
    const [, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(params[0]).toEqual(codes)
  })
})

describe('getFallbackFamilies', () => {
  test('returns array of family_code strings', async () => {
    const pool   = makePool([{ family_code: '879' }, { family_code: '863' }])
    const result = await getFallbackFamilies(pool, 10)
    expect(result).toEqual(['879', '863'])
  })
})
