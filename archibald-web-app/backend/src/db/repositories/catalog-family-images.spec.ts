import { describe, test, expect, vi } from 'vitest'
import {
  upsertFamilyImage,
  updateEmbedding,
  queryTopK,
  countIndexed,
  getFallbackFamilies,
} from './catalog-family-images'

const FAKE_EMBEDDING = Array.from({ length: 2048 }, () => 0.5)

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

describe('updateEmbedding', () => {
  test('calls UPDATE with vector literal and id', async () => {
    const pool = makePool()
    await updateEmbedding(pool, 7, FAKE_EMBEDDING)
    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(sql).toContain('UPDATE shared.catalog_family_images')
    expect(params[0]).toMatch(/^\[[\d.,]+\]$/)
    expect(params[1]).toBe(7)
  })
})

describe('queryTopK', () => {
  test('returns AnnCandidate rows', async () => {
    const fakeRows = [
      { id: 1, family_code: '879', similarity: 0.92, local_path: '/p1.jpg', source_type: 'campionario', metadata: null },
      { id: 2, family_code: '863', similarity: 0.88, local_path: '/p2.jpg', source_type: 'campionario', metadata: null },
    ]
    const result = await queryTopK(makePool(fakeRows), FAKE_EMBEDDING, 50)
    expect(result).toHaveLength(2)
    expect(result[0]!.family_code).toBe('879')
    expect(result[0]!.similarity).toBe(0.92)
  })

  test('passes vector literal as first query parameter', async () => {
    const pool = makePool([])
    await queryTopK(pool, [0.1, 0.2], 10)
    const [, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(params[0]).toBe('[0.1,0.2]')
  })
})

describe('countIndexed', () => {
  test('returns integer count', async () => {
    expect(await countIndexed(makePool([{ count: '137' }]))).toBe(137)
  })
})

describe('getFallbackFamilies', () => {
  test('returns array of family_code strings', async () => {
    const pool = makePool([{ family_code: '879' }, { family_code: '863' }])
    const result = await getFallbackFamilies(pool, 10)
    expect(result).toEqual(['879', '863'])
  })
})
