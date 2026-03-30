import type { OperationType } from '../operations/operation-types';
import { logger } from '../logger';

type EnqueueFn = (
  type: OperationType,
  userId: string,
  data: Record<string, unknown>,
  idempotencyKey?: string,
) => Promise<string>;

type GetOrdersNeedingArticleSyncFn = (userId: string, limit: number) => Promise<string[]>;

type GetCustomersNeedingAddressSyncFn = (
  userId: string,
  limit: number,
) => Promise<Array<{ erp_id: string; name: string }>>;

type GetAgentsByActivityFn = () => { active: string[]; idle: string[] };

type SyncIntervals = {
  agentSyncMs: number;
  sharedSyncMs: number;
};

const SAFETY_TIMEOUT_MS = 10 * 60 * 1000;
const ARTICLE_SYNC_BATCH_LIMIT = 10;
const ARTICLE_SYNC_DELAY_MS = 3 * 60 * 1000;
const ADDRESS_SYNC_BATCH_LIMIT = 30;
const ADDRESS_SYNC_DELAY_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 1000;
const IDLE_AGENT_MULTIPLIER = 4;

type DeleteExpiredFn = () => Promise<number>;

function createSyncScheduler(
  enqueue: EnqueueFn,
  getAgentsByActivity: GetAgentsByActivityFn,
  getOrdersNeedingArticleSync?: GetOrdersNeedingArticleSyncFn,
  getCustomersNeedingAddressSync?: GetCustomersNeedingAddressSyncFn,
  deleteExpiredNotifications?: DeleteExpiredFn,
) {
  const timers: NodeJS.Timeout[] = [];
  const pendingTimeouts: NodeJS.Timeout[] = [];
  const addressSyncTimeouts = new Map<string, NodeJS.Timeout>();
  let running = false;
  let currentIntervals: SyncIntervals = { agentSyncMs: 0, sharedSyncMs: 0 };
  let sessionCount = 0;
  let safetyTimeout: NodeJS.Timeout | null = null;

  function enqueueAgentSyncs(agentIds: string[], syncTypes: readonly OperationType[]): void {
    for (const userId of agentIds) {
      for (const syncType of syncTypes) {
        enqueue(syncType, userId, {});
      }
    }
  }

  function scheduleArticleSync(agentIds: string[]): void {
    if (!getOrdersNeedingArticleSync) return;
    for (const userId of agentIds) {
      const agentUserId = userId;
      pendingTimeouts.push(setTimeout(() => {
        getOrdersNeedingArticleSync(agentUserId, ARTICLE_SYNC_BATCH_LIMIT).then((orderIds) => {
          for (const orderId of orderIds) {
            enqueue('sync-order-articles', agentUserId, { orderId }, `sync-order-articles-${agentUserId}-${orderId}`);
          }
        }).catch((error) => {
          logger.error('Failed to fetch orders needing article sync', { userId: agentUserId, error });
        });
      }, ARTICLE_SYNC_DELAY_MS));
    }
  }

  function scheduleAddressSync(agentIds: string[]): void {
    if (!getCustomersNeedingAddressSync) return;
    for (const userId of agentIds) {
      if (addressSyncTimeouts.has(userId)) continue;
      const agentUserId = userId;
      const tid = setTimeout(() => {
        getCustomersNeedingAddressSync(agentUserId, ADDRESS_SYNC_BATCH_LIMIT)
          .then((customers) => {
            if (customers.length === 0) {
              addressSyncTimeouts.delete(agentUserId);
              return;
            }
            return enqueue(
              'sync-customer-addresses',
              agentUserId,
              { customers: customers.map((c) => ({ erpId: c.erp_id, customerName: c.name })) },
              `sync-customer-addresses-${agentUserId}`,
            ).finally(() => {
              addressSyncTimeouts.delete(agentUserId);
            });
          })
          .catch((error) => {
            logger.error('Failed to fetch customers needing address sync', { userId: agentUserId, error });
            addressSyncTimeouts.delete(agentUserId);
          });
      }, ADDRESS_SYNC_DELAY_MS);
      addressSyncTimeouts.set(agentUserId, tid);
    }
  }

  const ACTIVE_SYNC_TYPES: readonly OperationType[] = [
    'sync-customers',
    'sync-orders',
    'sync-ddt',
    'sync-invoices',
    'sync-tracking',
    'sync-order-states',
  ];

  const IDLE_SYNC_TYPES: readonly OperationType[] = [
    'sync-customers',
    'sync-orders',
  ];

  function start(intervals?: SyncIntervals): void {
    if (intervals) {
      currentIntervals = intervals;
    }
    running = true;

    timers.push(
      setInterval(() => {
        const { active } = getAgentsByActivity();
        enqueueAgentSyncs(active, ACTIVE_SYNC_TYPES);
        scheduleArticleSync(active);
        scheduleAddressSync(active);
      }, currentIntervals.agentSyncMs),
    );

    timers.push(
      setInterval(() => {
        const { idle } = getAgentsByActivity();
        enqueueAgentSyncs(idle, IDLE_SYNC_TYPES);
      }, currentIntervals.agentSyncMs * IDLE_AGENT_MULTIPLIER),
    );

    timers.push(
      setInterval(() => {
        enqueue('sync-products', 'service-account', {});
        enqueue('sync-prices', 'service-account', {});
      }, currentIntervals.sharedSyncMs),
    );

    if (deleteExpiredNotifications) {
      timers.push(
        setInterval(() => {
          deleteExpiredNotifications().catch((error) => {
            logger.error('Failed to delete expired notifications', { error });
          });
        }, CLEANUP_INTERVAL_MS),
      );
    }
  }

  function stop(): void {
    for (const timer of timers) {
      clearInterval(timer);
    }
    timers.length = 0;
    for (const timeout of pendingTimeouts) {
      clearTimeout(timeout);
    }
    pendingTimeouts.length = 0;
    for (const [, tid] of addressSyncTimeouts) {
      clearTimeout(tid);
    }
    addressSyncTimeouts.clear();
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

    const { active } = getAgentsByActivity();
    const targetUserId = active.includes(userId) ? userId : active[0] ?? userId;
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

  function updateInterval(type: string, intervalMinutes: number): void {
    const ms = intervalMinutes * 60 * 1000;
    const agentTypes = new Set(['customers', 'orders', 'ddt', 'invoices', 'tracking']);
    if (agentTypes.has(type)) {
      currentIntervals.agentSyncMs = ms;
    } else {
      currentIntervals.sharedSyncMs = ms;
    }
    if (running) {
      stop();
      start(currentIntervals);
    }
  }

  return { start, stop, isRunning, getIntervals, smartCustomerSync, resumeOtherSyncs, getSessionCount, updateInterval };
}

type SyncScheduler = ReturnType<typeof createSyncScheduler>;

export {
  createSyncScheduler,
  SAFETY_TIMEOUT_MS,
  ARTICLE_SYNC_BATCH_LIMIT,
  ARTICLE_SYNC_DELAY_MS,
  ADDRESS_SYNC_BATCH_LIMIT,
  ADDRESS_SYNC_DELAY_MS,
  CLEANUP_INTERVAL_MS,
  IDLE_AGENT_MULTIPLIER,
  type SyncScheduler,
  type SyncIntervals,
  type EnqueueFn,
  type GetAgentsByActivityFn,
  type GetOrdersNeedingArticleSyncFn,
  type GetCustomersNeedingAddressSyncFn,
  type DeleteExpiredFn,
};
