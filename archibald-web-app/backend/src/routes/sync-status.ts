import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { OperationQueue } from '../operations/operation-queue';
import type { AgentLock } from '../operations/agent-lock';
import type { OperationType } from '../operations/operation-types';
import type { SyncType, SyncTypeIntervals } from '../sync/sync-scheduler';
import type { DbPool } from '../db/pool';
import { logger } from '../logger';

type SyncSchedulerLike = {
  start: (intervals: SyncTypeIntervals) => void;
  stop: () => void;
  isRunning: () => boolean;
  getIntervals: () => SyncTypeIntervals;
  updateInterval: (syncType: SyncType, intervalMs: number) => void;
  getDetailedIntervals: () => Record<SyncType, number>;
};

type SyncStatusRouterDeps = {
  queue: OperationQueue;
  agentLock: AgentLock;
  syncScheduler: SyncSchedulerLike;
  clearSyncData?: (type: string) => Promise<{ message: string }>;
  loadIntervalsMs?: () => Promise<SyncTypeIntervals>;
  persistInterval?: (syncType: SyncType, intervalMinutes: number) => Promise<void>;
  pool?: DbPool;
};

const VALID_SYNC_TYPES = new Set([
  'sync-customers', 'sync-orders', 'sync-ddt',
  'sync-invoices', 'sync-products', 'sync-prices',
  'sync-order-articles',
]);

type SyncWarning = {
  warning: string;
  syncType: string;
  createdAt: string;
};

async function fetchRecentWarnings(pool?: DbPool): Promise<SyncWarning[]> {
  if (!pool) return [];
  const { rows } = await pool.query<{ warning: string; sync_type: string; created_at: string }>(
    `SELECT details->>'warning' as warning, sync_type, created_at
     FROM system.sync_events
     WHERE event_type = 'parser_warning'
     ORDER BY created_at DESC
     LIMIT 10`,
  );
  return rows.map((row) => ({
    warning: row.warning,
    syncType: row.sync_type,
    createdAt: row.created_at,
  }));
}

type SyncHistoryEntry = {
  syncType: string;
  timestamp: string;
  duration: number;
  success: boolean;
  error: string | null;
  warnings?: string[];
};

