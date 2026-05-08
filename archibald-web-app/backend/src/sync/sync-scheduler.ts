import type { OperationType } from '../operations/operation-types';
import type { DbPool } from '../db/pool';
import { logger } from '../logger';

type EnqueueFn = (
  type: OperationType,
  userId: string,
  data: Record<string, unknown>,
  idempotencyKey?: string,
) => Promise<string>;

type GetOrdersNeedingArticleSyncFn = (userId: string, limit: number) => Promise<string[]>;

// Callback dedicata per enqueued sync-order-articles con dedup e priority=50 via Conductor.
type EnqueueArticleSyncFn = (userId: string, orderId: string) => Promise<void>;

// Ritorna l'userId dell'agente disponibile meno recentemente usato per le shared syncs,
// o null se nessun agente è disponibile.
type GetNextSharedSyncAgentFn = () => Promise<string | null>;

type GetCustomersNeedingAddressSyncFn = (
  userId: string,
  limit: number,
) => Promise<Array<{ erp_id: string; name: string }>>;

type GetAgentsByActivityFn = () => { active: string[]; idle: string[] };

type SyncIntervals = {
  agentSyncMs: number;
  sharedSyncMs: number;
};

const ARTICLE_SYNC_BATCH_LIMIT = 10;
const ARTICLE_SYNC_DELAY_MS = 3 * 60 * 1000;
const ADDRESS_SYNC_BATCH_LIMIT = 30;
const ADDRESS_SYNC_DELAY_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 1000;
const IDLE_AGENT_MULTIPLIER = 4;

type DeleteExpiredFn = () => Promise<number>;

type CheckRemindersFn = (userId: string) => Promise<void>;

type DeleteExpiredCacheFn = () => Promise<number>;

type ConductorLike = {
  isAnyWriteActive: () => boolean;
};

