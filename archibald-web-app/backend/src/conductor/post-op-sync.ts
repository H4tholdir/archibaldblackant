import { enqueueWithDedup } from '../db/repositories/agent-queue';
import type { DbPool } from '../db/pool';
import type { TaskType } from './types';
import type { EnqueueWithDedupParams } from '../db/repositories/agent-queue';
import { logger } from '../logger';

type EnqueueFn = (pool: DbPool, params: EnqueueWithDedupParams) => Promise<bigint | null>;

export async function enqueuePostOpSyncs(
  pool: DbPool,
  userId: string,
  completedTaskType: TaskType,
  payload: Record<string, unknown>,
  enqueue: EnqueueFn = enqueueWithDedup,
): Promise<void> {
  const ops: EnqueueWithDedupParams[] = [];

  switch (completedTaskType) {
    case 'submit-order':
    case 'edit-order':
      ops.push({ userId, taskType: 'sync-orders', payload: {}, priority: 100, requiresBrowser: true });
      if (payload.orderId) {
        ops.push({ userId, taskType: 'sync-order-articles', payload: { orderId: payload.orderId }, priority: 20, requiresBrowser: true });
      }
      break;
    case 'delete-order':
      ops.push({ userId, taskType: 'sync-orders', payload: {}, priority: 100, requiresBrowser: true });
      break;
    case 'create-customer':
    case 'update-customer':
      ops.push({ userId, taskType: 'sync-customers', payload: {}, priority: 100, requiresBrowser: true });
      break;
    default:
      return;
  }

  for (const op of ops) {
    await enqueue(pool, op).catch((err: unknown) => {
      logger.warn('[Conductor] Post-op sync enqueue failed', {
        taskType: op.taskType,
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
