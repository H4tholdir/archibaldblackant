import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { DbPool } from '../pool';
import {
  recordPriceChange,
  getProductHistory,
  getRecentChanges,
  getRecentStats,
  getTopIncreases,
  getTopDecreases,
} from './prices-history';

function createMockPool(queryFn?: DbPool['query']): DbPool {
  return {
    query: queryFn ?? vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    withTransaction: vi.fn(),
    end: vi.fn(async () => {}),
    getStats: vi.fn(() => ({ totalCount: 1, idleCount: 1, waitingCount: 0 })),
  };
}

const SAMPLE_ROW = {
  id: 1,
  product_id: 'P001',
  product_name: 'Mozzarella DOP',
  variant_id: 'K2',
  old_price: '10,50',
  new_price: '12,00',
  old_price_numeric: 10.5,
  new_price_numeric: 12.0,
  price_change: 1.5,
  percentage_change: 14.29,
  change_type: 'increase',
  source: 'pdf-sync',
  currency: 'EUR',
  changed_at: '2026-02-20T10:00:00.000Z',
  created_at: '2026-02-20T10:00:00.000Z',
};

const EXPECTED_ENTRY = {
  id: 1,
  productId: 'P001',
  oldPrice: '10,50',
  newPrice: '12,00',
  changeType: 'increase',
  changedAt: '2026-02-20T10:00:00.000Z',
  source: 'pdf-sync',
};

describe('recordPriceChange', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('inserts price change and returns mapped entry', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [SAMPLE_ROW], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await recordPriceChange(pool, {
      productId: 'P001',
      productName: 'Mozzarella DOP',
      variantId: 'K2',
      oldPrice: '10,50',
      newPrice: '12,00',
      oldPriceNumeric: 10.5,
      newPriceNumeric: 12.0,
      priceChange: 1.5,
      percentageChange: 14.29,
      changeType: 'increase',
      source: 'pdf-sync',
      currency: 'EUR',
    });

    expect(result).toEqual(EXPECTED_ENTRY);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.price_history'),
      ['P001', 'Mozzarella DOP', 'K2', '10,50', '12,00', 10.5, 12.0, 1.5, 14.29, 'increase', 'pdf-sync', 'EUR'],
    );
  });

  test('inserts new price with null old values', async () => {
    const newRow = {
      ...SAMPLE_ROW,
      old_price: null,
      old_price_numeric: null,
      price_change: null,
      percentage_change: null,
      change_type: 'new',
      variant_id: null,
    };
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [newRow], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await recordPriceChange(pool, {
      productId: 'P001',
      productName: 'Mozzarella DOP',
      newPrice: '12,00',
      newPriceNumeric: 12.0,
      changeType: 'new',
      source: 'excel-upload',
    });

    expect(result).toEqual({
      id: 1,
      productId: 'P001',
      oldPrice: null,
      newPrice: '12,00',
      changeType: 'new',
      changedAt: '2026-02-20T10:00:00.000Z',
      source: 'pdf-sync',
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shared.price_history'),
      ['P001', 'Mozzarella DOP', null, null, '12,00', null, 12.0, null, null, 'new', 'excel-upload', null],
    );
  });
});

describe('getProductHistory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns mapped entries for a product with default limit', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [SAMPLE_ROW], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getProductHistory(pool, 'P001');

    expect(result).toEqual([EXPECTED_ENTRY]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE product_id = $1'),
      ['P001', 50],
    );
  });

  test('passes custom limit', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    );

    await getProductHistory(pool, 'P001', 10);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $2'),
      ['P001', 10],
    );
  });

  test('returns empty array when no history exists', async () => {
    const pool = createMockPool();

    const result = await getProductHistory(pool, 'MISSING');

    expect(result).toEqual([]);
  });
});

describe('getRecentChanges', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns recent changes within days window', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [SAMPLE_ROW], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getRecentChanges(pool, 30);

    expect(result).toEqual([EXPECTED_ENTRY]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('make_interval(days => $1)'),
      [30],
    );
  });

  test('returns empty array when no recent changes', async () => {
    const pool = createMockPool();

    const result = await getRecentChanges(pool, 7);

    expect(result).toEqual([]);
  });
});

describe('getRecentStats', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns aggregated statistics for the period', async () => {
    const statsRow = {
      total_changes: 25,
      increases: 10,
      decreases: 8,
      new_prices: 7,
      avg_increase: 5.75,
      avg_decrease: -3.20,
    };
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [statsRow], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getRecentStats(pool, 30);

    expect(result).toEqual({
      totalChanges: 25,
      increases: 10,
      decreases: 8,
      newPrices: 7,
      avgIncrease: 5.75,
      avgDecrease: -3.20,
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('make_interval(days => $1)'),
      [30],
    );
  });

  test('returns zero averages when no increases or decreases', async () => {
    const statsRow = {
      total_changes: 3,
      increases: 0,
      decreases: 0,
      new_prices: 3,
      avg_increase: null,
      avg_decrease: null,
    };
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [statsRow], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getRecentStats(pool, 7);

    expect(result).toEqual({
      totalChanges: 3,
      increases: 0,
      decreases: 0,
      newPrices: 3,
      avgIncrease: 0,
      avgDecrease: 0,
    });
  });
});

describe('getTopIncreases', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns top increases ordered by percentage_change DESC', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [SAMPLE_ROW], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getTopIncreases(pool, 30, 5);

    expect(result).toEqual([EXPECTED_ENTRY]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("change_type = 'increase'"),
      [30, 5],
    );
  });

  test('uses default limit of 10', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    );

    await getTopIncreases(pool, 30);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $2'),
      [30, 10],
    );
  });
});

describe('getTopDecreases', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns top decreases ordered by percentage_change ASC', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [SAMPLE_ROW], rowCount: 1, command: '', oid: 0, fields: [] })),
    );

    const result = await getTopDecreases(pool, 30, 5);

    expect(result).toEqual([EXPECTED_ENTRY]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("change_type = 'decrease'"),
      [30, 5],
    );
  });

  test('uses default limit of 10', async () => {
    const pool = createMockPool(
      vi.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
    );

    await getTopDecreases(pool, 30);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $2'),
      [30, 10],
    );
  });
});
