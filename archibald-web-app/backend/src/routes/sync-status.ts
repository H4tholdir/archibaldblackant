import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';
import type { OperationQueue } from '../operations/operation-queue';
import type { AgentLock } from '../operations/agent-lock';
import type { OperationType } from '../operations/operation-types';
import type { DbPool } from '../db/pool';
import { enqueueWithDedup } from '../db/repositories/agent-queue';
import { logger } from '../logger';
import type { CircuitBreakerState } from '../sync/circuit-breaker';

type SyncSchedulerLike = {
  start: (intervals?: unknown) => void;
  stop: () => void;
  isRunning: () => boolean;
  getIntervals: () => { agentSyncMs: number; sharedSyncMs: number };
  updateInterval?: (type: string, intervalMinutes: number) => void;
  getDetailedIntervals?: () => Record<string, number>;
};

type ResetSyncType = 'customers' | 'products' | 'prices';

const VALID_RESET_TYPES = new Set<ResetSyncType>(['customers', 'products', 'prices']);

type ConductorHistoryEntry = {
  completedAt: Date | null;
  startedAt: Date | null;
  status: string;
  errorMessage: string | null;
};

type ConductorHistoryResult = {
  rows: ConductorHistoryEntry[];
  freshnessLastCompletedAt: Date | null;
};

type SyncStatusRouterDeps = {
  pool?: DbPool;
  queue: OperationQueue;
  agentLock: AgentLock;
  syncScheduler: SyncSchedulerLike;
  clearSyncData?: (type: string) => Promise<{ message: string }>;
  resetSyncCheckpoint?: (type: ResetSyncType) => Promise<void>;
  getGlobalCustomerCount?: () => Promise<number>;
  getGlobalCustomerLastSyncTime?: () => Promise<number | null>;
  getProductCount?: () => Promise<number>;
  getProductLastSyncTime?: () => Promise<number | null>;
  getSessionCount?: () => number;
  getOrdersNeedingArticleSync?: (userId: string, limit: number) => Promise<string[]>;
  getCircuitBreakerStatus?: () => Promise<CircuitBreakerState[]>;
  getConductorHistory?: (syncType: string, limit: number) => Promise<ConductorHistoryResult>;
  broadcast?: (userId: string, event: Record<string, unknown>) => void;
};

const VALID_SYNC_TYPES = new Set([
  'sync-customers', 'sync-orders', 'sync-ddt',
  'sync-invoices', 'sync-products', 'sync-prices',
  'sync-order-articles', 'sync-tracking',
  'sync-customer-addresses', 'sync-order-states',
]);

const CONDUCTOR_SYNC_TYPES = new Set([
  'sync-order-articles',
  'sync-customer-addresses',
  'sync-orders',
  'sync-customers',
  'sync-ddt',
  'sync-invoices',
  'sync-products',
  'sync-prices',
  'sync-tracking',
  'sync-order-states',
]);

type JobOutcome = 'real' | 'circuit_breaker_skip' | 'rescheduled' | 'skipped';

function classifyOutcome(returnvalue: Record<string, unknown> | null | undefined): JobOutcome {
  const data = returnvalue?.data as Record<string, unknown> | undefined;
  if (data?.circuitBreakerSkipped) return 'circuit_breaker_skip';
  if (data?.rescheduled) return 'rescheduled';
  if (data?.skipped) return 'skipped';
  return 'real';
}

