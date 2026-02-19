import { Router } from 'express';
import { z } from 'zod';
import { OPERATION_TYPES } from '../operations/operation-types';
import type { OperationQueue } from '../operations/operation-queue';
import type { AgentLock } from '../operations/agent-lock';
import type { AuthRequest } from '../middleware/auth';

type BrowserPoolStats = {
  getStats: () => { browsers: number; activeContexts: number; maxContexts: number };
};

type OperationsRouterDeps = {
  queue: OperationQueue;
  agentLock: AgentLock;
  browserPool: BrowserPoolStats;
};

const enqueueSchema = z.object({
  type: z.enum(OPERATION_TYPES),
  data: z.record(z.unknown()),
  idempotencyKey: z.string().optional(),
});

function createOperationsRouter(deps: OperationsRouterDeps) {
  const { queue, agentLock, browserPool } = deps;
  const router = Router();

  router.post('/enqueue', async (req: AuthRequest, res) => {
    const parsed = enqueueSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues });
    }

    const { type, data, idempotencyKey } = parsed.data;
    const userId = req.user!.userId;
    const jobId = await queue.enqueue(type, userId, data, idempotencyKey);
    res.json({ success: true, jobId });
  });

  router.get('/:jobId/status', async (req: AuthRequest, res) => {
    const job = await queue.getJobStatus(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    if ((job as any).userId && (job as any).userId !== req.user!.userId && req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    res.json({ success: true, job });
  });

  router.get('/user/:userId', async (req: AuthRequest, res) => {
    if (req.params.userId !== req.user!.userId && req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const jobs = await queue.getAgentJobs(req.params.userId);
    res.json({ success: true, jobs });
  });

  router.post('/:jobId/retry', async (req: AuthRequest, res) => {
    const job = await queue.queue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    if (job.data.userId !== req.user!.userId && req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    await job.retry();
    res.json({ success: true });
  });

  router.post('/:jobId/cancel', async (req: AuthRequest, res) => {
    const job = await queue.queue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    if (job.data.userId !== req.user!.userId && req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const state = await job.getState();
    if (state !== 'waiting' && state !== 'delayed') {
      return res.status(409).json({ success: false, error: `Cannot cancel job in state: ${state}` });
    }

    await job.remove();
    res.json({ success: true });
  });

  router.get('/stats', async (_req: AuthRequest, res) => {
    const stats = await queue.getStats();
    res.json({ success: true, stats });
  });

  router.get('/dashboard', async (_req: AuthRequest, res) => {
    const [queueStats, activeJobs] = await Promise.all([
      queue.getStats(),
      Promise.resolve(agentLock.getAllActive()),
    ]);

    const activeJobsList = Array.from(activeJobs.entries()).map(([userId, job]) => ({
      userId,
      jobId: job.jobId,
      type: job.type,
    }));

    const poolStats = browserPool.getStats();

    res.json({
      success: true,
      queue: queueStats,
      activeJobs: activeJobsList,
      browserPool: poolStats,
    });
  });

  return router;
}

export { createOperationsRouter, type OperationsRouterDeps };
