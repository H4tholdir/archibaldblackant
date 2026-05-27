import type { DbPool } from '../db/pool';
import type { EnqueueWithDedupParams } from '../db/repositories/agent-queue';
import type { TaskType } from '../conductor/types';

type EnqueueFn = (pool: DbPool, params: EnqueueWithDedupParams) => Promise<bigint | null>;

const THROTTLE_MS = 30 * 60 * 1000;

async function enqueueVatBgValidationIfNeeded(
  pool: DbPool,
  userId: string,
  erpId: string,
  enqueue: EnqueueFn,
  priority: number = 25,
): Promise<boolean> {
  const { rows } = await pool.query<{
    vat_number: string | null;
    vat_validated_at: string | null;
    vat_invalid: boolean;
    vat_last_bg_check_at: string | null;
  }>(
    `SELECT vat_number, vat_validated_at, vat_invalid, vat_last_bg_check_at
     FROM agents.customers
     WHERE erp_id = $1 AND user_id = $2`,
    [erpId, userId],
  );

  const customer = rows[0];
  if (!customer) return false;
  if (!customer.vat_number) return false;
  if (customer.vat_validated_at) return false;
  if (customer.vat_invalid) return false;

  if (customer.vat_last_bg_check_at) {
    const checkedAt = new Date(customer.vat_last_bg_check_at).getTime();
    if (Date.now() - checkedAt < THROTTLE_MS) return false;
  }

  await enqueue(pool, {
    userId,
    taskType: 'read-vat-status' as TaskType,
    payload: { erpId, vatNumber: customer.vat_number },
    priority,
    requiresBrowser: true,
  });

  return true;
}

export { enqueueVatBgValidationIfNeeded };
