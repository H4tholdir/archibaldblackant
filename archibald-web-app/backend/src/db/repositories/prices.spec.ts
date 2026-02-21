import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import {
  upsertPrice,
  getPrice,
  getPricesByProductId,
  getTotalCount,
  getAllPrices,
  getSyncStats,
  recordPriceChange,
  getRecentPriceChanges,
  getPriceHistoryByProduct,
} from './prices';

function createMockPool(queryFn?: DbPool['query']): DbPool {
  return {
    query: queryFn ?? vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

describe('upsertPrice', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('inserts new price when no existing record found', async () => {
    const queryFn = vi.fn(async (text: string) => {
      if (text.includes('SELECT id, hash')) {
        return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
      }
      if (text.includes('INSERT INTO shared.prices')) {
        return { rows: [], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);

    const priceData = {
      product_id: 'P001',
      product_name: 'Test Product',
      unit_price: '10,50',
      item_selection: 'K2',
      packaging_description: '5 colli',
      currency: 'EUR',
      price_valid_from: '2026-01-01',
      price_valid_to: '2026-12-31',
      price_unit: 'KG',
      account_description: 'Account 1',
      account_code: 'ACC01',
      price_qty_from: 1,
      price_qty_to: 100,
      last_modified: '2026-01-15',
      data_area_id: 'DAI1',
      hash: 'abc123',
      last_sync: 1000000,
    };

    const result = await upsertPrice(pool, priceData);

    expect(result).toBe('inserted');
  });

  test('skips when hash matches existing record', async () => {
    const queryFn = vi.fn(async (text: string) => {
      if (text.includes('SELECT id, hash')) {
        return { rows: [{ id: 1, hash: 'abc123' }], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);

    const priceData = {
      product_id: 'P001',
      product_name: 'Test Product',
      unit_price: '10,50',
      item_selection: 'K2',
      hash: 'abc123',
      last_sync: 1000000,
    };

    const result = await upsertPrice(pool, priceData);

    expect(result).toBe('skipped');
  });

  test('updates when hash differs from existing record', async () => {
    const queryFn = vi.fn(async (text: string) => {
      if (text.includes('SELECT id, hash')) {
        return { rows: [{ id: 1, hash: 'old_hash' }], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      if (text.includes('UPDATE shared.prices')) {
        return { rows: [], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);

    const priceData = {
      product_id: 'P001',
      product_name: 'Updated Product',
      unit_price: '15,00',
      item_selection: 'K2',
      hash: 'new_hash',
      last_sync: 2000000,
    };

    const result = await upsertPrice(pool, priceData);

    expect(result).toBe('updated');
  });
});

describe('getPrice', () => {
  test('returns price for product and item selection', async () => {
    const priceRow = { id: 1, product_id: 'P001', item_selection: 'K2', unit_price: '10,50' };
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [priceRow], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getPrice(pool, 'P001', 'K2');

    expect(result).toEqual(priceRow);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('product_id = $1'),
      ['P001', 'K2'],
    );
  });

  test('returns undefined when not found', async () => {
    const pool = createMockPool();

    const result = await getPrice(pool, 'MISSING', null);

    expect(result).toBeUndefined();
  });
});

describe('getPricesByProductId', () => {
  test('returns all prices for a product ordered by item_selection', async () => {
    const prices = [
      { id: 1, product_id: 'P001', item_selection: 'K2' },
      { id: 2, product_id: 'P001', item_selection: 'K3' },
    ];
    const pool = createMockPool(
      vi.fn(async () => ({ rows: prices, rowCount: 2, command: '', oid: 0, fields: [] })),
    );

    const result = await getPricesByProductId(pool, 'P001');

    expect(result).toEqual(prices);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY item_selection'),
      ['P001'],
    );
  });
});

describe('getTotalCount', () => {
  test('returns total count of prices', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [{ count: 150 }], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getTotalCount(pool);

    expect(result).toBe(150);
  });
});

describe('getAllPrices', () => {
  test('returns all prices ordered by product_id and item_selection', async () => {
    const prices = [
      { id: 1, product_id: 'P001', item_selection: 'K2' },
      { id: 2, product_id: 'P002', item_selection: 'K3' },
    ];
    const pool = createMockPool(
      vi.fn(async () => ({ rows: prices, rowCount: 2, command: '', oid: 0, fields: [] })),
    );

    const result = await getAllPrices(pool);

    expect(result).toEqual(prices);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY product_id, item_selection'),
    );
  });
});

describe('getSyncStats', () => {
  test('returns sync statistics', async () => {
    const queryFn = vi.fn(async (text: string) => {
      if (text.includes('COUNT(*)')) {
        return { rows: [{ total_prices: 100, last_sync_timestamp: 1708300000, prices_with_null_price: 5 }], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);

    const result = await getSyncStats(pool);

    expect(result).toEqual({
      total_prices: 100,
      last_sync_timestamp: 1708300000,
      prices_with_null_price: 5,
    });
  });
});

describe('recordPriceChange', () => {
  test('inserts a price change record with all fields', async () => {
    const queryFn = vi.fn(async () => ({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] }));
    const pool = createMockPool(queryFn);

    await recordPriceChange(pool, {
      product_id: 'P001',
      product_name: 'Widget',
      variant_id: 'K2',
      old_price: 10,
      new_price: 15,
      percentage_change: 50,
      change_type: 'increase',
      sync_date: 1700000000,
      source: 'price-sync',
    });

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.price_history'),
      ['P001', 'Widget', 'K2', 10, 15, 50, 'increase', 1700000000, 'price-sync'],
    );
  });

  test('defaults source to price-sync and variant_id to null', async () => {
    const queryFn = vi.fn(async () => ({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] }));
    const pool = createMockPool(queryFn);

    await recordPriceChange(pool, {
      product_id: 'P002',
      product_name: 'Gadget',
      old_price: null,
      new_price: 20,
      percentage_change: 0,
      change_type: 'new',
      sync_date: 1700000000,
    });

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.price_history'),
      ['P002', 'Gadget', null, null, 20, 0, 'new', 1700000000, 'price-sync'],
    );
  });
});

describe('getRecentPriceChanges', () => {
  test('returns changes and aggregated stats', async () => {
    const changeRow = {
      id: 1, product_id: 'P001', product_name: 'Widget', variant_id: null,
      old_price: 10, new_price: 15, percentage_change: 50,
      change_type: 'increase', sync_date: 1700000000, source: 'price-sync',
    };
    const statsRow = { total_changes: 3, increases: 2, decreases: 1, new_prices: 0 };
    const queryFn = vi.fn(async (text: string) => {
      if (text.includes('SELECT id, product_id')) {
        return { rows: [changeRow], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      if (text.includes('COUNT(*)')) {
        return { rows: [statsRow], rowCount: 1, command: '', oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
    });
    const pool = createMockPool(queryFn);

    const result = await getRecentPriceChanges(pool, 30);

    expect(result).toEqual({
      changes: [changeRow],
      stats: statsRow,
    });
  });
});

describe('getPriceHistoryByProduct', () => {
  test('returns history rows for a product with default limit', async () => {
    const historyRow = {
      id: 1, product_id: 'P001', product_name: 'Widget', variant_id: null,
      old_price: 10, new_price: 12, percentage_change: 20,
      change_type: 'increase', sync_date: 1700000000, source: 'price-sync',
    };
    const queryFn = vi.fn(async () => ({ rows: [historyRow], rowCount: 1, command: '', oid: 0, fields: [] }));
    const pool = createMockPool(queryFn);

    const result = await getPriceHistoryByProduct(pool, 'P001');

    expect(result).toEqual([historyRow]);
    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('WHERE product_id = $1'),
      ['P001', 100],
    );
  });

  test('respects custom limit', async () => {
    const queryFn = vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] }));
    const pool = createMockPool(queryFn);

    await getPriceHistoryByProduct(pool, 'P001', 5);

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $2'),
      ['P001', 5],
    );
  });
});