function createSyncStatusRouter(deps: SyncStatusRouterDeps) {
  const { queue, agentLock, syncScheduler } = deps;
  const router = Router();

  router.get('/stats', async (_req: AuthRequest, res) => {
    try {
      const stats = await queue.getStats();
      res.json({ success: true, queue: stats });
    } catch (error) {
      logger.error('Error fetching sync stats', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero statistiche' });
    }
  });

  router.get('/monitoring/status', async (_req: AuthRequest, res) => {
    try {
      const [runningRows, conductorCounts] = await Promise.all([
        deps.pool
          ? deps.pool.query<{ task_id: string; task_type: string; user_id: string }>(
              `SELECT task_id::text AS task_id, task_type, user_id
               FROM system.agent_operation_queue
               WHERE status = 'running'`,
            ).then((r) => r.rows)
          : Promise.resolve([]),
        deps.pool
          ? deps.pool.query<{ waiting: string; active: string; completed: string; failed: string }>(
              `SELECT
                 COUNT(*) FILTER (WHERE status = 'enqueued') AS waiting,
                 COUNT(*) FILTER (WHERE status = 'running') AS active,
                 COUNT(*) FILTER (WHERE status = 'completed'
                   AND completed_at > NOW() - INTERVAL '24 hours') AS completed,
                 COUNT(*) FILTER (WHERE status = 'failed'
                   AND enqueued_at > NOW() - INTERVAL '24 hours') AS failed
               FROM system.agent_operation_queue`,
            ).then((r) => r.rows[0] ?? null)
          : Promise.resolve(null),
      ]);

      const activeJobsList = runningRows.map((r) => ({
        userId: r.user_id,
        jobId: r.task_id,
        type: r.task_type,
      }));

      const queueStats = conductorCounts
        ? {
            waiting: parseInt(conductorCounts.waiting, 10),
            active: parseInt(conductorCounts.active, 10),
            completed: parseInt(conductorCounts.completed, 10),
            failed: parseInt(conductorCounts.failed, 10),
            delayed: 0,
            prioritized: 0,
          }
        : await queue.getStats();

      res.json({
        success: true,
        queue: queueStats,
        activeJobs: activeJobsList,
        scheduler: {
          running: syncScheduler.isRunning(),
          intervals: syncScheduler.getIntervals(),
          sessionCount: deps.getSessionCount?.() ?? 0,
        },
      });
    } catch (error) {
      logger.error('Error fetching monitoring status', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero stato monitoring' });
    }
  });

  const SYNC_HISTORY_TYPES: OperationType[] = [
    'sync-customers', 'sync-orders', 'sync-ddt',
    'sync-invoices', 'sync-products', 'sync-prices',
    'sync-order-articles', 'sync-tracking', 'sync-customer-addresses',
    'sync-order-states',
  ];

  const STALE_THRESHOLDS_MS: Partial<Record<OperationType, number>> = {
    'sync-customers': 30 * 60_000,
    'sync-orders': 30 * 60_000,
    'sync-ddt': 30 * 60_000,
    'sync-invoices': 30 * 60_000,
    'sync-tracking': 30 * 60_000,
    'sync-order-states': 30 * 60_000,
    'sync-order-articles': 60 * 60_000,
    'sync-products': 90 * 60_000,
    'sync-prices': 90 * 60_000,
    'sync-customer-addresses': 4 * 60 * 60_000,
  };

  router.get('/monitoring/sync-history', async (_req: AuthRequest, res) => {
    try {
      const jobs = await queue.queue.getJobs(['completed', 'failed'], 0, 499);

      const byType = new Map<string, typeof jobs>();
      for (const syncType of SYNC_HISTORY_TYPES) {
        byType.set(syncType, []);
      }
      for (const job of jobs) {
        if (!job?.data) continue;
        const t = job.data.type;
        if (byType.has(t)) {
          byType.get(t)!.push(job);
        }
      }

      const types: Record<string, unknown> = {};

      for (const syncType of SYNC_HISTORY_TYPES) {
        if (CONDUCTOR_SYNC_TYPES.has(syncType) && deps.getConductorHistory) {
          const conductorHistory = await deps.getConductorHistory(syncType, 20);
          const rows = conductorHistory.rows;
          const freshnessAt = conductorHistory.freshnessLastCompletedAt ?? null;

          const history = rows.map((r) => ({
            timestamp: r.completedAt ? new Date(r.completedAt).toISOString() : null,
            duration: r.startedAt && r.completedAt
              ? new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()
              : null,
            success: r.status === 'completed' && !r.errorMessage,
            error: r.errorMessage ?? null,
            outcome: 'real' as JobOutcome,
          }));

          const totalCompleted = rows.filter((r) => r.status === 'completed' && !r.errorMessage).length;
          const totalFailed = rows.filter((r) => r.status === 'failed' || r.errorMessage).length;
          let consecutiveFailures = 0;
          for (const r of rows) {
            if (r.status === 'failed' || r.errorMessage) {
              consecutiveFailures++;
            } else {
              break;
            }
          }

          const lastRow = rows[0] ?? null;
          const lastSuccess: boolean | null = lastRow ? (lastRow.status === 'completed' && !lastRow.errorMessage) : null;
          const lastError: string | null = lastRow?.errorMessage ?? null;

          const realRow = rows.find((r) => r.status === 'completed' && !r.errorMessage) ?? null;

          // Use the most-recent between DB queue history and sync_freshness.
          // sync_freshness is updated by the Worker on every completeTask, so it stays current
          // even after a backend restart that clears the in-memory queue history.
          const realCompletedAt = realRow?.completedAt ?? null;
          const effectiveRealAt: Date | null =
            realCompletedAt && freshnessAt
              ? new Date(Math.max(new Date(realCompletedAt).getTime(), freshnessAt.getTime()))
              : (realCompletedAt ? new Date(realCompletedAt) : freshnessAt);

          const lastQueueAt = lastRow?.completedAt ? new Date(lastRow.completedAt) : null;
          const effectiveLastAt: Date | null =
            lastQueueAt && freshnessAt
              ? new Date(Math.max(lastQueueAt.getTime(), freshnessAt.getTime()))
              : (lastQueueAt ?? freshnessAt);

          const lastRunTime = effectiveLastAt ? effectiveLastAt.toISOString() : null;
          const lastDuration = lastRow?.startedAt && lastRow.completedAt
            ? new Date(lastRow.completedAt).getTime() - new Date(lastRow.startedAt).getTime()
            : null;

          const lastRealRunTime = effectiveRealAt ? effectiveRealAt.toISOString() : null;
          const lastRealDuration = realRow?.startedAt && realRow.completedAt
            ? new Date(realRow.completedAt).getTime() - new Date(realRow.startedAt).getTime()
            : null;

          const staleThresholdMs = STALE_THRESHOLDS_MS[syncType as OperationType];
          const isStale = staleThresholdMs !== undefined && effectiveRealAt != null
            ? Date.now() - effectiveRealAt.getTime() > staleThresholdMs
            : false;

          // When the queue has no rows but freshness says it ran recently, show healthy/stale
          // rather than idle — the queue was flushed but the work did happen.
          const health: 'healthy' | 'degraded' | 'stale' | 'idle' | 'paused' =
            (rows.length === 0 && effectiveRealAt === null) ? 'idle'
              : consecutiveFailures >= 3 ? 'degraded'
                : isStale ? 'stale'
                  : 'healthy';

          types[syncType] = {
            lastRunTime,
            lastDuration,
            lastSuccess,
            lastError,
            health,
            totalCompleted,
            totalFailed,
            consecutiveFailures,
            history,
            lastRealRunTime,
            lastRealDuration,
            circuitBreakerActive: false,
            skipCount: 0,
          };
          continue;
        }

        const typeJobs = byType.get(syncType)!;
        typeJobs.sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));

        let consecutiveFailures = 0;
        let totalCompleted = 0;
        let totalFailed = 0;

        for (const job of typeJobs) {
          if (job.failedReason) {
            totalFailed++;
          } else {
            totalCompleted++;
          }
        }

        // Solo i job 'real' failed incrementano consecutiveFailures.
        // Gli skip (CB, rescheduled, skipped) non azzerano la streak né la incrementano.
        for (const job of typeJobs) {
          if (job.failedReason) {
            consecutiveFailures++;
          } else {
            const outcome = classifyOutcome(job.returnvalue as Record<string, unknown> | null);
            if (outcome === 'real') break;
          }
        }

        const lastJob = typeJobs[0] ?? null;
        const lastRunTime = lastJob?.finishedOn
          ? new Date(lastJob.finishedOn).toISOString()
          : null;
        const lastDuration = lastJob?.finishedOn && lastJob.processedOn
          ? lastJob.finishedOn - lastJob.processedOn
          : null;

        const lastSuccess: boolean | null = lastJob ? !lastJob.failedReason : null;
        const lastError: string | null = lastJob?.failedReason ?? null;

        const realJob = typeJobs.find(
          (job) => !job.failedReason && classifyOutcome(job.returnvalue as Record<string, unknown> | null) === 'real',
        ) ?? null;
        const lastRealRunTime = realJob?.finishedOn ? new Date(realJob.finishedOn).toISOString() : null;
        const lastRealDuration = realJob?.finishedOn && realJob.processedOn
          ? realJob.finishedOn - realJob.processedOn
          : null;

        const recentJobs = typeJobs.slice(0, 20);
        const circuitBreakerActive = recentJobs.some(
          (job) => !job.failedReason && classifyOutcome(job.returnvalue as Record<string, unknown> | null) === 'circuit_breaker_skip',
        );
        const skipCount = recentJobs.filter(
          (job) => !job.failedReason && classifyOutcome(job.returnvalue as Record<string, unknown> | null) !== 'real',
        ).length;

        const staleThresholdMs = STALE_THRESHOLDS_MS[syncType as OperationType];
        const isStale = staleThresholdMs !== undefined && realJob?.finishedOn != null
          ? Date.now() - realJob.finishedOn > staleThresholdMs
          : false;

        const health: 'healthy' | 'degraded' | 'stale' | 'idle' | 'paused' =
          typeJobs.length === 0 ? 'idle'
            : circuitBreakerActive ? 'paused'
              : consecutiveFailures >= 3 ? 'degraded'
                : isStale ? 'stale'
                  : 'healthy';

        const history = typeJobs.slice(0, 20).map((job) => ({
          timestamp: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
          success: !job.failedReason,
          error: job.failedReason ?? null,
          outcome: classifyOutcome(job.returnvalue as Record<string, unknown> | null),
        }));

        types[syncType] = {
          lastRunTime,
          lastDuration,
          lastSuccess,
          lastError,
          health,
          totalCompleted,
          totalFailed,
          consecutiveFailures,
          history,
          lastRealRunTime,
          lastRealDuration,
          circuitBreakerActive,
          skipCount,
        };
      }

      res.json({ success: true, types });
    } catch (error) {
      logger.error('Error fetching sync history', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({ success: false, error: 'Errore nel recupero history sync' });
    }
  });

  router.get('/monitoring/circuit-breaker', async (_req: AuthRequest, res) => {
    try {
      if (!deps.getCircuitBreakerStatus) {
        return res.json({ success: true, entries: [] });
      }
      const states = await deps.getCircuitBreakerStatus();
      const now = new Date();
      const entries = states.map((s) => ({
        userId: s.userId,
        syncType: s.syncType,
        consecutiveFailures: s.consecutiveFailures,
        totalFailures24h: s.totalFailures24h,
        lastFailureAt: s.lastFailureAt?.toISOString() ?? null,
        lastError: s.lastError,
        pausedUntil: s.pausedUntil?.toISOString() ?? null,
        isPaused: s.pausedUntil ? s.pausedUntil > now : false,
        lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
      }));
      res.json({ success: true, entries });
    } catch (error) {
      logger.error('Error fetching circuit breaker status', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero circuit breaker status' });
    }
  });

  // Pulisce il registro del Conductor:
  // 1. Task 'failed' con started_at IS NULL (retry mai eseguiti, > 1h) — clutter puro
  // 2. Task 'failed' eseguiti (started_at IS NOT NULL, > 24h) — storico già diagnosticato
  // 3. Task 'completed' (> 7 giorni) — history vecchia
  router.post('/cleanup-queue', requireAdmin, async (_req: AuthRequest, res) => {
    if (!deps.pool) return res.status(501).json({ success: false, error: 'pool non disponibile' });
    try {
      const { rowCount: failedRetries } = await deps.pool.query(
        `DELETE FROM system.agent_operation_queue
         WHERE status = 'failed'
           AND started_at IS NULL
           AND enqueued_at < NOW() - INTERVAL '1 hour'`,
      );
      const { rowCount: oldFailedRun } = await deps.pool.query(
        `DELETE FROM system.agent_operation_queue
         WHERE status = 'failed'
           AND started_at IS NOT NULL
           AND enqueued_at < NOW() - INTERVAL '24 hours'`,
      );
      const { rowCount: oldCompleted } = await deps.pool.query(
        `DELETE FROM system.agent_operation_queue
         WHERE status = 'completed'
           AND completed_at < NOW() - INTERVAL '7 days'`,
      );
      const total = (failedRetries ?? 0) + (oldFailedRun ?? 0) + (oldCompleted ?? 0);
      res.json({
        success: true,
        deletedRetryFailed: failedRetries ?? 0,
        deletedOldFailedRun: oldFailedRun ?? 0,
        deletedOldCompleted: oldCompleted ?? 0,
        total,
      });
    } catch (error) {
      logger.error('Error cleaning queue', { error });
      res.status(500).json({ success: false, error: 'Errore durante la pulizia' });
    }
  });

  router.get('/auto-sync/status', async (_req: AuthRequest, res) => {
    res.json({
      success: true,
      running: syncScheduler.isRunning(),
      intervals: syncScheduler.getIntervals(),
    });
  });

  router.post('/auto-sync/start', async (_req: AuthRequest, res) => {
    try {
      syncScheduler.start();
      res.json({ success: true });
    } catch (error) {
      logger.error('Error starting auto-sync', { error });
      res.status(500).json({ success: false, error: 'Errore avvio auto-sync' });
    }
  });

  router.post('/auto-sync/stop', async (_req: AuthRequest, res) => {
    try {
      syncScheduler.stop();
      res.json({ success: true });
    } catch (error) {
      logger.error('Error stopping auto-sync', { error });
      res.status(500).json({ success: false, error: 'Errore stop auto-sync' });
    }
  });

  const VALID_MODES = new Set(['full', 'forced', 'delta', 'manual']);

  router.post('/trigger/:type', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const syncType = req.params.type;
      if (!VALID_SYNC_TYPES.has(syncType)) {
        return res.status(400).json({
          success: false,
          error: `Tipo sync non valido: ${syncType}. Validi: ${Array.from(VALID_SYNC_TYPES).join(', ')}`,
        });
      }

      const mode = (req.query.mode as string) ?? 'full';
      if (!VALID_MODES.has(mode)) {
        return res.status(400).json({ success: false, error: `Invalid sync mode: ${mode}` });
      }

      const userId = req.user!.userId;

      if (mode === 'forced') {
        if (!deps.clearSyncData) {
          return res.status(501).json({ success: false, error: 'clearSyncData non disponibile' });
        }
        await deps.clearSyncData(syncType);
        if (deps.resetSyncCheckpoint && VALID_RESET_TYPES.has(syncType.replace('sync-', '') as ResetSyncType)) {
          await deps.resetSyncCheckpoint(syncType.replace('sync-', '') as ResetSyncType);
        }
      }

      if (syncType === 'sync-order-articles') {
        if (!deps.getOrdersNeedingArticleSync) {
          return res.status(501).json({ success: false, error: 'getOrdersNeedingArticleSync non disponibile' });
        }
        if (!deps.pool) {
          return res.status(501).json({ success: false, error: 'pool non disponibile per sync-order-articles' });
        }
        const orderIds = await deps.getOrdersNeedingArticleSync(userId, 200);
        const taskIds: string[] = [];
        for (const orderId of orderIds) {
          const taskId = await enqueueWithDedup(deps.pool, {
            userId,
            taskType: 'sync-order-articles',
            payload: { orderId },
            priority: 50,
            requiresBrowser: true,
          });
          if (taskId !== null) taskIds.push(taskId.toString());
        }
        return res.json({ success: true, taskIds, jobsEnqueued: orderIds.length });
      }

      const jobData: Record<string, unknown> = {};
      if (mode === 'delta') {
        jobData.syncMode = 'delta';
      } else if (mode === 'manual') {
        jobData.syncMode = 'manual';
        jobData.triggeredBy = userId;
      }

      const jobId = await queue.enqueue(syncType as OperationType, userId, jobData);
      res.json({ success: true, jobId });
    } catch (error) {
      logger.error('Error triggering sync', { error });
      res.status(500).json({ success: false, error: 'Errore trigger sync' });
    }
  });

  const ALL_SYNC_TYPES: OperationType[] = [
    'sync-orders', 'sync-customers', 'sync-ddt',
    'sync-invoices', 'sync-prices', 'sync-products',
    'sync-tracking', 'sync-customer-addresses', 'sync-order-states',
  ];

  router.post('/trigger-all', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const jobIds: string[] = [];

      for (const syncType of ALL_SYNC_TYPES) {
        const jobId = await queue.enqueue(syncType, userId, {});
        jobIds.push(jobId);
      }

      if (deps.getOrdersNeedingArticleSync && deps.pool) {
        const orderIds = await deps.getOrdersNeedingArticleSync(userId, 200);
        for (const orderId of orderIds) {
          const taskId = await enqueueWithDedup(deps.pool, {
            userId,
            taskType: 'sync-order-articles',
            payload: { orderId },
            priority: 50,
            requiresBrowser: true,
          });
          if (taskId !== null) jobIds.push(taskId.toString());
        }
      }

      res.json({ success: true, jobIds, message: `Triggered ${ALL_SYNC_TYPES.length} sync operations` });
    } catch (error) {
      logger.error('Error triggering all syncs', { error });
      res.status(500).json({ success: false, error: 'Errore trigger sync completo' });
    }
  });

  // Timer di sicurezza: richiude il CB automaticamente se /manual-run/close non viene chiamato
  let manualRunCloseTimer: ReturnType<typeof setTimeout> | null = null;

  async function openCircuitForManualRun(pool: DbPool, userId: string): Promise<void> {
    // Chiude il circuit breaker (stato 'closed' = ERP raggiungibile) per permettere
    // l'esecuzione dei task manuali. NON rimuove da sync_paused_users: questo garantisce
    // che AdaptiveScheduler e SyncScheduler non auto-enqueino nulla — solo i task
    // esplicitamente triggerati dall'utente vengono eseguiti.
    await pool.query(
      `UPDATE system.agent_circuit_state
       SET state = 'closed', consecutive_erp_failures = 0, next_probe_at = NULL, updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    );
  }

  async function closeCircuitAfterManualRun(pool: DbPool, userId: string): Promise<void> {
    await pool.query(
      `UPDATE system.agent_circuit_state
       SET state = 'open', consecutive_erp_failures = 99,
           next_probe_at = NOW() + INTERVAL '999 days', updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    );
    await pool.query(
      `INSERT INTO system.sync_paused_users (user_id, reason)
       VALUES ($1, 'erp_blocked_offline_mode')
       ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason`,
      [userId],
    );
    // Cancella task BG rimasti in coda dopo la sync manuale
    await pool.query(
      `UPDATE system.agent_operation_queue
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_reason = 'erp_blocked_offline_mode'
       WHERE status = 'enqueued' AND user_id = $1`,
      [userId],
    );
    // Pulisce active_jobs residui e notifica il frontend per svuotare il banner
    const { rows: activeJobs } = await pool.query<{ job_id: string; type: string }>(
      `DELETE FROM system.active_jobs WHERE user_id = $1 RETURNING job_id, type`,
      [userId],
    );
    if (deps.broadcast && activeJobs.length > 0) {
      for (const job of activeJobs) {
        deps.broadcast(userId, {
          event: 'JOB_FAILED',
          jobId: job.job_id,
          taskId: job.job_id,
          type: job.type,
          error: 'Sessione VPN chiusa',
        });
      }
    }
  }

  // POST /api/sync/manual-run — apre il circuit breaker, triggera tutte le sync principali,
  // e richiude automaticamente dopo 30 minuti (safety net).
  // POST /api/sync/manual-run/open — apre solo il circuit breaker senza triggerare sync.
  // L'utente poi triggera le sync singolarmente dai bottoni esistenti.
  router.post('/manual-run/open', requireAdmin, async (req: AuthRequest, res) => {
    if (!deps.pool) return res.status(501).json({ success: false, error: 'pool non disponibile' });
    try {
      const userId = req.user!.userId;
      if (manualRunCloseTimer) { clearTimeout(manualRunCloseTimer); manualRunCloseTimer = null; }
      await openCircuitForManualRun(deps.pool, userId);
      const poolRef = deps.pool;
      manualRunCloseTimer = setTimeout(async () => {
        await closeCircuitAfterManualRun(poolRef, userId).catch(() => {});
        manualRunCloseTimer = null;
        logger.info('[ManualRun] Circuit breaker richiuso automaticamente dopo 30min', { userId });
      }, 30 * 60 * 1000);
      logger.info('[ManualRun] Circuit breaker aperto (open-only)', { userId });
      res.json({ success: true, message: 'Circuit breaker aperto. Puoi ora triggerare le sync singolarmente. Auto-chiusura in 30 min.' });
    } catch (error) {
      logger.error('[ManualRun] Errore open', { error });
      res.status(500).json({ success: false, error: 'Errore apertura circuit breaker' });
    }
  });

  router.post('/manual-run', requireAdmin, async (req: AuthRequest, res) => {
    if (!deps.pool) {
      return res.status(501).json({ success: false, error: 'pool non disponibile' });
    }
    try {
      const userId = req.user!.userId;

      if (manualRunCloseTimer) {
        clearTimeout(manualRunCloseTimer);
        manualRunCloseTimer = null;
      }

      await openCircuitForManualRun(deps.pool, userId);
      logger.info('[ManualRun] Circuit breaker aperto per sync manuale', { userId });

      const syncTypes: OperationType[] = [
        'sync-orders', 'sync-customers', 'sync-ddt',
        'sync-invoices', 'sync-products', 'sync-prices',
        'sync-tracking', 'sync-order-states',
      ];
      const jobIds: string[] = [];
      for (const syncType of syncTypes) {
        const jobId = await queue.enqueue(syncType, userId, { syncMode: 'manual', triggeredBy: userId });
        jobIds.push(jobId);
      }

      // Safety net: richiude il CB dopo 30 minuti se /manual-run/close non viene chiamato
      const poolRef = deps.pool;
      manualRunCloseTimer = setTimeout(async () => {
        await closeCircuitAfterManualRun(poolRef, userId).catch(() => {});
        manualRunCloseTimer = null;
        logger.info('[ManualRun] Circuit breaker richiuso automaticamente dopo 30min', { userId });
      }, 30 * 60 * 1000);

      res.json({
        success: true,
        jobIds,
        message: `${syncTypes.length} sync avviate. Il circuit breaker si richiuderà automaticamente tra 30 minuti, oppure chiama POST /api/sync/manual-run/close.`,
      });
    } catch (error) {
      logger.error('[ManualRun] Errore', { error });
      res.status(500).json({ success: false, error: 'Errore avvio sync manuale' });
    }
  });

  // POST /api/sync/manual-run/close — richiude il circuit breaker manualmente dopo la sync.
  router.post('/manual-run/close', requireAdmin, async (req: AuthRequest, res) => {
    if (!deps.pool) {
      return res.status(501).json({ success: false, error: 'pool non disponibile' });
    }
    try {
      const userId = req.user!.userId;

      if (manualRunCloseTimer) {
        clearTimeout(manualRunCloseTimer);
        manualRunCloseTimer = null;
      }

      await closeCircuitAfterManualRun(deps.pool, userId);
      logger.info('[ManualRun] Circuit breaker richiuso manualmente', { userId });

      res.json({ success: true, message: 'Circuit breaker richiuso. Sistema in modalità offline.' });
    } catch (error) {
      logger.error('[ManualRun] Errore chiusura', { error });
      res.status(500).json({ success: false, error: 'Errore chiusura circuit breaker' });
    }
  });

  router.get('/status', async (_req: AuthRequest, res) => {
    try {
      const [queueStats, runningRows] = await Promise.all([
        queue.getStats(),
        deps.pool
          ? deps.pool.query<{ task_id: string; task_type: string; user_id: string }>(
              `SELECT task_id::text AS task_id, task_type, user_id
               FROM system.agent_operation_queue
               WHERE status = 'running'`,
            ).then((r) => r.rows)
          : Promise.resolve([]),
      ]);

      const activeJobsList = runningRows.map((r) => ({
        userId: r.user_id,
        jobId: r.task_id,
        type: r.task_type,
      }));

      res.json({
        success: true,
        status: {
          queue: queueStats,
          activeJobs: activeJobsList,
          scheduler: {
            running: syncScheduler.isRunning(),
            intervals: syncScheduler.getIntervals(),
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching sync status', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero stato sync' });
    }
  });

  router.get('/intervals', requireAdmin, async (_req: AuthRequest, res) => {
    try {
      const intervals = syncScheduler.getDetailedIntervals
        ? syncScheduler.getDetailedIntervals()
        : syncScheduler.getIntervals();
      res.json({ success: true, intervals });
    } catch (error) {
      logger.error('Error fetching sync intervals', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero intervalli sync' });
    }
  });

  const VALID_INTERVAL_TYPES = new Set([
    'orders', 'customers', 'products', 'prices', 'ddt', 'invoices',
  ]);

  const intervalSchema = z.object({
    intervalMinutes: z.number().min(5).max(1440),
  });

  router.post('/intervals/:type', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { type } = req.params;
      if (!VALID_INTERVAL_TYPES.has(type)) {
        return res.status(400).json({ success: false, error: 'Tipo sync non valido' });
      }

      const parsed = intervalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Interval must be a number between 5 and 1440 minutes',
        });
      }

      if (!syncScheduler.updateInterval) {
        return res.status(501).json({ success: false, error: 'Aggiornamento intervalli non supportato' });
      }

      syncScheduler.updateInterval(type, parsed.data.intervalMinutes);

      logger.info(`Sync interval updated for ${type}`, {
        userId: req.user?.userId,
        intervalMinutes: parsed.data.intervalMinutes,
      });

      res.json({
        success: true,
        message: `Interval updated to ${parsed.data.intervalMinutes} minutes`,
        type,
        intervalMinutes: parsed.data.intervalMinutes,
      });
    } catch (error) {
      logger.error('Error updating sync interval', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento intervallo sync' });
    }
  });

  const VALID_CLEAR_TYPES = new Set([
    'customers', 'products', 'prices', 'orders', 'ddt', 'invoices',
  ]);

  router.delete('/:type/clear-db', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { type } = req.params;
      if (!VALID_CLEAR_TYPES.has(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid sync type. Must be one of: ${Array.from(VALID_CLEAR_TYPES).join(', ')}`,
        });
      }

      if (!deps.clearSyncData) {
        return res.status(501).json({ success: false, error: 'Cancellazione dati non supportata' });
      }

      logger.info(`Clear DB requested for ${type}`, { userId: req.user?.userId });
      const result = await deps.clearSyncData(type);
      res.json({ success: true, message: result.message });
    } catch (error) {
      logger.error('Error clearing sync data', { error });
      res.status(500).json({ success: false, error: 'Errore durante cancellazione database' });
    }
  });

  router.post('/reset/:type', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const syncType = req.params.type;
      if (!VALID_RESET_TYPES.has(syncType as ResetSyncType)) {
        return res.status(400).json({
          success: false,
          error: 'Tipo sync non valido. Usare: customers, products, prices',
        });
      }

      if (!deps.resetSyncCheckpoint) {
        return res.status(501).json({ success: false, error: 'Reset checkpoint non supportato' });
      }

      await deps.resetSyncCheckpoint(syncType as ResetSyncType);
      logger.info(`Checkpoint ${syncType} resettato`, { userId: req.user?.userId });

      res.json({
        success: true,
        message: `Checkpoint ${syncType} resettato. Prossima sync ripartirà da pagina 1.`,
      });
    } catch (error) {
      logger.error('Errore API /api/sync/reset', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Errore reset checkpoint',
      });
    }
  });

  const frequencySchema = z.object({
    intervalMinutes: z.number().min(5).max(1440),
  });

  router.post('/frequency', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const parsed = frequencySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Interval must be a number between 5 and 1440 minutes',
        });
      }

      const { intervalMinutes } = parsed.data;
      syncScheduler.stop();
      syncScheduler.start();

      logger.info(`Sync frequency updated to ${intervalMinutes} minutes`);

      res.json({
        success: true,
        intervalMinutes,
        message: `Sync frequency updated to ${intervalMinutes} minutes`,
      });
    } catch (error) {
      logger.error('Error updating sync frequency', { error });
      res.status(500).json({ success: false, error: 'Errore aggiornamento frequenza sync' });
    }
  });

  return router;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function createQuickCheckRouter(deps: SyncStatusRouterDeps) {
  const router = Router();

  router.get('/quick-check', async (_req, res) => {
    try {
      if (!deps.getGlobalCustomerCount || !deps.getGlobalCustomerLastSyncTime
        || !deps.getProductCount || !deps.getProductLastSyncTime) {
        return res.status(501).json({ success: false, error: 'Quick-check non configurato' });
      }

      const [customerCount, productCount, customerLastSync, productLastSync] = await Promise.all([
        deps.getGlobalCustomerCount(),
        deps.getProductCount(),
        deps.getGlobalCustomerLastSyncTime(),
        deps.getProductLastSyncTime(),
      ]);

      const needsInitialSync = customerCount === 0 || productCount === 0;

      const oneHourAgo = Date.now() - ONE_HOUR_MS;
      const customerNeedsSync = !customerLastSync || customerLastSync < oneHourAgo;
      const productNeedsSync = !productLastSync || productLastSync < oneHourAgo;

      res.json({
        success: true,
        data: {
          needsSync: needsInitialSync || customerNeedsSync || productNeedsSync,
          needsInitialSync,
          customers: {
            count: customerCount,
            lastSync: customerLastSync ? new Date(customerLastSync).toISOString() : null,
            needsSync: customerNeedsSync,
          },
          products: {
            count: productCount,
            lastSync: productLastSync ? new Date(productLastSync).toISOString() : null,
            needsSync: productNeedsSync,
          },
        },
      });
    } catch (error) {
      logger.error('Error in /sync/quick-check', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Errore durante il controllo sync',
      });
    }
  });

  return router;
}

export { createSyncStatusRouter, createQuickCheckRouter, classifyOutcome, type SyncStatusRouterDeps, type ResetSyncType, type JobOutcome };
