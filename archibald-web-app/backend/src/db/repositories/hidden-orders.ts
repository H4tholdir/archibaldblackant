import type { DbPool } from '../pool';

async function getHiddenOrderIds(pool: DbPool, userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ order_id: string }>(
    `SELECT order_id FROM agents.hidden_orders WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.order_id);
}

async function hideOrder(pool: DbPool, userId: string, orderId: string): Promise<void> {
  await pool.query(
    `INSERT INTO agents.hidden_orders (user_id, order_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, order_id) DO NOTHING`,
    [userId, orderId],
  );
}

async function unhideOrder(pool: DbPool, userId: string, orderId: string): Promise<void> {
  await pool.query(
    `DELETE FROM agents.hidden_orders WHERE user_id = $1 AND order_id = $2`,
    [userId, orderId],
  );
}

export { getHiddenOrderIds, hideOrder, unhideOrder };
