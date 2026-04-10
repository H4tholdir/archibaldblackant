import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import {
  getProducts,
  getProductById,
  getProductCount,
  getProductVariants,
  getProductsWithoutVat,
  upsertProducts,
  findDeletedProducts,
  softDeleteProducts,
  updateProductPrice,
  getLastSyncTime,
  getAllProducts,
  getAllProductVariants,
  extractBaseCode,
  findSiblingVariants,
  updateProductVat,
  levenshteinDistance,
  calculateSimilarity,
  fuzzySearchProducts,
  getRecentProductChanges,
  getProductChangeStats,
  getProductPricesByNames,
  getShankLengthMm,
} from './products';

function createMockPool(queryFn?: DbPool['query']): DbPool {
  return {
    query: queryFn ?? vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

describe('getProducts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns all non-deleted products when no search query', async () => {
    const productRow = {
      id: 'P001',
      name: 'Test Product',
      description: 'A product',
      group_code: 'GRP1',
      search_name: 'test',
      price_unit: 'KG',
      product_group_id: 'PG1',
      product_group_description: 'Group 1',
      package_content: '1 collo',
      min_qty: 1,
      multiple_qty: 1,
      max_qty: 100,
      price: 10.5,
      price_source: 'archibald',
      price_updated_at: '2026-01-01T00:00:00Z',
      vat: 22,
      vat_source: 'excel',
      vat_updated_at: '2026-01-01T00:00:00Z',
      hash: 'abc123',
      last_sync: 1000000,
    };
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [productRow], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getProducts(pool);

    expect(result).toEqual([productRow]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM shared.products'),
      [],
    );
  });

  test('applies normalized search filter when query provided', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    );

    await getProducts(pool, 'H129.FSQ');

    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('LIKE');
    expect(call[1]).toEqual(['%h129fsq%', '%h129fsq%', '%h129fsq%', '%h129fsq%', 100]);
  });
});

describe('getProductById', () => {
  test('returns product row when found', async () => {
    const productRow = { id: 'P001', name: 'Test' };
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [productRow], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getProductById(pool, 'P001');

    expect(result).toEqual(productRow);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1'),
      ['P001'],
    );
  });

  test('returns undefined when not found', async () => {
    const pool = createMockPool();

    const result = await getProductById(pool, 'MISSING');

    expect(result).toBeUndefined();
  });
});

describe('getProductCount', () => {
  test('returns count of non-deleted products', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [{ count: 42 }], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getProductCount(pool);

    expect(result).toBe(42);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('deleted_at IS NULL'),
    );
  });
});

describe('getProductVariants', () => {
  test('returns variants sorted by package_content descending', async () => {
    const variants = [
      { id: 'P001-A', name: 'Product A', package_content: '5 colli' },
      { id: 'P001-B', name: 'Product A', package_content: '1 collo' },
    ];
    const pool = createMockPool(
      vi.fn(async () => ({ rows: variants, rowCount: 2, command: '', oid: 0, fields: [] })),
    );

    const result = await getProductVariants(pool, 'Product A');

    expect(result).toEqual(variants);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE name = $1'),
      ['Product A'],
    );
  });
});

