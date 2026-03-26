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

function createMockDeps(pool?: DbPool, overrides?: Partial<ProductSyncDeps>): ProductSyncDeps {
  return {
    pool: pool ?? createMockPool(),
    downloadPdf: vi.fn().mockResolvedValue('/tmp/products.pdf'),
    parsePdf: vi.fn().mockResolvedValue([
      { id: 'P-001', name: 'Widget', searchName: 'WIDGET', groupCode: 'GRP1', packageContent: 1 },
      { id: 'P-002', name: 'Gadget', searchName: 'GADGET', groupCode: 'GRP2', packageContent: 6 },
    ]),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
    softDeleteGhosts: vi.fn().mockResolvedValue(0),
    trackProductCreated: vi.fn().mockResolvedValue(undefined),
    ...overrides,
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

  test('calls softDeleteGhosts with ids and name map of all synced products', async () => {
    const softDeleteGhosts = vi.fn().mockResolvedValue(0);
    const deps = createMockDeps(undefined, { softDeleteGhosts });
    await syncProducts(deps, vi.fn(), () => false);
    expect(softDeleteGhosts).toHaveBeenCalledWith(
      ['P-001', 'P-002'],
      new Map([['Widget', 'P-001'], ['Gadget', 'P-002']]),
    );
  });

  test('reports ghost count in result', async () => {
    const deps = createMockDeps(undefined, { softDeleteGhosts: vi.fn().mockResolvedValue(3) });
    const result = await syncProducts(deps, vi.fn(), () => false);
    expect(result.ghostsDeleted).toBe(3);
  });

  test('tracks each new product as created', async () => {
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);
    // pool returns empty rows → both P-001 and P-002 are new
    const deps = createMockDeps(undefined, { trackProductCreated });
    await syncProducts(deps, vi.fn(), () => false);
    expect(trackProductCreated).toHaveBeenCalledTimes(2);
    expect(trackProductCreated).toHaveBeenCalledWith('P-001', expect.any(String));
    expect(trackProductCreated).toHaveBeenCalledWith('P-002', expect.any(String));
  });

  test('does not track existing non-deleted product as created', async () => {
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);
    const pool = createMockPool();
    // SELECT returns existing non-deleted product for both queries
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ id: 'P-001', deleted_at: null }],
      rowCount: 1,
    });
    const deps = createMockDeps(pool, { trackProductCreated });
    await syncProducts(deps, vi.fn(), () => false);
    expect(trackProductCreated).not.toHaveBeenCalled();
  });

  test('calls onProductsChanged when new products are found', async () => {
    const onProductsChanged = vi.fn().mockResolvedValue(undefined);
    // pool default → rows: [] → both products are new
    const deps = createMockDeps(undefined, { onProductsChanged });

    await syncProducts(deps, vi.fn(), () => false);

    expect(onProductsChanged).toHaveBeenCalledOnce();
    expect(onProductsChanged).toHaveBeenCalledWith(2, 0);
  });

  test('calls onProductsChanged when ghosts are deleted', async () => {
    const onProductsChanged = vi.fn().mockResolvedValue(undefined);
    const pool = createMockPool();
    // Products already exist and are not new
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ id: 'P-001', deleted_at: null }], rowCount: 1 });
    const softDeleteGhosts = vi.fn().mockResolvedValue(3);
    const deps = createMockDeps(pool, { softDeleteGhosts, onProductsChanged });

    await syncProducts(deps, vi.fn(), () => false);

    expect(onProductsChanged).toHaveBeenCalledOnce();
    expect(onProductsChanged).toHaveBeenCalledWith(0, 3);
  });

  test('does not call onProductsChanged when nothing new or deleted', async () => {
    const onProductsChanged = vi.fn().mockResolvedValue(undefined);
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ id: 'P-001', deleted_at: null }], rowCount: 1 });
    // softDeleteGhosts returns 0
    const deps = createMockDeps(pool, { onProductsChanged });

    await syncProducts(deps, vi.fn(), () => false);

    expect(onProductsChanged).not.toHaveBeenCalled();
  });

  test('calls onProductsMissingVat after sync when provided', async () => {
    const onProductsMissingVat = vi.fn().mockResolvedValue(undefined);
    const deps = createMockDeps(undefined, { onProductsMissingVat });

    await syncProducts(deps, vi.fn(), () => false);

    expect(onProductsMissingVat).toHaveBeenCalledOnce();
  });

  test('does not call onProductsMissingVat when not provided', async () => {
    const deps = createMockDeps();
    await expect(syncProducts(deps, vi.fn(), () => false)).resolves.toMatchObject({ success: true });
  });

  test('tracks restored soft-deleted product as created and clears deleted_at', async () => {
    const trackProductCreated = vi.fn().mockResolvedValue(undefined);
    const pool = createMockPool();
    const softDeletedAt = '2026-03-01T00:00:00Z';
    // P-001 SELECT → soft-deleted; UPDATE → ok; P-002 SELECT → soft-deleted; UPDATE → ok
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [{ id: 'P-001', deleted_at: softDeletedAt }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE P-001
      .mockResolvedValueOnce({ rows: [{ id: 'P-002', deleted_at: softDeletedAt }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE P-002
    const deps = createMockDeps(pool, { trackProductCreated });
    await syncProducts(deps, vi.fn(), () => false);
    expect(trackProductCreated).toHaveBeenCalledTimes(2);
    expect(trackProductCreated).toHaveBeenCalledWith('P-001', expect.any(String));
    expect(trackProductCreated).toHaveBeenCalledWith('P-002', expect.any(String));
    // Verify deleted_at was cleared in the UPDATE
    const updateCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('deleted_at = NULL'),
    );
    expect(updateCalls).toHaveLength(2);
  });
});
