import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';
import type { OperationQueue } from '../operations/operation-queue';
import type { AgentLock } from '../operations/agent-lock';
import type { OperationType } from '../operations/operation-types';
import { logger } from '../logger';

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

type SyncStatusRouterDeps = {
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
};

const VALID_SYNC_TYPES = new Set([
  'sync-customers', 'sync-orders', 'sync-ddt',
  'sync-invoices', 'sync-products', 'sync-prices',
  'sync-order-articles', 'sync-tracking',
  'sync-customer-addresses', 'sync-order-states',
]);

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

        for (const job of typeJobs) {
          if (job.failedReason) {
            consecutiveFailures++;
          } else {
            break;
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

        const staleThresholdMs = STALE_THRESHOLDS_MS[syncType as OperationType];
        const isStale = staleThresholdMs !== undefined && lastJob?.finishedOn !== undefined
          ? Date.now() - lastJob.finishedOn > staleThresholdMs
          : false;

        const health: 'healthy' | 'degraded' | 'stale' | 'idle' =
          typeJobs.length === 0 ? 'idle'
            : consecutiveFailures >= 3 ? 'degraded'
              : isStale ? 'stale'
                : 'healthy';

        const history = typeJobs.slice(0, 20).map((job) => ({
          timestamp: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
          success: !job.failedReason,
          error: job.failedReason ?? null,
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
        };
      }

      res.json({ success: true, types });
    } catch (error) {
      logger.error('Error fetching sync history', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({ success: false, error: 'Errore nel recupero history sync' });
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
        const orderIds = await deps.getOrdersNeedingArticleSync(userId, 200);
        const jobIds: string[] = [];
        for (const orderId of orderIds) {
          const jobId = await queue.enqueue('sync-order-articles', userId, { orderId });
          jobIds.push(jobId);
        }
        return res.json({ success: true, jobIds, jobsEnqueued: orderIds.length });
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

      if (deps.getOrdersNeedingArticleSync) {
        const orderIds = await deps.getOrdersNeedingArticleSync(userId, 200);
        for (const orderId of orderIds) {
          const jobId = await queue.enqueue('sync-order-articles', userId, { orderId });
          jobIds.push(jobId);
        }
      }

      res.json({ success: true, jobIds, message: `Triggered ${ALL_SYNC_TYPES.length} sync operations` });
    } catch (error) {
      logger.error('Error triggering all syncs', { error });
      res.status(500).json({ success: false, error: 'Errore trigger sync completo' });
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

export { createSyncStatusRouter, createQuickCheckRouter, type SyncStatusRouterDeps, type ResetSyncType };
