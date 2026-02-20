import { describe, expect, test, vi } from 'vitest';
import { syncPrices, type PriceSyncDeps } from './price-sync';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockDeps(pool?: DbPool): PriceSyncDeps {
  return {
    pool: pool ?? createMockPool(),
    downloadPdf: vi.fn().mockResolvedValue('/tmp/prices.pdf'),
    parsePdf: vi.fn().mockResolvedValue([
      { productId: 'P-001', productName: 'Widget', unitPrice: 5.00, currency: 'EUR', priceValidFrom: '2026-01-01' },
      { productId: 'P-002', productName: 'Gadget', unitPrice: 20.00, currency: 'EUR', priceValidFrom: '2026-01-01' },
    ]),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

describe('syncPrices', () => {
  test('downloads, parses, and upserts prices', async () => {
    const deps = createMockDeps();
    const result = await syncPrices(deps, vi.fn(), () => false);

    expect(result.success).toBe(true);
    expect(result.pricesProcessed).toBe(2);
  });

  test('stops on shouldStop', async () => {
    const deps = createMockDeps();
    const result = await syncPrices(deps, vi.fn(), () => true);
    expect(result.success).toBe(false);
  });

  test('cleans up PDF', async () => {
    const deps = createMockDeps();
    await syncPrices(deps, vi.fn(), () => false);
    expect(deps.cleanupFile).toHaveBeenCalledWith('/tmp/prices.pdf');
  });

  test('reports progress at 100', async () => {
    const deps = createMockDeps();
    const onProgress = vi.fn();
    await syncPrices(deps, onProgress, () => false);
    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('stops during DB loop when shouldStop returns true mid-iteration', async () => {
    const totalRecords = 15;
    const prices = Array.from({ length: totalRecords }, (_, i) => ({
      productId: `P-${String(i).padStart(3, '0')}`,
      productName: `Product ${i}`,
      unitPrice: (i + 1) * 5,
      currency: 'EUR',
      priceValidFrom: '2026-01-01',
    }));
    const deps = createMockDeps();
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue(prices);

    let dbLoopCalls = 0;
    const shouldStop = () => {
      dbLoopCalls++;
      return dbLoopCalls > 3;
    };

    const result = await syncPrices(deps, vi.fn(), shouldStop);

    expect(result.success).toBe(false);
    expect(result.error).toContain('db-loop');

    const insertCalls = (deps.pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO shared.prices'));
    expect(insertCalls.length).toBeLessThan(totalRecords);
  });
});
