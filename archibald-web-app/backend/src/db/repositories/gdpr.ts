import type { DbPool } from '../pool';

export async function hasActiveOrders(pool: DbPool, customerProfile: string): Promise<boolean> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM agents.order_records
     WHERE customer_profile_id = $1
       AND current_state NOT IN ('consegnato', 'fatturato', 'pagamento_scaduto', 'pagato')`,
    [customerProfile],
  );
  return parseInt(rows[0]?.count ?? '0', 10) > 0;
}

export async function eraseCustomerPersonalData(pool: DbPool, customerProfile: string): Promise<void> {
  const erasedMarker = `[GDPR_ERASED_${new Date().toISOString()}]`;
  await pool.withTransaction(async (tx) => {
    await tx.query(
      `UPDATE agents.customers SET
         name         = $1,
         street       = $1,
         city         = CASE WHEN city IS NOT NULL THEN $1 ELSE NULL END,
         postal_code  = CASE WHEN postal_code IS NOT NULL THEN $1 ELSE NULL END,
         email        = CASE WHEN email IS NOT NULL THEN $1 ELSE NULL END,
         phone        = CASE WHEN phone IS NOT NULL THEN $1 ELSE NULL END,
         mobile       = CASE WHEN mobile IS NOT NULL THEN $1 ELSE NULL END,
         pec          = CASE WHEN pec IS NOT NULL THEN $1 ELSE NULL END,
         sdi          = CASE WHEN sdi IS NOT NULL THEN $1 ELSE NULL END,
         fiscal_code  = CASE WHEN fiscal_code IS NOT NULL THEN $1 ELSE NULL END
       WHERE customer_profile = $2`,
      [erasedMarker, customerProfile],
    );
  });
}
