import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createSyncScheduler, type SyncIntervals } from './sync-scheduler';
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

    const agentSyncTypes: OperationType[] = ['sync-customers', 'sync-orders', 'sync-ddt', 'sync-invoices'];
    for (const type of agentSyncTypes) {
      expect(enqueue).toHaveBeenCalledWith(type, 'user-1', {});
      expect(enqueue).toHaveBeenCalledWith(type, 'user-2', {});
    }

    scheduler.stop();
  });

  test('enqueues shared syncs with service-account userId', () => {
    const enqueue = createMockEnqueue();
    const scheduler = createSyncScheduler(enqueue, () => []);

    scheduler.start(intervals);
    vi.advanceTimersByTime(200);

    expect(enqueue).toHaveBeenCalledWith('sync-products', 'service-account', {});
    expect(enqueue).toHaveBeenCalledWith('sync-prices', 'service-account', {});

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
});
