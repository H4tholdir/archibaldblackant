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
import { TASK_PRIORITY } from './types';
import type { TaskType } from './types';

export type DispatcherDeps = {
  pool: DbPool;
  handlers: Partial<Record<TaskType, TaskHandler>>;
  broadcast: (userId: string, event: Record<string, unknown>) => void;
  releaseBrowserContext: (userId: string, priority?: number) => Promise<void>;
};

export class Conductor extends EventEmitter {
  private readonly workers = new Map<string, Worker>();
  // Tracking dei Promise dei worker in volo: lo stop() li aspetta tutti per drain graceful
  private readonly workerPromises = new Map<string, Promise<void>>();
  private listenClient: InstanceType<typeof PgClient> | null = null;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly metrics: MetricsRecorder;
  private probeTimer: NodeJS.Timeout | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private isStopping = false;

  constructor(private readonly deps: DispatcherDeps) {
    super();
    const probe = createDefaultProbe({ erpUrl: config.archibald.url, timeoutMs: 10_000 });
    this.circuitBreaker = new CircuitBreaker(circuitRepo, probe, this.deps.pool);
    this.metrics = new MetricsRecorder(this.deps.pool);
  }

  private makeRecoveryHandlers() {
    return {
      // Resume di un task con phase='erp_save_done': re-enqueue preservando phase ed
      // erp_order_id. Quando il Worker lo prenderà, rileverà phase='erp_save_done' e
      // attiverà il resume mode automaticamente (skip ERP, solo DB).
      resumeFromErpSaveDone: async (task: import('./types').TaskRow) => {
        await this.deps.pool.query(
          `UPDATE system.agent_operation_queue
           SET status = 'enqueued', started_at = NULL, heartbeat_at = NULL
           WHERE task_id = $1::bigint`,
          [task.taskId.toString()],
        );
        if (!this.isStopping) this.scheduleWorker(task.userId);
      },
      // Re-enqueue di un task pre-ERP (phase=null o in_progress): reset completo.
      // erp_order_id azzerato per sicurezza (defensive: in pratica è già null).
      reEnqueueTask: async (task: import('./types').TaskRow) => {
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
        if (!this.isStopping) this.scheduleWorker(task.userId);
      },
    };
  }

  async start(): Promise<void> {
    logger.info('[Conductor] Starting...');

    await recoverOrphans(this.deps.pool, this.makeRecoveryHandlers());

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
      this.circuitBreaker.probeAll()
        .then((recoveredUsers) => {
          for (const userId of recoveredUsers) {
            if (!this.isStopping) this.scheduleWorker(userId);
          }
        })
        .catch((err) => {
          logger.error('[Conductor] probeAll error', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }, 30_000);

    // Recovery periodico degli orfani: rileva task stuck in 'running' con heartbeat stale
    // non catturati dal recovery al startup (es. crash durante normale esecuzione, deploy rolling).
    this.recoveryTimer = setInterval(() => {
      if (this.isStopping) return;
      recoverOrphans(this.deps.pool, this.makeRecoveryHandlers()).catch((err) => {
        logger.error('[Conductor] periodic recoverOrphans error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, 60_000);

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
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
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
        // Usa countEnqueuedByUser (non countActiveByUser): contare anche i 'running' causerebbe
        // un loop infinito se un task rimane stuck in 'running' senza mai completarsi —
        // pickupNextTask skippa utenti con task running, il worker esce subito, ma il re-check
        // vedrebbe ancora active>0 e rischedulerrebbe all'infinito (~3k iter/s, 6M log in 33min).
        const enqueued = await queueRepo.countEnqueuedByUser(this.deps.pool, userId).catch(() => 0);
        if (enqueued > 0 && !this.isStopping) {
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
    const taskId = await queueRepo.enqueueTask(this.deps.pool, params);
    // Il NOTIFY viene emesso automaticamente dal trigger DB

    const priority = TASK_PRIORITY[params.taskType] ?? 500;
    if (priority <= 10) {
      this.signalPreemption(params.userId).catch(() => {});
    }

    // Notifica il frontend che il task è stato accodato — appare nel QueueDrawer
    // come operazione "queued" prima che JOB_STARTED venga emesso dal Worker.
    this.deps.broadcast(params.userId, {
      event: 'JOB_QUEUED',
      jobId: taskId.toString(),
      taskId: taskId.toString(),
      type: params.taskType,
      priority,
    });

    return taskId;
  }

  private async signalPreemption(userId: string): Promise<void> {
    const { rows } = await this.deps.pool.query<{ task_id: string }>(
      `UPDATE system.agent_operation_queue
       SET preempt_requested = true
       WHERE user_id = $1 AND status = 'running' AND priority >= 500
       RETURNING task_id`,
      [userId],
    );
    if (rows.length === 0) return;

    const targetTaskId = rows[0].task_id;

    // Safety net: se il task non si è fermato cooperativamente entro 15s,
    // force-chiudi il browser. Il Worker catturerà l'errore di connessione CDP
    // e re-enqueue con run_after=+30s (stesso codepath del PreemptedSignal cooperativo).
    setTimeout(async () => {
      try {
        const { rows: still } = await this.deps.pool.query(
          `SELECT 1 FROM system.agent_operation_queue
           WHERE task_id = $1 AND status = 'running'`,
          [targetTaskId],
        );
        if (still.length > 0) {
          logger.warn('[Conductor] Safety net: force-closing browser after 15s preemption timeout', {
            userId,
            targetTaskId,
          });
          await this.deps.releaseBrowserContext(userId, 500);
        }
      } catch (err) {
        logger.warn('[Conductor] signalPreemption safety net error', { err });
      }
    }, 15_000);
  }

  hasActiveWriteFor(userId: string): boolean {
    return this.workers.has(userId);
  }

  isAnyWriteActive(): boolean {
    return this.workers.size > 0;
  }
}
