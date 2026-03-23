import type { OperationType, OperationJobData, OperationJobResult } from './operation-types';
import { getNextSyncInChain, isWriteOperation, isScheduledSync } from './operation-types';
import type { AgentLock } from './agent-lock';

type BrowserContext = unknown;

type OperationHandler = (
  context: BrowserContext,
  data: Record<string, unknown>,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
) => Promise<Record<string, unknown>>;

type BroadcastFn = (userId: string, event: Record<string, unknown>) => void;

type EnqueueFn = (
  type: OperationType,
  userId: string,
  data: Record<string, unknown>,
  idempotencyKey?: string,
  delayMs?: number,
) => Promise<string>;

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<BrowserContext>;
  releaseContext: (userId: string, context: BrowserContext, success: boolean) => Promise<void>;
};

type JobLike = {
  id: string;
  data: OperationJobData;
  updateProgress: (progress: number | object) => Promise<void>;
};

type OnJobFailedFn = (type: OperationType, data: Record<string, unknown>, userId: string, error: string) => Promise<void>;

type OnJobStartedFn = (type: OperationType, data: Record<string, unknown>, userId: string, jobId: string) => Promise<void>;

type ProcessorDeps = {
  agentLock: AgentLock;
  browserPool: BrowserPoolLike;
  broadcast: BroadcastFn;
  enqueue: EnqueueFn;
  handlers: Partial<Record<OperationType, OperationHandler>>;
  onJobFailed?: OnJobFailedFn;
  onJobStarted?: OnJobStartedFn;
};

type ProcessJobResult = {
  success: boolean;
  data?: Record<string, unknown>;
  duration: number;
  requeued?: boolean;
};

const PREEMPTION_WAIT_MS = 2000;
const REQUEUE_DELAY_MS = 5000;
const ADDRESS_SYNC_REQUEUE_DELAY_MS = 60_000;
const MAX_REQUEUE_COUNT = 3;

const SUBMIT_ORDER_BASE_TIMEOUT_MS = 60_000;
const SUBMIT_ORDER_PER_ARTICLE_TIMEOUT_MS = 30_000;
const DEFAULT_WRITE_TIMEOUT_MS = 180_000;
const SYNC_TIMEOUT_MS = 600_000;
const PDF_TIMEOUT_MS = 60_000;

function calculateJobTimeout(type: OperationType, data: Record<string, unknown>): number {
  if (type === 'submit-order') {
    const items = data.items as unknown[] | undefined;
    const numArticles = items?.length ?? 1;
    return SUBMIT_ORDER_BASE_TIMEOUT_MS + (SUBMIT_ORDER_PER_ARTICLE_TIMEOUT_MS * numArticles);
  }
  if (type === 'download-ddt-pdf' || type === 'download-invoice-pdf') return PDF_TIMEOUT_MS;
  if (isScheduledSync(type)) return SYNC_TIMEOUT_MS;
  if (isWriteOperation(type)) return DEFAULT_WRITE_TIMEOUT_MS;
  return DEFAULT_WRITE_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationType: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operazione "${operationType}" timeout dopo ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function createOperationProcessor(deps: ProcessorDeps) {
  const { agentLock, browserPool, broadcast, enqueue, handlers, onJobFailed, onJobStarted } = deps;

  async function processJob(job: JobLike): Promise<ProcessJobResult> {
    const startTime = Date.now();
    const { type, userId, data, idempotencyKey } = job.data;

    const handler = handlers[type];
    if (!handler) {
      throw new Error(`No handler registered for operation type: ${type}`);
    }

    let lockAcquired = false;
    let acquireResult = agentLock.acquire(userId, job.id, type);

    if (!acquireResult.acquired) {
      if (acquireResult.preemptable) {
        const { activeJob } = acquireResult;
        if (activeJob.requestStop) {
          activeJob.requestStop();
        }
        await new Promise((resolve) => setTimeout(resolve, PREEMPTION_WAIT_MS));
        acquireResult = agentLock.acquire(userId, job.id, type);

        // Force-release the sync lock if it didn't stop gracefully
        if (!acquireResult.acquired) {
          agentLock.release(userId);
          acquireResult = agentLock.acquire(userId, job.id, type);
        }
      }

      if (!acquireResult.acquired) {
        const requeueCount = (idempotencyKey.match(/-r\d+/g) ?? []).length;
        if (requeueCount >= MAX_REQUEUE_COUNT) {
          throw new Error(`Agent ${userId} busy: lock not acquired after ${MAX_REQUEUE_COUNT} requeues for ${type}`);
        }
        // Use a fresh key to guarantee BullMQ creates a new waiting job
        // (same key would be a no-op when the active job's Redis key still exists).
        // Delay prevents tight requeue loops when the lock is held for a long time.
        const requeueKey = `${idempotencyKey}-r${Date.now()}`;
        const requeueDelayMs = type === 'sync-customer-addresses' ? ADDRESS_SYNC_REQUEUE_DELAY_MS : REQUEUE_DELAY_MS;
        const newJobId = await enqueue(type, userId, data, requeueKey, requeueDelayMs);
        broadcast(userId, {
          event: 'JOB_REQUEUED',
          originalJobId: job.id,
          newJobId,
          type,
        });
        return { success: false, requeued: true, duration: Date.now() - startTime };
      }
    }

    lockAcquired = true;

    try {
      broadcast(userId, {
        event: 'JOB_STARTED',
        jobId: job.id,
        type,
      });

      if (onJobStarted) {
        await onJobStarted(type, data, userId, job.id).catch(() => {});
      }

      const onProgress = (progress: number, label?: string) => {
        job.updateProgress(label ? { progress, label } : progress);
        broadcast(userId, {
          event: 'JOB_PROGRESS',
          jobId: job.id,
          type,
          progress,
          ...(label ? { label } : {}),
        });
      };

      const timeoutMs = calculateJobTimeout(type, data);
      const result = await withTimeout(
        handler(null, data, userId, onProgress),
        timeoutMs,
        type,
      );

      broadcast(userId, {
        event: 'JOB_COMPLETED',
        jobId: job.id,
        type,
        result,
      });

      const nextSync = getNextSyncInChain(type);
      if (nextSync) {
        await enqueue(nextSync, userId, {});
      }

      return { success: true, data: result, duration: Date.now() - startTime };
    } catch (error) {
      // Invalidate browser context on failure so next operation gets a fresh session
      await browserPool.releaseContext(userId, null as unknown as BrowserContext, false).catch(() => {});

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Persist error in DB (e.g., update pending_orders.status='error')
      if (onJobFailed) {
        await onJobFailed(type, data, userId, errorMessage).catch(() => {});
      }

      broadcast(userId, {
        event: 'JOB_FAILED',
        jobId: job.id,
        type,
        error: errorMessage,
      });

      const nextSync = getNextSyncInChain(type);
      if (nextSync) {
        await enqueue(nextSync, userId, {}).catch(() => { /* ignore chain enqueue errors */ });
      }

      throw error;
    } finally {
      if (lockAcquired) {
        agentLock.release(userId);
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
  type BrowserPoolLike,
  type BroadcastFn,
  type EnqueueFn,
  type JobLike,
  type ProcessorDeps,
  type ProcessJobResult,
  type OnJobStartedFn,
};
