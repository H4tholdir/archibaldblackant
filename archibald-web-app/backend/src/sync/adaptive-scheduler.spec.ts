import { describe, expect, test, vi, beforeEach } from 'vitest';
import { stalenessScore, getTargetFreshnessMs, schedulerTick } from './adaptive-scheduler';
import type { DbPool } from '../db/pool';

vi.mock('../db/repositories/agent-queue', () => ({
  enqueueWithDedup: vi.fn().mockResolvedValue(BigInt(1)),
}));
vi.mock('../db/repositories/sync-freshness', () => ({
  getAllFreshnessForUser: vi.fn().mockResolvedValue({}),
}));

describe('stalenessScore', () => {
  test('ritorna 2.0 se lastSyncAt è null (mai sincronizzato)', () => {
    expect(stalenessScore(null, 20 * 60_000)).toBe(2.0);
  });

  test('ritorna ~0 se sincronizzato ora', () => {
    expect(stalenessScore(new Date(), 20 * 60_000)).toBeCloseTo(0, 1);
  });

  test('ritorna 0 se lastSyncAt è nel futuro (clock skew)', () => {
    const futureDate = new Date(Date.now() + 60_000);
    expect(stalenessScore(futureDate, 20 * 60_000)).toBe(0);
  });

  test('ritorna 0 se targetFreshnessMs <= 0 (target invalido)', () => {
    const lastSync = new Date(Date.now() - 60_000);
    expect(stalenessScore(lastSync, 0)).toBe(0);
    expect(stalenessScore(lastSync, -1)).toBe(0);
  });

  test('ritorna 1.0 se il tempo trascorso è uguale al target (alla soglia)', () => {
    const targetMs = 20 * 60_000;
    const lastSync = new Date(Date.now() - targetMs);
    expect(stalenessScore(lastSync, targetMs)).toBeCloseTo(1.0, 1);
  });

  test('ritorna >1 se dati scaduti (tempo > target)', () => {
    const targetMs = 20 * 60_000;
    const lastSync = new Date(Date.now() - targetMs * 1.5);
    expect(stalenessScore(lastSync, targetMs)).toBeGreaterThan(1.0);
  });
});

describe('getTargetFreshnessMs', () => {
  test('sync-orders active: 20 minuti', () => {
    expect(getTargetFreshnessMs('sync-orders', 'active')).toBe(20 * 60_000);
  });

  test('sync-ddt idle: null (sospeso)', () => {
    expect(getTargetFreshnessMs('sync-ddt', 'idle')).toBeNull();
  });

  test('sync-orders offline: null (sospeso)', () => {
    expect(getTargetFreshnessMs('sync-orders', 'offline')).toBeNull();
  });

  test('sync-tracking active: 15 minuti', () => {
    expect(getTargetFreshnessMs('sync-tracking', 'active')).toBe(15 * 60_000);
  });

  test('sync-order-states active: 10 minuti', () => {
    expect(getTargetFreshnessMs('sync-order-states', 'active')).toBe(10 * 60_000);
  });
});

describe('schedulerTick - address sync sweep', () => {
  const makePool = (queryFn: (sql: string) => unknown) =>
    ({ query: (sql: string) => Promise.resolve(queryFn(sql)) } as unknown as DbPool);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultQuery = (sql: string) => {
    if (sql.includes('bg_count'))   return { rows: [{ bg_count: '0' }] };
    if (sql.includes('addr_count')) return { rows: [{ addr_count: '0' }] };
    return { rows: [] };
  };

  test('enqueue sync-customer-addresses per agente con clienti stale', async () => {
    const { enqueueWithDedup } = await import('../db/repositories/agent-queue');
    const getCustomersNeedingAddressSync = vi.fn().mockResolvedValue([
      { erp_id: '1.001', name: 'Cliente Alpha' },
      { erp_id: '1.002', name: 'Cliente Beta' },
    ]);

    await schedulerTick({
      pool: makePool(defaultQuery),
      getAgentsByActivity: () => ({ active: ['user1'], idle: [] }),
      getCustomersNeedingAddressSync,
    });

    expect(enqueueWithDedup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user1',
        taskType: 'sync-customer-addresses',
        payload: {
          customers: [
            { erpId: '1.001', customerName: 'Cliente Alpha' },
            { erpId: '1.002', customerName: 'Cliente Beta' },
          ],
        },
        priority: 500,
      }),
    );
  });

  test('non enqueue se tutti gli indirizzi sono freschi', async () => {
    const { enqueueWithDedup } = await import('../db/repositories/agent-queue');
    const getCustomersNeedingAddressSync = vi.fn().mockResolvedValue([]);

    await schedulerTick({
      pool: makePool(defaultQuery),
      getAgentsByActivity: () => ({ active: ['user1'], idle: [] }),
      getCustomersNeedingAddressSync,
    });

    const addressCalls = (enqueueWithDedup as ReturnType<typeof vi.fn>).mock.calls
      .filter((args: unknown[]) => (args[1] as { taskType?: string })?.taskType === 'sync-customer-addresses');
    expect(addressCalls).toHaveLength(0);
  });

  test('non enqueue se addr_count già al limite', async () => {
    const { enqueueWithDedup } = await import('../db/repositories/agent-queue');
    const getCustomersNeedingAddressSync = vi.fn().mockResolvedValue([
      { erp_id: '1.001', name: 'Cliente Alpha' },
    ]);

    const fullQuery = (sql: string) => {
      if (sql.includes('bg_count'))   return { rows: [{ bg_count: '0' }] };
      if (sql.includes('addr_count')) return { rows: [{ addr_count: '2' }] }; // già al limite
      return { rows: [] };
    };

    await schedulerTick({
      pool: makePool(fullQuery),
      getAgentsByActivity: () => ({ active: ['user1'], idle: [] }),
      getCustomersNeedingAddressSync,
    });

    const addressCalls = (enqueueWithDedup as ReturnType<typeof vi.fn>).mock.calls
      .filter((args: unknown[]) => (args[1] as { taskType?: string })?.taskType === 'sync-customer-addresses');
    expect(addressCalls).toHaveLength(0);
  });

  test('non enqueue se utente è in sync_paused_users', async () => {
    const { enqueueWithDedup } = await import('../db/repositories/agent-queue');
    const getCustomersNeedingAddressSync = vi.fn().mockResolvedValue([
      { erp_id: '1.001', name: 'Cliente Alpha' },
    ]);

    const pausedQuery = (sql: string) => {
      if (sql.includes('bg_count'))        return { rows: [{ bg_count: '0' }] };
      if (sql.includes('addr_count'))      return { rows: [{ addr_count: '0' }] };
      if (sql.includes('sync_paused_users')) return { rows: [{ user_id: 'user1' }] }; // paused
      return { rows: [] };
    };

    await schedulerTick({
      pool: makePool(pausedQuery),
      getAgentsByActivity: () => ({ active: ['user1'], idle: [] }),
      getCustomersNeedingAddressSync,
    });

    const addressCalls = (enqueueWithDedup as ReturnType<typeof vi.fn>).mock.calls
      .filter((args: unknown[]) => (args[1] as { taskType?: string })?.taskType === 'sync-customer-addresses');
    expect(addressCalls).toHaveLength(0);
  });
});