function createSyncScheduler(
  enqueue: EnqueueFn,
  getAgentsByActivity: GetAgentsByActivityFn,
  getOrdersNeedingArticleSync?: GetOrdersNeedingArticleSyncFn,
  getCustomersNeedingAddressSync?: GetCustomersNeedingAddressSyncFn,
  deleteExpiredNotifications?: DeleteExpiredFn,
  checkCustomerReminders?: CheckRemindersFn,
  deleteExpiredRecognitionCache?: DeleteExpiredCacheFn,
  conductor?: ConductorLike,
  enqueueArticleSync?: EnqueueArticleSyncFn,
  getNextSharedSyncAgent?: GetNextSharedSyncAgentFn,
) {
  const timers: NodeJS.Timeout[] = [];
  const pendingTimeouts: NodeJS.Timeout[] = [];
  const addressSyncTimeouts = new Map<string, NodeJS.Timeout>();
  let running = false;
  let currentIntervals: SyncIntervals = { agentSyncMs: 0, sharedSyncMs: 0 };
  let sessionCount = 0;
  // Starvation guard: forza la sync condivisa dopo MAX_SKIP_MS di skip consecutivi
  const MAX_SKIP_MS = 30 * 60 * 1000;
  let lastSharedSyncRunAt = Date.now();

  function scheduleArticleSync(agentIds: string[]): void {
    if (!getOrdersNeedingArticleSync) return;
    for (const userId of agentIds) {
      const agentUserId = userId;
      pendingTimeouts.push(setTimeout(() => {
        getOrdersNeedingArticleSync(agentUserId, ARTICLE_SYNC_BATCH_LIMIT).then(async (orderIds) => {
          for (const orderId of orderIds) {
            if (enqueueArticleSync) {
              await enqueueArticleSync(agentUserId, orderId);
            } else {
              enqueue('sync-order-articles', agentUserId, { orderId }, `sync-order-articles-${agentUserId}-${orderId}`);
            }
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
              `sync-customer-addresses-${agentUserId}-${Math.floor(Date.now() / ADDRESS_SYNC_DELAY_MS)}`,
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

  function start(intervals?: SyncIntervals): void {
    if (intervals) {
      currentIntervals = intervals;
    }
    running = true;

    timers.push(
      setInterval(() => {
        const { active, idle } = getAgentsByActivity();
        scheduleArticleSync(active);
        scheduleAddressSync([...active, ...idle]);
      }, currentIntervals.agentSyncMs),
    );

    timers.push(
      setInterval(() => {
        if (conductor?.isAnyWriteActive()) {
          const skippedMs = Date.now() - lastSharedSyncRunAt;
          if (skippedMs < MAX_SKIP_MS) {
            logger.info('[SyncScheduler] Skipping shared sync: Conductor active', {
              skippedMinutes: Math.round(skippedMs / 60_000),
            });
            return;
          }
          // Starvation guard: troppo tempo senza sync — forziamo anche con Conductor attivo
          // Le sync condivise sono read-only e non interferiscono con le scritture ERP
          logger.warn('[SyncScheduler] Starvation guard: forcing shared sync after 30min skip', {
            skippedMinutes: Math.round(skippedMs / 60_000),
          });
        }
        lastSharedSyncRunAt = Date.now();
        if (getNextSharedSyncAgent) {
          // Conductor mode: scegli l'agente via round-robin (least recently used)
          getNextSharedSyncAgent().then((userId) => {
            if (!userId) return; // già loggato nel callback
            enqueue('sync-products', userId, {});
            enqueue('sync-prices', userId, {});
          }).catch((err: unknown) => {
            logger.error('[SyncScheduler] getNextSharedSyncAgent failed', { err });
          });
        } else {
          enqueue('sync-products', 'service-account', {});
          enqueue('sync-prices', 'service-account', {});
        }
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

    if (checkCustomerReminders) {
      function scheduleNextEightAm(): NodeJS.Timeout {
        const now = new Date();
        const next8 = new Date(now);
        next8.setHours(8, 0, 0, 0);
        if (next8 <= now) next8.setDate(next8.getDate() + 1);
        const msUntil8 = next8.getTime() - now.getTime();

        return setTimeout(() => {
          const { active } = getAgentsByActivity();
          for (const userId of active) {
            checkCustomerReminders!(userId).catch((err) => {
              logger.error('checkCustomerReminders failed', { userId, error: err });
            });
          }
          const daily = setInterval(() => {
            const { active: agents } = getAgentsByActivity();
            for (const id of agents) {
              checkCustomerReminders!(id).catch((err) => {
                logger.error('checkCustomerReminders failed', { userId: id, error: err });
              });
            }
          }, 24 * 60 * 60 * 1000);
          timers.push(daily);
        }, msUntil8) as unknown as NodeJS.Timeout;
      }
      pendingTimeouts.push(scheduleNextEightAm());
    }

    if (deleteExpiredRecognitionCache) {
      timers.push(
        setInterval(() => {
          deleteExpiredRecognitionCache().catch((error) => {
            logger.error('Failed to delete expired recognition cache', { error });
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

  async function smartCustomerSync(userId: string, pool?: DbPool): Promise<void> {
    if (sessionCount > 0) {
      sessionCount++;
      return;
    }

    sessionCount = 1;

    if (pool) {
      pool.query(
        `INSERT INTO system.sync_paused_users (user_id, reason)
         VALUES ($1, 'interactive_session') ON CONFLICT DO NOTHING`,
        [userId]
      ).catch((err: unknown) => logger.warn('[SyncScheduler] Failed to insert sync_paused_users', { err }));
    }

    const { active } = getAgentsByActivity();
    const targetUserId = active.includes(userId) ? userId : active[0] ?? userId;
    await enqueue('sync-customers', targetUserId, {});
  }

  function resumeOtherSyncs(userId?: string, pool?: DbPool): void {
    if (sessionCount <= 0) {
      return;
    }

    sessionCount--;

    if (sessionCount <= 0) {
      sessionCount = 0;

      if (userId && pool) {
        pool.query(
          `DELETE FROM system.sync_paused_users WHERE user_id = $1`,
          [userId]
        ).catch((err: unknown) => logger.warn('[SyncScheduler] Failed to remove sync_paused_users', { err }));
      }
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
  ARTICLE_SYNC_BATCH_LIMIT,
  ARTICLE_SYNC_DELAY_MS,
  ADDRESS_SYNC_BATCH_LIMIT,
  ADDRESS_SYNC_DELAY_MS,
  CLEANUP_INTERVAL_MS,
  IDLE_AGENT_MULTIPLIER,
  type SyncScheduler,
  type SyncIntervals,
  type EnqueueFn,
  type EnqueueArticleSyncFn,
  type GetAgentsByActivityFn,
  type GetOrdersNeedingArticleSyncFn,
  type GetCustomersNeedingAddressSyncFn,
  type DeleteExpiredFn,
  type CheckRemindersFn,
  type ConductorLike,
  type GetNextSharedSyncAgentFn,
};
