import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import type { CatalogPdfService } from '../../services/catalog-pdf-service';
import type { SonnetFn } from './catalog-ingestion';
import { createCatalogIngestionHandler } from './catalog-ingestion';

const READING_GUIDE_RESPONSE = JSON.stringify({
  shank_codes: [{ code: '314', type: 'fg', length_mm: 19, diameter_mm: 1.6, name: 'FG short' }],
  grit_systems: { diamond: [], carbide: [], polisher: [] },
  size_code_to_mm: { '010': 1.0 },
  pictograms: [],
  root_post_collar_colors: [],
  packaging_rules: { units_per_pack_default: 5 },
});

const SAMPLE_FAMILY = {
  family_codes: ['879'],
  product_type: 'rotary_diamond',
  shape_description: 'Flame',
  material_description: 'Diamond',
  identification_clues: 'Blue ring',
  grit_options: [{ grit_indicator_type: 'ring_color', visual_cue: 'blue', grit_level: 'standard', label: 'Standard', prefix_pattern: '' }],
  shank_options: [{ code: '314', type: 'fg', length_mm: 19 }],
  size_options: [10, 12, 14],
  rpm_max: 160000,
  clinical_indications: 'Reduction',
  usage_notes: 'Water cooling required',
  pictograms: [],
  packaging_info: { units_per_pack: 5, sterile: false, single_use: false },
  notes: '',
};

function createMockPool(queryMocks: ReturnType<typeof vi.fn>[] = []): DbPool {
  const queryFn = vi.fn();
  for (const mock of queryMocks) {
    queryFn.mockImplementationOnce(mock);
  }
  return {
    query: queryFn,
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  } as unknown as DbPool;
}

