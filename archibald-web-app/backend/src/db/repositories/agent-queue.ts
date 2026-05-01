import type { DbPool, TxClient } from '../pool';
import type { TaskRow, TaskStatus, TaskPhase, TaskType, ErrorClass } from '../../conductor/types';

type Querier = DbPool | TxClient;

type DbTaskRow = {
  task_id: string;
  user_id: string;
  task_type: TaskType;
  payload: Record<string, unknown>;
  batch_id: string | null;
  position: number;
  enqueued_at: Date;
  status: TaskStatus;
  phase: TaskPhase | null;
  erp_order_id: string | null;
  started_at: Date | null;
  heartbeat_at: Date | null;
  completed_at: Date | null;
  retry_count: number;
  max_retries: number;
  error_class: ErrorClass | null;
  error_message: string | null;
  cancelled_at: Date | null;
  cancelled_reason: string | null;
};

function mapRow(row: DbTaskRow): TaskRow {
  return {
    taskId: BigInt(row.task_id),
    userId: row.user_id,
    taskType: row.task_type,
    payload: row.payload,
    batchId: row.batch_id,
    position: row.position,
    enqueuedAt: row.enqueued_at,
    status: row.status,
    phase: row.phase,
    erpOrderId: row.erp_order_id,
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    completedAt: row.completed_at,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    errorClass: row.error_class,
    errorMessage: row.error_message,
    cancelledAt: row.cancelled_at,
    cancelledReason: row.cancelled_reason,
  };
}

export type EnqueueParams = {
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  batchId?: string;
};

export async function enqueueTask(pool: DbPool, params: EnqueueParams): Promise<bigint> {
  return await pool.withTransaction(async (tx) => {
    const { rows: [maxRow] } = await tx.query<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_position
       FROM system.agent_operation_queue
       WHERE user_id = $1 AND status IN ('enqueued', 'running')`,
      [params.userId],
    );

    const { rows: [task] } = await tx.query<{ task_id: string }>(
      `INSERT INTO system.agent_operation_queue
       (user_id, task_type, payload, batch_id, position, status)
       VALUES ($1, $2, $3, $4, $5, 'enqueued')
       RETURNING task_id`,
      [
        params.userId,
        params.taskType,
        JSON.stringify(params.payload),
        params.batchId ?? null,
        maxRow.next_position,
      ],
    );

    return BigInt(task.task_id);
  });
}

export async function pickupNextTask(pool: DbPool, userId: string): Promise<TaskRow | null> {
  const { rows } = await pool.query<DbTaskRow>(
    `UPDATE system.agent_operation_queue
     SET status = 'running',
         started_at = COALESCE(started_at, now()),
         heartbeat_at = now()
     WHERE task_id = (
       SELECT task_id FROM system.agent_operation_queue
       WHERE user_id = $1 AND status = 'enqueued'
       ORDER BY position ASC, enqueued_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [userId],
  );

  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateTaskHeartbeat(pool: Querier, taskId: bigint): Promise<void> {
  await pool.query(
    `UPDATE system.agent_operation_queue
     SET heartbeat_at = now()
     WHERE task_id = $1 AND status = 'running'`,
    [taskId.toString()],
  );
}

export async function updateTaskPhase(
  pool: Querier,
  taskId: bigint,
  phase: TaskPhase,
  erpOrderId?: string,
): Promise<void> {
  if (erpOrderId !== undefined) {
    await pool.query(
      `UPDATE system.agent_operation_queue
       SET phase = $1, erp_order_id = $2, heartbeat_at = now()
       WHERE task_id = $3`,
      [phase, erpOrderId, taskId.toString()],
    );
  } else {
    await pool.query(
      `UPDATE system.agent_operation_queue
       SET phase = $1, heartbeat_at = now()
       WHERE task_id = $2`,
      [phase, taskId.toString()],
    );
  }
}

export async function completeTask(pool: Querier, taskId: bigint): Promise<void> {
  await pool.query(
    `UPDATE system.agent_operation_queue
     SET status = 'completed', phase = 'completed', completed_at = now()
     WHERE task_id = $1`,
    [taskId.toString()],
  );
}

export type FailParams = {
  errorClass: ErrorClass;
  errorMessage: string;
  incrementRetry: boolean;
};

export async function failTask(
  pool: Querier,
  taskId: bigint,
  params: FailParams,
): Promise<{ retryCount: number; willRetry: boolean }> {
  const { rows: [row] } = await pool.query<{ retry_count: number; max_retries: number }>(
    `UPDATE system.agent_operation_queue
     SET error_class = $1,
         error_message = $2,
         retry_count = retry_count + $3,
         status = CASE
                    WHEN retry_count + $3 >= max_retries THEN 'failed'
                    ELSE 'enqueued'
                  END,
         heartbeat_at = NULL,
         started_at = NULL
     WHERE task_id = $4
     RETURNING retry_count, max_retries`,
    [
      params.errorClass,
      params.errorMessage,
      params.incrementRetry ? 1 : 0,
      taskId.toString(),
    ],
  );
  return {
    retryCount: row.retry_count,
    willRetry: row.retry_count < row.max_retries,
  };
}

export async function findOrphanRunningTasks(
  pool: DbPool,
  staleSeconds: number,
): Promise<TaskRow[]> {
  const { rows } = await pool.query<DbTaskRow>(
    `SELECT * FROM system.agent_operation_queue
     WHERE status = 'running'
       AND heartbeat_at < now() - INTERVAL '1 second' * $1`,
    [staleSeconds],
  );
  return rows.map(mapRow);
}

export async function countActiveByUser(pool: DbPool, userId: string): Promise<number> {
  const { rows: [row] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM system.agent_operation_queue
     WHERE user_id = $1 AND status IN ('enqueued', 'running')`,
    [userId],
  );
  return parseInt(row.count, 10);
}

export async function listActiveByUser(pool: DbPool, userId: string): Promise<TaskRow[]> {
  const { rows } = await pool.query<DbTaskRow>(
    `SELECT * FROM system.agent_operation_queue
     WHERE user_id = $1 AND status IN ('enqueued', 'running')
     ORDER BY position ASC, enqueued_at ASC`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function listRecentCompletedByUser(
  pool: DbPool,
  userId: string,
  limit: number,
): Promise<TaskRow[]> {
  const { rows } = await pool.query<DbTaskRow>(
    `SELECT * FROM system.agent_operation_queue
     WHERE user_id = $1 AND status IN ('completed', 'failed', 'cancelled')
     ORDER BY completed_at DESC NULLS LAST
     LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapRow);
}

export async function cancelTask(
  pool: DbPool,
  taskId: bigint,
  reason: string,
): Promise<void> {
  await pool.query(
    `UPDATE system.agent_operation_queue
     SET status = 'cancelled', cancelled_at = now(), cancelled_reason = $1
     WHERE task_id = $2 AND status IN ('enqueued', 'running')`,
    [reason, taskId.toString()],
  );
}

export async function getTaskById(pool: DbPool, taskId: bigint): Promise<TaskRow | null> {
  const { rows } = await pool.query<DbTaskRow>(
    `SELECT * FROM system.agent_operation_queue WHERE task_id = $1`,
    [taskId.toString()],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
