import type { DbPool } from '../db/pool';

export type PreflightChange = {
  articleCode: string;
  type: 'discontinued' | 'price_changed';
  suggestedAlternative?: { code: string; name: string } | null;
  oldPrice?: number;
  newPrice?: number;
};

export type PreflightResult = {
  changes: PreflightChange[];
  checkedAt: string;
};

export async function preflightPending(
  pool: DbPool,
  userId: string,
  pendingOrderId: string,
): Promise<PreflightResult> {
  const { rows: [pendingRow] } = await pool.query<{ confirmed_at: string | null; items: unknown }>(
    `SELECT confirmed_at, items FROM agents.pending_orders WHERE id = $1 AND user_id = $2`,
    [pendingOrderId, userId],
  );

  if (!pendingRow) {
    return { changes: [], checkedAt: new Date().toISOString() };
  }

  const { rows: [syncRow] } = await pool.query<{ completed_at: string | null }>(
    `SELECT MAX(updated_at)::text AS completed_at
     FROM system.active_jobs
     WHERE type = 'sync-products' AND user_id = $1`,
    [userId],
  );

  const lastSyncAt = syncRow?.completed_at;

  if (!pendingRow.confirmed_at || !lastSyncAt || lastSyncAt <= pendingRow.confirmed_at) {
    return { changes: [], checkedAt: new Date().toISOString() };
  }

  const items = (pendingRow.items ?? []) as Array<{
    articleCode: string;
    price: number;
    quantity: number;
  }>;

  const changes: PreflightChange[] = [];

  for (const item of items) {
    const { rows: [productRow] } = await pool.query<{
      id: string;
      deleted_at: string | null;
    }>(
      `SELECT id, deleted_at FROM shared.products WHERE id = $1`,
      [item.articleCode],
    );

    if (!productRow || productRow.deleted_at) {
      const { rows: [alt] } = await pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM shared.products
         WHERE deleted_at IS NULL
           AND name ILIKE '%' || (SELECT name FROM shared.products WHERE id = $1) || '%'
           AND id != $1
         LIMIT 1`,
        [item.articleCode],
      );
      changes.push({
        articleCode: item.articleCode,
        type: 'discontinued',
        suggestedAlternative: alt ? { code: alt.id, name: alt.name } : null,
      });
      continue;
    }

    const { rows: [priceRow] } = await pool.query<{ unit_price: string | null }>(
      `SELECT p.unit_price FROM shared.prices p
       JOIN agents.customers c ON c.price_group = p.price_group AND c.user_id = $2
       WHERE p.product_id = $1
       LIMIT 1`,
      [item.articleCode, userId],
    );

    if (priceRow?.unit_price) {
      const currentPrice = parseFloat(priceRow.unit_price);
      const delta = Math.abs(currentPrice - item.price);
      if (delta > 0.01) {
        changes.push({
          articleCode: item.articleCode,
          type: 'price_changed',
          oldPrice: item.price,
          newPrice: currentPrice,
        });
      }
    }
  }

  return { changes, checkedAt: new Date().toISOString() };
}
