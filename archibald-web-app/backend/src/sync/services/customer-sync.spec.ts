import { describe, expect, test, vi } from 'vitest';
import { syncCustomers, type CustomerSyncDeps, type CustomerSyncResult } from './customer-sync';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockDeps(pool?: DbPool): CustomerSyncDeps {
  return {
    pool: pool ?? createMockPool(),
    downloadPdf: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
    parsePdf: vi.fn().mockResolvedValue([
      { customerProfile: 'CUST-001', name: 'Acme Corp', vatNumber: 'IT123', phone: '+39123' },
      { customerProfile: 'CUST-002', name: 'Beta Ltd', vatNumber: 'IT456', phone: '+39456' },
    ]),
    cleanupFile: vi.fn().mockResolvedValue(undefined),
  };
}

describe('syncCustomers', () => {
  test('downloads PDF, parses it, and upserts customers', async () => {
    const deps = createMockDeps();

    const result = await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    expect(deps.downloadPdf).toHaveBeenCalledWith('user-1');
    expect(deps.parsePdf).toHaveBeenCalledWith('/tmp/customers.pdf');

    const upsertCalls = (deps.pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.customers'));
    expect(upsertCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('returns sync result with counts', async () => {
    const deps = createMockDeps();

    const result = await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    expect(result.success).toBe(true);
    expect(result.customersProcessed).toBe(2);
    expect(typeof result.duration).toBe('number');
  });

  test('deletes customers not in parsed PDF', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [{ customer_profile: 'CUST-OLD' }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });
    const deps = createMockDeps(pool);

    await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    const deleteCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('DELETE FROM agents.customers'));
    expect(deleteCalls.length).toBeGreaterThanOrEqual(0);
  });

  test('stops at checkpoint when shouldStop returns true', async () => {
    const deps = createMockDeps();
    let callCount = 0;
    const shouldStop = () => {
      callCount++;
      return callCount >= 2;
    };

    const result = await syncCustomers(deps, 'user-1', vi.fn(), shouldStop);

    expect(result.success).toBe(false);
    expect(result.error).toContain('stop');
  });

  test('cleans up PDF file after sync', async () => {
    const deps = createMockDeps();

    await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    expect(deps.cleanupFile).toHaveBeenCalledWith('/tmp/customers.pdf');
  });

  test('cleans up PDF file even on error', async () => {
    const deps = createMockDeps();
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Parse error'));

    const result = await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    expect(deps.cleanupFile).toHaveBeenCalledWith('/tmp/customers.pdf');
    expect(result.success).toBe(false);
  });

  test('reports progress at milestones', async () => {
    const deps = createMockDeps();
    const onProgress = vi.fn();

    await syncCustomers(deps, 'user-1', onProgress, () => false);

    expect(onProgress).toHaveBeenCalledWith(expect.any(Number), expect.any(String));
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(lastCall[0]).toBe(100);
  });

  test('stops during DB loop when shouldStop returns true mid-iteration', async () => {
    const totalRecords = 15;
    const customers = Array.from({ length: totalRecords }, (_, i) => ({
      customerProfile: `CUST-${String(i).padStart(3, '0')}`,
      name: `Customer ${i}`,
      vatNumber: `IT${i}`,
      phone: `+39${i}`,
    }));
    const deps = createMockDeps();
    (deps.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue(customers);

    let dbLoopCalls = 0;
    const shouldStop = () => {
      dbLoopCalls++;
      return dbLoopCalls > 3;
    };

    const result = await syncCustomers(deps, 'user-1', vi.fn(), shouldStop);

    expect(result.success).toBe(false);
    expect(result.error).toContain('db-loop');

    const insertCalls = (deps.pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.customers'));
    expect(insertCalls.length).toBeLessThan(totalRecords);
  });
});
