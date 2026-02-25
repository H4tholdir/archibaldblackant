import { Router, type Request, type Response } from 'express';
import type { QueueStats } from '../operations/operation-queue';
import type { ActiveJob } from '../operations/agent-lock';
import { logger } from '../logger';

type JobEvent = {
  event: string;
  data: Record<string, unknown>;
};

type SseProgressDeps = {
  verifyToken: (token: string) => Promise<{ userId: string } | null>;
  getActiveJob: (userId: string) => ActiveJob | undefined;
  getQueueStats: () => Promise<QueueStats>;
  onJobEvent: (userId: string, callback: (event: JobEvent) => void) => () => void;
};

function createSseProgressRouter(deps: SseProgressDeps) {
  const { verifyToken, getActiveJob, getQueueStats, onJobEvent } = deps;
  const router = Router();

  router.get('/progress', async (req: Request, res: Response) => {
    const token = req.query.token as string | undefined;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token richiesto' });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Token non valido' });
    }

    const userId = payload.userId;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (eventName: string, data: unknown) => {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const [queueStats] = await Promise.all([getQueueStats()]);
      const activeJob = getActiveJob(userId);

      sendEvent('initial-state', {
        queue: queueStats,
        activeJob: activeJob ? { jobId: activeJob.jobId, type: activeJob.type } : null,
      });
    } catch (error) {
      logger.error('Error sending initial SSE state', { error, userId });
    }

    const unsubscribe = onJobEvent(userId, (event: JobEvent) => {
      try {
        sendEvent(event.event, event.data);
      } catch {
        // Connection may be closed
      }
    });

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  });

  return router;
}

export { createSseProgressRouter, type SseProgressDeps, type JobEvent };
