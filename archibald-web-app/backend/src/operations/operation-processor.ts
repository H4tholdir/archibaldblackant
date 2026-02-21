import type { OperationType, OperationJobData, OperationJobResult } from './operation-types';
import { OPERATION_TIMEOUTS } from './operation-types';
import type { AgentLock } from './agent-lock';
import { UnrecoverableError } from 'bullmq';

type BrowserContext = unknown;

type OnEmitFn = (event: { type: string; payload: unknown; timestamp: string }) => void;

type OperationHandler = (
  context: BrowserContext,
  data: Record<string, unknown>,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  signal?: AbortSignal,
  onEmit?: OnEmitFn,
) => Promise<Record<string, unknown>>;

type BroadcastFn = (userId: string, event: Record<string, unknown>) => void;

type EnqueueFn = (
  type: OperationType,
  userId: string,
  data: Record<string, unknown>,
  idempotencyKey?: string,
  options?: { delay?: number },
) => Promise<string>;

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<BrowserContext>;
  releaseContext: (userId: string, context: BrowserContext, success: boolean) => Promise<void>;
  markInUse?: (userId: string) => void;
  markIdle?: (userId: string) => void;
};

type JobLike = {
  id: string;
  data: OperationJobData;
  updateProgress: (progress: number | object) => Promise<void>;
  signal?: AbortSignal;
};

type PreemptionConfig = {
  timeoutMs: number;
  pollIntervalMs: number;
};

type LogSyncEventFn = (
  userId: string,
  syncType: string,
  eventType: string,
  details: Record<string, unknown>,
) => Promise<void>;

type ProcessorDeps = {
  agentLock: AgentLock;
  browserPool: BrowserPoolLike;
  broadcast: BroadcastFn;
  enqueue: EnqueueFn;
  handlers: Partial<Record<OperationType, OperationHandler>>;
  cancelJob: (jobId: string) => boolean;
  preemptionConfig?: PreemptionConfig;
  getTimeout?: (type: OperationType) => number;
  logSyncEvent?: LogSyncEventFn;
};

type ProcessJobResult = {
  success: boolean;
  data?: Record<string, unknown>;
  duration: number;
  requeued?: boolean;
};

const PREEMPTION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

