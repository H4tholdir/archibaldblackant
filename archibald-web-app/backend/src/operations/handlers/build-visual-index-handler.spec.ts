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
  upsertFamilyImage: vi.fn().mockResolvedValue(1),
}))

describe('createBuildVisualIndexHandler', () => {
  test('calls upsertFamilyImage for each crop', async () => {
    const { upsertFamilyImage } = await import('../../db/repositories/catalog-family-images')
    const pool = {} as import('../../db/pool').DbPool

    await createBuildVisualIndexHandler({ pool })(null, {}, 'system', () => {})

    expect(upsertFamilyImage).toHaveBeenCalledTimes(2)
  })

  test('returns count of newly indexed families', async () => {
    const pool   = {} as import('../../db/pool').DbPool
    const result = await createBuildVisualIndexHandler({ pool })(null, {}, 'system', () => {})
    expect(result).toMatchObject({ indexed: 2 })
  })
})