function createMockCatalogPdf(totalPages = 11): CatalogPdfService {
  return {
    getPageAsBase64: vi.fn().mockResolvedValue('base64data'),
    getTotalPages: vi.fn().mockResolvedValue(totalPages),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe('createCatalogIngestionHandler', () => {
  test('handle() calls callSonnet for pages 5-9 with all 5 images', async () => {
    const pool = createMockPool();
    pool.query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })            // upsert reading guide
      .mockResolvedValueOnce({ rows: [{ last_page: null }] }) // resume query
      .mockResolvedValue({ rows: [] });               // subsequent inserts

    const catalogPdf = createMockCatalogPdf(9);
    const callSonnet: SonnetFn = vi.fn()
      .mockResolvedValueOnce(READING_GUIDE_RESPONSE) // reading guide call
      .mockResolvedValue('[]');                      // product page calls

    const handler = createCatalogIngestionHandler({ pool, catalogPdf, callSonnet });
    const promise = handler(null as never, {}, 'service', vi.fn());
    await vi.runAllTimersAsync();
    await promise;

    const sonnetMock = vi.mocked(callSonnet);
    const firstCall = sonnetMock.mock.calls[0]!;
    const images = firstCall[0];

    expect(images).toHaveLength(5);
    expect(images.every((img) => img.mediaType === 'image/png')).toBe(true);
    expect(images.every((img) => img.base64 === 'base64data')).toBe(true);
  });

  test('handle() upserts reading guide into catalog_reading_guide', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })                      // upsert reading guide
        .mockResolvedValueOnce({ rows: [{ last_page: null }] })   // resume query
        .mockResolvedValue({ rows: [] }),
      withTransaction: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    } as unknown as DbPool;

    const catalogPdf = createMockCatalogPdf(9);
    const callSonnet: SonnetFn = vi.fn()
      .mockResolvedValueOnce(READING_GUIDE_RESPONSE)
      .mockResolvedValue('[]');

    const handler = createCatalogIngestionHandler({ pool, catalogPdf, callSonnet });
    const promise = handler(null as never, {}, 'service', vi.fn());
    await vi.runAllTimersAsync();
    await promise;

    const upsertCall = vi.mocked(pool.query).mock.calls[0]!;
    expect(upsertCall[0]).toMatch(/INSERT INTO shared\.catalog_reading_guide/);
    expect(upsertCall[0]).toMatch(/ON CONFLICT \(page_range\) DO UPDATE/);
    expect(upsertCall[1]![0]).toEqual(JSON.parse(READING_GUIDE_RESPONSE));
  });

  test('handle() resumes from last processed page when catalog_entries has data', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })                       // upsert reading guide
        .mockResolvedValueOnce({ rows: [{ last_page: 15 }] })     // resume query → start from 16
        .mockResolvedValue({ rows: [] }),
      withTransaction: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    } as unknown as DbPool;

    const catalogPdf = createMockCatalogPdf(17);
    const callSonnet: SonnetFn = vi.fn()
      .mockResolvedValueOnce(READING_GUIDE_RESPONSE)
      .mockResolvedValue('[]');

    const handler = createCatalogIngestionHandler({ pool, catalogPdf, callSonnet });
    const promise = handler(null as never, {}, 'service', vi.fn());
    await vi.runAllTimersAsync();
    await promise;

    const sonnetMock = vi.mocked(callSonnet);
    const productPageCalls = sonnetMock.mock.calls.slice(1);

    // Pages 16 and 17 should be processed (2 pages from 16 to 17 inclusive)
    expect(productPageCalls).toHaveLength(2);

    const firstProductPrompt = productPageCalls[0]![1];
    expect(firstProductPrompt).toMatch(/Page 16 of the Komet 2025 catalog/);
  });

  test('handle() skips page on Sonnet error after 3 retries and continues to next page', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })                      // upsert reading guide
        .mockResolvedValueOnce({ rows: [{ last_page: null }] })   // resume query
        .mockResolvedValue({ rows: [] }),
      withTransaction: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    } as unknown as DbPool;

    const catalogPdf = createMockCatalogPdf(11);

    const sonnetError = new Error('Sonnet API unavailable');
    const callSonnet: SonnetFn = vi.fn()
      .mockResolvedValueOnce(READING_GUIDE_RESPONSE)    // reading guide succeeds
      .mockRejectedValueOnce(sonnetError)               // page 10 attempt 1
      .mockRejectedValueOnce(sonnetError)               // page 10 attempt 2
      .mockRejectedValueOnce(sonnetError)               // page 10 attempt 3 — give up
      .mockResolvedValueOnce('[]');                     // page 11 succeeds

    const handler = createCatalogIngestionHandler({ pool, catalogPdf, callSonnet });
    const promise = handler(null as never, {}, 'service', vi.fn());
    await vi.runAllTimersAsync();
    const result = await promise;

    const sonnetMock = vi.mocked(callSonnet);
    // 1 reading guide + 3 retries for page 10 + 1 for page 11 = 5 total calls
    expect(sonnetMock).toHaveBeenCalledTimes(5);
    // Page 10 failed (skipped), page 11 succeeded but returned [] → pagesProcessed=1
    expect(result).toEqual({ pagesProcessed: 1, familiesFound: 0 });
  });

  test('handle() inserts families into catalog_entries for each non-empty array response', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })                      // upsert reading guide
        .mockResolvedValueOnce({ rows: [{ last_page: null }] })   // resume query
        .mockResolvedValueOnce({ rows: [] })                      // insert family on page 10
        .mockResolvedValue({ rows: [] }),
      withTransaction: vi.fn(),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    } as unknown as DbPool;

    const catalogPdf = createMockCatalogPdf(10);
    const callSonnet: SonnetFn = vi.fn()
      .mockResolvedValueOnce(READING_GUIDE_RESPONSE)
      .mockResolvedValueOnce(JSON.stringify([SAMPLE_FAMILY])); // page 10 has 1 family

    const handler = createCatalogIngestionHandler({ pool, catalogPdf, callSonnet });
    const promise = handler(null as never, {}, 'service', vi.fn());
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ pagesProcessed: 1, familiesFound: 1 });

    const insertCall = vi.mocked(pool.query).mock.calls[2]!;
    expect(insertCall[0]).toMatch(/INSERT INTO shared\.catalog_entries/);
    expect(insertCall[0]).toMatch(/ON CONFLICT DO NOTHING/);

    const params = insertCall[1]!;
    expect(params[0]).toEqual(SAMPLE_FAMILY.family_codes);
    expect(params[1]).toBe(10);
    expect(params[2]).toBe(SAMPLE_FAMILY.product_type);
    expect(params[15]).toEqual(SAMPLE_FAMILY);
  });
});
