import type { DbPool } from '../db/pool';
import type { TaskType } from '../conductor/types';
import { enqueueWithDedup } from '../db/repositories/agent-queue';
import { getAllFreshnessForUser } from '../db/repositories/sync-freshness';
import { logger } from '../logger';

// Throttle globale sync BG — configurabile per hardware:
//   CPX32 (4 vCPU,  8 GB)  10 agenti  → MAX_CONCURRENT_BG_SYNCS=3
//   CPX52 (8 vCPU,  16 GB) 30 agenti  → MAX_CONCURRENT_BG_SYNCS=6
//   CPX62 (16 vCPU, 32 GB) 70 agenti  → MAX_CONCURRENT_BG_SYNCS=12
// Regola: ~75% vCPU ai sync BG, 25% sempre liberi per user ops.
// Ogni agente usa la propria sessione ERP separata (browser context indipendente).
const MAX_CONCURRENT_BG_SYNCS = parseInt(process.env.MAX_CONCURRENT_BG_SYNCS ?? '3', 10);

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
  'sync-order-states': { active: 10 * 60_000, idle: 15 * 60_000 }, // 5→10min: riduce sessioni ERP di giorno
};

// Restituisce true se l'ora locale (fuso configurabile) è nell'intervallo lavorativo.
// Gate unico per i sync in background: nessuna chiamata ERP nelle ore notturne.
export function isWithinWorkingHours(now = new Date()): boolean {
  const start = parseInt(process.env.SYNC_WORKING_HOURS_START ?? '7', 10);
  const end   = parseInt(process.env.SYNC_WORKING_HOURS_END   ?? '20', 10);
  const tz    = process.env.SYNC_WORKING_HOURS_TZ ?? 'Europe/Rome';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).formatToParts(now);
  const hour  = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10) % 24;
  return hour >= start && hour < end;
}

export function getTargetFreshnessMs(syncType: string, level: ActivityLevel): number | null {
  return TARGET_FRESHNESS_MS[syncType]?.[level] ?? null;
}

export function stalenessScore(lastSyncAt: Date | null, targetFreshnessMs: number): number {
  if (!lastSyncAt) return 2.0;
  if (targetFreshnessMs <= 0) return 0; // target invalido → non scaduto
  const elapsed = Date.now() - lastSyncAt.getTime();
  return Math.max(0, elapsed / targetFreshnessMs); // clamp a 0 per date future (clock skew)
}

const SYNC_TYPES = Object.keys(TARGET_FRESHNESS_MS) as TaskType[];

type GetAgentsByActivityFn = () => { active: string[]; idle: string[] };
type HasPendingTrackingFn = (pool: DbPool, userId: string) => Promise<boolean>;

type GetCustomersNeedingVatValidationFn = (pool: DbPool, userId: string) => Promise<Array<{ erpId: string; vatNumber: string }>>;

export type AdaptiveSchedulerDeps = {
  pool: DbPool;
  getAgentsByActivity: GetAgentsByActivityFn;
  hasPendingTracking?: HasPendingTrackingFn;
  getCustomersNeedingVatValidation?: GetCustomersNeedingVatValidationFn;
};

