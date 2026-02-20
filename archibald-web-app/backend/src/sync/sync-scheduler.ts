import type { OperationType } from '../operations/operation-types';

type EnqueueFn = (
  type: OperationType,
  userId: string,
  data: Record<string, unknown>,
) => Promise<string>;

type SyncType = 'orders' | 'customers' | 'products' | 'prices' | 'ddt' | 'invoices';

type SyncTypeIntervals = Record<SyncType, number>;

const SYNC_TYPES: readonly SyncType[] = ['orders', 'customers', 'products', 'prices', 'ddt', 'invoices'];

const AGENT_SPECIFIC_TYPES: ReadonlySet<SyncType> = new Set(['customers', 'orders', 'ddt', 'invoices']);

const SHARED_TYPES: ReadonlySet<SyncType> = new Set(['products', 'prices']);

const SYNC_TYPE_TO_OPERATION: Record<SyncType, OperationType> = {
  orders: 'sync-orders',
  customers: 'sync-customers',
  products: 'sync-products',
  prices: 'sync-prices',
  ddt: 'sync-ddt',
  invoices: 'sync-invoices',
};

const AGENT_IDS_CACHE_TTL_MS = 5_000;

function createSyncScheduler(
  enqueue: EnqueueFn,
  getActiveAgentIds: () => Promise<string[]>,
) {
  const timers = new Map<SyncType, NodeJS.Timeout>();
  let running = false;
  let currentIntervals: SyncTypeIntervals = {
    orders: 0, customers: 0, products: 0, prices: 0, ddt: 0, invoices: 0,
  };

  let cachedAgentIds: string[] | null = null;
  let cacheTimestamp = 0;

  async function getAgentIdsCached(): Promise<string[]> {
    const now = Date.now();
    if (cachedAgentIds !== null && now - cacheTimestamp < AGENT_IDS_CACHE_TTL_MS) {
      return cachedAgentIds;
    }
    cachedAgentIds = await getActiveAgentIds();
    cacheTimestamp = now;
    return cachedAgentIds;
  }

  function startTimerForType(syncType: SyncType, intervalMs: number): void {
    const operationType = SYNC_TYPE_TO_OPERATION[syncType];

    const timer = setInterval(async () => {
      if (AGENT_SPECIFIC_TYPES.has(syncType)) {
        const agentIds = await getAgentIdsCached();
        for (const userId of agentIds) {
          enqueue(operationType, userId, {});
        }
      } else {
        enqueue(operationType, 'service-account', {});
      }
    }, intervalMs);

    timers.set(syncType, timer);
  }

  function start(intervals: SyncTypeIntervals): void {
    currentIntervals = { ...intervals };
    running = true;

    for (const syncType of SYNC_TYPES) {
      const intervalMs = intervals[syncType];
      if (intervalMs > 0) {
        startTimerForType(syncType, intervalMs);
      }
    }
  }

  function stop(): void {
    for (const timer of timers.values()) {
      clearInterval(timer);
    }
    timers.clear();
    running = false;
  }

  function isRunning(): boolean {
    return running;
  }

  function getIntervals(): SyncTypeIntervals {
    return { ...currentIntervals };
  }

  function getDetailedIntervals(): Record<SyncType, number> {
    const result = {} as Record<SyncType, number>;
    for (const syncType of SYNC_TYPES) {
      result[syncType] = Math.round(currentIntervals[syncType] / 60_000);
    }
    return result;
  }

  function updateInterval(syncType: SyncType, intervalMs: number): void {
    const existingTimer = timers.get(syncType);
    if (existingTimer) {
      clearInterval(existingTimer);
      timers.delete(syncType);
    }

    currentIntervals[syncType] = intervalMs;

    if (running && intervalMs > 0) {
      startTimerForType(syncType, intervalMs);
    }
  }

  return { start, stop, isRunning, getIntervals, getDetailedIntervals, updateInterval };
}

type SyncScheduler = ReturnType<typeof createSyncScheduler>;

export {
  createSyncScheduler,
  SYNC_TYPES,
  AGENT_SPECIFIC_TYPES,
  SHARED_TYPES,
  type SyncScheduler,
  type SyncType,
  type SyncTypeIntervals,
  type EnqueueFn,
};
