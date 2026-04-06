import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import { createWebProductEnrichmentHandler } from './web-product-enrichment';

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const productInfoRow = {
  name: 'Komet 879.314.014',
  catalog_family_code: '879',
  description_en: 'Diamond bur for enamel',
  web_enriched_at: null,
};

const youtubeResult = {
  url: 'https://www.youtube.com/watch?v=abc123',
  title: 'Komet 879 tutorial',
  snippet: 'Step-by-step guide',
};

const pdfResult = {
  url: 'https://komet.de/ifu/879.pdf',
  title: 'IFU 879',
  snippet: 'Instructions for use',
};

const articleResult = {
  url: 'https://dental-journal.com/879-komet-review',
  title: '879 Komet clinical review',
  snippet: 'Clinical indications for use',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createWebProductEnrichmentHandler', () => {
  test('returns early with zeros when no productId in job data', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn();
    const searchWeb = vi.fn();

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    const result = await handler(null, {}, 'service-account', vi.fn());

    expect(result).toEqual({ scraped: 0, resourcesFound: 0 });
    expect(vi.mocked(pool.query)).not.toHaveBeenCalled();
  });

  test('returns early with zeros when product not found in DB', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn();
    const searchWeb = vi.fn();

    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    const result = await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    expect(result).toEqual({ scraped: 0, resourcesFound: 0 });
    expect(fetchUrl).not.toHaveBeenCalled();
    expect(searchWeb).not.toHaveBeenCalled();
  });

  test('calls searchWeb 3 times with correct query strings for the family code', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('network error'));
    const searchWeb = vi.fn().mockResolvedValue([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    expect(searchWeb).toHaveBeenCalledTimes(3);
    expect(searchWeb).toHaveBeenCalledWith('"879 Komet" dental technique OR clinical indication');
    expect(searchWeb).toHaveBeenCalledWith('"879 Komet" video tutorial youtube');
    expect(searchWeb).toHaveBeenCalledWith('"879 Komet" IFU instructions pdf');
  });

  test('classifies youtube URL as video, .pdf URL as pdf, other as article', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('network error'));
    const searchWeb = vi.fn()
      .mockResolvedValueOnce([youtubeResult])
      .mockResolvedValueOnce([pdfResult])
      .mockResolvedValueOnce([articleResult]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    const queryCalls = vi.mocked(pool.query).mock.calls;
    const resourceInsertCalls = queryCalls.filter(([sql]) =>
      (sql as string).includes('product_web_resources'),
    );

    const insertedTypes = resourceInsertCalls.map(([, params]) => (params as unknown[])[1]);
    expect(insertedTypes).toEqual(['video', 'pdf', 'article']);
  });

  test('inserts resources into product_web_resources with correct params', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('network error'));
    const searchWeb = vi.fn()
      .mockResolvedValueOnce([youtubeResult])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    const queryCalls = vi.mocked(pool.query).mock.calls;
    const resourceInsertCall = queryCalls.find(([sql]) =>
      (sql as string).includes('product_web_resources'),
    );

    expect(resourceInsertCall).toBeDefined();
    expect(resourceInsertCall![1]).toEqual([
      '879.314.014',
      'video',
      youtubeResult.url,
      youtubeResult.title,
      youtubeResult.snippet,
      'www.youtube.com',
      'en',
    ]);
  });

  test('continues and updates web_enriched_at even when fetchUrl throws', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('connection refused'));
    const searchWeb = vi.fn().mockResolvedValue([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    const result = await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    expect(result).toEqual({ scraped: 0, resourcesFound: 0 });

    const queryCalls = vi.mocked(pool.query).mock.calls;
    const webEnrichedAtUpdate = queryCalls.find(([sql]) =>
      (sql as string).includes('web_enriched_at'),
    );
    expect(webEnrichedAtUpdate).toBeDefined();
  });

  test('updates web_enriched_at in product_details via upsert', async () => {
    const pool = createMockPool();
    const fetchUrl = vi.fn().mockRejectedValue(new Error('network error'));
    const searchWeb = vi.fn().mockResolvedValue([]);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [productInfoRow], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const handler = createWebProductEnrichmentHandler({ pool, fetchUrl, searchWeb });
    await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

    const queryCalls = vi.mocked(pool.query).mock.calls;
    const upsertCall = queryCalls.find(
      ([sql]) =>
        (sql as string).includes('product_details') &&
        (sql as string).includes('web_enriched_at') &&
        (sql as string).includes('ON CONFLICT'),
    );

    expect(upsertCall).toBeDefined();
    expect(upsertCall![1]).toEqual(['879.314.014']);
  });
});