async function fetchSyncHistory(pool: DbPool | undefined, limit: number): Promise<SyncHistoryEntry[]> {
  if (!pool) return [];
  try {
    const { rows } = await pool.query<{
      sync_type: string;
      event_type: string;
      details: Record<string, unknown>;
      created_at: string;
    }>(
      `SELECT sync_type, event_type, details, created_at
       FROM system.sync_events
       WHERE event_type IN ('sync_completed', 'sync_error', 'parser_warning')
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit * 6],
    );
    return rows.map((row) => ({
      syncType: row.sync_type.replace('sync-', ''),
      timestamp: row.created_at,
      duration: (row.details?.duration as number) ?? 0,
      success: row.event_type !== 'sync_error',
      error: (row.details?.error as string) ?? null,
      warnings: row.details?.warning ? [row.details.warning as string] : undefined,
    }));
  } catch {
    return [];
  }
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

  router.get('/monitoring/status', async (req: AuthRequest, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || '20', 10);
      const [queueStats, activeJobs, recentWarnings, syncHistory] = await Promise.all([
        queue.getStats(),
        Promise.resolve(agentLock.getAllActive()),
        fetchRecentWarnings(deps.pool),
        fetchSyncHistory(deps.pool, limit),
      ]);

      const activeJobsList = Array.from(activeJobs.entries()).map(([userId, job]) => ({
        userId,
        jobId: job.jobId,
        type: job.type,
      }));

      const syncTypes: Array<'orders' | 'customers' | 'products' | 'prices' | 'ddt' | 'invoices'> =
        ['orders', 'customers', 'products', 'prices', 'ddt', 'invoices'];

      const activeTypeSet = new Set(
        activeJobsList.map((j) => j.type.replace('sync-', '')),
      );

      const types: Record<string, {
        isRunning: boolean;
        lastRunTime: string | null;
        queuePosition: number | null;
        history: Array<{ timestamp: string; duration: number; success: boolean; error: string | null; warnings?: string[] }>;
        health: 'healthy' | 'unhealthy' | 'idle';
      }> = {};

      for (const syncType of syncTypes) {
        const typeHistory = syncHistory.filter((h) => h.syncType === syncType);
        const isRunning = activeTypeSet.has(syncType);
        const lastEntry = typeHistory[0] ?? null;
        const hasRecentError = typeHistory.slice(0, 3).some((h) => !h.success);

        types[syncType] = {
          isRunning,
          lastRunTime: lastEntry?.timestamp ?? null,
          queuePosition: null,
          history: typeHistory.map((h) => ({
            timestamp: h.timestamp,
            duration: h.duration,
            success: h.success,
            error: h.error,
            warnings: h.warnings,
          })),
          health: isRunning ? 'healthy' : lastEntry ? (hasRecentError ? 'unhealthy' : 'healthy') : 'idle',
        };
      }

      const currentSync = activeJobsList.length > 0
        ? activeJobsList[0].type.replace('sync-', '') as string
        : null;

      res.json({
        success: true,
        currentSync,
        types,
        queue: queueStats,
        activeJobs: activeJobsList,
        scheduler: {
          running: syncScheduler.isRunning(),
          intervals: syncScheduler.getDetailedIntervals(),
        },
        recentWarnings,
      });
    } catch (error) {
      logger.error('Error fetching monitoring status', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero stato monitoring' });
    }
  });

  router.get('/auto-sync/status', async (_req: AuthRequest, res) => {
    res.json({
      success: true,
      running: syncScheduler.isRunning(),
      intervals: syncScheduler.getDetailedIntervals(),
    });
  });

  router.post('/auto-sync/start', async (_req: AuthRequest, res) => {
    try {
      if (deps.loadIntervalsMs) {
        const intervalsMs = await deps.loadIntervalsMs();
        syncScheduler.start(intervalsMs);
      } else {
        syncScheduler.start(syncScheduler.getIntervals());
      }
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

  router.post('/trigger/:type', async (req: AuthRequest, res) => {
    try {
      const syncType = req.params.type;
      if (!VALID_SYNC_TYPES.has(syncType)) {
        return res.status(400).json({
          success: false,
          error: `Tipo sync non valido: ${syncType}. Validi: ${Array.from(VALID_SYNC_TYPES).join(', ')}`,
        });
      }

      const userId = req.user!.userId;
      const jobId = await queue.enqueue(syncType as OperationType, userId, {});
      res.json({ success: true, jobId });
    } catch (error) {
      logger.error('Error triggering sync', { error });
      res.status(500).json({ success: false, error: 'Errore trigger sync' });
    }
  });

  router.get('/status', async (_req: AuthRequest, res) => {
    try {
      const [queueStats, activeJobs] = await Promise.all([
        queue.getStats(),
        Promise.resolve(agentLock.getAllActive()),
      ]);

      const activeJobsList = Array.from(activeJobs.entries()).map(([userId, job]) => ({
        userId,
        jobId: job.jobId,
        type: job.type,
      }));

      res.json({
        success: true,
        status: {
          queue: queueStats,
          activeJobs: activeJobsList,
          scheduler: {
            running: syncScheduler.isRunning(),
            intervals: syncScheduler.getDetailedIntervals(),
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching sync status', { error });
      res.status(500).json({ success: false, error: 'Errore nel recupero stato sync' });
    }
  });

  router.get('/intervals', async (_req: AuthRequest, res) => {
    try {
      const intervals = syncScheduler.getDetailedIntervals();
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

  router.post('/intervals/:type', async (req: AuthRequest, res) => {
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

      const intervalMs = parsed.data.intervalMinutes * 60_000;
      syncScheduler.updateInterval(type as SyncType, intervalMs);

      if (deps.persistInterval) {
        await deps.persistInterval(type as SyncType, parsed.data.intervalMinutes);
      }

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

  router.delete('/:type/clear-db', async (req: AuthRequest, res) => {
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

  return router;
}

export { createSyncStatusRouter, type SyncStatusRouterDeps, type SyncSchedulerLike };
