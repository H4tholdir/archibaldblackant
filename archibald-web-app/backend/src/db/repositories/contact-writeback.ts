import type { DbPool } from '../pool';
import { enqueueWithDedup } from './agent-queue';

type ContactUpdate = {
  email?: string | null;
  mobile?: string | null;
  phone?: string | null;
};

export async function updateCustomerContactAndQueueErp(
  pool: DbPool,
  userId: string,
  erpId: string,
  update: ContactUpdate,
): Promise<void> {
  const setClauses: string[] = ['contact_write_pending_at = NOW()', 'updated_at = NOW()'];
  const params: unknown[] = [userId, erpId];
  let i = 3;
  if ('email' in update) { setClauses.push(`email = $${i++}`); params.push(update.email ?? null); }
  if ('mobile' in update) { setClauses.push(`mobile = $${i++}`); params.push(update.mobile ?? null); }
  if ('phone' in update) { setClauses.push(`phone = $${i++}`); params.push(update.phone ?? null); }

  await pool.query(
    `UPDATE agents.customers SET ${setClauses.join(', ')} WHERE user_id = $1 AND erp_id = $2`,
    params,
  );

  await enqueueWithDedup(pool, {
    userId,
    taskType: 'update-customer',
    payload: { erpId, diff: update },
    priority: 25,
  });
}
