import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import { setupTestDb, truncateAllTables, destroyTestDb } from '../../db/integration/test-db-setup';
import { syncPrices, type PriceSyncDeps, type ParsedPrice } from './price-sync';

const TEST_PDF_PATH = '/tmp/test-prices.pdf';

function makePrice(overrides: Partial<ParsedPrice> & { productId: string; productName: string; unitPrice: number }): ParsedPrice {
  return {
    productId: overrides.productId,
    productName: overrides.productName,
    unitPrice: overrides.unitPrice,
    itemSelection: overrides.itemSelection,
    packagingDescription: overrides.packagingDescription,
    currency: overrides.currency ?? 'EUR',
    priceValidFrom: overrides.priceValidFrom ?? '2026-01-01',
    priceValidTo: overrides.priceValidTo,
    priceUnit: overrides.priceUnit ?? 'PZ',
    accountDescription: overrides.accountDescription,
    accountCode: overrides.accountCode,
    priceQtyFrom: overrides.priceQtyFrom,
    priceQtyTo: overrides.priceQtyTo,
    lastModified: overrides.lastModified,
    dataAreaId: overrides.dataAreaId,
  };
}

function makeDeps(pool: DbPool, prices: ParsedPrice[]): PriceSyncDeps {
  return {
    pool,
    downloadPdf: vi.fn().mockResolvedValue(TEST_PDF_PATH),
    parsePdf: vi.fn().mockResolvedValue(prices),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

const neverStop = () => false;

describe('syncPrices (integration)', () => {
  let pool: DbPool;

  beforeAll(async () => {
    pool = await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
  });

  afterAll(async () => {
    if (pool) await destroyTestDb(pool);
  });

  test('sync inserts prices and verifies rows', async () => {
    const prices = [
      makePrice({ productId: 'P-001', productName: 'Widget', unitPrice: 5.50, priceValidFrom: '2026-01-01', currency: 'EUR' }),
      makePrice({ productId: 'P-002', productName: 'Gadget', unitPrice: 12.00, priceValidFrom: '2026-01-01', currency: 'EUR' }),
    ];
    const deps = makeDeps(pool, prices);

    const result = await syncPrices(deps, vi.fn(), neverStop);

    expect(result).toEqual({
      success: true,
      pricesProcessed: 2,
      pricesInserted: 2,
      pricesUpdated: 0,
      pricesSkipped: 0,
      duration: expect.any(Number),
    });

    const { rows } = await pool.query<{ product_id: string; product_name: string; unit_price: string; currency: string }>(
      'SELECT product_id, product_name, unit_price, currency FROM shared.prices ORDER BY product_id',
    );
    expect(rows).toEqual([
      { product_id: 'P-001', product_name: 'Widget', unit_price: '5.5', currency: 'EUR' },
      { product_id: 'P-002', product_name: 'Gadget', unit_price: '12', currency: 'EUR' },
    ]);
  });

  test('second sync with same data skips prices (hash unchanged)', async () => {
    const prices = [
      makePrice({ productId: 'P-010', productName: 'Stable Price Product', unitPrice: 9.99, priceValidFrom: '2026-02-01' }),
    ];

    await syncPrices(makeDeps(pool, prices), vi.fn(), neverStop);
    const secondResult = await syncPrices(makeDeps(pool, prices), vi.fn(), neverStop);

    expect(secondResult.pricesInserted).toBe(0);
    expect(secondResult.pricesUpdated).toBe(0);
    expect(secondResult.pricesSkipped).toBe(1);
  });

  test('modified price triggers update via upsert on composite key', async () => {
    const originalPrice = makePrice({
      productId: 'P-020',
      productName: 'Updatable Product',
      unitPrice: 10.00,
      priceValidFrom: '2026-03-01',
      priceQtyFrom: 1,
      priceValidTo: '2026-12-31',
    });
    await syncPrices(makeDeps(pool, [originalPrice]), vi.fn(), neverStop);

    const modifiedPrice = makePrice({
      productId: 'P-020',
      productName: 'Updatable Product',
      unitPrice: 15.00,
      priceValidFrom: '2026-03-01',
      priceQtyFrom: 1,
      priceValidTo: '2027-06-30',
    });
    const result = await syncPrices(makeDeps(pool, [modifiedPrice]), vi.fn(), neverStop);

    expect(result.pricesUpdated).toBe(1);
    expect(result.pricesSkipped).toBe(0);

    const { rows } = await pool.query<{ unit_price: string; price_valid_to: string }>(
      'SELECT unit_price, price_valid_to FROM shared.prices WHERE product_id = $1 AND price_valid_from = $2',
      ['P-020', '2026-03-01'],
    );
    expect(rows).toEqual([{ unit_price: '15', price_valid_to: '2027-06-30' }]);
  });

  test('multiple prices for same product with different valid_from are separate rows', async () => {
    const prices = [
      makePrice({ productId: 'P-030', productName: 'Multi-Price Product', unitPrice: 8.00, priceValidFrom: '2026-01-01' }),
      makePrice({ productId: 'P-030', productName: 'Multi-Price Product', unitPrice: 9.50, priceValidFrom: '2026-04-01' }),
      makePrice({ productId: 'P-030', productName: 'Multi-Price Product', unitPrice: 11.00, priceValidFrom: '2026-07-01' }),
    ];
    const deps = makeDeps(pool, prices);

    const result = await syncPrices(deps, vi.fn(), neverStop);

    expect(result.pricesInserted).toBe(3);

    const { rows } = await pool.query<{ product_id: string; unit_price: string; price_valid_from: string }>(
      'SELECT product_id, unit_price, price_valid_from FROM shared.prices WHERE product_id = $1 ORDER BY price_valid_from',
      ['P-030'],
    );
    expect(rows).toEqual([
      { product_id: 'P-030', unit_price: '8', price_valid_from: '2026-01-01' },
      { product_id: 'P-030', unit_price: '9.5', price_valid_from: '2026-04-01' },
      { product_id: 'P-030', unit_price: '11', price_valid_from: '2026-07-01' },
    ]);
  });
});
