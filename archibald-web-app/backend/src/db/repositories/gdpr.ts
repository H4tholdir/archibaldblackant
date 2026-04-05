import type { DbPool } from '../pool';

export type CustomerExport = {
  customer: Record<string, unknown> | null;
  orders: Record<string, unknown>[];
  orderArticles: Record<string, unknown>[];
  subClients: Record<string, unknown>[];
};

export async function exportCustomerData(pool: DbPool, customerProfile: string): Promise<CustomerExport> {
  const [customerResult, ordersResult, articlesResult, subClientsResult] = await Promise.all([
    pool.query(`SELECT * FROM agents.customers WHERE customer_profile = $1`, [customerProfile]),
    pool.query(`SELECT * FROM agents.order_records WHERE customer_profile_id = $1 ORDER BY created_at DESC`, [customerProfile]),
    pool.query(
      `SELECT oa.* FROM agents.order_articles oa
       JOIN agents.order_records o ON oa.order_id = o.id
       WHERE o.customer_profile_id = $1`,
      [customerProfile],
    ),
    pool.query(
      `SELECT sc.* FROM shared.sub_clients sc
       WHERE sc.matched_customer_profile_id = $1
          OR sc.codice IN (
            SELECT sub_client_codice FROM shared.sub_client_customer_matches
            WHERE customer_profile_id = $1
          )`,
      [customerProfile],
    ),
  ]);

  return {
    customer: customerResult.rows[0] ?? null,
    orders: ordersResult.rows,
    orderArticles: articlesResult.rows,
    subClients: subClientsResult.rows,
  };
}

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
    await tx.query(
      `UPDATE shared.sub_clients SET
         ragione_sociale    = $1,
         pers_da_contattare = CASE WHEN pers_da_contattare IS NOT NULL THEN $1 ELSE NULL END,
         email              = CASE WHEN email IS NOT NULL THEN $1 ELSE NULL END,
         email_amministraz  = CASE WHEN email_amministraz IS NOT NULL THEN $1 ELSE NULL END,
         telefono           = CASE WHEN telefono IS NOT NULL THEN $1 ELSE NULL END,
         telefono2          = CASE WHEN telefono2 IS NOT NULL THEN $1 ELSE NULL END,
         telefono3          = CASE WHEN telefono3 IS NOT NULL THEN $1 ELSE NULL END,
         cod_fiscale        = CASE WHEN cod_fiscale IS NOT NULL THEN $1 ELSE NULL END,
         partita_iva        = CASE WHEN partita_iva IS NOT NULL THEN $1 ELSE NULL END
       WHERE codice IN (
         SELECT sub_client_codice FROM shared.sub_client_customer_matches
         WHERE customer_profile_id = $2
       ) OR matched_customer_profile_id = $2`,
      [erasedMarker, customerProfile],
    );
  });
}
