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
});
