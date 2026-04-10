import { describe, test, expect, vi, beforeEach } from 'vitest'

const mockChain = vi.hoisted(() => {
  const chain: Record<string, unknown> = {}
  chain.metadata  = vi.fn().mockResolvedValue({ width: 900, height: 200 })
  chain.extract   = vi.fn().mockReturnValue(chain)
  chain.jpeg      = vi.fn().mockReturnValue(chain)
  chain.toBuffer  = vi.fn().mockResolvedValue(Buffer.from('FAKE_JPEG'))
  return chain
})

vi.mock('sharp', () => ({ default: vi.fn().mockReturnValue(mockChain) }))
vi.mock('node:fs/promises', () => ({ readFile: vi.fn().mockResolvedValue(Buffer.from('STRIP')) }))

import { cropStripForFamilies, cropSingleFamily } from './campionario-strip-cropper'
import type { StripEntry } from './campionario-strip-map'

const STRIP_3: StripEntry = {
  path:     'test-section/test-strip-01.jpg',
  kometUrl: '',
  families: ['860', '863', '879'],
  label:    'test strip',
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(mockChain.metadata as ReturnType<typeof vi.fn>).mockResolvedValue({ width: 900, height: 200 })
  ;(mockChain.extract as ReturnType<typeof vi.fn>).mockReturnValue(mockChain)
  ;(mockChain.jpeg as ReturnType<typeof vi.fn>).mockReturnValue(mockChain)
  ;(mockChain.toBuffer as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from('FAKE_JPEG'))
})

describe('cropStripForFamilies', () => {
  test('returns one crop per family', async () => {
    const crops = await cropStripForFamilies(STRIP_3)
    expect(crops).toHaveLength(3)
  })

  test('family codes match strip families in order', async () => {
    const crops = await cropStripForFamilies(STRIP_3)
    expect(crops.map(c => c.familyCode)).toEqual(['860', '863', '879'])
  })

  test('crops have correct family index and count metadata', async () => {
    const crops = await cropStripForFamilies(STRIP_3)
    expect(crops.map(c => [c.familyIndex, c.familyCount])).toEqual([
      [0, 3], [1, 3], [2, 3],
    ])
  })

  test('extract called with correct left offsets for equal-width slicing', async () => {
    await cropStripForFamilies(STRIP_3)
    const calls = (mockChain.extract as ReturnType<typeof vi.fn>).mock.calls
    // width=900, 3 families → cropWidth=300
    expect(calls[0]![0]).toEqual({ left: 0,   top: 0, width: 300, height: 200 })
    expect(calls[1]![0]).toEqual({ left: 300, top: 0, width: 300, height: 200 })
    expect(calls[2]![0]).toEqual({ left: 600, top: 0, width: 300, height: 200 })
  })

  test('last crop absorbs rounding remainder', async () => {
    ;(mockChain.metadata as ReturnType<typeof vi.fn>).mockResolvedValue({ width: 901, height: 200 })
    await cropStripForFamilies(STRIP_3)
    const calls = (mockChain.extract as ReturnType<typeof vi.fn>).mock.calls
    // floor(901/3)=300; last crop = 901-600=301
    expect(calls[2]![0]).toMatchObject({ left: 600, width: 301 })
  })

  test('single-family strip returns full-width crop', async () => {
    const STRIP_1: StripEntry = { path: 'x/y.jpg', kometUrl: '', families: ['801'], label: 'x' }
    ;(mockChain.metadata as ReturnType<typeof vi.fn>).mockResolvedValue({ width: 600, height: 150 })
    await cropStripForFamilies(STRIP_1)
    const calls = (mockChain.extract as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0]![0]).toEqual({ left: 0, top: 0, width: 600, height: 150 })
  })
})

describe('cropSingleFamily', () => {
  test('re-crops a specific family from strip by index', async () => {
    await cropSingleFamily('test-section/test-strip-01.jpg', 1, 3)
    const calls = (mockChain.extract as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0]![0]).toEqual({ left: 300, top: 0, width: 300, height: 200 })
  })
})
