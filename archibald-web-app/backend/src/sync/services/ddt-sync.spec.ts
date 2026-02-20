import { describe, expect, test, vi } from 'vitest';
import { syncDdt, type DdtSyncDeps } from './ddt-sync';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'ORD-1' }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 1 }),
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
  test('downloads, parses, and updates orders with DDT data', async () => {
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

  test('stops during DB loop when shouldStop returns true mid-iteration', async () => {
    const totalRecords = 15;
    const ddts = Array.from({ length: totalRecords }, (_, i) => ({
      orderNumber: `SO-${String(i).padStart(3, '0')}`,
      ddtNumber: `DDT-${String(i).padStart(3, '0')}`,
      ddtDeliveryDate: '2026-01-15',
    }));
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ id: `ORD-1` }], rowCount: 1 });
    const deps = createMockDeps(pool);
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue(ddts);

    let dbLoopCalls = 0;
    const shouldStop = () => {
      dbLoopCalls++;
      return dbLoopCalls > 3;
    };

    const result = await syncDdt(deps, 'user-1', vi.fn(), shouldStop);

    expect(result.success).toBe(false);
    expect(result.error).toContain('db-loop');
  });
});
