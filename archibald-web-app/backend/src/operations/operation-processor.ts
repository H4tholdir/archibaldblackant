import type { OperationType, OperationJobData, OperationJobResult } from './operation-types';
import type { AgentLock } from './agent-lock';

type BrowserContext = unknown;

type OperationHandler = (
  context: BrowserContext,
  data: Record<string, unknown>,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
  signal?: AbortSignal,
) => Promise<Record<string, unknown>>;

type BroadcastFn = (userId: string, event: Record<string, unknown>) => void;

type EnqueueFn = (
  type: OperationType,
  userId: string,
  data: Record<string, unknown>,
  idempotencyKey?: string,
) => Promise<string>;

type BrowserPoolLike = {
  acquireContext: (userId: string, options?: { fromQueue?: boolean }) => Promise<BrowserContext>;
  releaseContext: (userId: string, context: BrowserContext, success: boolean) => Promise<void>;
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

type ProcessorDeps = {
  agentLock: AgentLock;
  browserPool: BrowserPoolLike;
  broadcast: BroadcastFn;
  enqueue: EnqueueFn;
  handlers: Partial<Record<OperationType, OperationHandler>>;
  cancelJob: (jobId: string) => boolean;
  preemptionConfig?: PreemptionConfig;
};

type ProcessJobResult = {
  success: boolean;
  data?: Record<string, unknown>;
  duration: number;
  requeued?: boolean;
};

const PREEMPTION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;
const REQUEUE_DELAY_MS = 2000;

function createOperationProcessor(deps: ProcessorDeps) {
  const { agentLock, browserPool, broadcast, enqueue, handlers } = deps;

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
        await enqueue(type, userId, data, idempotencyKey);
        return { success: false, requeued: true, duration: Date.now() - startTime };
      }
    }

    lockAcquired = true;

    let context: BrowserContext | null = null;
    try {
      context = await browserPool.acquireContext(userId, { fromQueue: true });

      const onProgress = (progress: number, label?: string) => {
        job.updateProgress(label ? { progress, label } : progress);
      };

      const result = await handler(context, data, userId, onProgress, job.signal);

      await browserPool.releaseContext(userId, context, true);
      context = null;

      broadcast(userId, {
        event: 'JOB_COMPLETED',
        jobId: job.id,
        type,
        result,
      });

      return { success: true, data: result, duration: Date.now() - startTime };
    } catch (error) {
      if (context) {
        await browserPool.releaseContext(userId, context, false);
      }

      broadcast(userId, {
        event: 'JOB_FAILED',
        jobId: job.id,
        type,
        error: error instanceof Error ? error.message : String(error),
      });

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
};
