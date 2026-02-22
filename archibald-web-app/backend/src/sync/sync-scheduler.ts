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

const SAFETY_TIMEOUT_MS = 10 * 60 * 1000;

function createSyncScheduler(
  enqueue: EnqueueFn,
  getActiveAgentIds: () => string[],
) {
  const timers: NodeJS.Timeout[] = [];
  let running = false;
  let currentIntervals: SyncIntervals = { agentSyncMs: 0, sharedSyncMs: 0 };
  let sessionCount = 0;
  let safetyTimeout: NodeJS.Timeout | null = null;

  function start(intervals: SyncIntervals): void {
    currentIntervals = intervals;
    running = true;

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
    running = false;
  }

  function isRunning(): boolean {
    return running;
  }

  function getIntervals(): SyncIntervals {
    return { ...currentIntervals };
  }

  function clearSafetyTimeout(): void {
    if (safetyTimeout !== null) {
      clearTimeout(safetyTimeout);
      safetyTimeout = null;
    }
  }

  function resetSafetyTimeout(): void {
    clearSafetyTimeout();
    safetyTimeout = setTimeout(() => {
      sessionCount = 0;
      if (!running && currentIntervals.agentSyncMs > 0) {
        start(currentIntervals);
      }
    }, SAFETY_TIMEOUT_MS);
  }

  async function smartCustomerSync(userId: string): Promise<void> {
    if (sessionCount > 0) {
      sessionCount++;
      resetSafetyTimeout();
      return;
    }

    sessionCount = 1;

    if (running) {
      stop();
    }

    resetSafetyTimeout();

    const agentIds = getActiveAgentIds();
    const targetUserId = agentIds.includes(userId) ? userId : agentIds[0] ?? userId;
    await enqueue('sync-customers', targetUserId, {});
  }

  function resumeOtherSyncs(): void {
    if (sessionCount <= 0) {
      return;
    }

    sessionCount--;

    if (sessionCount <= 0) {
      sessionCount = 0;
      clearSafetyTimeout();

      if (!running && currentIntervals.agentSyncMs > 0) {
        start(currentIntervals);
      }
    } else {
      resetSafetyTimeout();
    }
  }

  function getSessionCount(): number {
    return sessionCount;
  }

  return { start, stop, isRunning, getIntervals, smartCustomerSync, resumeOtherSyncs, getSessionCount };
}

type SyncScheduler = ReturnType<typeof createSyncScheduler>;

export { createSyncScheduler, SAFETY_TIMEOUT_MS, type SyncScheduler, type SyncIntervals, type EnqueueFn };
