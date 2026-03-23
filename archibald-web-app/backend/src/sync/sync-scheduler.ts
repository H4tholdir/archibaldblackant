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
) => Promise<Array<{ customer_profile: string; name: string }>>;

type SyncIntervals = {
  agentSyncMs: number;
  sharedSyncMs: number;
};

const SAFETY_TIMEOUT_MS = 10 * 60 * 1000;
const ARTICLE_SYNC_BATCH_LIMIT = 10;
const ARTICLE_SYNC_DELAY_MS = 3 * 60 * 1000;
const ADDRESS_SYNC_BATCH_LIMIT = 10;
const ADDRESS_SYNC_DELAY_MS = 5 * 60 * 1000;

function createSyncScheduler(
  enqueue: EnqueueFn,
  getActiveAgentIds: () => string[],
  getOrdersNeedingArticleSync?: GetOrdersNeedingArticleSyncFn,
  getCustomersNeedingAddressSync?: GetCustomersNeedingAddressSyncFn,
) {
  const timers: NodeJS.Timeout[] = [];
  const pendingTimeouts: NodeJS.Timeout[] = [];
  const addressSyncTimeouts: NodeJS.Timeout[] = [];
  let running = false;
  let currentIntervals: SyncIntervals = { agentSyncMs: 0, sharedSyncMs: 0 };
  let sessionCount = 0;
  let safetyTimeout: NodeJS.Timeout | null = null;

  function start(intervals?: SyncIntervals): void {
    if (intervals) {
      currentIntervals = intervals;
    }
    running = true;

    timers.push(
      setInterval(() => {
        const agentIds = getActiveAgentIds();
        for (const userId of agentIds) {
          enqueue('sync-customers', userId, {});

          if (getOrdersNeedingArticleSync) {
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

          if (getCustomersNeedingAddressSync) {
            const agentUserId = userId;
            const tid = setTimeout(() => {
              const idx = addressSyncTimeouts.indexOf(tid);
              if (idx >= 0) addressSyncTimeouts.splice(idx, 1);
              getCustomersNeedingAddressSync(agentUserId, ADDRESS_SYNC_BATCH_LIMIT)
                .then((customers) => {
                  if (customers.length === 0) return;
                  enqueue(
                    'sync-customer-addresses',
                    agentUserId,
                    { customers: customers.map((c) => ({ customerProfile: c.customer_profile, customerName: c.name })) },
                    `sync-customer-addresses-batch-${agentUserId}`,
                  );
                })
                .catch((error) => {
                  logger.error('Failed to fetch customers needing address sync', { userId: agentUserId, error });
                });
            }, ADDRESS_SYNC_DELAY_MS);
            addressSyncTimeouts.push(tid);
          }
        }
      }, currentIntervals.agentSyncMs),
    );

    timers.push(
      setInterval(() => {
        enqueue('sync-products', 'service-account', {});
      }, currentIntervals.sharedSyncMs),
    );
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
  type SyncScheduler,
  type SyncIntervals,
  type EnqueueFn,
  type GetOrdersNeedingArticleSyncFn,
  type GetCustomersNeedingAddressSyncFn,
};
