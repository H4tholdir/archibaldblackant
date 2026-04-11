import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createBuildVisualIndexHandler } from './build-visual-index-handler'

const mockCropStripForFamilies = vi.fn()

vi.mock('../../recognition/campionario-strip-map', () => ({
  CAMPIONARIO_STRIPS: [
    { path: 'section/strip-01.jpg', kometUrl: '', families: ['860', '879'], label: 'test strip 1' },
    { path: 'section/strip-02.jpg', kometUrl: '', families: ['807', '879'], label: 'test strip 2' },
  ],
}))

vi.mock('../../recognition/campionario-strip-cropper', () => ({
  cropStripForFamilies: (...args: unknown[]) => mockCropStripForFamilies(...args),
}))

const mockUpsertFamilyImage = vi.fn()
const mockUpdateEmbedding   = vi.fn()
const mockCountIndexed      = vi.fn()
const mockGetIndexedFamilyStripKeys = vi.fn()

vi.mock('../../db/repositories/catalog-family-images', () => ({
  upsertFamilyImage:          (...args: unknown[]) => mockUpsertFamilyImage(...args),
  updateEmbedding:            (...args: unknown[]) => mockUpdateEmbedding(...args),
  countIndexed:               (...args: unknown[]) => mockCountIndexed(...args),
  getIndexedFamilyStripKeys:  (...args: unknown[]) => mockGetIndexedFamilyStripKeys(...args),
}))

const STRIP1_CROPS = [
  { familyCode: '860', imageBuffer: Buffer.from('IMG1'), stripPath: 'section/strip-01.jpg', familyIndex: 0, familyCount: 2 },
  { familyCode: '879', imageBuffer: Buffer.from('IMG2'), stripPath: 'section/strip-01.jpg', familyIndex: 1, familyCount: 2 },
]
const STRIP2_CROPS = [
  { familyCode: '807', imageBuffer: Buffer.from('IMG3'), stripPath: 'section/strip-02.jpg', familyIndex: 0, familyCount: 2 },
  { familyCode: '879', imageBuffer: Buffer.from('IMG4'), stripPath: 'section/strip-02.jpg', familyIndex: 1, familyCount: 2 },
]

function makeHandler(embeddingVec = Array(2048).fill(0.1)) {
  const pool        = {} as import('../../db/pool').DbPool
  const embeddingSvc = { embedImage: vi.fn().mockResolvedValue(embeddingVec) }
  return { handler: createBuildVisualIndexHandler({ pool, embeddingSvc }), embeddingSvc }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpsertFamilyImage.mockResolvedValue(1)
  mockUpdateEmbedding.mockResolvedValue(undefined)
  mockCountIndexed.mockResolvedValue(3)
  mockGetIndexedFamilyStripKeys.mockResolvedValue(new Set<string>())
  mockCropStripForFamilies
    .mockResolvedValueOnce(STRIP1_CROPS)
    .mockResolvedValueOnce(STRIP2_CROPS)
})

describe('createBuildVisualIndexHandler', () => {
  test('embeds every (family, strip) pair when nothing is pre-indexed', async () => {
    const { handler, embeddingSvc } = makeHandler()
    await handler(null, {}, 'admin', vi.fn())

    // 2 crops from strip-01 + 2 crops from strip-02 = 4 embeddings
    expect(embeddingSvc.embedImage).toHaveBeenCalledTimes(4)
    expect(mockUpsertFamilyImage).toHaveBeenCalledTimes(4)
    expect(mockUpdateEmbedding).toHaveBeenCalledTimes(4)
  })

  test('skips (family, strip) pairs already in the index', async () => {
    // 879 on strip-01 already indexed
    mockGetIndexedFamilyStripKeys.mockResolvedValue(new Set(['879|section/strip-01.jpg']))
    const { handler, embeddingSvc } = makeHandler()
    await handler(null, {}, 'admin', vi.fn())

    // 1 skipped → 3 embedded
    expect(embeddingSvc.embedImage).toHaveBeenCalledTimes(3)
  })

  test('indexes the same family from two different strips', async () => {
    // Only 879|strip-01 pre-indexed; 879|strip-02 is new
    mockGetIndexedFamilyStripKeys.mockResolvedValue(new Set(['879|section/strip-01.jpg']))
    const { handler, embeddingSvc } = makeHandler()
    await handler(null, {}, 'admin', vi.fn())

    // 860|strip-01, 807|strip-02, 879|strip-02 = 3 embeddings
    expect(embeddingSvc.embedImage).toHaveBeenCalledTimes(3)
  })

  test('returns total indexed count on completion', async () => {
    const { handler } = makeHandler()
    const result = await handler(null, {}, 'admin', vi.fn())
    expect(result).toMatchObject({ indexed: 3 })
  })

  test('continues processing remaining strips when one strip fails to crop', async () => {
    mockCropStripForFamilies.mockReset()
    mockCropStripForFamilies
      .mockRejectedValueOnce(new Error('file not found'))
      .mockResolvedValueOnce(STRIP2_CROPS)
    const { handler, embeddingSvc } = makeHandler()
    await handler(null, {}, 'admin', vi.fn())

    expect(embeddingSvc.embedImage).toHaveBeenCalledTimes(2)
  })
})
