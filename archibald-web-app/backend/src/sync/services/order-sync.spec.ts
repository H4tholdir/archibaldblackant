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
    fetchRows: vi.fn().mockResolvedValue([
      { id: 'ORD-001', orderNumber: 'SO-001', customerProfileId: 'C1', customerName: 'Acme', date: '2026-01-01', status: 'Open' },
      { id: 'ORD-002', orderNumber: 'SO-002', customerProfileId: 'C2', customerName: 'Beta', date: '2026-01-02', status: 'Open' },
    ]),
  };
}

describe('syncOrders', () => {
  test('fetches rows and upserts orders', async () => {
    const deps = createMockDeps();
    const result = await syncOrders(deps, 'user-1', vi.fn(), () => false);

    expect(deps.fetchRows).toHaveBeenCalledWith('user-1');
    expect(result.success).toBe(true);
    expect(result.ordersProcessed).toBe(2);
  });

  test('stops at checkpoint when shouldStop returns true', async () => {
    const deps = createMockDeps();
    const result = await syncOrders(deps, 'user-1', vi.fn(), () => true);

    expect(result.success).toBe(false);
    expect(result.error).toContain('stop');
  });

  test('returns success:false when fetchRows throws', async () => {
    const deps = createMockDeps();
    (deps.fetchRows as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

    const result = await syncOrders(deps, 'user-1', vi.fn(), () => false);

    expect(result.success).toBe(false);
    expect(result.error).toContain('fail');
  });

  test('reports progress at 100 on completion', async () => {
    const deps = createMockDeps();
    const onProgress = vi.fn();

    await syncOrders(deps, 'user-1', onProgress, () => false);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('fail-closed guard count query excludes PENDING placeholder records to prevent false positives', async () => {
    const deps = createMockDeps();
    await syncOrders(deps, 'user-1', vi.fn(), () => false);

    const calls = (deps.pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const countQuery = calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('count(*)') && sql.includes('order_records'),
    );
    expect(countQuery).toBeDefined();
    // Without this exclusion, PENDING local records inflate currentDbCount above parsedOrders.length,
    // causing the guard to throw before reconciliation runs — leaving PENDING duplicates forever.
    expect(countQuery![0]).toContain('PENDING-%');
  });

  test('non scambia date ambigue del parser IT anche con vicini ERP corrotti nel batch', async () => {
    // Scenario: il parser IT produce correttamente "2026-06-01" per un ordine (ERP raw: "01/06/2026").
    // Nel batch, l'ordine adiacente per ID ha data "2026-01-05" (data corrotta da vecchio parser US).
    // Il sincronizzatore NON deve scambiare "2026-06-01" → "2026-01-06" basandosi sui vicini.
    // Questo era il comportamento di heelAmbiguousDates che causava l'oscillazione delle date.
    const corruptNeighbour: ParsedOrder = {
      id: '55.997',
      orderNumber: 'ORD/26011246',
      customerName: 'Cliente A',
      date: '2026-01-05T09:00:00', // data corrotta (vicino con data di gennaio)
    };
    const ambiguousOrder: ParsedOrder = {
      id: '55.998',
      orderNumber: 'ORD/26011247',
      customerName: 'Cliente B',
      date: '2026-06-01T09:31:17', // parser IT ha correttamente prodotto giugno 1
      deliveryDate: '2026-06-01',
    };

    const insertedParams: unknown[][] = [];
    const mockPool: DbPool = {
      query: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        if (typeof sql === 'string' && sql.includes('INSERT') && sql.includes('order_records') && params) {
          insertedParams.push(params);
          const id = params[0] as string;
          return { rows: [{ id, was_inserted: true }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    };

    const deps: OrderSyncDeps = {
      pool: mockPool,
      // Ordina per ID crescente come farebbe heelAmbiguousDates: 55.997 prima, 55.998 dopo
      fetchRows: vi.fn().mockResolvedValue([corruptNeighbour, ambiguousOrder]),
    };

    const result = await syncOrders(deps, 'user-1', vi.fn(), () => false);
    expect(result.success).toBe(true);

    // Trova i parametri dell'INSERT per l'ordine 55.998
    const insertFor55998 = insertedParams.find((p) => p[0] === '55.998');
    expect(insertFor55998).toBeDefined();

    // creation_date deve essere '2026-06-01T09:31:17' — NON '2026-01-06T09:31:17'
    // Indice 7 = creation_date nel INSERT (id,userId,orderNumber,custAccount,custName,delivName,delivAddr,date,...)
    const creationDate = insertFor55998![7];
    expect(creationDate).toBe('2026-06-01T09:31:17');
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
      fetchRows: vi.fn().mockResolvedValue([recentOrder]),
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
