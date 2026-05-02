import { EventEmitter } from 'events';
import { Client as PgClient } from 'pg';
import type { DbPool } from '../db/pool';
import { config } from '../config';
import { CircuitBreaker, createDefaultProbe } from './circuit-breaker';
import { MetricsRecorder } from './metrics-recorder';
import { Worker } from './worker';
import type { TaskHandler, WorkerDeps } from './worker';
import { recoverOrphans } from './auto-recovery';
import * as queueRepo from '../db/repositories/agent-queue';
import * as circuitRepo from '../db/repositories/agent-circuit-state';
import { logger } from '../logger';
import type { TaskType } from './types';

export type DispatcherDeps = {
  pool: DbPool;
  handlers: Partial<Record<TaskType, TaskHandler>>;
  broadcast: (userId: string, event: Record<string, unknown>) => void;
  releaseBrowserContext: (userId: string) => Promise<void>;
};

export class Conductor extends EventEmitter {
  private readonly workers = new Map<string, Worker>();
  private listenClient: InstanceType<typeof PgClient> | null = null;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly metrics: MetricsRecorder;
  private probeTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: DispatcherDeps) {
    super();
    const probe = createDefaultProbe({ erpUrl: config.archibald.url, timeoutMs: 10_000 });
    this.circuitBreaker = new CircuitBreaker(circuitRepo, probe, this.deps.pool);
    this.metrics = new MetricsRecorder(this.deps.pool);
  }

  async start(): Promise<void> {
    logger.info('[Conductor] Starting...');

    await recoverOrphans(this.deps.pool, {
      resumeFromErpSaveDone: async (task) => {
        const handler = this.deps.handlers['submit-order'];
        if (!handler) return;
        await handler(
          { ...task, payload: { ...task.payload, _resumeFromErpSaveDone: true } },
          { metrics: this.metrics, userId: task.userId },
        );
        await queueRepo.completeTask(this.deps.pool, task.taskId);
      },
      reEnqueueTask: async (task) => {
        await this.deps.pool.query(
          `UPDATE system.agent_operation_queue
           SET status = 'enqueued', phase = NULL, started_at = NULL, heartbeat_at = NULL
           WHERE task_id = $1`,
          [task.taskId.toString()],
        );
      },
    });

    this.listenClient = new PgClient({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
    });
    await this.listenClient.connect();
    await this.listenClient.query('LISTEN agent_queue_changed');

    this.listenClient.on('notification', (msg) => {
      const userId = msg.payload;
      if (userId) this.scheduleWorker(userId);
    });

    this.probeTimer = setInterval(() => {
      this.circuitBreaker.probeAll().catch((err) => {
        logger.error('[Conductor] probeAll error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, 30_000);

    const { rows } = await this.deps.pool.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM system.agent_operation_queue WHERE status = 'enqueued'`,
    );
    for (const row of rows) this.scheduleWorker(row.user_id);

    logger.info('[Conductor] Started');
  }

  async stop(): Promise<void> {
    logger.info('[Conductor] Stopping...');
    if (this.probeTimer) clearInterval(this.probeTimer);
    if (this.listenClient) await this.listenClient.end();
    this.workers.clear();
    logger.info('[Conductor] Stopped');
  }

  private scheduleWorker(userId: string): void {
    let worker = this.workers.get(userId);
    if (!worker) {
      const workerDeps: WorkerDeps = {
        pool: this.deps.pool,
        circuitBreaker: this.circuitBreaker,
        handlers: this.deps.handlers,
        broadcast: this.deps.broadcast,
        metrics: this.metrics,
        releaseBrowserContext: this.deps.releaseBrowserContext,
      };
      worker = new Worker(userId, workerDeps);
      this.workers.set(userId, worker);
    }

    worker.runUntilEmpty()
      .catch((err) => {
        logger.error(`[Conductor] Worker ${userId} crashed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        this.workers.delete(userId);
        // Re-check: un NOTIFY potrebbe essere arrivato mentre il worker stava uscendo.
        // runUntilEmpty è idempotente (esce subito se la coda è vuota).
        this.scheduleWorker(userId);
      });
  }

  async enqueueTaskExternal(params: {
    userId: string;
    taskType: TaskType;
    payload: Record<string, unknown>;
    batchId?: string;
  }): Promise<bigint> {
    return queueRepo.enqueueTask(this.deps.pool, params);
    // Il NOTIFY viene emesso automaticamente dal trigger DB
  }

  hasActiveWriteFor(userId: string): boolean {
    return this.workers.has(userId);
  }

  isAnyWriteActive(): boolean {
    return this.workers.size > 0;
  }
}
