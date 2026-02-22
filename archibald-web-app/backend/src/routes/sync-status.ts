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

type SyncStatusRouterDeps = {
  queue: OperationQueue;
  agentLock: AgentLock;
  syncScheduler: SyncSchedulerLike;
  clearSyncData?: (type: string) => Promise<{ message: string }>;
  getGlobalCustomerCount?: () => Promise<number>;
  getGlobalCustomerLastSyncTime?: () => Promise<number | null>;
  getProductCount?: () => Promise<number>;
  getProductLastSyncTime?: () => Promise<number | null>;
};

const VALID_SYNC_TYPES = new Set([
  'sync-customers', 'sync-orders', 'sync-ddt',
  'sync-invoices', 'sync-products', 'sync-prices',
  'sync-order-articles',
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
        },
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

  router.post('/trigger/:type', requireAdmin, async (req: AuthRequest, res) => {
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

  const ALL_SYNC_TYPES: OperationType[] = [
    'sync-orders', 'sync-customers', 'sync-ddt',
    'sync-invoices', 'sync-prices', 'sync-products',
  ];

  router.post('/trigger-all', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const jobIds: string[] = [];

      for (const syncType of ALL_SYNC_TYPES) {
        const jobId = await queue.enqueue(syncType, userId, {});
        jobIds.push(jobId);
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

export { createSyncStatusRouter, createQuickCheckRouter, type SyncStatusRouterDeps };
