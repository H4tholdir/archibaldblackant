import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import {
  getProducts,
  getProductById,
  getProductCount,
  getProductVariants,
  upsertProducts,
  findDeletedProducts,
  softDeleteProducts,
  updateProductPrice,
  getLastSyncTime,
  getAllProducts,
  getAllProductVariants,
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
    );
  });

  test('applies normalized search filter when query provided', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    );

    await getProducts(pool, 'H129.FSQ');

    const call = vi.mocked(pool.query).mock.calls[0];
    expect(call[0]).toContain('LIKE');
    expect(call[1]).toEqual(['%h129fsq%', '%h129fsq%', '%h129fsq%', '%h129fsq%']);
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