describe('upsertProducts', () => {
  test('inserts new products when no existing hash match', async () => {
    const queryFn = vi.fn(async (text: string) => {
      if (text.includes('SELECT id, hash, deleted_at')) {
        return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
      }
      if (text.includes('INSERT INTO shared.products')) {
        return { rows: [], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      if (text.includes('INSERT INTO shared.product_changes')) {
        return { rows: [], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);

    const products = [
      { id: 'P001', name: 'New Product', hash: 'hash1', last_sync: 1000 },
    ];

    const result = await upsertProducts(pool, products);

    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(0);
  });

  test('skips products when hash matches existing', async () => {
    const queryFn = vi.fn(async (text: string) => {
      if (text.includes('SELECT id, hash, deleted_at')) {
        return { rows: [{ id: 'P001', hash: 'hash1', deleted_at: null }], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);

    const products = [
      { id: 'P001', name: 'Same Product', hash: 'hash1', last_sync: 1000 },
    ];

    const result = await upsertProducts(pool, products);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(1);
  });

  test('updates product when hash differs', async () => {
    const queryFn = vi.fn(async (text: string) => {
      if (text.includes('SELECT id, hash, deleted_at')) {
        return { rows: [{ id: 'P001', hash: 'old_hash', deleted_at: null }], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      if (text.includes('INSERT INTO shared.products')) {
        return { rows: [], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      if (text.includes('INSERT INTO shared.product_changes')) {
        return { rows: [], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);

    const products = [
      { id: 'P001', name: 'Updated Product', hash: 'new_hash', last_sync: 2000 },
    ];

    const result = await upsertProducts(pool, products);

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.unchanged).toBe(0);
  });
});

describe('findDeletedProducts', () => {
  test('returns IDs not in the provided list', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [{ id: 'P003' }, { id: 'P004' }],
        rowCount: 2,
        command: '',
        oid: 0,
        fields: [],
      })),
    );

    const result = await findDeletedProducts(pool, ['P001', 'P002']);

    expect(result).toEqual(['P003', 'P004']);
  });

  test('returns empty array when no current IDs provided', async () => {
    const pool = createMockPool();

    const result = await findDeletedProducts(pool, []);

    expect(result).toEqual([]);
  });
});

describe('softDeleteProducts', () => {
  test('sets deleted_at and logs changes', async () => {
    const queryFn = vi.fn(async (text: string) => {
      if (text.includes('UPDATE shared.products')) {
        return { rows: [], rowCount: 2, command: '', oid: 0, fields: [] };
      }
      if (text.includes('INSERT INTO shared.product_changes')) {
        return { rows: [], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);

    const result = await softDeleteProducts(pool, ['P001', 'P002'], 'sync-123');

    expect(result).toBe(2);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET deleted_at = NOW()'),
      expect.any(Array),
    );
  });

  test('returns 0 when no ids provided', async () => {
    const pool = createMockPool();

    const result = await softDeleteProducts(pool, [], 'sync-123');

    expect(result).toBe(0);
  });

  test('logs renamed product as updated with field_changed=id instead of deleted', async () => {
    const insertCalls: string[][] = [];
    const queryFn = vi.fn(async (text: string, params?: unknown[]) => {
      if (text.includes('INSERT INTO shared.product_changes')) {
        insertCalls.push(params as string[]);
      }
      return { rows: [], rowCount: 1, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);
    const renames = new Map([['P001', 'P001-NEW']]);

    await softDeleteProducts(pool, ['P001', 'P002'], 'sync-123', renames);

    const renamedInsert = insertCalls.find((p) => p[0] === 'P001');
    const deletedInsert = insertCalls.find((p) => p[0] === 'P002');
    expect(renamedInsert).toEqual(['P001', 'id', 'P001', 'P001-NEW', expect.any(Number), 'sync-123']);
    expect(deletedInsert).toEqual(['P002', expect.any(Number), 'sync-123']);
  });
});

describe('updateProductPrice', () => {
  test('updates price and vat fields with sources', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await updateProductPrice(pool, 'P001', 10.5, 22, 'archibald', 'excel');

    expect(result).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('price = $2'),
      ['P001', 10.5, 22, 'archibald', 'excel'],
    );
  });

  test('returns false when product not found', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    );

    const result = await updateProductPrice(pool, 'MISSING', 10, 22, 'manual', null);

    expect(result).toBe(false);
  });
});

describe('getLastSyncTime', () => {
  test('returns last sync bigint value', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [{ last_sync: 1708300000000 }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      })),
    );

    const result = await getLastSyncTime(pool);

    expect(result).toBe(1708300000000);
  });

  test('returns null when no products exist', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [{ last_sync: null }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      })),
    );

    const result = await getLastSyncTime(pool);

    expect(result).toBeNull();
  });
});

describe('getAllProducts', () => {
  test('returns all non-deleted products', async () => {
    const products = [
      { id: 'P001', name: 'A' },
      { id: 'P002', name: 'B' },
    ];
    const pool = createMockPool(
      vi.fn(async () => ({ rows: products, rowCount: 2, command: '', oid: 0, fields: [] })),
    );

    const result = await getAllProducts(pool);

    expect(result).toEqual(products);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL'));
  });
});

describe('getProductsWithoutVat', () => {
  test('returns products where vat IS NULL with limit', async () => {
    const productsWithoutVat = [
      { id: 'P003', name: 'No VAT Product', price: 10.0, vat: null, group_code: 'GRP1' },
    ];
    const pool = createMockPool(
      vi.fn(async () => ({ rows: productsWithoutVat, rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getProductsWithoutVat(pool, 50);

    expect(result).toEqual(productsWithoutVat);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('vat IS NULL'),
      [50],
    );
  });

  test('returns empty array when all products have VAT', async () => {
    const pool = createMockPool();

    const result = await getProductsWithoutVat(pool, 100);

    expect(result).toEqual([]);
  });
});

describe('getAllProductVariants', () => {
  test('returns variant info for products with multipleQty', async () => {
    const variants = [
      { productId: 'Article A', variantId: 'P001', multiple_qty: 5, min_qty: 1, max_qty: 100, package_content: '5 colli' },
    ];
    const pool = createMockPool(
      vi.fn(async () => ({ rows: variants, rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getAllProductVariants(pool);

    expect(result).toEqual(variants);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('multiple_qty IS NOT NULL'),
    );
  });
});

describe('extractBaseCode', () => {
  test('strips trailing K', () => {
    expect(extractBaseCode('ABC123K')).toBe('ABC123');
  });

  test('strips trailing R', () => {
    expect(extractBaseCode('ABC123R')).toBe('ABC123');
  });

  test('no change for base codes without suffix', () => {
    expect(extractBaseCode('ABC123')).toBe('ABC123');
  });

  test('handles lowercase suffix', () => {
    expect(extractBaseCode('abc123k')).toBe('abc123');
  });

  test('does not strip K/R from middle of code', () => {
    expect(extractBaseCode('KR123')).toBe('KR123');
  });

  test('handles dot-containing product IDs', () => {
    expect(extractBaseCode('h129fsq.104.023K')).toBe('h129fsq.104.023');
  });

  test('preserves IDs ending in non-K/R letters', () => {
    expect(extractBaseCode('ABC123Z')).toBe('ABC123Z');
  });
});

describe('findSiblingVariants', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns all products sharing base code', async () => {
    const siblings = [
      { id: 'ABC123' },
      { id: 'ABC123K' },
      { id: 'ABC123R' },
    ];
    const pool = createMockPool(
      vi.fn(async () => ({ rows: siblings, rowCount: 3, command: '', oid: 0, fields: [] })),
    );

    const result = await findSiblingVariants(pool, 'ABC123K');

    expect(result).toEqual(siblings);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id ~ $1 AND deleted_at IS NULL'),
      ['^ABC123[KRkr]?$'],
    );
  });

  test('returns empty array when no siblings exist', async () => {
    const pool = createMockPool();

    const result = await findSiblingVariants(pool, 'LONELY001');

    expect(result).toEqual([]);
  });

  test('escapes dots in product IDs for regex safety', async () => {
    const siblings = [{ id: 'h129.001' }, { id: 'h129.001K' }];
    const pool = createMockPool(
      vi.fn(async () => ({ rows: siblings, rowCount: 2, command: '', oid: 0, fields: [] })),
    );

    const result = await findSiblingVariants(pool, 'h129.001');

    expect(result).toEqual(siblings);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id ~ $1 AND deleted_at IS NULL'),
      ['^h129\\.001[KRkr]?$'],
    );
  });

  test('excludes soft-deleted products via WHERE clause', async () => {
    const pool = createMockPool();

    await findSiblingVariants(pool, 'ABC123');

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('deleted_at IS NULL'),
      expect.any(Array),
    );
  });
});

describe('updateProductVat', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('updates VAT and vat_source on existing product', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await updateProductVat(pool, 'P001', 22, 'excel-import');

    expect(result).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('vat = $2'),
      ['P001', 22, 'excel-import'],
    );
  });

  test('returns true when product exists', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await updateProductVat(pool, 'P001', 10, 'manual');

    expect(result).toBe(true);
  });

  test('returns false when product does not exist', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    );

    const result = await updateProductVat(pool, 'MISSING', 22, 'excel-import');

    expect(result).toBe(false);
  });

  test('does not touch price fields', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    await updateProductVat(pool, 'P001', 22, 'excel-import');

    const sql = vi.mocked(pool.query).mock.calls[0][0] as string;
    expect(sql).not.toContain('price =');
    expect(sql).not.toContain('price_source');
    expect(sql).not.toContain('price_updated_at');
    expect(sql).toContain('vat = $2');
    expect(sql).toContain('vat_source = $3');
    expect(sql).toContain('vat_updated_at');
  });
});

