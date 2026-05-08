import type { DbPool } from '../db/pool';
import * as queueRepo from '../db/repositories/agent-queue';
import type { TaskRow, TaskType } from './types';
import type { CircuitBreaker } from './circuit-breaker';
import type { MetricsRecorder } from './metrics-recorder';
import { classifyError } from './error-classifier';
import { enqueuePostOpSyncs } from './post-op-sync';
import { insertActiveJob, deleteActiveJob } from '../db/repositories/active-jobs';
import { logger } from '../logger';

// Fresis Soc Cooperativa — ERP ID (customer profile), non l'account numerico
const FRESIS_ERP_ID = '55.261';

// Il result è un Record arbitrario: i task ordini ritornano { orderId }, i download
// ritornano { downloadKey }, create-customer { customerId }, ecc. Il payload completo viene
// broadcastato sull'evento JOB_COMPLETED in modo che il frontend possa consumarlo.
export type TaskHandler = (
  task: TaskRow,
  ctx: { metrics: MetricsRecorder; userId: string },
) => Promise<Record<string, unknown>>;

export type WorkerDeps = {
  pool: DbPool;
  circuitBreaker: CircuitBreaker;
  handlers: Partial<Record<TaskType, TaskHandler>>;
  broadcast: (userId: string, event: Record<string, unknown>) => void;
  metrics: MetricsRecorder;
  releaseBrowserContext: (userId: string, priority?: number) => Promise<void>;
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

        const task = await queueRepo.pickupNextTask(this.deps.pool);
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
    const taskIdStr = task.taskId.toString();

    // Fast-finalize: se questo task ha già completato il DB commit in una run precedente
    // (phase='db_committed' o 'completed' + erp_order_id), l'ordine ESISTE già su ERP
    // E nel nostro DB. Il retry NON deve re-eseguire NIENTE — solo finalizzare il task
    // come completed. La verification residua sarà recuperata dal sync periodico.
    // Senza questo, il bot.createOrder() veniva chiamato di nuovo su retry post-DB →
    // DUPLICATO ERP (bug rilevato in prod 2026-05-02 sull'ordine VERALLI: 53877+53878).
    if (
      task.taskType === 'submit-order' &&
      (task.phase === 'db_committed' || task.phase === 'completed') &&
      task.erpOrderId
    ) {
      try {
        logger.info(`[Worker ${this.userId}] Fast-finalize: phase=${task.phase}, marco completato senza re-execute`, {
          taskId: taskIdStr,
          erpOrderId: task.erpOrderId,
          retryCount: task.retryCount,
        });
        await queueRepo.completeTask(this.deps.pool, task.taskId);
        await this.deps.metrics.finishTask(task, startedAt, 'completed', null, null, task.erpOrderId);
        this.deps.broadcast(this.userId, {
          event: 'JOB_COMPLETED',
          taskId: taskIdStr,
          jobId: taskIdStr,
          type: task.taskType,
          result: { orderId: task.erpOrderId },
        });
        deleteActiveJob(this.deps.pool, taskIdStr)
          .catch((err: unknown) => logger.warn('[Conductor] deleteActiveJob on fast-finalize failed', { err, taskId: taskIdStr }));
      } finally {
        this.stopHeartbeat();
      }
      return;
    }

    // Auto-resume: se questo task è già stato salvato su ERP in una run precedente
    // (phase='erp_save_done' + erp_order_id valorizzato), inietta nel payload i flag
    // di resume in modo che il handler skippi bot.createOrder e proceda solo col DB.
    // Questo previene la creazione di un duplicato ERP su retry dopo un fallimento
    // post-ERP-save (es. transaction error). Vale solo per submit-order.
    let effectiveTask = task;
    if (
      task.taskType === 'submit-order' &&
      task.phase === 'erp_save_done' &&
      task.erpOrderId
    ) {
      effectiveTask = {
        ...task,
        payload: {
          ...task.payload,
          _resumeFromErpSaveDone: true,
          _resumeOrderId: task.erpOrderId,
        },
      };
      logger.info(`[Worker ${this.userId}] Auto-resume from erp_save_done`, {
        taskId: task.taskId.toString(),
        erpOrderId: task.erpOrderId,
        retryCount: task.retryCount,
      });
    }

    await this.deps.metrics.startTask(effectiveTask, agentMode);

    // Estrae entityName/entityId dal payload del task — active_jobs non viene popolata
    // per i task Conductor, quindi la lettura da DB sarebbe sempre vuota.
    const pd = task.payload as Record<string, unknown>;
    const orderIds = pd.orderIds as string[] | undefined;
    const entityName = String(
      pd.customerName ??
      pd.entityName ??
      (orderIds ? `${orderIds.length} ordini` : undefined) ??
      pd.erpId ??
      pd.orderId ??
      pd.pendingOrderId ??
      task.taskType,
    );
    const entityId = String(
      pd.pendingOrderId ??
      pd.orderId ??
      (orderIds ? orderIds[0] : undefined) ??
      pd.erpId ??
      '',
    );

    // jobId è alias di taskId per compatibilità con waitForJobViaWebSocket esistente
    this.deps.broadcast(this.userId, {
      event: 'JOB_STARTED',
      taskId: taskIdStr,
      jobId: taskIdStr,
      type: task.taskType,
      entityId,
      entityName,
      // Per submit-order: include pendingOrderId così usePendingSync su secondi dispositivi
      // può creare la tracking entry anche senza aver chiamato trackJobs localmente.
      ...(task.taskType === 'submit-order' && task.payload.pendingOrderId
        ? { pendingOrderId: task.payload.pendingOrderId }
        : {}),
    });
    insertActiveJob(this.deps.pool, { jobId: taskIdStr, type: task.taskType, userId: this.userId, entityId, entityName })
      .catch((err: unknown) => logger.warn('[Conductor] insertActiveJob failed', { err, taskId: taskIdStr }));

    try {
      const result = await handler(effectiveTask, { metrics: this.deps.metrics, userId: this.userId });
      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        throw new Error(`Handler ${task.taskType} reported success:false`);
      }
      await queueRepo.completeTask(this.deps.pool, task.taskId);
      await this.deps.circuitBreaker.onErpSuccess(this.userId);
      const orderIdForMetrics = typeof result.orderId === 'string' ? result.orderId : undefined;
      await this.deps.metrics.finishTask(task, startedAt, 'completed', null, null, orderIdForMetrics);
      // Broadcast JOB_COMPLETED prima delle operazioni background per ridurre latenza UX (~200ms)
      this.deps.broadcast(this.userId, {
        event: 'JOB_COMPLETED',
        taskId: taskIdStr,
        jobId: taskIdStr,
        type: task.taskType,
        result,
      });
      deleteActiveJob(this.deps.pool, taskIdStr)
        .catch((err: unknown) => logger.warn('[Conductor] deleteActiveJob on complete failed', { err, taskId: taskIdStr }));
      // Fire-and-forget: post-op syncs e round-robin timestamp non bloccano la risposta al client
      enqueuePostOpSyncs(this.deps.pool, task.userId, task.taskType, task.payload as Record<string, unknown>)
        .catch(() => {}); // già loggato dentro enqueuePostOpSyncs
      if (task.taskType === 'sync-products' || task.taskType === 'sync-prices') {
        this.deps.pool.query(
          `INSERT INTO agents.agent_sync_state (user_id, sync_type, last_shared_sync_at)
           VALUES ($1, 'shared', NOW())
           ON CONFLICT (user_id, sync_type) DO UPDATE SET last_shared_sync_at = NOW()`,
          [task.userId],
        ).catch((err: unknown) => logger.warn('[Conductor] Failed to update last_shared_sync_at', { err }));
      }
    } catch (err) {
      const errorClass = classifyError(err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorClass === 'erp_unreachable') {
        await this.deps.circuitBreaker.onErpFailure(this.userId, errorMessage);
      }

      const failResult = await queueRepo.failTask(this.deps.pool, task.taskId, {
        errorClass,
        errorMessage,
        incrementRetry: errorClass !== 'verification_mismatch',
      });

      await this.deps.metrics.finishTask(task, startedAt, 'failed', errorClass, errorMessage);
      this.deps.broadcast(this.userId, {
        event: failResult.willRetry ? 'JOB_RETRYING' : 'JOB_FAILED',
        taskId: taskIdStr,
        jobId: taskIdStr,
        type: task.taskType,
        error: errorMessage,
      });
      if (!failResult.willRetry) {
        deleteActiveJob(this.deps.pool, taskIdStr)
          .catch((err: unknown) => logger.warn('[Conductor] deleteActiveJob on failure failed', { err, taskId: taskIdStr }));
      }

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
    if (customerId === FRESIS_ERP_ID) return 'fresis';
    if (customerId) return 'simple';
    return undefined;
  }
}
