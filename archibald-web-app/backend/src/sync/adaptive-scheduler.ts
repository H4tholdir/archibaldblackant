import type { DbPool } from '../db/pool';
import type { TaskType } from '../conductor/types';
import { enqueueWithDedup } from '../db/repositories/agent-queue';
import { getAllFreshnessForUser } from '../db/repositories/sync-freshness';
import { logger } from '../logger';

export type ActivityLevel = 'active' | 'idle' | 'offline';
export type StopScheduler = () => void;

const TARGET_FRESHNESS_MS: Record<string, Partial<Record<ActivityLevel, number>>> = {
  'sync-orders':       { active: 20 * 60_000, idle: 60 * 60_000 },
  'sync-customers':    { active: 30 * 60_000, idle: 120 * 60_000 },
  'sync-ddt':          { active: 60 * 60_000 },
  'sync-invoices':     { active: 60 * 60_000 },
  'sync-products':     { active: 240 * 60_000 },
  'sync-prices':       { active: 240 * 60_000 },
  'sync-tracking':     { active: 15 * 60_000, idle: 30 * 60_000 },
  'sync-order-states': { active: 5 * 60_000, idle: 15 * 60_000 },
};

export function getTargetFreshnessMs(syncType: string, level: ActivityLevel): number | null {
  return TARGET_FRESHNESS_MS[syncType]?.[level] ?? null;
}

export function stalenessScore(lastSyncAt: Date | null, targetFreshnessMs: number): number {
  if (!lastSyncAt) return 2.0;
  return (Date.now() - lastSyncAt.getTime()) / targetFreshnessMs;
}

const SYNC_TYPES = Object.keys(TARGET_FRESHNESS_MS) as TaskType[];

type GetAgentsByActivityFn = () => { active: string[]; idle: string[] };
type HasPendingTrackingFn = (pool: DbPool, userId: string) => Promise<boolean>;

export type AdaptiveSchedulerDeps = {
  pool: DbPool;
  getAgentsByActivity: GetAgentsByActivityFn;
  hasPendingTracking?: HasPendingTrackingFn;
};

export async function schedulerTick(deps: AdaptiveSchedulerDeps): Promise<void> {
  const { pool, getAgentsByActivity, hasPendingTracking } = deps;
  const { active, idle } = getAgentsByActivity();

  const allAgents: Array<{ userId: string; level: ActivityLevel }> = [
    ...active.map(userId => ({ userId, level: 'active' as ActivityLevel })),
    ...idle.map(userId => ({ userId, level: 'idle' as ActivityLevel })),
  ];

  for (const { userId, level } of allAgents) {
    // Queue pressure: skip if P<=10 write op is pending or running
    const { rows: pressureRows } = await pool.query(
      `SELECT 1 FROM system.agent_operation_queue
       WHERE user_id = $1 AND status IN ('enqueued','running') AND priority <= 10 LIMIT 1`,
      [userId],
    );
    if (pressureRows.length > 0) {
      logger.debug('[AdaptiveScheduler] Skip: queue pressure for user', { userId });
      continue;
    }

    const freshness = await getAllFreshnessForUser(pool, userId);

    for (const syncType of SYNC_TYPES) {
      if (syncType === 'sync-tracking' && hasPendingTracking) {
        const hasPending = await hasPendingTracking(pool, userId);
        if (!hasPending) continue;
      }

      const target = getTargetFreshnessMs(syncType, level);
      if (!target) continue;

      const lastSyncAt = freshness[syncType] ?? null;
      const score = stalenessScore(lastSyncAt, target);

      if (score >= 1.0) {
        await enqueueWithDedup(pool, {
          userId,
          taskType: syncType,
          payload: {},
          priority: 500,
          requiresBrowser: true,
        }).catch((err: unknown) => {
          logger.warn('[AdaptiveScheduler] enqueue failed', { syncType, userId, err });
        });
      }
    }
  }
}

export function createAdaptiveScheduler(
  deps: AdaptiveSchedulerDeps,
  tickIntervalMs = 60_000,
): StopScheduler {
  let running = true;

  const loop = async (): Promise<void> => {
    if (!running) return;
    try {
      await schedulerTick(deps);
    } catch (err) {
      logger.error('[AdaptiveScheduler] tick error', { err });
    }
    if (running) setTimeout(loop, tickIntervalMs);
  };

  setTimeout(loop, tickIntervalMs); // first tick after one interval

  return () => { running = false; };
}