describe('levenshteinDistance', () => {
  test('returns 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  test('returns length of non-empty string when other is empty', () => {
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', 'xyz')).toBe(3);
  });

  test('counts single character substitution', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  test('counts insertion and deletion', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('calculateSimilarity', () => {
  test('returns 1.0 for exact match', () => {
    expect(calculateSimilarity('h129', 'h129')).toBe(1.0);
  });

  test('returns 0.98 for match after normalization (dots/spaces/dashes)', () => {
    expect(calculateSimilarity('h129.fsq', 'h129fsq')).toBe(0.98);
  });

  test('returns high score for substring match', () => {
    const score = calculateSimilarity('h129', 'h129fsq104023');
    expect(score).toBeGreaterThanOrEqual(0.7);
    expect(score).toBeLessThan(0.98);
  });

  test('returns low score for unrelated strings', () => {
    expect(calculateSimilarity('abc', 'xyz')).toBeLessThan(0.5);
  });

  test('handles product codes with special characters', () => {
    const score = calculateSimilarity('H129.FSQ.104', 'H129FSQ104023');
    expect(score).toBeGreaterThanOrEqual(0.7);
  });
});

describe('fuzzySearchProducts', () => {
  function makeProduct(id: string, name: string): Record<string, unknown> {
    return {
      id, name, description: '', group_code: '', search_name: name,
      price_unit: '', product_group_id: '', product_group_description: '',
      package_content: '', min_qty: 1, multiple_qty: 1, max_qty: 100,
      price: 10, price_source: '', price_updated_at: null,
      vat: 22, vat_source: '', vat_updated_at: null,
      hash: '', last_sync: 0,
    };
  }

  test('returns exact matches with highest confidence', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [makeProduct('ABC', 'ABC Widget'), makeProduct('XYZ', 'XYZ Gadget')],
        rowCount: 2, command: '', oid: 0, fields: [],
      })),
    );

    const results = await fuzzySearchProducts(pool, 'ABC', 5);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].product.id).toBe('ABC');
    expect(results[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('returns empty array for empty query', async () => {
    const pool = createMockPool(vi.fn());
    const results = await fuzzySearchProducts(pool, '', 5);
    expect(results).toEqual([]);
  });

  test('filters out low confidence results (below 0.3)', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [makeProduct('ZZZZZ', 'Completely Different')],
        rowCount: 1, command: '', oid: 0, fields: [],
      })),
    );

    const results = await fuzzySearchProducts(pool, 'ABC', 5);
    expect(results.every(r => r.confidence > 0.3)).toBe(true);
  });

  test('classifies match reasons correctly', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [makeProduct('H129', 'H129 Fresa')],
        rowCount: 1, command: '', oid: 0, fields: [],
      })),
    );

    const results = await fuzzySearchProducts(pool, 'H129', 5);
    expect(results[0].matchReason).toBe('exact');
    expect(results[0].confidence).toBeGreaterThanOrEqual(0.95);
  });
});

