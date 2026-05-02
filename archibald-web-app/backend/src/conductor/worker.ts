import type { DbPool } from '../db/pool';
import * as queueRepo from '../db/repositories/agent-queue';
import type { TaskRow, TaskType } from './types';
import type { CircuitBreaker } from './circuit-breaker';
import type { MetricsRecorder } from './metrics-recorder';
import { classifyError } from './error-classifier';
import { logger } from '../logger';

// Fresis Soc Cooperativa — account numerico usato per distinguere agentMode
const FRESIS_ACCOUNT_NUM = '1002328';

export type TaskHandler = (
  task: TaskRow,
  ctx: { metrics: MetricsRecorder; userId: string },
) => Promise<{ orderId?: string }>;

export type WorkerDeps = {
  pool: DbPool;
  circuitBreaker: CircuitBreaker;
  handlers: Partial<Record<TaskType, TaskHandler>>;
  broadcast: (userId: string, event: Record<string, unknown>) => void;
  metrics: MetricsRecorder;
  releaseBrowserContext: (userId: string) => Promise<void>;
};

export class Worker {
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(public readonly userId: string, private readonly deps: WorkerDeps) {}

  async runUntilEmpty(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      while (true) {
        if (await this.deps.circuitBreaker.isOpen(this.userId)) {
          logger.info(`[Worker ${this.userId}] Circuit open, pausing`);
          this.deps.broadcast(this.userId, { event: 'CIRCUIT_OPEN', userId: this.userId });
          break;
        }

        const task = await queueRepo.pickupNextTask(this.deps.pool, this.userId);
        if (!task) break;

        await this.executeTask(task);
        // Loop continua immediatamente per chain — nessun delay tra task
      }
    } finally {
      this.isRunning = false;
      await this.deps.releaseBrowserContext(this.userId);
    }
  }

  private startHeartbeat(taskId: bigint): void {
    this.heartbeatTimer = setInterval(() => {
      queueRepo.updateTaskHeartbeat(this.deps.pool, taskId).catch(() => {});
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async executeTask(task: TaskRow): Promise<void> {
    const handler = this.deps.handlers[task.taskType];
    if (!handler) {
      await queueRepo.failTask(this.deps.pool, task.taskId, {
        errorClass: 'application_error',
        errorMessage: `No handler for task type ${task.taskType}`,
        incrementRetry: false,
      });
      return;
    }

    this.startHeartbeat(task.taskId);
    const startedAt = task.startedAt ?? new Date();
    const agentMode = this.deduceAgentMode(task);

    await this.deps.metrics.startTask(task, agentMode);
    this.deps.broadcast(this.userId, {
      event: 'JOB_STARTED',
      taskId: task.taskId.toString(),
      type: task.taskType,
    });

    try {
      const result = await handler(task, { metrics: this.deps.metrics, userId: this.userId });
      await queueRepo.completeTask(this.deps.pool, task.taskId);
      await this.deps.circuitBreaker.onErpSuccess(this.userId);
      await this.deps.metrics.finishTask(task, startedAt, 'completed', null, null, result.orderId);
      this.deps.broadcast(this.userId, {
        event: 'JOB_COMPLETED',
        taskId: task.taskId.toString(),
        type: task.taskType,
        result,
      });
    } catch (err) {
      const errorClass = classifyError(err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorClass === 'erp_unreachable') {
        await this.deps.circuitBreaker.onErpFailure(this.userId, errorMessage);
      }

      const failResult = await queueRepo.failTask(this.deps.pool, task.taskId, {
        errorClass,
        errorMessage,
        incrementRetry: true,
      });

      await this.deps.metrics.finishTask(task, startedAt, 'failed', errorClass, errorMessage);
      this.deps.broadcast(this.userId, {
        event: failResult.willRetry ? 'JOB_RETRYING' : 'JOB_FAILED',
        taskId: task.taskId.toString(),
        type: task.taskType,
        error: errorMessage,
      });

      if (failResult.willRetry) {
        // Backoff 10s/30s/60s prima di riprendere il loop per il retry
        const backoffMs = [10_000, 30_000, 60_000][failResult.retryCount - 1] ?? 60_000;
        await new Promise(r => setTimeout(r, backoffMs));
      }
    } finally {
      this.stopHeartbeat();
    }
  }

  private deduceAgentMode(task: TaskRow): 'simple' | 'fresis' | undefined {
    const customerId = (task.payload as { customerId?: string }).customerId;
    if (customerId === FRESIS_ACCOUNT_NUM) return 'fresis';
    if (customerId) return 'simple';
    return undefined;
  }
}
