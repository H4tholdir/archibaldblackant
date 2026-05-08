import type { DbPool, TxClient } from '../pool';
import type { TaskRow, TaskStatus, TaskPhase, TaskType, ErrorClass } from '../../conductor/types';
import { TASK_PRIORITY } from '../../conductor/types';

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
  priority: number;
  run_after: Date | null;
  requires_browser: boolean;
  dedup_key_external: string | null;
  preempt_requested: boolean;
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
    priority: row.priority ?? 500,
    runAfter: row.run_after,
    requiresBrowser: row.requires_browser ?? true,
    dedupKeyExternal: row.dedup_key_external,
    preemptRequested: row.preempt_requested ?? false,
  };
}

export type EnqueueParams = {
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  batchId?: string;
  priority?: number;
};

export async function enqueueTask(pool: DbPool, params: EnqueueParams): Promise<bigint> {
  const priority = params.priority ?? TASK_PRIORITY[params.taskType] ?? 500;

  return await pool.withTransaction(async (tx) => {
    // FIX: rimosso FOR UPDATE dentro scalar subquery (causa 0A000 come in enqueueWithDedup)
    const { rows: [maxRow] } = await tx.query<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_position
       FROM system.agent_operation_queue
       WHERE user_id = $1 AND status IN ('enqueued', 'running')`,
      [params.userId],
    );

    const { rows: [task] } = await tx.query<{ task_id: string }>(
      `INSERT INTO system.agent_operation_queue
       (user_id, task_type, payload, batch_id, position, status, priority)
       VALUES ($1, $2, $3, $4, $5, 'enqueued', $6)
       RETURNING task_id`,
      [
        params.userId,
        params.taskType,
        JSON.stringify(params.payload),
        params.batchId ?? null,
        maxRow.next_position,
        priority,
      ],
    );

    return BigInt(task.task_id);
  });
}

export async function pickupNextTask(pool: DbPool): Promise<TaskRow | null> {
  const { rows } = await pool.query<DbTaskRow>(`
    UPDATE system.agent_operation_queue
    SET status = 'running',
        started_at = NOW(),
        heartbeat_at = NOW()
    WHERE task_id = (
      SELECT aoq.task_id
      FROM system.agent_operation_queue aoq
      WHERE aoq.status = 'enqueued'
        AND (aoq.run_after IS NULL OR aoq.run_after <= NOW())
        AND aoq.user_id NOT IN (
          SELECT DISTINCT user_id
          FROM system.agent_operation_queue
          WHERE status = 'running'
        )
        AND NOT (
          aoq.priority = 500
          AND aoq.user_id IN (SELECT user_id FROM system.sync_paused_users)
        )
        AND pg_try_advisory_xact_lock(hashtext(aoq.user_id))
      ORDER BY (
        aoq.priority::float
        -- Anti-starvation: tasks waiting >5min are progressively promoted (lower score = picked first)
        / GREATEST(1.0, 1.0 + LOG(2, GREATEST(
            1,
            EXTRACT(EPOCH FROM (NOW() - aoq.enqueued_at)) / 300.0
          )))
        -- Pressure suppression: P>=500 with P<=10 pending for same userId gets EP=999 (deprioritised)
        * CASE
            WHEN aoq.priority >= 500 AND EXISTS (
              SELECT 1 FROM system.agent_operation_queue q2
              WHERE q2.user_id = aoq.user_id
                AND q2.status IN ('enqueued', 'running')
                AND q2.priority <= 10
            ) THEN 999.0
            ELSE 1.0
          END
      ) ASC, aoq.enqueued_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateTaskHeartbeat(pool: Querier, taskId: bigint): Promise<void> {
  await pool.query(
    `UPDATE system.agent_operation_queue
     SET heartbeat_at = now()
     WHERE task_id = $1::bigint AND status = 'running'`,
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
       WHERE task_id = $3::bigint`,
      [phase, erpOrderId, taskId.toString()],
    );
  } else {
    await pool.query(
      `UPDATE system.agent_operation_queue
       SET phase = $1, heartbeat_at = now()
       WHERE task_id = $2::bigint`,
      [phase, taskId.toString()],
    );
  }
}

export async function completeTask(pool: Querier, taskId: bigint): Promise<void> {
  await pool.query(
    `UPDATE system.agent_operation_queue
     SET status = 'completed', phase = 'completed', completed_at = now()
     WHERE task_id = $1::bigint`,
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
         phase = CASE
                   -- Preserva 'erp_save_done' e 'db_committed': l'ordine è già su ERP (e
                   -- nei due casi anche già nel nostro DB). Il retry NON deve chiamare
                   -- bot.createOrder() di nuovo — duplicherebbe l'ordine ERP. Worker
                   -- rileva phase != NULL + erp_order_id e fa auto-resume / completa.
                   WHEN phase IN ('erp_save_done', 'db_committed') THEN phase
                   -- Su task definitivamente failed: preserva la phase corrente per debug
                   WHEN retry_count + $3 >= max_retries THEN phase
                   -- Altrimenti: reset (era pre-ERP, non serve preservare)
                   ELSE NULL
                 END,
         status = CASE
                    -- verification_mismatch = fallimento definitivo, nessun retry
                    WHEN $1 = 'verification_mismatch' THEN 'failed'
                    WHEN retry_count + $3 >= max_retries THEN 'failed'
                    ELSE 'enqueued'
                  END,
         heartbeat_at = NULL,
         started_at = NULL
     WHERE task_id = $4::bigint
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
    willRetry: params.errorClass !== 'verification_mismatch' && row.retry_count < row.max_retries,
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
     ORDER BY COALESCE(completed_at, cancelled_at) DESC NULLS LAST
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
     WHERE task_id = $2::bigint AND status IN ('enqueued', 'running')`,
    [reason, taskId.toString()],
  );
}

export async function getTaskById(pool: DbPool, taskId: bigint): Promise<TaskRow | null> {
  const { rows } = await pool.query<DbTaskRow>(
    `SELECT * FROM system.agent_operation_queue WHERE task_id = $1::bigint`,
    [taskId.toString()],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export function buildDedupKey(taskType: TaskType, userId: string, payload: Record<string, unknown>): string | null {
  switch (taskType) {
    case 'sync-order-articles':
      return payload.orderId ? `${userId}:${taskType}:${payload.orderId}` : null;
    case 'sync-orders':
    case 'sync-customers':
    case 'sync-ddt':
    case 'sync-invoices':
    case 'sync-customer-addresses':
    case 'sync-products':
    case 'sync-prices':
    case 'sync-order-states':
    case 'sync-tracking':
      return `${userId}:${taskType}`;
    case 'read-vat-status':
    case 'refresh-customer':
      return `${userId}:${taskType}:${String(payload.erpId ?? payload.customerId ?? '')}`;
    default:
      return null; // nessun dedup per ERP write ops e download
  }
}

export type EnqueueWithDedupParams = {
  userId: string;
  taskType: TaskType;
  payload: Record<string, unknown>;
  priority: number;
  runAfter?: Date;
  requiresBrowser?: boolean;
  batchId?: string;
  maxRetries?: number;
};

export async function enqueueWithDedup(pool: DbPool, params: EnqueueWithDedupParams): Promise<bigint | null> {
  const {
    userId, taskType, payload, priority,
    runAfter = null, requiresBrowser = true, batchId = null, maxRetries = 3,
  } = params;

  const dedupKey = buildDedupKey(taskType, userId, payload);

  return pool.withTransaction(async (tx) => {
    // Blocca le righe enqueued/running per questo userId per evitare race condition
    // nella lettura della posizione massima (due enqueue concorrenti potrebbero ottenere
    // lo stesso MAX(position) se non serializzati).
    // FOR UPDATE SKIP LOCKED non è supportato dentro scalar subquery (PostgreSQL 0A000).
    // La posizione è un hint di ordinamento non critico — collisioni accettabili in transazione.
    const { rows: [posRow] } = await tx.query<{ next_position: number }>(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_position
       FROM system.agent_operation_queue
       WHERE user_id = $1 AND status IN ('enqueued', 'running')`,
      [userId],
    );

    const { rows } = await tx.query<{ task_id: string }>(`
      INSERT INTO system.agent_operation_queue
        (user_id, task_type, payload, batch_id, position, status, priority,
         run_after, requires_browser, dedup_key_external, max_retries)
      VALUES ($1, $2, $3::jsonb, $4, $5, 'enqueued', $6, $7, $8, $9, $10)
      ON CONFLICT (dedup_key_external)
        WHERE status IN ('enqueued', 'running') AND dedup_key_external IS NOT NULL
        DO NOTHING
      RETURNING task_id
    `, [userId, taskType, JSON.stringify(payload), batchId, posRow.next_position, priority, runAfter, requiresBrowser, dedupKey, maxRetries]);

    return rows[0] ? BigInt(rows[0].task_id) : null;
  });
}

export async function shouldPromoteP500ForUser(
  pool: DbPool,
  userId: string,
  agingThresholdMs: number,
): Promise<boolean> {
  // Non promuovere se c'è P<=100 pending per questo userId
  const { rows: priorityRows } = await pool.query(
    `SELECT 1 FROM system.agent_operation_queue
     WHERE user_id = $1 AND status = 'enqueued' AND priority <= 100
       AND (run_after IS NULL OR run_after <= NOW())
     LIMIT 1`,
    [userId]
  );
  if (priorityRows.length > 0) return false;

  // Promuovi solo se l'ultima sync completata è più vecchia della soglia
  const { rows: lastRows } = await pool.query<{ completed_at: Date }>(
    `SELECT completed_at FROM system.agent_operation_queue
     WHERE user_id = $1 AND priority = 500 AND status = 'completed'
     ORDER BY completed_at DESC LIMIT 1`,
    [userId]
  );

  if (lastRows.length === 0) return true; // mai sincronizzato

  const ageMs = Date.now() - new Date(lastRows[0].completed_at).getTime();
  return ageMs > agingThresholdMs;
}