describe('getRecentProductChanges', () => {
  const SAMPLE_ROW = {
    product_id: 'P001',
    product_name: 'Fresa Pilota',
    change_type: 'deleted',
    changed_at: '1741234567890', // pg returns BIGINT as string
    sync_session_id: 'session-abc',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('maps changedAt from string to number', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [SAMPLE_ROW], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getRecentProductChanges(pool, 30, 100);

    expect(typeof result[0].changedAt).toBe('number');
    expect(result[0].changedAt).toBe(1741234567890);
  });

  test('includes productName from joined products table', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [SAMPLE_ROW], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getRecentProductChanges(pool, 30, 100);

    expect(result[0].productName).toBe('Fresa Pilota');
  });

  test('returns empty array when no changes in period', async () => {
    const pool = createMockPool();

    const result = await getRecentProductChanges(pool, 7, 100);

    expect(result).toEqual([]);
  });

  test('maps fieldChanged, oldValue, newValue for id-rename records', async () => {
    const renameRow = {
      product_id: '032278K0',
      product_name: '9436C.204.045',
      change_type: 'updated',
      changed_at: '1773308686335',
      sync_session_id: 'sync-1773308686335',
      field_changed: 'id',
      old_value: '032278K0',
      new_value: '032278K1',
    };
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [renameRow], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getRecentProductChanges(pool, 30, 100);

    expect(result[0]).toMatchObject({
      fieldChanged: 'id',
      oldValue: '032278K0',
      newValue: '032278K1',
    });
  });
});

