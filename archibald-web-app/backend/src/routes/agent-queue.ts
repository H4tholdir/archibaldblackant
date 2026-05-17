import { Router } from 'express';
import type { DbPool } from '../db/pool';
import type { Conductor } from '../conductor/dispatcher';
import type { AuthRequest } from '../middleware/auth';
import * as queueRepo from '../db/repositories/agent-queue';
import { randomUUID } from 'crypto';
import type { TaskType } from '../conductor/types';

export function createAgentQueueRouter(deps: {
  pool: DbPool;
  conductor: Conductor;
  broadcast?: (userId: string, event: Record<string, unknown>) => void;
}) {
  const router = Router();

  // POST /api/agent-queue/submit
  router.post('/submit', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { tasks } = req.body as { tasks: Array<{ type: string; payload: Record<string, unknown>; priority?: number }> };

      if (!Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ error: 'tasks array required' });
      }

      const batchId = tasks.length > 1 ? randomUUID() : undefined;
      const taskIds: string[] = [];

      for (const t of tasks) {
        const taskId = await deps.conductor.enqueueTaskExternal({
          userId,
          taskType: t.type as TaskType,
          payload: t.payload,
          batchId,
          priority: t.priority,
        });
        const taskIdStr = taskId.toString();
        taskIds.push(taskIdStr);
        // Broadcast aggiuntivo solo per operazioni con orderId: include pendingOrderId e
        // customerName che enqueueTaskExternal non conosce. Per sync tasks (no pendingOrderId)
        // il broadcast di enqueueTaskExternal è sufficiente ed evita il doppio record in UI.
        const pendingOrderId = t.payload.pendingOrderId as string | undefined;
        if (pendingOrderId) {
          deps.broadcast?.(userId, {
            event: 'JOB_QUEUED',
            taskId: taskIdStr,
            type: t.type,
            pendingOrderId,
            customerName: (t.payload.customerName as string | undefined) ?? '',
          });
        }
      }

      res.json({ taskIds, batchId });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/agent-queue/state
  router.get('/state', async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const active = await queueRepo.listActiveByUser(deps.pool, userId);
      const recent = await queueRepo.listRecentCompletedByUser(deps.pool, userId, 20);
      res.json({
        active: active.map(t => ({ ...t, taskId: t.taskId.toString() })),
        recent: recent.map(t => ({ ...t, taskId: t.taskId.toString() })),
      });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/agent-queue/:taskId/cancel
  router.post('/:taskId/cancel', async (req: AuthRequest, res) => {
    let taskId: bigint;
    try {
      taskId = BigInt(req.params.taskId);
    } catch {
      return res.status(400).json({ error: 'invalid taskId' });
    }
    try {
      const userId = req.user!.userId;
      const task = await queueRepo.getTaskById(deps.pool, taskId);
      if (!task || task.userId !== userId) {
        return res.status(404).json({ error: 'task not found' });
      }
      if (task.status !== 'enqueued') {
        return res.status(400).json({ error: `cannot cancel task in status ${task.status}` });
      }
      await queueRepo.cancelTask(deps.pool, taskId, 'user_requested');
      // Notifica il frontend che il task è stato cancellato (UI banner aggiorna stato)
      deps.broadcast?.(userId, {
        event: 'JOB_CANCELLED',
        taskId: req.params.taskId,
        type: task.taskType,
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
