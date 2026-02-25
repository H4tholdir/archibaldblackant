import { describe, expect, test, vi } from 'vitest';
import { syncProducts, type ProductSyncDeps } from './product-sync';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockDeps(pool?: DbPool): ProductSyncDeps {
  return {
    pool: pool ?? createMockPool(),
    downloadPdf: vi.fn().mockResolvedValue('/tmp/products.pdf'),
    parsePdf: vi.fn().mockResolvedValue([
      { id: 'P-001', name: 'Widget', searchName: 'WIDGET', groupCode: 'GRP1', packageContent: 1 },
      { id: 'P-002', name: 'Gadget', searchName: 'GADGET', groupCode: 'GRP2', packageContent: 6 },
    ]),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

describe('syncProducts', () => {
  test('downloads, parses, and upserts products', async () => {
    const deps = createMockDeps();
    const result = await syncProducts(deps, vi.fn(), () => false);

    expect(result.success).toBe(true);
    expect(result.productsProcessed).toBe(2);
  });

  test('stops on shouldStop', async () => {
    const deps = createMockDeps();
    const result = await syncProducts(deps, vi.fn(), () => true);
    expect(result.success).toBe(false);
  });

  test('cleans up PDF', async () => {
    const deps = createMockDeps();
    await syncProducts(deps, vi.fn(), () => false);
    expect(deps.cleanupFile).toHaveBeenCalledWith('/tmp/products.pdf');
  });

  test('reports progress at 100', async () => {
    const deps = createMockDeps();
    const onProgress = vi.fn();
    await syncProducts(deps, onProgress, () => false);
    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });
});