describe('getProductChangeStats', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns totalChanges as sum of all change types', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [
          { change_type: 'created', count: 5 },
          { change_type: 'updated', count: 10 },
          { change_type: 'deleted', count: 3 },
        ],
        rowCount: 3, command: '', oid: 0, fields: [],
      })),
    );

    const result = await getProductChangeStats(pool, 30);

    expect(result).toEqual({ created: 5, updated: 10, deleted: 3, totalChanges: 18 });
  });

  test('returns zero totalChanges when no changes', async () => {
    const pool = createMockPool();

    const result = await getProductChangeStats(pool, 30);

    expect(result).toEqual({ created: 0, updated: 0, deleted: 0, totalChanges: 0 });
  });
});

describe('getProductPricesByNames', () => {
  const artA = '6830L.314.014';
  const artB = '9436C.204.045';

  test('returns empty Map when names array is empty', async () => {
    const pool = createMockPool();

    const result = await getProductPricesByNames(pool, []);

    expect(result.size).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('returns price and vat for each found article name', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [
          { name: artA, price: 12.5, vat: 22 },
          { name: artB, price: 7.0, vat: 4 },
        ],
        rowCount: 2, command: '', oid: 0, fields: [],
      })),
    );

    const result = await getProductPricesByNames(pool, [artA, artB]);

    expect(result.get(artA)).toEqual({ price: 12.5, vat: 22 });
    expect(result.get(artB)).toEqual({ price: 7.0, vat: 4 });
  });

  test('maps null for requested name not found in DB', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [{ name: artA, price: 12.5, vat: 22 }],
        rowCount: 1, command: '', oid: 0, fields: [],
      })),
    );

    const result = await getProductPricesByNames(pool, [artA, artB]);

    expect(result.get(artA)).toEqual({ price: 12.5, vat: 22 });
    expect(result.get(artB)).toBeNull();
  });

  test('defaults vat to 22 when DB row has null vat', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [{ name: artA, price: 5.0, vat: null }],
        rowCount: 1, command: '', oid: 0, fields: [],
      })),
    );

    const result = await getProductPricesByNames(pool, [artA]);

    expect(result.get(artA)).toEqual({ price: 5.0, vat: 22 });
  });

  test('maps null when DB row has null price', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({
        rows: [{ name: artA, price: null, vat: 22 }],
        rowCount: 1, command: '', oid: 0, fields: [],
      })),
    );

    const result = await getProductPricesByNames(pool, [artA]);

    expect(result.get(artA)).toBeNull();
  });

  test('uses ANY($1::text[]) and passes names array as single param', async () => {
    const mockQuery = vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] }));
    const pool = createMockPool(mockQuery);

    await getProductPricesByNames(pool, [artA, artB]);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ANY($1::text[])'),
      [[artA, artB]],
    );
  });
});

describe('getShankLengthMm', () => {
  const productId = 'H1.314.009';
  const shankCode = '314';

  test('returns shank length when catalog entry exists for the given shank code', async () => {
    const pool = createMockPool(vi.fn(async () => ({
      rows: [{ shank_length_mm: 19 }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    })));

    const result = await getShankLengthMm(pool, productId, shankCode);

    expect(result).toBe(19);
  });

  test('returns null when no catalog entry matches', async () => {
    const pool = createMockPool(vi.fn(async () => ({
      rows: [],
      rowCount: 0, command: 'SELECT', oid: 0, fields: [],
    })));

    const result = await getShankLengthMm(pool, productId, shankCode);

    expect(result).toBeNull();
  });

  test('passes productId and shankCode as query parameters', async () => {
    const mockQuery = vi.fn(async () => ({
      rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [],
    }));
    const pool = createMockPool(mockQuery as DbPool['query']);

    await getShankLengthMm(pool, productId, shankCode);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('shank_options'),
      [productId, shankCode],
    );
  });
});
