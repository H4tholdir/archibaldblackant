import { describe, expect, test, vi } from 'vitest';
import { syncDdt, type DdtSyncDeps } from './ddt-sync';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'ORD-1' }], rowCount: 1 })    // order lookup
      .mockResolvedValueOnce({ rows: [{ is_insert: true }], rowCount: 1 }) // upsertOrderDdt
      .mockResolvedValue({ rows: [], rowCount: 0 }),                        // repositionOrderDdts
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockDeps(pool?: DbPool): DdtSyncDeps {
  return {
    pool: pool ?? createMockPool(),
    downloadPdf: vi.fn().mockResolvedValue('/tmp/ddt.pdf'),
    parsePdf: vi.fn().mockResolvedValue([
      { orderNumber: 'SO-001', ddtNumber: 'DDT-001', ddtDeliveryDate: '2026-01-15', trackingNumber: 'TRK-123' },
    ]),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

describe('syncDdt', () => {
  test('downloads, parses, and upserts DDT data via order_ddts repository', async () => {
    const deps = createMockDeps();
    const result = await syncDdt(deps, 'user-1', vi.fn(), () => false);

    expect(result.success).toBe(true);
    expect(result.ddtProcessed).toBe(1);
  });

  test('stops on shouldStop', async () => {
    const deps = createMockDeps();
    const result = await syncDdt(deps, 'user-1', vi.fn(), () => true);
    expect(result.success).toBe(false);
  });

  test('cleans up PDF on error', async () => {
    const deps = createMockDeps();
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
    await syncDdt(deps, 'user-1', vi.fn(), () => false);
    expect(deps.cleanupFile).toHaveBeenCalledWith('/tmp/ddt.pdf');
  });

  test('reports progress at 100', async () => {
    const deps = createMockDeps();
    const onProgress = vi.fn();
    await syncDdt(deps, 'user-1', onProgress, () => false);
    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('upserts DDTs sorted by ddtId ASC within each order group (lower ddtId = primary shipment)', async () => {
    const callOrder: string[] = [];
    const pool: DbPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        if ((sql as string).includes('SELECT id FROM')) {
          callOrder.push('lookup');
          return Promise.resolve({ rows: [{ id: 'ORD-42' }], rowCount: 1 });
        }
        if ((sql as string).includes('INSERT INTO')) {
          callOrder.push(`upsert:${params[2]}`); // params[2] = ddt_number in upsertOrderDdt
          return Promise.resolve({ rows: [{ is_insert: true }], rowCount: 1 });
        }
        // repositionOrderDdts
        callOrder.push('reposition');
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    };

    const deps: DdtSyncDeps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/ddt.pdf'),
      parsePdf: vi.fn().mockResolvedValue([
        { orderNumber: 'SO-042', ddtNumber: 'DDT-200', ddtId: '200' },
        { orderNumber: 'SO-042', ddtNumber: 'DDT-100', ddtId: '100' },
      ]),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
    };

    const result = await syncDdt(deps, 'user-1', vi.fn(), () => false);

    expect(result.success).toBe(true);
    expect(result.ddtProcessed).toBe(2);
    // order lookup happens once per order group, then DDTs sorted by ddtId ASC
    expect(callOrder).toEqual(['lookup', 'upsert:DDT-100', 'upsert:DDT-200', 'reposition']);
  });
});
