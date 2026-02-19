import type { OperationType } from '../operations/operation-types';

type EnqueueFn = (
  type: OperationType,
  userId: string,
  data: Record<string, unknown>,
) => Promise<string>;

type SyncIntervals = {
  agentSyncMs: number;
  sharedSyncMs: number;
};

function createSyncScheduler(
  enqueue: EnqueueFn,
  getActiveAgentIds: () => string[],
) {
  const timers: NodeJS.Timeout[] = [];

  function start(intervals: SyncIntervals): void {
    timers.push(
      setInterval(() => {
        const agentIds = getActiveAgentIds();
        for (const userId of agentIds) {
          enqueue('sync-customers', userId, {});
          enqueue('sync-orders', userId, {});
          enqueue('sync-ddt', userId, {});
          enqueue('sync-invoices', userId, {});
        }
      }, intervals.agentSyncMs),
    );

    timers.push(
      setInterval(() => {
        enqueue('sync-products', 'service-account', {});
        enqueue('sync-prices', 'service-account', {});
      }, intervals.sharedSyncMs),
    );
  }

  function stop(): void {
    for (const timer of timers) {
      clearInterval(timer);
    }
    timers.length = 0;
  }

  return { start, stop };
}

type SyncScheduler = ReturnType<typeof createSyncScheduler>;

export { createSyncScheduler, type SyncScheduler, type SyncIntervals, type EnqueueFn };