export async function schedulerTick(deps: AdaptiveSchedulerDeps): Promise<void> {
  if (!isWithinWorkingHours()) {
    logger.debug('[AdaptiveScheduler] fuori orario lavorativo — tick saltato');
    return;
  }

  const { pool, getAgentsByActivity, hasPendingTracking } = deps;
  const { active, idle } = getAgentsByActivity();

  const allAgents: Array<{ userId: string; level: ActivityLevel }> = [
    ...active.map(userId => ({ userId, level: 'active' as ActivityLevel })),
    ...idle.map(userId => ({ userId, level: 'idle' as ActivityLevel })),
  ];

  // Throttle globale: conta i sync BG già attivi/in coda in tutto il sistema
  const { rows: [{ bg_count }] } = await pool.query<{ bg_count: string }>(
    `SELECT COUNT(*)::text AS bg_count
     FROM system.agent_operation_queue
     WHERE status IN ('enqueued','running') AND priority >= 200`,
  );
  let bgBudget = MAX_CONCURRENT_BG_SYNCS - parseInt(bg_count, 10);

  if (bgBudget <= 0) {
    logger.debug('[AdaptiveScheduler] throttle: limite BG raggiunto', {
      bg_active: bg_count,
      max: MAX_CONCURRENT_BG_SYNCS,
    });
    return;
  }

  let enqueuedCount = 0;

  for (const { userId, level } of allAgents) {
    if (bgBudget <= 0) break; // budget esaurito per questo tick

    try {
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

      // sync_paused_users è l'UNICO gate per la schedulazione automatica.
      // Il CB controlla solo l'esecuzione — non usarlo per decidere se enqueued.
      // In questo modo, anche se il CB viene accidentalmente lasciato 'closed'
      // (es. riavvio backend con sessione orfana), non partono sync automatiche.
      const { rows: pausedRows } = await pool.query(
        `SELECT 1 FROM system.sync_paused_users WHERE user_id = $1 LIMIT 1`, [userId],
      );
      if (pausedRows.length > 0) {
        logger.debug('[AdaptiveScheduler] Skip: user in sync_paused_users', { userId });
        continue;
      }

      const freshness = await getAllFreshnessForUser(pool, userId);

      for (const syncType of SYNC_TYPES) {
        if (bgBudget <= 0) break;

        if (syncType === 'sync-tracking' && hasPendingTracking) {
          const hasPending = await hasPendingTracking(pool, userId);
          if (!hasPending) continue;
        }

        const target = getTargetFreshnessMs(syncType, level);
        if (!target) continue;

        const lastSyncAt = freshness[syncType] ?? null;
        const score = stalenessScore(lastSyncAt, target);

        if (score >= 1.0) {
          const enqueued = await enqueueWithDedup(pool, {
            userId,
            taskType: syncType,
            payload: {},
            priority: 500,
            requiresBrowser: true,
          }).catch((err: unknown) => {
            logger.warn('[AdaptiveScheduler] enqueue failed', { syncType, userId, err });
            return null;
          });
          if (enqueued !== null) {
            enqueuedCount++;
            bgBudget--;
          }
        }
      }
    } catch (err) {
      logger.warn('[AdaptiveScheduler] per-user tick error — skipping user', { userId, err });
    }
  }

  if (enqueuedCount > 0) {
    logger.info('[AdaptiveScheduler] tick completato', {
      agents: allAgents.length,
      enqueued: enqueuedCount,
      bg_budget_used: MAX_CONCURRENT_BG_SYNCS - bgBudget,
      max_concurrent: MAX_CONCURRENT_BG_SYNCS,
    });
  } else {
    logger.debug('[AdaptiveScheduler] tick — nessun sync stale', {
      agents: allAgents.length,
    });
  }

  if (deps.getCustomersNeedingVatValidation) {
    for (const { userId } of allAgents) {
      try {
        // Rispetta gli stessi gate del sync loop normale
        const { rows: pressureRows } = await pool.query(
          `SELECT 1 FROM system.agent_operation_queue
           WHERE user_id = $1 AND status IN ('enqueued','running') AND priority <= 10 LIMIT 1`,
          [userId],
        );
        if (pressureRows.length > 0) continue;

        const { rows: pausedRows } = await pool.query(
          `SELECT 1 FROM system.sync_paused_users WHERE user_id = $1 LIMIT 1`, [userId],
        );
        if (pausedRows.length > 0) continue;

        const candidates = await deps.getCustomersNeedingVatValidation(pool, userId);
        for (const { erpId, vatNumber } of candidates) {
          await enqueueWithDedup(pool, {
            userId,
            taskType: 'read-vat-status' as TaskType,
            payload: { erpId, vatNumber },
            priority: 500,
            requiresBrowser: true,
          });
        }
        if (candidates.length > 0) {
          logger.info('[AdaptiveScheduler] VAT sweep', { userId, count: candidates.length });
        }
      } catch (err) {
        logger.warn('[AdaptiveScheduler] VAT sweep error', { userId, error: String(err) });
      }
    }
  }
}

export function createAdaptiveScheduler(
  deps: AdaptiveSchedulerDeps,
  tickIntervalMs = 60_000,
): StopScheduler {
  let running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const loop = async (): Promise<void> => {
    if (!running) return;
    try {
      await schedulerTick(deps);
    } catch (err) {
      logger.error('[AdaptiveScheduler] tick error', { err });
    }
    if (running) {
      timer = setTimeout(loop, tickIntervalMs);
    }
  };

  timer = setTimeout(loop, tickIntervalMs); // first tick after one interval
  logger.info('[AdaptiveScheduler] avviato', { tickIntervalMs });

  return () => {
    running = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
