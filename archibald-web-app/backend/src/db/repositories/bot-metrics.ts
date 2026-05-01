import type { DbPool, TxClient } from '../pool';
import type { TaskStatus, ErrorClass } from '../../conductor/types';

type Querier = DbPool | TxClient;

export type TaskMetricInsert = {
  taskId: bigint;
  userId: string;
  taskType: string;
  agentMode?: 'simple' | 'fresis';
  customerId?: string;
  customerName?: string;
  numArticles?: number;
  uiStartedAt?: Date | null;
  uiCompletedAt?: Date | null;
  enqueuedAt: Date;
  uiDurationMs?: number | null;
};

export async function recordTaskStart(pool: Querier, params: TaskMetricInsert): Promise<void> {
  await pool.query(
    `INSERT INTO system.bot_task_metrics
     (task_id, user_id, task_type, agent_mode, customer_id, customer_name,
      num_articles, ui_started_at, ui_completed_at, enqueued_at, ui_duration_ms, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed')
     ON CONFLICT (task_id) DO NOTHING`,
    [
      params.taskId.toString(),
      params.userId,
      params.taskType,
      params.agentMode ?? null,
      params.customerId ?? null,
      params.customerName ?? null,
      params.numArticles ?? null,
      params.uiStartedAt ?? null,
      params.uiCompletedAt ?? null,
      params.enqueuedAt,
      params.uiDurationMs ?? null,
    ],
  );
}

export type TaskMetricFinish = {
  taskId: bigint;
  startedAt: Date;
  completedAt: Date;
  status: TaskStatus;
  errorClass?: ErrorClass | null;
  errorMessage?: string | null;
  retryCount: number;
  orderId?: string;
  uiDurationMs: number | null;
};

export async function recordTaskFinish(pool: Querier, params: TaskMetricFinish): Promise<void> {
  const { taskId, startedAt, completedAt, status, errorClass, errorMessage, retryCount, orderId, uiDurationMs } = params;
  const uiMs = uiDurationMs ?? 0;

  await pool.query(
    `UPDATE system.bot_task_metrics SET
       started_at = $1,
       completed_at = $2,
       status = $3,
       error_class = $4,
       error_message = $5,
       retry_count = $6,
       order_id = COALESCE($7, order_id),
       queue_wait_ms = EXTRACT(EPOCH FROM ($1 - enqueued_at)) * 1000,
       bot_duration_ms = EXTRACT(EPOCH FROM ($2 - $1)) * 1000,
       total_e2e_ms = $9 +
                      EXTRACT(EPOCH FROM ($1 - enqueued_at)) * 1000 +
                      EXTRACT(EPOCH FROM ($2 - $1)) * 1000
     WHERE task_id = $8`,
    [startedAt, completedAt, status, errorClass ?? null, errorMessage ?? null, retryCount, orderId ?? null, taskId.toString(), uiMs],
  );
}

export type PhaseMetric = {
  taskId: bigint;
  phase: 'login' | 'navigation' | 'customer_fill' | 'articles_fill' | 'discount_notes' | 'save' | 'verification';
  startedAt: Date;
  completedAt: Date;
  retryCount?: number;
  notes?: Record<string, unknown>;
};

export async function recordPhase(pool: Querier, params: PhaseMetric): Promise<void> {
  await pool.query(
    `INSERT INTO system.bot_phase_metrics
     (task_id, phase, started_at, completed_at, duration_ms, retry_count, notes)
     VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM ($4 - $3)) * 1000, $5, $6)`,
    [
      params.taskId.toString(),
      params.phase,
      params.startedAt,
      params.completedAt,
      params.retryCount ?? 0,
      params.notes ? JSON.stringify(params.notes) : null,
    ],
  );
}
