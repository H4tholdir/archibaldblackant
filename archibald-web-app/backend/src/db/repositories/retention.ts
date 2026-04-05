import type { DbPool } from '../pool';

export type InactiveCustomerSummary = {
  customerProfile: string;
  name: string;
  lastActivityAt: Date;
};

export async function getInactiveCustomers(
  pool: DbPool,
  userId: string,
  thresholdMonths: number,
): Promise<InactiveCustomerSummary[]> {
  const { rows } = await pool.query<{ customer_profile: string; name: string; last_activity_at: Date }>(
    `SELECT customer_profile, name, last_activity_at
     FROM agents.customers
     WHERE user_id = $1
       AND last_activity_at IS NOT NULL
       AND last_activity_at < NOW() - ($2 || ' months')::INTERVAL
     ORDER BY last_activity_at ASC`,
    [userId, thresholdMonths],
  );
  return rows.map((r) => ({
    customerProfile: r.customer_profile,
    name: r.name,
    lastActivityAt: r.last_activity_at,
  }));
}
