import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import { createCatalogProductEnrichmentHandler } from './catalog-product-enrichment';

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    withTransaction: vi.fn(),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

const catalogEntryForFamily879 = {
  catalog_page: 42,
  product_type: 'rotary_diamond',
  shape_description: 'Ball',
  material_description: 'Diamond',
  clinical_indications: 'Enamel preparation',
  rpm_max: 160000,
  usage_notes: 'Use with water cooling',
  pictograms: [{ symbol: 'water', meaning: 'Water cooling required' }],
  packaging_info: { units_per_pack: 5, sterile: false, single_use: false },
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createCatalogProductEnrichmentHandler', () => {
  describe('bulk mode', () => {
    test('queries products without catalog_enriched_at, enriches matching ones, skips unmatched', async () => {
      const pool = createMockPool();
      const queryMock = vi.mocked(pool.query);

      queryMock
        .mockResolvedValueOnce({ rows: [{ id: '879.314.014' }, { id: '999.000.000' }], rowCount: 2 })
        .mockResolvedValueOnce({ rows: [catalogEntryForFamily879], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const handler = createCatalogProductEnrichmentHandler({ pool });
      const result = await handler(null, {}, 'service-account', vi.fn());

      expect(result).toEqual({ enriched: 1, notFound: 1 });
    });

    test('runs the bulk SELECT with correct filter for missing catalog_enriched_at', async () => {
      const pool = createMockPool();
      const queryMock = vi.mocked(pool.query);

      queryMock
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const handler = createCatalogProductEnrichmentHandler({ pool });
      await handler(null, {}, 'service-account', vi.fn());

      const [bulkSql] = queryMock.mock.calls[0] as [string, ...unknown[]];
      expect(bulkSql).toContain('catalog_enriched_at IS NULL');
      expect(bulkSql).toContain('deleted_at IS NULL');
    });
  });

  describe('single mode', () => {
    test('enriches only the given productId when { productId } is in job data', async () => {
      const pool = createMockPool();
      const queryMock = vi.mocked(pool.query);

      queryMock
        .mockResolvedValueOnce({ rows: [catalogEntryForFamily879], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const handler = createCatalogProductEnrichmentHandler({ pool });
      const result = await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

      expect(result).toEqual({ enriched: 1, notFound: 0 });
      expect(queryMock).toHaveBeenCalledTimes(2);
    });

    test('returns notFound:1 when no catalog entry matches the product', async () => {
      const pool = createMockPool();
      const queryMock = vi.mocked(pool.query);

      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const handler = createCatalogProductEnrichmentHandler({ pool });
      const result = await handler(null, { productId: '999.000.000' }, 'service-account', vi.fn());

      expect(result).toEqual({ enriched: 0, notFound: 1 });
      expect(queryMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('family code extraction', () => {
    test('"879.314.014" → "879" used in the @> query', async () => {
      const pool = createMockPool();
      const queryMock = vi.mocked(pool.query);

      queryMock
        .mockResolvedValueOnce({ rows: [catalogEntryForFamily879], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const handler = createCatalogProductEnrichmentHandler({ pool });
      await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

      const [catalogSql, catalogParams] = queryMock.mock.calls[0] as [string, string[]];
      expect(catalogSql).toContain('@>');
      expect(catalogParams).toEqual(['879']);
    });

    test('product id with no dots uses the whole string as family code', async () => {
      const pool = createMockPool();
      const queryMock = vi.mocked(pool.query);

      queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const handler = createCatalogProductEnrichmentHandler({ pool });
      await handler(null, { productId: '879' }, 'service-account', vi.fn());

      const [, catalogParams] = queryMock.mock.calls[0] as [string, string[]];
      expect(catalogParams).toEqual(['879']);
    });
  });

  describe('upsert SQL params', () => {
    test('packaging_units, sterile, single_use come from packaging_info fields', async () => {
      const pool = createMockPool();
      const queryMock = vi.mocked(pool.query);

      const entryWithPackaging = {
        ...catalogEntryForFamily879,
        packaging_info: { units_per_pack: 10, sterile: true, single_use: true },
      };

      queryMock
        .mockResolvedValueOnce({ rows: [entryWithPackaging], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const handler = createCatalogProductEnrichmentHandler({ pool });
      await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

      const [upsertSql, upsertParams] = queryMock.mock.calls[1] as [string, unknown[]];
      expect(upsertSql).toContain('ON CONFLICT');

      const productId = upsertParams[0];
      const familyCode = upsertParams[1];
      const packagingUnits = upsertParams[7];
      const sterile = upsertParams[8];
      const singleUse = upsertParams[9];

      expect(productId).toBe('879.314.014');
      expect(familyCode).toBe('879');
      expect(packagingUnits).toBe(10);
      expect(sterile).toBe(true);
      expect(singleUse).toBe(true);
    });

    test('packaging_units, sterile, single_use are null when packaging_info is null', async () => {
      const pool = createMockPool();
      const queryMock = vi.mocked(pool.query);

      const entryNoPackaging = { ...catalogEntryForFamily879, packaging_info: null };

      queryMock
        .mockResolvedValueOnce({ rows: [entryNoPackaging], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const handler = createCatalogProductEnrichmentHandler({ pool });
      await handler(null, { productId: '879.314.014' }, 'service-account', vi.fn());

      const [, upsertParams] = queryMock.mock.calls[1] as [string, unknown[]];

      expect(upsertParams[7]).toBeNull();
      expect(upsertParams[8]).toBeNull();
      expect(upsertParams[9]).toBeNull();
    });
  });
});
