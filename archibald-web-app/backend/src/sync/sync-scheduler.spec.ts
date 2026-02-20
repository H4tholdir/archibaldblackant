import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createSyncScheduler, type SyncTypeIntervals, type SyncType } from './sync-scheduler';

function createMockEnqueue(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue('job-id');
}

function createIntervals(overrides: Partial<SyncTypeIntervals> = {}): SyncTypeIntervals {
  return {
    orders: 100,
    customers: 100,
    products: 200,
    prices: 200,
    ddt: 100,
    invoices: 100,
    ...overrides,
  };
}

async function flushTimers(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('createSyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('start() creates per-type timers that fire at their respective intervals', async () => {
    const enqueue = createMockEnqueue();
    const getAgentIds = vi.fn().mockResolvedValue(['user-1']);
    const scheduler = createSyncScheduler(enqueue, getAgentIds);

    scheduler.start(createIntervals({ orders: 100, products: 200 }));

    expect(enqueue).not.toHaveBeenCalled();

    await flushTimers(100);

    expect(enqueue).toHaveBeenCalledWith('sync-orders', 'user-1', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-products', 'service-account', {});

    await flushTimers(100);

    expect(enqueue).toHaveBeenCalledWith('sync-products', 'service-account', {});

    scheduler.stop();
  });

  test('enqueues agent-specific syncs for each active agent', async () => {
    const enqueue = createMockEnqueue();
    const getAgentIds = vi.fn().mockResolvedValue(['user-1', 'user-2']);
    const scheduler = createSyncScheduler(enqueue, getAgentIds);

    scheduler.start(createIntervals());
    await flushTimers(100);

    const agentSyncTypes = ['sync-customers', 'sync-orders', 'sync-ddt', 'sync-invoices'] as const;
    for (const type of agentSyncTypes) {
      expect(enqueue).toHaveBeenCalledWith(type, 'user-1', {});
      expect(enqueue).toHaveBeenCalledWith(type, 'user-2', {});
    }

    scheduler.stop();
  });

  test('enqueues shared syncs with service-account', async () => {
    const enqueue = createMockEnqueue();
    const getAgentIds = vi.fn().mockResolvedValue([]);
    const scheduler = createSyncScheduler(enqueue, getAgentIds);

    scheduler.start(createIntervals());
    await flushTimers(200);

    expect(enqueue).toHaveBeenCalledWith('sync-products', 'service-account', {});
    expect(enqueue).toHaveBeenCalledWith('sync-prices', 'service-account', {});

    scheduler.stop();
  });

  test('stop() clears all timers', async () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, async () => ['user-1']);

    scheduler.start(createIntervals());
    scheduler.stop();

    enqueue.mockClear();
    await flushTimers(1000);

    expect(enqueue).not.toHaveBeenCalled();
  });

  test('stop() is safe to call multiple times', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, async () => []);

    scheduler.start(createIntervals());
    scheduler.stop();
    scheduler.stop();
  });

  test('isRunning() returns false before start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), async () => []);
    expect(scheduler.isRunning()).toBe(false);
  });

  test('isRunning() returns true after start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), async () => []);
    scheduler.start(createIntervals());
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
  });

  test('isRunning() returns false after stop', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), async () => []);
    scheduler.start(createIntervals());
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  test('getIntervals() returns zero values before start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), async () => []);
    expect(scheduler.getIntervals()).toEqual({
      orders: 0, customers: 0, products: 0, prices: 0, ddt: 0, invoices: 0,
    });
  });

  test('getIntervals() returns configured values after start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), async () => []);
    const intervals = createIntervals();
    scheduler.start(intervals);
    expect(scheduler.getIntervals()).toEqual(intervals);
    scheduler.stop();
  });

  test('getDetailedIntervals() converts ms to minutes', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), async () => []);
    scheduler.start(createIntervals({
      orders: 600_000,
      customers: 900_000,
      products: 1_800_000,
      prices: 3_600_000,
      ddt: 1_200_000,
      invoices: 1_200_000,
    }));

    expect(scheduler.getDetailedIntervals()).toEqual({
      orders: 10,
      customers: 15,
      products: 30,
      prices: 60,
      ddt: 20,
      invoices: 20,
    });

    scheduler.stop();
  });

  test('updateInterval() restarts only the target timer', async () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, async () => ['user-1']);

    scheduler.start(createIntervals({ orders: 100, customers: 500 }));

    await flushTimers(100);
    expect(enqueue).toHaveBeenCalledWith('sync-orders', 'user-1', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-customers', 'user-1', {});

    enqueue.mockClear();

    scheduler.updateInterval('orders' as SyncType, 300);

    await flushTimers(100);
    expect(enqueue).not.toHaveBeenCalledWith('sync-orders', 'user-1', {});

    await flushTimers(200);
    expect(enqueue).toHaveBeenCalledWith('sync-orders', 'user-1', {});

    scheduler.stop();
  });

  test('updateInterval() updates currentIntervals', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), async () => []);
    scheduler.start(createIntervals({ orders: 100 }));

    scheduler.updateInterval('orders' as SyncType, 999);

    expect(scheduler.getIntervals().orders).toBe(999);

    scheduler.stop();
  });

  test('getActiveAgentIds is called async', async () => {
    const enqueue = createMockEnqueue();
    const getAgentIds = vi.fn().mockResolvedValue(['agent-a']);
    const scheduler = createSyncScheduler(enqueue, getAgentIds);

    scheduler.start(createIntervals());
    await flushTimers(100);

    expect(getAgentIds).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith('sync-orders', 'agent-a', {});

    scheduler.stop();
  });

  test('caches agent IDs across concurrent timer ticks', async () => {
    const enqueue = createMockEnqueue();
    const getAgentIds = vi.fn().mockResolvedValue(['user-1']);
    const scheduler = createSyncScheduler(enqueue, getAgentIds);

    scheduler.start(createIntervals({
      orders: 100,
      customers: 100,
      ddt: 100,
      invoices: 100,
    }));

    await flushTimers(100);

    expect(getAgentIds).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });
});
