import type { DbPool } from '../db/pool';
import * as metricsRepo from '../db/repositories/bot-metrics';
import * as uiIntentsRepo from '../db/repositories/ui-operation-intents';
import type { TaskRow } from './types';

type PhaseKey = 'login' | 'navigation' | 'customer_fill' | 'articles_fill' | 'discount_notes' | 'save' | 'verification';

export class MetricsRecorder {
  private readonly phaseStarts = new Map<string, Date>();

  constructor(private readonly pool: DbPool) {}

  async startTask(task: TaskRow, agentMode: 'simple' | 'fresis' | undefined): Promise<void> {
    let uiAggregation: { firstOpen: Date | null; lastSave: Date | null; activeMs: number | null } =
      { firstOpen: null, lastSave: null, activeMs: null };

    if (task.taskType === 'submit-order') {
      const pendingOrderId = (task.payload as { pendingOrderId?: string }).pendingOrderId;
      if (pendingOrderId) {
        uiAggregation = await uiIntentsRepo.aggregateUiDurationForPending(this.pool, pendingOrderId);
      }
    }

    await metricsRepo.recordTaskStart(this.pool, {
      taskId: task.taskId,
      userId: task.userId,
      taskType: task.taskType,
      agentMode,
      customerId: (task.payload as { customerId?: string }).customerId,
      customerName: (task.payload as { customerName?: string }).customerName,
      numArticles: (task.payload as { items?: unknown[] }).items?.length,
      uiStartedAt: uiAggregation.firstOpen,
      uiCompletedAt: uiAggregation.lastSave,
      enqueuedAt: task.enqueuedAt,
      uiDurationMs: uiAggregation.activeMs,
    });
  }

  startPhase(taskId: bigint, phase: PhaseKey): void {
    this.phaseStarts.set(`${taskId}-${phase}`, new Date());
  }

  async endPhase(taskId: bigint, phase: PhaseKey, notes?: Record<string, unknown>): Promise<void> {
    const start = this.phaseStarts.get(`${taskId}-${phase}`);
    if (!start) return;
    this.phaseStarts.delete(`${taskId}-${phase}`);
    await metricsRepo.recordPhase(this.pool, {
      taskId,
      phase,
      startedAt: start,
      completedAt: new Date(),
      notes,
    });
  }

  async finishTask(
    task: TaskRow,
    startedAt: Date,
    status: 'completed' | 'failed' | 'cancelled',
    errorClass?: 'erp_unreachable' | 'application_error' | null,
    errorMessage?: string | null,
    orderId?: string,
  ): Promise<void> {
    let uiDurationMs: number | null = null;
    if (task.taskType === 'submit-order') {
      const pendingOrderId = (task.payload as { pendingOrderId?: string }).pendingOrderId;
      if (pendingOrderId) {
        const agg = await uiIntentsRepo.aggregateUiDurationForPending(this.pool, pendingOrderId);
        uiDurationMs = agg.activeMs;
      }
    }
    await metricsRepo.recordTaskFinish(this.pool, {
      taskId: task.taskId,
      startedAt,
      completedAt: new Date(),
      status,
      errorClass,
      errorMessage,
      retryCount: task.retryCount,
      orderId,
      uiDurationMs,
    });
  }
}