function createOperationProcessor(deps: ProcessorDeps) {
  const { agentLock, browserPool, broadcast, enqueue, handlers } = deps;

  async function processJob(job: JobLike): Promise<ProcessJobResult> {
    const startTime = Date.now();
    const { type, userId, data, idempotencyKey } = job.data;
    const { _requeueCount, ...handlerData } = data as Record<string, unknown> & { _requeueCount?: number };

    const handler = handlers[type];
    if (!handler) {
      throw new Error(`No handler registered for operation type: ${type}`);
    }

    let lockAcquired = false;
    let acquireResult = agentLock.acquire(userId, job.id, type);

    if (!acquireResult.acquired) {
      if (acquireResult.preemptable) {
        const { activeJob } = acquireResult;
        deps.cancelJob(activeJob.jobId);
        if (activeJob.requestStop) {
          activeJob.requestStop();
        }

        const preemptionTimeout = deps.preemptionConfig?.timeoutMs ?? PREEMPTION_TIMEOUT_MS;
        const pollInterval = deps.preemptionConfig?.pollIntervalMs ?? POLL_INTERVAL_MS;
        let waited = 0;
        while (waited < preemptionTimeout) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          waited += pollInterval;
          acquireResult = agentLock.acquire(userId, job.id, type);
          if (acquireResult.acquired) break;
        }
      }

      if (!acquireResult.acquired) {
        const requeueCount = (_requeueCount ?? 0) + 1;
        const delay = Math.min(2_000 * Math.pow(2, requeueCount - 1), 30_000);
        console.info(`[Processor] Re-enqueueing ${type} for ${userId} (attempt ${requeueCount}, delay ${delay}ms)`);
        await enqueue(type, userId, { ...handlerData, _requeueCount: requeueCount }, idempotencyKey, { delay });
        return { success: false, requeued: true, duration: Date.now() - startTime };
      }
    }

    lockAcquired = true;

    let context: BrowserContext | null = null;
    const timeoutMs = deps.getTimeout?.(type) ?? OPERATION_TIMEOUTS[type] ?? 120_000;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

    const combinedAbort = () => { timeoutController.abort(); };
    job.signal?.addEventListener('abort', combinedAbort, { once: true });

    try {
      broadcast(userId, {
        type: 'JOB_STARTED',
        payload: { jobId: job.id, operationType: type },
        timestamp: new Date().toISOString(),
      });

      context = await browserPool.acquireContext(userId, { fromQueue: true });
      browserPool.markInUse?.(userId);

      const onProgress = (progress: number, label?: string) => {
        job.updateProgress(label ? { progress, label } : progress);
        broadcast(userId, {
          type: 'JOB_PROGRESS',
          payload: { jobId: job.id, operationType: type, progress, label },
          timestamp: new Date().toISOString(),
        });
      };

      const onEmit: OnEmitFn = (event) => {
        broadcast(userId, event);
      };

      const result = await Promise.race([
        handler(context, handlerData, userId, onProgress, timeoutController.signal, onEmit),
        new Promise<never>((_resolve, reject) => {
          if (timeoutController.signal.aborted) {
            reject(timeoutController.signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
            return;
          }
          timeoutController.signal.addEventListener('abort', () => {
            reject(timeoutController.signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
          }, { once: true });
        }),
      ]);

      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        const errorMessage = ('error' in result && typeof result.error === 'string')
          ? result.error
          : 'Sync completed with failure';

        browserPool.markIdle?.(userId);
        await browserPool.releaseContext(userId, context, false);
        context = null;

        const duration = Date.now() - startTime;
        if (type.startsWith('sync-') && deps.logSyncEvent) {
          await deps.logSyncEvent(userId, type, 'sync_error', { error: errorMessage, duration }).catch(() => {});
        }

        broadcast(userId, {
          type: 'JOB_FAILED',
          payload: { jobId: job.id, operationType: type, error: errorMessage },
          timestamp: new Date().toISOString(),
        });

        throw new Error(errorMessage);
      }

      browserPool.markIdle?.(userId);
      await browserPool.releaseContext(userId, context, true);
      context = null;

      const duration = Date.now() - startTime;
      if (type.startsWith('sync-') && deps.logSyncEvent) {
        await deps.logSyncEvent(userId, type, 'sync_completed', { duration, result }).catch(() => {});
      }

      broadcast(userId, {
        type: 'JOB_COMPLETED',
        payload: { jobId: job.id, operationType: type, result },
        timestamp: new Date().toISOString(),
      });

      return { success: true, data: result, duration };
    } catch (error) {
      if (context) {
        browserPool.markIdle?.(userId);
        await browserPool.releaseContext(userId, context, false);
      }

      const errorMsg = error instanceof Error ? error.message : String(error);

      if (type.startsWith('sync-') && deps.logSyncEvent) {
        await deps.logSyncEvent(userId, type, 'sync_error', {
          error: errorMsg,
          duration: Date.now() - startTime,
        }).catch(() => {});
      }

      if (error instanceof Error && error.name === 'AbortError') {
        broadcast(userId, {
          type: 'JOB_FAILED',
          payload: { jobId: job.id, operationType: type, error: `Handler timeout after ${timeoutMs}ms for ${type}` },
          timestamp: new Date().toISOString(),
        });
        throw new UnrecoverableError(`Handler timeout after ${timeoutMs}ms for ${type}`);
      }

      broadcast(userId, {
        type: 'JOB_FAILED',
        payload: { jobId: job.id, operationType: type, error: errorMsg },
        timestamp: new Date().toISOString(),
      });

      throw error;
    } finally {
      clearTimeout(timer);
      if (lockAcquired) {
        agentLock.release(userId, job.id);
      }
    }
  }

  return { processJob };
}

type OperationProcessor = ReturnType<typeof createOperationProcessor>;

export {
  createOperationProcessor,
  type OperationProcessor,
  type OperationHandler,
  type OnEmitFn,
  type BrowserPoolLike,
  type BroadcastFn,
  type EnqueueFn,
  type LogSyncEventFn,
  type JobLike,
  type ProcessorDeps,
  type ProcessJobResult,
};
