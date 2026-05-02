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
  // Tracking dei Promise dei worker in volo: lo stop() li aspetta tutti per drain graceful
  private readonly workerPromises = new Map<string, Promise<void>>();
  private listenClient: InstanceType<typeof PgClient> | null = null;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly metrics: MetricsRecorder;
  private probeTimer: NodeJS.Timeout | null = null;
  private isStopping = false;

  constructor(private readonly deps: DispatcherDeps) {
    super();
    const probe = createDefaultProbe({ erpUrl: config.archibald.url, timeoutMs: 10_000 });
    this.circuitBreaker = new CircuitBreaker(circuitRepo, probe, this.deps.pool);
    this.metrics = new MetricsRecorder(this.deps.pool);
  }

  async start(): Promise<void> {
    logger.info('[Conductor] Starting...');

    await recoverOrphans(this.deps.pool, {
      // Resume di un task con phase='erp_save_done': re-enqueue preservando phase ed
      // erp_order_id. Quando il Worker lo prenderà, rileverà phase='erp_save_done' e
      // attiverà il resume mode automaticamente (skip ERP, solo DB).
      resumeFromErpSaveDone: async (task) => {
        await this.deps.pool.query(
          `UPDATE system.agent_operation_queue
           SET status = 'enqueued', started_at = NULL, heartbeat_at = NULL
           WHERE task_id = $1::bigint`,
          [task.taskId.toString()],
        );
      },
      // Re-enqueue di un task pre-ERP (phase=null o in_progress): reset completo.
      // erp_order_id azzerato per sicurezza (defensive: in pratica è già null).
      reEnqueueTask: async (task) => {
        await this.deps.pool.query(
          `UPDATE system.agent_operation_queue
           SET status = 'enqueued',
               phase = NULL,
               erp_order_id = NULL,
               started_at = NULL,
               heartbeat_at = NULL
           WHERE task_id = $1::bigint`,
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
    this.isStopping = true;
    if (this.probeTimer) clearInterval(this.probeTimer);
    if (this.listenClient) {
      await this.listenClient.end().catch((err) =>
        logger.warn('[Conductor] listenClient.end error', { error: err instanceof Error ? err.message : String(err) }),
      );
    }
    // Drain graceful: aspetta che i worker in volo terminino i task correnti.
    // Timeout 60s per evitare hang su task molto lunghi (ERP che ci mette eternità).
    const inflight = Array.from(this.workerPromises.values());
    if (inflight.length > 0) {
      logger.info(`[Conductor] Waiting for ${inflight.length} in-flight worker(s) to finish...`);
      await Promise.race([
        Promise.allSettled(inflight),
        new Promise<void>((resolve) => setTimeout(resolve, 60_000)),
      ]);
    }
    this.workers.clear();
    this.workerPromises.clear();
    logger.info('[Conductor] Stopped');
  }

  private scheduleWorker(userId: string): void {
    if (this.isStopping) return;

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

    const promise = worker.runUntilEmpty()
      .catch((err) => {
        logger.error(`[Conductor] Worker ${userId} crashed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(async () => {
        this.workers.delete(userId);
        this.workerPromises.delete(userId);
        // Re-check: un NOTIFY potrebbe essere arrivato mentre il worker stava uscendo.
        // Prima di creare un nuovo Worker, verifichiamo che ci siano davvero task da processare
        // per evitare un loop ricorsivo tight se la coda è vuota sotto flood di NOTIFY.
        const active = await queueRepo.countActiveByUser(this.deps.pool, userId).catch(() => 0);
        if (active > 0 && !this.isStopping) {
          this.scheduleWorker(userId);
        }
      });
    this.workerPromises.set(userId, promise);
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
