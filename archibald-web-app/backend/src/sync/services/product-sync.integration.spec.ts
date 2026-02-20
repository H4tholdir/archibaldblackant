import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DbPool } from '../../db/pool';
import { setupTestDb, truncateAllTables, destroyTestDb } from '../../db/integration/test-db-setup';
import { syncProducts, type ProductSyncDeps, type ParsedProduct } from './product-sync';

const TEST_PDF_PATH = '/tmp/test-products.pdf';

function makeProduct(overrides: Partial<ParsedProduct> & { id: string; name: string }): ParsedProduct {
  return {
    id: overrides.id,
    name: overrides.name,
    searchName: overrides.searchName ?? overrides.name.toUpperCase(),
    groupCode: overrides.groupCode ?? 'GRP-DEFAULT',
    packageContent: overrides.packageContent ?? 1,
    description: overrides.description,
    priceUnit: overrides.priceUnit ?? 'PZ',
    productGroupId: overrides.productGroupId,
    minQty: overrides.minQty,
    multipleQty: overrides.multipleQty,
    maxQty: overrides.maxQty,
    figure: overrides.figure,
    bulkArticleId: overrides.bulkArticleId,
    legPackage: overrides.legPackage,
    size: overrides.size,
    vat: overrides.vat ?? 22,
  };
}

function makeDeps(pool: DbPool, products: ParsedProduct[]): ProductSyncDeps {
  return {
    pool,
    downloadPdf: vi.fn().mockResolvedValue(TEST_PDF_PATH),
    parsePdf: vi.fn().mockResolvedValue(products),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

const neverStop = () => false;

describe('syncProducts (integration)', () => {
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

  test('sync inserts products and verifies rows', async () => {
    const products = [
      makeProduct({ id: 'PROD-001', name: 'Widget Alpha', groupCode: 'GRP-A', vat: 22 }),
      makeProduct({ id: 'PROD-002', name: 'Gadget Beta', groupCode: 'GRP-B', vat: 10 }),
    ];
    const deps = makeDeps(pool, products);

    const result = await syncProducts(deps, vi.fn(), neverStop);

    expect(result).toEqual({
      success: true,
      productsProcessed: 2,
      newProducts: 2,
      updatedProducts: 0,
      duration: expect.any(Number),
    });

    const { rows } = await pool.query<{ id: string; name: string; group_code: string; vat: number }>(
      'SELECT id, name, group_code, vat FROM shared.products ORDER BY id',
    );
    expect(rows).toEqual([
      { id: 'PROD-001', name: 'Widget Alpha', group_code: 'GRP-A', vat: 22 },
      { id: 'PROD-002', name: 'Gadget Beta', group_code: 'GRP-B', vat: 10 },
    ]);
  });

  test('second sync with same data updates all products (no hash-based skip)', async () => {
    const products = [
      makeProduct({ id: 'PROD-010', name: 'Stable Product', groupCode: 'GRP-S' }),
    ];

    await syncProducts(makeDeps(pool, products), vi.fn(), neverStop);
    const secondResult = await syncProducts(makeDeps(pool, products), vi.fn(), neverStop);

    expect(secondResult.newProducts).toBe(0);
    expect(secondResult.updatedProducts).toBe(1);
  });

  test('sync with modified product updates the row via upsert', async () => {
    const originalProduct = makeProduct({ id: 'PROD-020', name: 'Original Name', groupCode: 'GRP-O', vat: 22 });
    await syncProducts(makeDeps(pool, [originalProduct]), vi.fn(), neverStop);

    const modifiedProduct = makeProduct({ id: 'PROD-020', name: 'Modified Name', groupCode: 'GRP-M', vat: 10 });
    const result = await syncProducts(makeDeps(pool, [modifiedProduct]), vi.fn(), neverStop);

    expect(result.updatedProducts).toBe(1);

    const { rows } = await pool.query<{ name: string; group_code: string; vat: number }>(
      'SELECT name, group_code, vat FROM shared.products WHERE id = $1',
      ['PROD-020'],
    );
    expect(rows).toEqual([{ name: 'Modified Name', group_code: 'GRP-M', vat: 10 }]);
  });

  test('products are never deleted by sync (no deletion logic)', async () => {
    const products = [
      makeProduct({ id: 'PROD-030', name: 'Permanent A' }),
      makeProduct({ id: 'PROD-031', name: 'Permanent B' }),
    ];
    await syncProducts(makeDeps(pool, products), vi.fn(), neverStop);

    const fewerProducts = [
      makeProduct({ id: 'PROD-030', name: 'Permanent A' }),
    ];
    await syncProducts(makeDeps(pool, fewerProducts), vi.fn(), neverStop);

    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM shared.products WHERE id LIKE 'PROD-03%' ORDER BY id",
    );
    expect(rows).toEqual([
      { id: 'PROD-030' },
      { id: 'PROD-031' },
    ]);
  });
});
