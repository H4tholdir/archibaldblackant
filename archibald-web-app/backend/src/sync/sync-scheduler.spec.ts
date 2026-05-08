import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  createSyncScheduler,
  ARTICLE_SYNC_BATCH_LIMIT,
  ARTICLE_SYNC_DELAY_MS,
  ADDRESS_SYNC_BATCH_LIMIT,
  ADDRESS_SYNC_DELAY_MS,
  CLEANUP_INTERVAL_MS,
  IDLE_AGENT_MULTIPLIER,
  type SyncIntervals,
  type GetCustomersNeedingAddressSyncFn,
  type GetAgentsByActivityFn,
} from './sync-scheduler';

function createMockEnqueue(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue('job-id');
}

const intervals: SyncIntervals = {
  agentSyncMs: 100,
  sharedSyncMs: 200,
};

function activityProvider(active: string[], idle: string[] = []): GetAgentsByActivityFn {
  return () => ({ active, idle });
}

describe('createSyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('start() creates intervals for agent and shared syncs', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']));

    scheduler.start(intervals);

    expect(enqueue).not.toHaveBeenCalled();

    // Agent sync types (sync-customers, sync-orders, etc.) are now handled by the
    // adaptive scheduler — only the shared sync (sync-products/sync-prices) fires here.
    vi.advanceTimersByTime(200);

    expect(enqueue).toHaveBeenCalledWith('sync-products', 'service-account', {});
    expect(enqueue).toHaveBeenCalledWith('sync-prices', 'service-account', {});

    scheduler.stop();
  });

  test('agent sync types are NOT enqueued by the old scheduler (managed by adaptive scheduler)', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1', 'user-2']));

    scheduler.start(intervals);
    // Advance past both agent interval and shared sync interval
    vi.advanceTimersByTime(intervals.agentSyncMs * IDLE_AGENT_MULTIPLIER);

    const agentSyncTypes = ['sync-customers', 'sync-orders', 'sync-ddt', 'sync-invoices', 'sync-tracking', 'sync-order-states'] as const;
    for (const user of ['user-1', 'user-2']) {
      for (const syncType of agentSyncTypes) {
        expect(enqueue).not.toHaveBeenCalledWith(syncType, user, {});
      }
    }

    scheduler.stop();
  });

  test('idle agents do not get agent sync types from old scheduler', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, activityProvider([], ['idle-1']));

    scheduler.start(intervals);
    vi.advanceTimersByTime(intervals.agentSyncMs * IDLE_AGENT_MULTIPLIER);

    expect(enqueue).not.toHaveBeenCalledWith('sync-customers', 'idle-1', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-orders', 'idle-1', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-ddt', 'idle-1', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-invoices', 'idle-1', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-order-states', 'idle-1', {});

    scheduler.stop();
  });

  test('offline agents (not in either list) get nothing', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1'], ['idle-1']));

    scheduler.start(intervals);
    vi.advanceTimersByTime(intervals.agentSyncMs * IDLE_AGENT_MULTIPLIER);

    expect(enqueue).not.toHaveBeenCalledWith('sync-customers', 'offline-agent', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-orders', 'offline-agent', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-ddt', 'offline-agent', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-invoices', 'offline-agent', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-order-states', 'offline-agent', {});

    scheduler.stop();
  });

  test('enqueues sync-products and sync-prices for shared syncs', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, activityProvider([]));

    scheduler.start(intervals);
    vi.advanceTimersByTime(200);

    expect(enqueue).toHaveBeenCalledWith('sync-products', 'service-account', {});
    expect(enqueue).toHaveBeenCalledWith('sync-prices', 'service-account', {});

    scheduler.stop();
  });

  describe('Conductor starvation guard', () => {
    test('skips shared sync when Conductor is active (dentro MAX_SKIP_MS)', () => {
      const enqueue = createMockEnqueue();
      const conductor = { isAnyWriteActive: vi.fn().mockReturnValue(true) };
      // conductor è l'8° argomento (dopo deleteExpiredRecognitionCache)
      const scheduler = createSyncScheduler(enqueue, activityProvider([]), undefined, undefined, undefined, undefined, undefined, conductor);

      scheduler.start(intervals);
      vi.advanceTimersByTime(200); // un interval, Conductor attivo

      expect(enqueue).not.toHaveBeenCalledWith('sync-products', expect.anything(), expect.anything());
      expect(enqueue).not.toHaveBeenCalledWith('sync-prices', expect.anything(), expect.anything());

      scheduler.stop();
    });

    test('forza shared sync dopo MAX_SKIP_MS (30min) anche con Conductor attivo', () => {
      const enqueue = createMockEnqueue();
      const conductor = { isAnyWriteActive: vi.fn().mockReturnValue(true) };
      const scheduler = createSyncScheduler(enqueue, activityProvider([]), undefined, undefined, undefined, undefined, undefined, conductor);

      scheduler.start(intervals);

      // Simula 31 minuti di tick: lo skip dura > MAX_SKIP_MS → starvation guard interviene
      vi.advanceTimersByTime(31 * 60 * 1000 + 200);

      expect(enqueue).toHaveBeenCalledWith('sync-products', 'service-account', {});
      expect(enqueue).toHaveBeenCalledWith('sync-prices', 'service-account', {});

      scheduler.stop();
    });
  });

  test('stop() clears all intervals', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']));

    scheduler.start(intervals);
    scheduler.stop();

    enqueue.mockClear();
    vi.advanceTimersByTime(1000);

    expect(enqueue).not.toHaveBeenCalled();
  });

  test('stop() is safe to call multiple times', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, activityProvider([]));

    scheduler.start(intervals);
    scheduler.stop();
    scheduler.stop();
  });

  test('isRunning() returns false before start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), activityProvider([]));
    expect(scheduler.isRunning()).toBe(false);
  });

  test('isRunning() returns true after start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), activityProvider([]));
    scheduler.start(intervals);
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
  });

  test('isRunning() returns false after stop', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), activityProvider([]));
    scheduler.start(intervals);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  test('getIntervals() returns default values before start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), activityProvider([]));
    expect(scheduler.getIntervals()).toEqual({ agentSyncMs: 0, sharedSyncMs: 0 });
  });

  test('getIntervals() returns configured values after start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), activityProvider([]));
    scheduler.start(intervals);
    expect(scheduler.getIntervals()).toEqual({ agentSyncMs: 100, sharedSyncMs: 200 });
    scheduler.stop();
  });

  describe('smartCustomerSync', () => {
    test('enqueues sync-customers for given user without stopping the scheduler', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']));

      scheduler.start(intervals);
      expect(scheduler.isRunning()).toBe(true);

      enqueue.mockClear();
      await scheduler.smartCustomerSync('user-1');

      expect(scheduler.isRunning()).toBe(true);
      expect(enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', {});
      expect(scheduler.getSessionCount()).toBe(1);
    });

    test('increments session count on repeated calls without re-enqueuing', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']));

      scheduler.start(intervals);
      enqueue.mockClear();

      await scheduler.smartCustomerSync('user-1');
      await scheduler.smartCustomerSync('user-1');

      expect(scheduler.getSessionCount()).toBe(2);
      expect(enqueue).toHaveBeenCalledTimes(1);
    });

    test('uses requesting userId when it is an active agent', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1', 'user-2']));

      await scheduler.smartCustomerSync('user-2');

      expect(enqueue).toHaveBeenCalledWith('sync-customers', 'user-2', {});
    });

    test('falls back to first active agent when userId is not active', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider(['agent-A']));

      await scheduler.smartCustomerSync('unknown-user');

      expect(enqueue).toHaveBeenCalledWith('sync-customers', 'agent-A', {});
    });

    test('uses provided userId when no active agents exist', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider([]));

      await scheduler.smartCustomerSync('user-1');

      expect(enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', {});
    });
  });

  describe('resumeOtherSyncs', () => {
    test('decrements session count to zero and clears safety timeout', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']));

      scheduler.start(intervals);
      await scheduler.smartCustomerSync('user-1');
      expect(scheduler.getSessionCount()).toBe(1);

      scheduler.resumeOtherSyncs();

      expect(scheduler.getSessionCount()).toBe(0);
      expect(scheduler.isRunning()).toBe(true);
    });

    test('does not decrement below zero when session count is still positive', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']));

      scheduler.start(intervals);
      await scheduler.smartCustomerSync('user-1');
      await scheduler.smartCustomerSync('user-1');
      expect(scheduler.getSessionCount()).toBe(2);

      scheduler.resumeOtherSyncs();

      expect(scheduler.getSessionCount()).toBe(1);
      expect(scheduler.isRunning()).toBe(true);
    });

    test('is safe to call when no smart sync is active', () => {
      const scheduler = createSyncScheduler(createMockEnqueue(), activityProvider([]));

      scheduler.resumeOtherSyncs();

      expect(scheduler.getSessionCount()).toBe(0);
    });

    test('does not restart if intervals were never configured', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider([]));

      await scheduler.smartCustomerSync('user-1');
      scheduler.resumeOtherSyncs();

      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('article sync auto-enqueue', () => {
    test('enqueues sync-order-articles after delay for active agents only', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockResolvedValue(['order-1', 'order-2']);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100);

      expect(enqueue).not.toHaveBeenCalledWith('sync-order-articles', expect.any(String), expect.any(Object));

      await vi.advanceTimersByTimeAsync(ARTICLE_SYNC_DELAY_MS);

      expect(getOrdersNeedingArticleSync).toHaveBeenCalledWith('user-1', ARTICLE_SYNC_BATCH_LIMIT);
      expect(enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-1' }, 'sync-order-articles-user-1-order-1');
      expect(enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-2' }, 'sync-order-articles-user-1-order-2');

      scheduler.stop();
    });

    test('calls getOrdersNeedingArticleSync for each active agent after delay', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockResolvedValue([]);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1', 'user-2']), getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ARTICLE_SYNC_DELAY_MS);

      expect(getOrdersNeedingArticleSync).toHaveBeenCalledWith('user-1', ARTICLE_SYNC_BATCH_LIMIT);
      expect(getOrdersNeedingArticleSync).toHaveBeenCalledWith('user-2', ARTICLE_SYNC_BATCH_LIMIT);

      scheduler.stop();
    });

    test('does not enqueue article syncs for idle agents', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockResolvedValue(['order-1']);
      const scheduler = createSyncScheduler(enqueue, activityProvider([], ['idle-1']), getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(intervals.agentSyncMs * IDLE_AGENT_MULTIPLIER + ARTICLE_SYNC_DELAY_MS);

      expect(getOrdersNeedingArticleSync).not.toHaveBeenCalledWith('idle-1', expect.any(Number));

      scheduler.stop();
    });

    test('does not enqueue article syncs when no orders need sync', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockResolvedValue([]);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ARTICLE_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-order-articles', expect.any(String), expect.any(Object));

      scheduler.stop();
    });

    test('does not call getOrdersNeedingArticleSync when not provided', () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']));

      scheduler.start(intervals);
      vi.advanceTimersByTime(100 + ARTICLE_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-order-articles', expect.any(String), expect.any(Object));

      scheduler.stop();
    });

    test('swallows errors from getOrdersNeedingArticleSync gracefully', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockRejectedValue(new Error('db error'));
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ARTICLE_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-order-articles', expect.any(String), expect.any(Object));

      scheduler.stop();
    });

    test('stop() cancels pending article sync timeouts', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockResolvedValue(['order-1']);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100);
      scheduler.stop();

      enqueue.mockClear();
      await vi.advanceTimersByTimeAsync(ARTICLE_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-order-articles', expect.any(String), expect.any(Object));
    });
  });

  describe('address sync auto-enqueue', () => {
    test('enqueues sync-customer-addresses after ADDRESS_SYNC_DELAY_MS for active agents', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
        { erp_id: 'CUST-001', name: 'Rossi Mario' },
        { erp_id: 'CUST-002', name: 'Verdi Luca' },
      ]);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100);

      expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));

      await vi.advanceTimersByTimeAsync(ADDRESS_SYNC_DELAY_MS);

      expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('user-1', ADDRESS_SYNC_BATCH_LIMIT);
      expect(enqueue).toHaveBeenCalledWith(
        'sync-customer-addresses',
        'user-1',
        {
          customers: [
            { erpId: 'CUST-001', customerName: 'Rossi Mario' },
            { erpId: 'CUST-002', customerName: 'Verdi Luca' },
          ],
        },
        expect.stringMatching(/^sync-customer-addresses-user-1-\d+$/),
      );

      scheduler.stop();
    });

    test('address sync jobId changes across time slots to prevent permanent deduplication', async () => {
      vi.setSystemTime(0);
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
        { erp_id: 'CUST-001', name: 'Rossi Mario' },
      ]);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);
      const call1 = enqueue.mock.calls.find((c) => c[0] === 'sync-customer-addresses');
      expect(call1).toBeDefined();
      const jobId1 = call1![3] as string;

      enqueue.mockClear();
      await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);
      const call2 = enqueue.mock.calls.find((c) => c[0] === 'sync-customer-addresses');
      expect(call2).toBeDefined();
      const jobId2 = call2![3] as string;

      expect(jobId1).toMatch(/^sync-customer-addresses-user-1-\d+$/);
      expect(jobId2).toMatch(/^sync-customer-addresses-user-1-\d+$/);
      expect(jobId1).not.toBe(jobId2);

      scheduler.stop();
    });

    test('calls getCustomersNeedingAddressSync for each active agent', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([]);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1', 'user-2']), undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);

      expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('user-1', ADDRESS_SYNC_BATCH_LIMIT);
      expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('user-2', ADDRESS_SYNC_BATCH_LIMIT);

      scheduler.stop();
    });

    test('enqueues address syncs for idle agents (background maintenance)', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
        { erp_id: 'CUST-001', name: 'Rossi' },
      ]);
      const scheduler = createSyncScheduler(enqueue, activityProvider([], ['idle-1']), undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(intervals.agentSyncMs + ADDRESS_SYNC_DELAY_MS);

      expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('idle-1', ADDRESS_SYNC_BATCH_LIMIT);

      scheduler.stop();
    });

    test('does not enqueue address syncs when no customers need sync', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([]);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));

      scheduler.stop();
    });

    test('does not call getCustomersNeedingAddressSync when not provided', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']));

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));

      scheduler.stop();
    });

    test('swallows errors from getCustomersNeedingAddressSync gracefully', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockRejectedValue(new Error('db error'));
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await expect(vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS)).resolves.not.toThrow();

      expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));

      scheduler.stop();
    });

    test('does not create duplicate address sync timeout when interval fires multiple times before delay expires', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
        { erp_id: 'CUST-001', name: 'Rossi' },
      ]);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100); // first interval fires, timeout set
      await vi.advanceTimersByTimeAsync(100); // second interval fires, timeout already pending — no duplicate

      enqueue.mockClear();
      await vi.advanceTimersByTimeAsync(ADDRESS_SYNC_DELAY_MS);

      // Only one enqueue despite two intervals: second interval skipped because timeout already pending
      const addressCalls = enqueue.mock.calls.filter((c) => c[0] === 'sync-customer-addresses');
      expect(addressCalls.length).toBe(1);

      scheduler.stop();
    });

    test('stop() cancels pending address sync timeouts so no enqueue fires after stop', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
        { erp_id: 'CUST-001', name: 'Rossi' },
      ]);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100); // first tick → schedules 5-min address timeout
      scheduler.stop();

      enqueue.mockClear();
      await vi.advanceTimersByTimeAsync(ADDRESS_SYNC_DELAY_MS); // would have fired without fix

      expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object));
    });
  });

  describe('cleanup and notifications', () => {
    test('calls deleteExpiredNotifications every CLEANUP_INTERVAL_MS when provided', () => {
      const enqueue = createMockEnqueue();
      const deleteExpired = vi.fn().mockResolvedValue(3);
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']), undefined, undefined, deleteExpired);

      scheduler.start(intervals);

      vi.advanceTimersByTime(CLEANUP_INTERVAL_MS - 1);
      expect(deleteExpired).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(deleteExpired).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(CLEANUP_INTERVAL_MS);
      expect(deleteExpired).toHaveBeenCalledTimes(2);

      scheduler.stop();
    });

    test('does not call deleteExpiredNotifications when not provided', () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, activityProvider(['user-1']));

      scheduler.start(intervals);
      vi.advanceTimersByTime(CLEANUP_INTERVAL_MS * 2);

      expect(enqueue).toHaveBeenCalled();

      scheduler.stop();
    });
  });
});
