import type { OperationType, OperationJobData } from './operation-types';
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

type OnJobFailedFn = (type: OperationType, data: Record<string, unknown>, userId: string, error: string, jobId: string) => Promise<void>;

type OnJobStartedFn = (type: OperationType, data: Record<string, unknown>, userId: string, jobId: string) => Promise<void>;

type OnJobCompletedFn = (type: OperationType, data: Record<string, unknown>, userId: string, jobId: string) => Promise<void>;

type CircuitBreakerLike = {
  isPaused: (userId: string, syncType: string) => Promise<boolean>;
  recordFailure: (userId: string, syncType: string, error: string) => Promise<void>;
  recordSuccess: (userId: string, syncType: string) => Promise<void>;
};

type ProcessorDeps = {
  agentLock: AgentLock;
  browserPool: BrowserPoolLike;
  broadcast: BroadcastFn;
  enqueue: EnqueueFn;
  handlers: Partial<Record<OperationType, OperationHandler>>;
  onJobFailed?: OnJobFailedFn;
  onJobStarted?: OnJobStartedFn;
  onJobCompleted?: OnJobCompletedFn;
  circuitBreaker?: CircuitBreakerLike;
};

type ProcessJobResult = {
  success: boolean;
  data?: Record<string, unknown>;
  duration: number;
  requeued?: boolean;
};

export {
  type OperationHandler,
  type BrowserPoolLike,
  type BroadcastFn,
  type CircuitBreakerLike,
  type EnqueueFn,
  type JobLike,
  type ProcessorDeps,
  type ProcessJobResult,
  type OnJobStartedFn,
  type OnJobCompletedFn,
};
