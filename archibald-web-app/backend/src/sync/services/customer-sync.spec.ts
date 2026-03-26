import { describe, expect, test, vi } from 'vitest';
import { syncCustomers, type CustomerSyncDeps, type CustomerSyncResult, type DeletedProfileInfo, type RestoredProfileInfo } from './customer-sync';
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

  test('soft-deletes customers not in parsed PDF', async () => {
    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      if (sql.includes('customer_profile NOT IN')) {
        return Promise.resolve({ rows: [{ customer_profile: 'CUST-OLD', internal_id: null, name: 'Old Corp' }], rowCount: 1 });
      }
      if (sql.includes('SET deleted_at = NOW()')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const deps = createMockDeps(pool);

    await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    const softDeleteCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('SET deleted_at = NOW()'));
    expect(softDeleteCalls.length).toBeGreaterThanOrEqual(1);
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

  test('migrates pending_orders from TEMP profile to real profile before deletion when VAT matches', async () => {
    const tempProfile = 'TEMP-1234567890';
    const realProfile = 'REAL-001';
    const vatNumber = 'IT99999999999';

    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string, params?: unknown[]) => {
      // SELECT for toDelete: returns TEMP profile as stale
      if (sql.includes('customer_profile NOT IN')) {
        return Promise.resolve({ rows: [{ customer_profile: tempProfile }], rowCount: 1 });
      }
      // SELECT vat_number for the TEMP profile
      if (sql.includes('SELECT vat_number') && Array.isArray(params) && params[0] === tempProfile) {
        return Promise.resolve({ rows: [{ vat_number: vatNumber }], rowCount: 1 });
      }
      // SELECT real profile by VAT number
      if (sql.includes('SELECT customer_profile') && Array.isArray(params) && params[1] === vatNumber) {
        return Promise.resolve({ rows: [{ customer_profile: realProfile }], rowCount: 1 });
      }
      // UPDATE pending_orders
      if (sql.includes('UPDATE agents.pending_orders')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      // Soft-delete agents.customers
      if (sql.includes('SET deleted_at = NOW()')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const deps = createMockDeps(pool);
    await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    const updateCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE agents.pending_orders'));
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][1]).toEqual([realProfile, tempProfile, 'user-1']);
  });

  test('skips pending_orders migration when TEMP profile has no VAT number', async () => {
    const tempProfile = 'TEMP-9999999999';

    const pool = createMockPool();
    (pool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('customer_profile NOT IN')) {
        return Promise.resolve({ rows: [{ customer_profile: tempProfile }], rowCount: 1 });
      }
      if (sql.includes('SELECT vat_number') && Array.isArray(params) && params[0] === tempProfile) {
        return Promise.resolve({ rows: [{ vat_number: null }], rowCount: 1 });
      }
      if (sql.includes('SET deleted_at = NOW()')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const deps = createMockDeps(pool);
    await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    const updateCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE agents.pending_orders'));
    expect(updateCalls).toHaveLength(0);
  });
});

describe('syncCustomers - onDeletedCustomers', () => {
  function createPool() {
    return {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    } as unknown as DbPool;
  }

  const TWO_PARSED = [
    { customerProfile: 'CUST-001', name: 'Acme Corp' },
    { customerProfile: 'CUST-002', name: 'Beta Ltd' },
  ];

  test('calls onDeletedCustomers with profiles that have orders', async () => {
    const pool = createPool();
    const q = pool.query as ReturnType<typeof vi.fn>;
    q.mockResolvedValueOnce({ rows: [], rowCount: 0 })  // SELECT hash,deleted_at CUST-001 → new
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // INSERT CUST-001
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // SELECT hash,deleted_at CUST-002 → new
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // INSERT CUST-002
      .mockResolvedValueOnce({ rows: [{ customer_profile: 'CUST-OLD', internal_id: 'INT-OLD', name: 'Old Corp' }], rowCount: 1 })  // SELECT toDelete
      .mockResolvedValueOnce({ rows: [{ user_id: 'agent-1', customer_profile_id: 'INT-OLD' }], rowCount: 1 })  // SELECT DISTINCT order users
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // UPDATE SET deleted_at = NOW()

    const onDeletedCustomers = vi.fn().mockResolvedValue(undefined);
    const deps: CustomerSyncDeps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
      parsePdf: vi.fn().mockResolvedValue(TWO_PARSED),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      onDeletedCustomers,
    };

    await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    expect(onDeletedCustomers).toHaveBeenCalledOnce();
    expect(onDeletedCustomers).toHaveBeenCalledWith([
      { profile: 'CUST-OLD', internalId: 'INT-OLD', name: 'Old Corp', affectedAgentIds: ['agent-1'] },
    ]);
  });

  test('does not call onDeletedCustomers when deleted customers have no orders', async () => {
    const pool = createPool();
    const q = pool.query as ReturnType<typeof vi.fn>;
    q.mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ customer_profile: 'CUST-OLD', internal_id: 'INT-OLD', name: 'Old Corp' }], rowCount: 1 })  // SELECT toDelete
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // SELECT DISTINCT order users → none
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // UPDATE SET deleted_at = NOW()

    const onDeletedCustomers = vi.fn().mockResolvedValue(undefined);
    const deps: CustomerSyncDeps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
      parsePdf: vi.fn().mockResolvedValue(TWO_PARSED),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      onDeletedCustomers,
    };

    await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    expect(onDeletedCustomers).not.toHaveBeenCalled();
  });

  test('does not call onDeletedCustomers when not defined in deps', async () => {
    const pool = createPool();
    const q = pool.query as ReturnType<typeof vi.fn>;
    q.mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ customer_profile: 'CUST-OLD', internal_id: 'INT-OLD', name: 'Old Corp' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // UPDATE SET deleted_at (no SELECT DISTINCT query)

    const deps: CustomerSyncDeps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
      parsePdf: vi.fn().mockResolvedValue(TWO_PARSED),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      // onDeletedCustomers not defined
    };

    await expect(syncCustomers(deps, 'user-1', vi.fn(), () => false)).resolves.toMatchObject({ success: true });
    // The SELECT DISTINCT query must NOT be called
    const orderQuery = q.mock.calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('order_records')
    );
    expect(orderQuery).toBeUndefined();
  });
});

