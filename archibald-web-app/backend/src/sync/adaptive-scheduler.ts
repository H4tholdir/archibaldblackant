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

// Converte "HH:MM" in minuti dall'inizio del giorno.
function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(s => parseInt(s, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

// Restituisce true se l'ora locale è AL DI FUORI del blocco notturno.
// Default: blocco 01:30–07:30 (attivo 07:30–01:30, quasi tutto il giorno).
// Env vars: SYNC_NIGHT_BLOCK_START (default "01:30"), SYNC_NIGHT_BLOCK_END (default "07:30").
// Supporta blocchi che attraversano la mezzanotte (es. "23:00"–"06:00").
export function isWithinWorkingHours(now = new Date()): boolean {
  const tz = process.env.SYNC_WORKING_HOURS_TZ ?? 'Europe/Rome';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour   = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10) % 24;
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const current = hour * 60 + minute;

  const blockStart = parseHHMM(process.env.SYNC_NIGHT_BLOCK_START ?? '01:30');
  const blockEnd   = parseHHMM(process.env.SYNC_NIGHT_BLOCK_END   ?? '07:30');

  const inBlock = blockStart <= blockEnd
    ? current >= blockStart && current < blockEnd          // blocco non attraversa mezzanotte
    : current >= blockStart || current < blockEnd;         // blocco attraversa mezzanotte

  return !inBlock;
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

// Cross-user: restituisce tutti i clienti da validare indipendentemente dallo stato agente
type GetAllCustomersNeedingVatValidationFn = (pool: DbPool) => Promise<Array<{ userId: string; erpId: string; vatNumber: string }>>;

type GetCustomersNeedingAddressSyncFn = (pool: DbPool, userId: string, limit: number) => Promise<Array<{ erp_id: string; name: string }>>;

export type AdaptiveSchedulerDeps = {
  pool: DbPool;
  getAgentsByActivity: GetAgentsByActivityFn;
  hasPendingTracking?: HasPendingTrackingFn;
  getAllCustomersNeedingVatValidation?: GetAllCustomersNeedingVatValidationFn;
  getCustomersNeedingAddressSync?: GetCustomersNeedingAddressSyncFn;
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

  // VAT sweep — include tutti gli agenti (anche offline) che hanno clienti da validare.
  // THROTTLE: massimo MAX_VAT_PER_TICK job per tick per non esaurire il BrowserPool.
  // Il sweep riprende i candidati restanti al tick successivo (~10 min).
  const MAX_VAT_PER_TICK = 3;
  if (deps.getAllCustomersNeedingVatValidation) {
    try {
      // Controlla quanti job VAT sono già in coda/esecuzione
      const { rows: [{ vat_count }] } = await pool.query<{ vat_count: string }>(
        `SELECT COUNT(*)::text AS vat_count FROM system.agent_operation_queue
         WHERE task_type IN ('read-vat-status','bg-validate-vat') AND status IN ('enqueued','running')`,
      );
      const vatInFlight = parseInt(vat_count, 10);
      if (vatInFlight >= MAX_VAT_PER_TICK) {
        logger.debug('[AdaptiveScheduler] VAT sweep skip: già in volo', { vatInFlight, max: MAX_VAT_PER_TICK });
        return;
      }
      const canEnqueue = MAX_VAT_PER_TICK - vatInFlight;

      const allCandidates = await deps.getAllCustomersNeedingVatValidation(pool);
      let vatEnqueued = 0;

      // Raggruppa per userId per applicare i gate per-utente
      const byUser = new Map<string, Array<{ erpId: string; vatNumber: string }>>();
      for (const { userId, erpId, vatNumber } of allCandidates) {
        if (!byUser.has(userId)) byUser.set(userId, []);
        byUser.get(userId)!.push({ erpId, vatNumber });
      }

      outer: for (const [userId, candidates] of byUser) {
        try {
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

          for (const { erpId, vatNumber } of candidates) {
            if (vatEnqueued >= canEnqueue) break outer;
            await enqueueWithDedup(pool, {
              userId,
              taskType: 'read-vat-status' as TaskType,
              payload: { erpId, vatNumber },
              priority: 500,
              requiresBrowser: true,
            });
            vatEnqueued++;
          }
        } catch (err) {
          logger.warn('[AdaptiveScheduler] VAT sweep error per user', { userId, error: String(err) });
        }
      }

      if (vatEnqueued > 0) {
        logger.info('[AdaptiveScheduler] VAT sweep completato', {
          users: byUser.size,
          total_candidates: allCandidates.length,
          enqueued_this_tick: vatEnqueued,
          remaining: allCandidates.length - vatEnqueued,
        });
      }
    } catch (err) {
      logger.warn('[AdaptiveScheduler] VAT sweep error', { error: String(err) });
    }
  }

  // Address sync sweep — clienti senza indirizzi sincronizzati di recente (24h).
  // Throttle: max MAX_ADDR_PER_TICK task simultanei, batch ADDRESS_BATCH_SIZE clienti ciascuno.
  const MAX_ADDR_PER_TICK = 2;
  const ADDRESS_BATCH_SIZE = 10;
  if (deps.getCustomersNeedingAddressSync) {
    try {
      const { rows: [{ addr_count }] } = await pool.query<{ addr_count: string }>(
        `SELECT COUNT(*)::text AS addr_count FROM system.agent_operation_queue
         WHERE task_type = 'sync-customer-addresses' AND status IN ('enqueued','running')`,
      );
      const addrInFlight = parseInt(addr_count, 10);
      if (addrInFlight >= MAX_ADDR_PER_TICK) {
        logger.debug('[AdaptiveScheduler] address sweep skip: già in volo', { addrInFlight, max: MAX_ADDR_PER_TICK });
        return;
      }
      const canEnqueue = MAX_ADDR_PER_TICK - addrInFlight;
      let addrEnqueued = 0;

      for (const { userId } of allAgents) {
        if (addrEnqueued >= canEnqueue) break;
        try {
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

          const customers = await deps.getCustomersNeedingAddressSync(pool, userId, ADDRESS_BATCH_SIZE);
          if (customers.length === 0) continue;

          await enqueueWithDedup(pool, {
            userId,
            taskType: 'sync-customer-addresses' as TaskType,
            payload: { customers: customers.map(c => ({ erpId: c.erp_id, customerName: c.name })) },
            priority: 500,
            requiresBrowser: true,
          });
          addrEnqueued++;
        } catch (err) {
          logger.warn('[AdaptiveScheduler] address sweep error per user', { userId, error: String(err) });
        }
      }

      if (addrEnqueued > 0) {
        logger.info('[AdaptiveScheduler] address sweep completato', { enqueued_this_tick: addrEnqueued });
      }
    } catch (err) {
      logger.warn('[AdaptiveScheduler] address sweep error', { error: String(err) });
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
