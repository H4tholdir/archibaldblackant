import { describe, expect, test, vi } from 'vitest';
import { syncOrders, type OrderSyncDeps, type ParsedOrder } from './order-sync';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ hash: '', order_number: '' }], rowCount: 1 }) // SELECT ORD-001 → trovato
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                               // UPDATE ORD-001 (hash cambiato)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                               // SELECT ORD-002 → non trovato
      .mockResolvedValueOnce({ rows: [{ id: 'ORD-002', was_inserted: true }], rowCount: 1 }) // INSERT ORD-002 RETURNING
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
      { id: 'ORD-001', orderNumber: 'SO-001', customerProfileId: 'C1', customerName: 'Acme', date: '2026-01-01', status: 'Open' },
      { id: 'ORD-002', orderNumber: 'SO-002', customerProfileId: 'C2', customerName: 'Beta', date: '2026-01-02', status: 'Open' },
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

  test('cancels auto reminders via account_num→erp_id subquery when a recent order is newly inserted', async () => {
    const userId = 'user-auto-cancel';
    const accountNum = 'ACC-123';
    const recentDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

    const recentOrder: ParsedOrder = {
      id: 'NEW-001',
      orderNumber: 'SO-NEW-001',
      customerAccountNum: accountNum,
      customerName: 'Cliente Test',
      date: recentDate,
    };

    const mockPool: DbPool = {
      query: vi.fn()
        // SELECT NEW-001 → not found
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // INSERT NEW-001 RETURNING → was_inserted = true
        .mockResolvedValueOnce({ rows: [{ id: 'NEW-001', was_inserted: true }], rowCount: 1 })
        // UPDATE customer_reminders (auto-cancel)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // all subsequent queries (email propagation, stale check, etc.)
        .mockResolvedValue({ rows: [], rowCount: 0 }),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    };

    const deps: OrderSyncDeps = {
      pool: mockPool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/orders.pdf'),
      parsePdf: vi.fn().mockResolvedValue([recentOrder]),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
    };

    const result = await syncOrders(deps, userId, vi.fn(), () => false);

    expect(result.success).toBe(true);
    expect(result.ordersInserted).toBe(1);

    const calls = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls;
    const cancelCall = calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('customer_reminders') && sql.includes("'done'"),
    );
    expect(cancelCall).toBeDefined();

    const [cancelSql, cancelParams] = cancelCall as [string, unknown[]];
    expect(cancelSql).toMatch(/SELECT erp_id FROM agents\.customers/);
    expect(cancelSql).toMatch(/account_num = \$1/);
    expect(cancelParams[0]).toBe(accountNum);
    expect(cancelParams[1]).toBe(userId);
  });
});
