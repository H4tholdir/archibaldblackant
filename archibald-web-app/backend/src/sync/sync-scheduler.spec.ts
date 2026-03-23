import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  createSyncScheduler,
  SAFETY_TIMEOUT_MS,
  ARTICLE_SYNC_BATCH_LIMIT,
  ARTICLE_SYNC_DELAY_MS,
  ADDRESS_SYNC_BATCH_LIMIT,
  ADDRESS_SYNC_DELAY_MS,
  type SyncIntervals,
  type GetCustomersNeedingAddressSyncFn,
} from './sync-scheduler';
import type { OperationType } from '../operations/operation-types';

function createMockEnqueue(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue('job-id');
}

const intervals: SyncIntervals = {
  agentSyncMs: 100,
  sharedSyncMs: 200,
};

describe('createSyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('start() creates intervals for agent and shared syncs', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

    scheduler.start(intervals);

    expect(enqueue).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(enqueue).toHaveBeenCalled();

    scheduler.stop();
  });

  test('enqueues per-agent syncs for each active agent', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, () => ['user-1', 'user-2']);

    scheduler.start(intervals);
    vi.advanceTimersByTime(100);

    // Scheduler now only enqueues the first sync in the chain (sync-customers).
    // The rest (sync-orders, sync-ddt, sync-invoices) are chained by the operation processor.
    expect(enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', {});
    expect(enqueue).toHaveBeenCalledWith('sync-customers', 'user-2', {});

    scheduler.stop();
  });

  test('enqueues only sync-products for shared syncs (sync-prices is chained after)', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, () => []);

    scheduler.start(intervals);
    vi.advanceTimersByTime(200);

    expect(enqueue).toHaveBeenCalledWith('sync-products', 'service-account', {});
    expect(enqueue).not.toHaveBeenCalledWith('sync-prices', 'service-account', {});

    scheduler.stop();
  });

  test('stop() clears all intervals', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

    scheduler.start(intervals);
    scheduler.stop();

    enqueue.mockClear();
    vi.advanceTimersByTime(1000);

    expect(enqueue).not.toHaveBeenCalled();
  });

  test('stop() is safe to call multiple times', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, () => []);

    scheduler.start(intervals);
    scheduler.stop();
    scheduler.stop();
  });

  test('isRunning() returns false before start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), () => []);
    expect(scheduler.isRunning()).toBe(false);
  });

  test('isRunning() returns true after start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), () => []);
    scheduler.start(intervals);
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
  });

  test('isRunning() returns false after stop', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), () => []);
    scheduler.start(intervals);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  test('getIntervals() returns default values before start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), () => []);
    expect(scheduler.getIntervals()).toEqual({ agentSyncMs: 0, sharedSyncMs: 0 });
  });

  test('getIntervals() returns configured values after start', () => {
    const scheduler = createSyncScheduler(createMockEnqueue(), () => []);
    scheduler.start(intervals);
    expect(scheduler.getIntervals()).toEqual({ agentSyncMs: 100, sharedSyncMs: 200 });
    scheduler.stop();
  });

  describe('smartCustomerSync', () => {
    test('stops scheduler and enqueues sync-customers for given user', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

      scheduler.start(intervals);
      expect(scheduler.isRunning()).toBe(true);

      enqueue.mockClear();
      await scheduler.smartCustomerSync('user-1');

      expect(scheduler.isRunning()).toBe(false);
      expect(enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', {});
      expect(scheduler.getSessionCount()).toBe(1);
    });

    test('increments session count on repeated calls without re-enqueuing', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

      scheduler.start(intervals);
      enqueue.mockClear();

      await scheduler.smartCustomerSync('user-1');
      await scheduler.smartCustomerSync('user-1');

      expect(scheduler.getSessionCount()).toBe(2);
      expect(enqueue).toHaveBeenCalledTimes(1);
    });

    test('uses requesting userId when it is an active agent', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => ['user-1', 'user-2']);

      await scheduler.smartCustomerSync('user-2');

      expect(enqueue).toHaveBeenCalledWith('sync-customers', 'user-2', {});
    });

    test('falls back to first active agent when userId is not active', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => ['agent-A']);

      await scheduler.smartCustomerSync('unknown-user');

      expect(enqueue).toHaveBeenCalledWith('sync-customers', 'agent-A', {});
    });

    test('uses provided userId when no active agents exist', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => []);

      await scheduler.smartCustomerSync('user-1');

      expect(enqueue).toHaveBeenCalledWith('sync-customers', 'user-1', {});
    });
  });

  describe('resumeOtherSyncs', () => {
    test('resumes scheduler when session count reaches zero', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

      scheduler.start(intervals);
      await scheduler.smartCustomerSync('user-1');
      expect(scheduler.isRunning()).toBe(false);

      scheduler.resumeOtherSyncs();

      expect(scheduler.getSessionCount()).toBe(0);
      expect(scheduler.isRunning()).toBe(true);
    });

    test('does not resume when session count is still positive', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

      scheduler.start(intervals);
      await scheduler.smartCustomerSync('user-1');
      await scheduler.smartCustomerSync('user-1');
      expect(scheduler.getSessionCount()).toBe(2);

      scheduler.resumeOtherSyncs();

      expect(scheduler.getSessionCount()).toBe(1);
      expect(scheduler.isRunning()).toBe(false);
    });

    test('is safe to call when no smart sync is active', () => {
      const scheduler = createSyncScheduler(createMockEnqueue(), () => []);

      scheduler.resumeOtherSyncs();

      expect(scheduler.getSessionCount()).toBe(0);
    });

    test('does not restart if intervals were never configured', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => []);

      await scheduler.smartCustomerSync('user-1');
      scheduler.resumeOtherSyncs();

      expect(scheduler.isRunning()).toBe(false);
    });
  });

  describe('article sync auto-enqueue', () => {
    test('enqueues sync-order-articles after delay for orders needing article sync', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockResolvedValue(['order-1', 'order-2']);
      const scheduler = createSyncScheduler(enqueue, () => ['user-1'], getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100);

      expect(enqueue).not.toHaveBeenCalledWith('sync-order-articles', expect.any(String), expect.any(Object));

      await vi.advanceTimersByTimeAsync(ARTICLE_SYNC_DELAY_MS);

      expect(getOrdersNeedingArticleSync).toHaveBeenCalledWith('user-1', ARTICLE_SYNC_BATCH_LIMIT);
      expect(enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-1' });
      expect(enqueue).toHaveBeenCalledWith('sync-order-articles', 'user-1', { orderId: 'order-2' });

      scheduler.stop();
    });

    test('calls getOrdersNeedingArticleSync for each active agent after delay', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockResolvedValue([]);
      const scheduler = createSyncScheduler(enqueue, () => ['user-1', 'user-2'], getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ARTICLE_SYNC_DELAY_MS);

      expect(getOrdersNeedingArticleSync).toHaveBeenCalledWith('user-1', ARTICLE_SYNC_BATCH_LIMIT);
      expect(getOrdersNeedingArticleSync).toHaveBeenCalledWith('user-2', ARTICLE_SYNC_BATCH_LIMIT);

      scheduler.stop();
    });

    test('does not enqueue article syncs when no orders need sync', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockResolvedValue([]);
      const scheduler = createSyncScheduler(enqueue, () => ['user-1'], getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ARTICLE_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-order-articles', expect.any(String), expect.any(Object));

      scheduler.stop();
    });

    test('does not call getOrdersNeedingArticleSync when not provided', () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

      scheduler.start(intervals);
      vi.advanceTimersByTime(100 + ARTICLE_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-order-articles', expect.any(String), expect.any(Object));

      scheduler.stop();
    });

    test('swallows errors from getOrdersNeedingArticleSync gracefully', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockRejectedValue(new Error('db error'));
      const scheduler = createSyncScheduler(enqueue, () => ['user-1'], getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ARTICLE_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-order-articles', expect.any(String), expect.any(Object));

      scheduler.stop();
    });

    test('stop() cancels pending article sync timeouts', async () => {
      const enqueue = createMockEnqueue();
      const getOrdersNeedingArticleSync = vi.fn().mockResolvedValue(['order-1']);
      const scheduler = createSyncScheduler(enqueue, () => ['user-1'], getOrdersNeedingArticleSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100);
      scheduler.stop();

      enqueue.mockClear();
      await vi.advanceTimersByTimeAsync(ARTICLE_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-order-articles', expect.any(String), expect.any(Object));
    });
  });

  describe('address sync auto-enqueue', () => {
    test('enqueues sync-customer-addresses after ADDRESS_SYNC_DELAY_MS for customers needing address sync', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
        { customer_profile: 'CUST-001', name: 'Rossi Mario' },
        { customer_profile: 'CUST-002', name: 'Verdi Luca' },
      ]);
      const scheduler = createSyncScheduler(enqueue, () => ['user-1'], undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100);

      expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object), expect.any(String));

      await vi.advanceTimersByTimeAsync(ADDRESS_SYNC_DELAY_MS);

      expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('user-1', ADDRESS_SYNC_BATCH_LIMIT);
      expect(enqueue).toHaveBeenCalledWith(
        'sync-customer-addresses',
        'user-1',
        { customerProfile: 'CUST-001', customerName: 'Rossi Mario' },
        'sync-customer-addresses-user-1-CUST-001',
      );
      expect(enqueue).toHaveBeenCalledWith(
        'sync-customer-addresses',
        'user-1',
        { customerProfile: 'CUST-002', customerName: 'Verdi Luca' },
        'sync-customer-addresses-user-1-CUST-002',
      );

      scheduler.stop();
    });

    test('calls getCustomersNeedingAddressSync for each active agent', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([]);
      const scheduler = createSyncScheduler(enqueue, () => ['user-1', 'user-2'], undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);

      expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('user-1', ADDRESS_SYNC_BATCH_LIMIT);
      expect(getCustomersNeedingAddressSync).toHaveBeenCalledWith('user-2', ADDRESS_SYNC_BATCH_LIMIT);

      scheduler.stop();
    });

    test('does not enqueue address syncs when no customers need sync', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([]);
      const scheduler = createSyncScheduler(enqueue, () => ['user-1'], undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object), expect.any(String));

      scheduler.stop();
    });

    test('does not call getCustomersNeedingAddressSync when not provided', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object), expect.any(String));

      scheduler.stop();
    });

    test('swallows errors from getCustomersNeedingAddressSync gracefully', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockRejectedValue(new Error('db error'));
      const scheduler = createSyncScheduler(enqueue, () => ['user-1'], undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await expect(vi.advanceTimersByTimeAsync(100 + ADDRESS_SYNC_DELAY_MS)).resolves.not.toThrow();

      expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object), expect.any(String));

      scheduler.stop();
    });

    test('stop() cancels pending address sync timeouts', async () => {
      const enqueue = createMockEnqueue();
      const getCustomersNeedingAddressSync: GetCustomersNeedingAddressSyncFn = vi.fn().mockResolvedValue([
        { customer_profile: 'CUST-001', name: 'Rossi' },
      ]);
      const scheduler = createSyncScheduler(enqueue, () => ['user-1'], undefined, getCustomersNeedingAddressSync);

      scheduler.start(intervals);
      await vi.advanceTimersByTimeAsync(100);
      scheduler.stop();

      enqueue.mockClear();
      await vi.advanceTimersByTimeAsync(ADDRESS_SYNC_DELAY_MS);

      expect(enqueue).not.toHaveBeenCalledWith('sync-customer-addresses', expect.any(String), expect.any(Object), expect.any(String));
    });
  });

  describe('safety timeout', () => {
    test('auto-resumes syncs after safety timeout', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

      scheduler.start(intervals);
      await scheduler.smartCustomerSync('user-1');
      expect(scheduler.isRunning()).toBe(false);

      vi.advanceTimersByTime(SAFETY_TIMEOUT_MS);

      expect(scheduler.getSessionCount()).toBe(0);
      expect(scheduler.isRunning()).toBe(true);
    });

    test('safety timeout resets on subsequent smartCustomerSync calls', async () => {
      const enqueue = createMockEnqueue();
      const scheduler = createSyncScheduler(enqueue, () => ['user-1']);

      scheduler.start(intervals);
      await scheduler.smartCustomerSync('user-1');

      vi.advanceTimersByTime(SAFETY_TIMEOUT_MS - 1000);
      await scheduler.smartCustomerSync('user-1');

      vi.advanceTimersByTime(SAFETY_TIMEOUT_MS - 1000);
      expect(scheduler.isRunning()).toBe(false);

      vi.advanceTimersByTime(1000);
      expect(scheduler.isRunning()).toBe(true);
    });
  });
});
