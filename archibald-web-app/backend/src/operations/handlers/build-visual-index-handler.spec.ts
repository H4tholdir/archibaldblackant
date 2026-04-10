import { describe, test, expect, vi } from 'vitest'
import { createBuildVisualIndexHandler } from './build-visual-index-handler'

vi.mock('../../recognition/campionario-strip-map', () => ({
  CAMPIONARIO_STRIPS: [
    { path: 'section/strip-01.jpg', kometUrl: '', families: ['860', '879'], label: 'test' },
  ],
}))

vi.mock('../../recognition/campionario-strip-cropper', () => ({
  cropStripForFamilies: vi.fn().mockResolvedValue([
    { familyCode: '860', imageBuffer: Buffer.from('IMG1'), stripPath: 'section/strip-01.jpg', familyIndex: 0, familyCount: 2 },
    { familyCode: '879', imageBuffer: Buffer.from('IMG2'), stripPath: 'section/strip-01.jpg', familyIndex: 1, familyCount: 2 },
  ]),
}))

vi.mock('../../db/repositories/catalog-family-images', () => ({
  upsertFamilyImage:      vi.fn().mockResolvedValue(1),
  updateEmbedding:        vi.fn().mockResolvedValue(undefined),
  countIndexed:           vi.fn().mockResolvedValue(2),
  getIndexedFamilyCodes:  vi.fn().mockResolvedValue(new Set<string>()),
}))

describe('createBuildVisualIndexHandler', () => {
  test('calls upsertFamilyImage and updateEmbedding for each crop', async () => {
    const { upsertFamilyImage, updateEmbedding } = await import('../../db/repositories/catalog-family-images')
    const pool        = {} as import('../../db/pool').DbPool
    const embeddingSvc = { embedImage: vi.fn().mockResolvedValue(Array(2048).fill(0.1)) }

    await createBuildVisualIndexHandler({ pool, embeddingSvc })({} as import('bullmq').Job)

    expect(upsertFamilyImage).toHaveBeenCalledTimes(2)
    expect(updateEmbedding).toHaveBeenCalledTimes(2)
    expect(embeddingSvc.embedImage).toHaveBeenCalledTimes(2)
  })

  test('returns total indexed count on completion', async () => {
    const pool        = {} as import('../../db/pool').DbPool
    const embeddingSvc = { embedImage: vi.fn().mockResolvedValue(Array(2048).fill(0.1)) }
    const result = await createBuildVisualIndexHandler({ pool, embeddingSvc })({} as import('bullmq').Job)
    expect(result).toMatchObject({ indexed: 2 })
  })
})
