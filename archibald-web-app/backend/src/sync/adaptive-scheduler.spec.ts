import { describe, expect, test, vi, afterEach, beforeEach } from 'vitest';
import { stalenessScore, getTargetFreshnessMs, isWithinWorkingHours, schedulerTick } from './adaptive-scheduler';
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

describe('isWithinWorkingHours', () => {
  // Semantica: blocco notturno 01:30-07:30 Rome (default), attivo tutto il resto.
  // January = CET (UTC+1): Rome = UTC + 1h.
  afterEach(() => {
    delete process.env.SYNC_NIGHT_BLOCK_START;
    delete process.env.SYNC_NIGHT_BLOCK_END;
    delete process.env.SYNC_WORKING_HOURS_TZ;
  });

  const jan15utc = (utcHour: number, utcMin = 0) =>
    new Date(`2026-01-15T${String(utcHour).padStart(2, '0')}:${String(utcMin).padStart(2, '0')}:00Z`);

  test('true a mezzogiorno (12:00 Rome = 11:00 UTC)', () => {
    expect(isWithinWorkingHours(jan15utc(11))).toBe(true);
  });

  test('true alle 22:00 Rome (21:00 UTC) — dopo il vecchio termine 20:00', () => {
    expect(isWithinWorkingHours(jan15utc(21))).toBe(true);
  });

  test('false nel blocco notturno — 03:00 Rome = 02:00 UTC', () => {
    expect(isWithinWorkingHours(jan15utc(2))).toBe(false);
  });

  test('false all\'inizio esatto del blocco — 01:30 Rome = 00:30 UTC', () => {
    expect(isWithinWorkingHours(jan15utc(0, 30))).toBe(false);
  });

  test('true un minuto prima del blocco — 01:29 Rome = 00:29 UTC', () => {
    expect(isWithinWorkingHours(jan15utc(0, 29))).toBe(true);
  });

  test('true alla fine esatta del blocco — 07:30 Rome = 06:30 UTC (end escluso)', () => {
    expect(isWithinWorkingHours(jan15utc(6, 30))).toBe(true);
  });

  test('false un minuto prima della fine del blocco — 07:29 Rome = 06:29 UTC', () => {
    expect(isWithinWorkingHours(jan15utc(6, 29))).toBe(false);
  });

  test('rispetta SYNC_NIGHT_BLOCK_START/END personalizzati', () => {
    process.env.SYNC_NIGHT_BLOCK_START = '23:00';
    process.env.SYNC_NIGHT_BLOCK_END   = '06:00';
    // 23:30 Rome = 22:30 UTC → nel blocco (attraversa mezzanotte)
    expect(isWithinWorkingHours(jan15utc(22, 30))).toBe(false);
    // 03:00 Rome = 02:00 UTC → nel blocco
    expect(isWithinWorkingHours(jan15utc(2))).toBe(false);
    // 10:00 Rome = 09:00 UTC → fuori blocco
    expect(isWithinWorkingHours(jan15utc(9))).toBe(true);
  });
});

describe('schedulerTick - address sync sweep', () => {
  const makePool = (queryFn: (sql: string) => unknown) =>
    ({ query: (sql: string) => Promise.resolve(queryFn(sql)) } as unknown as DbPool);

  beforeEach(() => {
    vi.clearAllMocks();
    // Blocco notturno 03:00–03:01 così qualsiasi orario reale è "working hours"
    process.env.SYNC_NIGHT_BLOCK_START = '03:00';
    process.env.SYNC_NIGHT_BLOCK_END   = '03:01';
  });

  afterEach(() => {
    delete process.env.SYNC_NIGHT_BLOCK_START;
    delete process.env.SYNC_NIGHT_BLOCK_END;
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