describe('syncCustomers - onRestoredCustomers', () => {
  function createPool() {
    return {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    } as unknown as DbPool;
  }

  const RESTORED_CUSTOMER = { customerProfile: 'CUST-001', name: 'Acme Corp', internalId: 'INT-001' };

  test('calls onRestoredCustomers when a soft-deleted customer reappears in ERP', async () => {
    const pool = createPool();
    const q = pool.query as ReturnType<typeof vi.fn>;

    q
      // SELECT hash, deleted_at for CUST-001 → found with deleted_at set (was soft-deleted)
      .mockResolvedValueOnce({ rows: [{ hash: 'old-hash', deleted_at: new Date() }], rowCount: 1 })
      // UPDATE SET deleted_at = NULL (restore)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // SELECT toDelete → nothing to delete
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // SELECT DISTINCT order_records for restored internalId
      .mockResolvedValueOnce({ rows: [{ user_id: 'agent-2', customer_profile_id: 'INT-001' }], rowCount: 1 });

    const onRestoredCustomers = vi.fn<[RestoredProfileInfo[]], Promise<void>>().mockResolvedValue(undefined);
    const deps: CustomerSyncDeps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
      parsePdf: vi.fn().mockResolvedValue([RESTORED_CUSTOMER]),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      onRestoredCustomers,
    };

    const result = await syncCustomers(deps, 'user-1', vi.fn(), () => false);

    expect(result.success).toBe(true);
    expect(result.restoredCustomers).toBe(1);
    expect(onRestoredCustomers).toHaveBeenCalledOnce();
    const [infos] = onRestoredCustomers.mock.calls[0];
    expect(infos).toHaveLength(1);
    expect(infos[0]).toMatchObject({
      profile: 'CUST-001',
      internalId: 'INT-001',
      name: 'Acme Corp',
    });
    // Must include both the syncing agent (user-1) and the agent from order_records (agent-2)
    expect(infos[0].affectedAgentIds).toContain('user-1');
    expect(infos[0].affectedAgentIds).toContain('agent-2');
  });

  test('does not call onRestoredCustomers when not provided', async () => {
    const pool = createPool();
    const q = pool.query as ReturnType<typeof vi.fn>;
    q
      .mockResolvedValueOnce({ rows: [{ hash: 'old-hash', deleted_at: new Date() }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const deps: CustomerSyncDeps = {
      pool,
      downloadPdf: vi.fn().mockResolvedValue('/tmp/customers.pdf'),
      parsePdf: vi.fn().mockResolvedValue([RESTORED_CUSTOMER]),
      cleanupFile: vi.fn().mockResolvedValue(undefined),
      // onRestoredCustomers not defined
    };

    await expect(syncCustomers(deps, 'user-1', vi.fn(), () => false)).resolves.toMatchObject({ success: true, restoredCustomers: 1 });
    // No order_records query should have been made for restore detection
    const orderQuery = q.mock.calls.find((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('order_records'),
    );
    expect(orderQuery).toBeUndefined();
  });
});
