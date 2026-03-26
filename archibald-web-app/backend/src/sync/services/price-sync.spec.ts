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
      { productId: 'P-001', productName: 'Widget', unitPrice: '5,00 €', currency: 'EUR', priceValidFrom: '2026-01-01' },
      { productId: 'P-002', productName: 'Gadget', unitPrice: '20,00 €', currency: 'EUR', priceValidFrom: '2026-01-01' },
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

  test('calls onPricesChanged with updated count when prices change', async () => {
    const pool = createMockPool();
    // Both prices already exist with different hash → updated
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ hash: 'old-hash' }], rowCount: 1 });
    const onPricesChanged = vi.fn().mockResolvedValue(undefined);
    const deps = createMockDeps(pool);
    deps.onPricesChanged = onPricesChanged;

    await syncPrices(deps, vi.fn(), () => false);

    expect(onPricesChanged).toHaveBeenCalledOnce();
    expect(onPricesChanged).toHaveBeenCalledWith(2);
  });

  test('does not call onPricesChanged when no prices are updated', async () => {
    const pool = createMockPool();
    // Both prices already exist with same hash → skipped (hash matches)
    // We simulate this by making the hash match: pool returns a hash that happens to match
    // The actual hash is computed by the service, so we just return a non-matching hash to see
    // if onPricesChanged is NOT called when pricesUpdated === 0.
    // Easiest: make all prices new (rows: []) → pricesInserted, not pricesUpdated
    const onPricesChanged = vi.fn().mockResolvedValue(undefined);
    const deps = createMockDeps(pool);
    deps.onPricesChanged = onPricesChanged;
    // pool default returns rows: [] → inserts (pricesInserted, not pricesUpdated)

    await syncPrices(deps, vi.fn(), () => false);

    expect(onPricesChanged).not.toHaveBeenCalled();
  });

  test('does not call onPricesChanged when not provided', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ hash: 'old-hash' }], rowCount: 1 });
    // no onPricesChanged in deps
    const deps = createMockDeps(pool);

    await expect(syncPrices(deps, vi.fn(), () => false)).resolves.toMatchObject({ success: true });
  });
});
