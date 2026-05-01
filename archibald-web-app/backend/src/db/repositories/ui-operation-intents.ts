import type { DbPool } from '../pool';

export type UiIntentRow = {
  intentId: string;
  userId: string;
  pendingOrderId: string;
  type: 'new-order' | 'edit-pending';
  uiStartedAt: Date;
  uiCompletedAt: Date | null;
};

export async function startIntent(
  pool: DbPool,
  params: { intentId: string; userId: string; pendingOrderId: string; type: 'new-order' | 'edit-pending' },
): Promise<void> {
  await pool.query(
    `INSERT INTO system.ui_operation_intents
     (intent_id, user_id, pending_order_id, type, ui_started_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (intent_id) DO NOTHING`,
    [params.intentId, params.userId, params.pendingOrderId, params.type],
  );
}

export async function completeIntent(
  pool: DbPool,
  params: { intentId: string; pendingOrderId: string },
): Promise<void> {
  await pool.query(
    `UPDATE system.ui_operation_intents
     SET ui_completed_at = now(), pending_order_id = $2
     WHERE intent_id = $1`,
    [params.intentId, params.pendingOrderId],
  );
}

export async function aggregateUiDurationForPending(
  pool: DbPool,
  pendingOrderId: string,
): Promise<{ firstOpen: Date | null; lastSave: Date | null; activeMs: number | null }> {
  const { rows: [row] } = await pool.query<{
    first_open: Date | null;
    last_save: Date | null;
    active_ms: string | null;
  }>(
    `SELECT
       MIN(ui_started_at) AS first_open,
       MAX(ui_completed_at) AS last_save,
       SUM(EXTRACT(EPOCH FROM (ui_completed_at - ui_started_at)) * 1000)::BIGINT AS active_ms
     FROM system.ui_operation_intents
     WHERE pending_order_id = $1 AND ui_completed_at IS NOT NULL`,
    [pendingOrderId],
  );
  return {
    firstOpen: row.first_open,
    lastSave: row.last_save,
    activeMs: row.active_ms ? parseInt(row.active_ms, 10) : null,
  };
}
