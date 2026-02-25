import { describe, expect, test, vi } from 'vitest';
import { syncOrders, type OrderSyncDeps } from './order-sync';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ hash: '', order_number: '' }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockDeps(pool?: DbPool): OrderSyncDeps {
  return {
    pool: pool ?? createMockPool(),
    downloadPdf: vi.fn().mockResolvedValue('/tmp/orders.pdf'),
    parsePdf: vi.fn().mockResolvedValue([
      { id: 'ORD-001', orderNumber: 'SO-001', customerProfileId: 'C1', customerName: 'Acme', creationDate: '2026-01-01', salesStatus: 'Open' },
      { id: 'ORD-002', orderNumber: 'SO-002', customerProfileId: 'C2', customerName: 'Beta', creationDate: '2026-01-02', salesStatus: 'Open' },
    ]),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

describe('syncOrders', () => {
  test('downloads PDF, parses it, and upserts orders', async () => {
    const deps = createMockDeps();
    const result = await syncOrders(deps, 'user-1', vi.fn(), () => false);

    expect(deps.downloadPdf).toHaveBeenCalledWith('user-1');
    expect(deps.parsePdf).toHaveBeenCalledWith('/tmp/orders.pdf');
    expect(result.success).toBe(true);
    expect(result.ordersProcessed).toBe(2);
  });

  test('stops at checkpoint when shouldStop returns true', async () => {
    const deps = createMockDeps();
    const result = await syncOrders(deps, 'user-1', vi.fn(), () => true);

    expect(result.success).toBe(false);
    expect(result.error).toContain('stop');
  });

  test('cleans up PDF even on error', async () => {
    const deps = createMockDeps();
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

    const result = await syncOrders(deps, 'user-1', vi.fn(), () => false);

    expect(deps.cleanupFile).toHaveBeenCalledWith('/tmp/orders.pdf');
    expect(result.success).toBe(false);
  });

  test('reports progress at 100 on completion', async () => {
    const deps = createMockDeps();
    const onProgress = vi.fn();

    await syncOrders(deps, 'user-1', onProgress, () => false);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });
});
