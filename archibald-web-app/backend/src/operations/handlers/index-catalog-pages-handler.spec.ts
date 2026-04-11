import { describe, test, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { createIndexCatalogPagesHandler, CATALOG_PAGES_DIR } from './index-catalog-pages-handler'

// --- fs mocks ---
const mockMkdir     = vi.fn().mockResolvedValue(undefined)
const mockWriteFile = vi.fn().mockResolvedValue(undefined)
const mockAccess    = vi.fn().mockRejectedValue(new Error('ENOENT')) // file does not exist by default
const mockReadFile  = vi.fn()

vi.mock('node:fs/promises', () => ({
  mkdir:     (...a: unknown[]) => mockMkdir(...a),
  writeFile: (...a: unknown[]) => mockWriteFile(...a),
  access:    (...a: unknown[]) => mockAccess(...a),
  readFile:  (...a: unknown[]) => mockReadFile(...a),
}))

// --- sharp mock: pngToJpeg returns fixed buffer ---
vi.mock('sharp', () => {
  const instance = {
    jpeg:     vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('JPEG_DATA')),
  }
  return { default: vi.fn(() => instance) }
})

// --- repo mocks ---
const mockUpsertFamilyImage      = vi.fn()
const mockUpdateEmbedding        = vi.fn()
const mockGetIndexedCatalogKeys  = vi.fn()

vi.mock('../../db/repositories/catalog-family-images', () => ({
  upsertFamilyImage:          (...a: unknown[]) => mockUpsertFamilyImage(...a),
  updateEmbedding:            (...a: unknown[]) => mockUpdateEmbedding(...a),
  getIndexedCatalogFamilyKeys: (...a: unknown[]) => mockGetIndexedCatalogKeys(...a),
}))

// --- fixtures ---
const FAKE_EMBEDDING = Array(2048).fill(0.1)

function makePool(queryRows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows: queryRows }) } as unknown as import('../../db/pool').DbPool
}

function makeDeps(pool: ReturnType<typeof makePool>) {
  return {
    pool,
    catalogPdf:   { getPageAsBase64: vi.fn().mockResolvedValue(Buffer.from('PNG').toString('base64')) },
    embeddingSvc: { embedImage: vi.fn().mockResolvedValue(FAKE_EMBEDDING) },
  }
}

const PAGE_509_PATH = join(CATALOG_PAGES_DIR, '509.jpg')

beforeEach(() => {
  vi.clearAllMocks()
  mockUpsertFamilyImage.mockResolvedValue(1)
  mockUpdateEmbedding.mockResolvedValue(undefined)
  mockGetIndexedCatalogKeys.mockResolvedValue(new Set<string>())
  mockAccess.mockRejectedValue(new Error('ENOENT')) // page file not yet saved
})

describe('createIndexCatalogPagesHandler', () => {
  test('embeds each unique page once and stores one row per family', async () => {
    const pool = makePool([
      { catalog_page: 509, family_codes: ['227A', '227B'] },
    ])
    const deps = makeDeps(pool)
    await createIndexCatalogPagesHandler(deps)(null, {}, 'admin', vi.fn())

    expect(deps.embeddingSvc.embedImage).toHaveBeenCalledTimes(1)
    expect(mockUpsertFamilyImage).toHaveBeenCalledTimes(2)
    expect(mockUpdateEmbedding).toHaveBeenCalledTimes(2)
  })

  test('saves page as JPEG to disk', async () => {
    const pool = makePool([{ catalog_page: 509, family_codes: ['227B'] }])
    const deps = makeDeps(pool)
    await createIndexCatalogPagesHandler(deps)(null, {}, 'admin', vi.fn())

    expect(mockWriteFile).toHaveBeenCalledWith(PAGE_509_PATH, expect.any(Buffer))
  })

  test('reuses cached page file without calling catalogPdf again', async () => {
    mockAccess.mockResolvedValue(undefined) // file already exists
    mockReadFile.mockResolvedValue(Buffer.from('CACHED_JPEG'))
    const pool = makePool([{ catalog_page: 509, family_codes: ['227B'] }])
    const deps = makeDeps(pool)
    await createIndexCatalogPagesHandler(deps)(null, {}, 'admin', vi.fn())

    expect(deps.catalogPdf.getPageAsBase64).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
    expect(deps.embeddingSvc.embedImage).toHaveBeenCalledTimes(1)
  })

  test('skips families already indexed', async () => {
    mockGetIndexedCatalogKeys.mockResolvedValue(new Set([`227A|${PAGE_509_PATH}`]))
    const pool = makePool([{ catalog_page: 509, family_codes: ['227A', '227B'] }])
    const deps = makeDeps(pool)
    await createIndexCatalogPagesHandler(deps)(null, {}, 'admin', vi.fn())

    // Only 227B is new → 1 upsert
    expect(mockUpsertFamilyImage).toHaveBeenCalledTimes(1)
    expect(mockUpsertFamilyImage).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ family_code: '227B' }),
    )
  })

  test('skips entire page when all families already indexed', async () => {
    mockGetIndexedCatalogKeys.mockResolvedValue(
      new Set([`227A|${PAGE_509_PATH}`, `227B|${PAGE_509_PATH}`]),
    )
    const pool = makePool([{ catalog_page: 509, family_codes: ['227A', '227B'] }])
    const deps = makeDeps(pool)
    await createIndexCatalogPagesHandler(deps)(null, {}, 'admin', vi.fn())

    expect(deps.catalogPdf.getPageAsBase64).not.toHaveBeenCalled()
    expect(deps.embeddingSvc.embedImage).not.toHaveBeenCalled()
  })

  test('continues processing remaining pages when one page fails', async () => {
    const pool = makePool([
      { catalog_page: 509, family_codes: ['227B'] },
      { catalog_page: 510, family_codes: ['863'] },
    ])
    const deps = makeDeps(pool)
    deps.catalogPdf.getPageAsBase64
      .mockRejectedValueOnce(new Error('pdftoppm failed'))
      .mockResolvedValueOnce(Buffer.from('PNG').toString('base64'))

    const result = await createIndexCatalogPagesHandler(deps)(null, {}, 'admin', vi.fn())
    expect(result).toMatchObject({ indexed: 1, errors: 1 })
  })

  test('stores upsert metadata with catalog_page number', async () => {
    const pool = makePool([{ catalog_page: 509, family_codes: ['227B'] }])
    const deps = makeDeps(pool)
    await createIndexCatalogPagesHandler(deps)(null, {}, 'admin', vi.fn())

    expect(mockUpsertFamilyImage).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        source_type: 'catalog_pdf',
        priority:    2,
        metadata:    { catalog_page: 509 },
        local_path:  PAGE_509_PATH,
      }),
    )
  })
})
