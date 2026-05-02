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
  const { rows: [pendingRow] } = await pool.query<{ created_at: number | null; items: unknown }>(
    `SELECT created_at, items FROM agents.pending_orders WHERE id = $1 AND user_id = $2`,
    [pendingOrderId, userId],
  );

  if (!pendingRow) {
    return { changes: [], checkedAt: new Date().toISOString() };
  }

  const { rows: [syncRow] } = await pool.query<{ completed_at: string | null }>(
    `SELECT MAX(completed_at)::text AS completed_at
     FROM shared.sync_sessions
     WHERE sync_type = 'products' AND status = 'completed'`,
  );

  const lastSyncAt = syncRow?.completed_at;

  // created_at è unix ms, lastSyncAt è ISO string — confronta in ms
  const pendingCreatedMs = pendingRow.created_at ?? 0;
  const lastSyncMs = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;

  if (!lastSyncMs || lastSyncMs <= pendingCreatedMs) {
    return { changes: [], checkedAt: new Date().toISOString() };
  }

  const items = (pendingRow.items ?? []) as Array<{
    articleCode: string;
    price: number;
    quantity: number;
  }>;

  if (items.length === 0) {
    return { changes: [], checkedAt: new Date().toISOString() };
  }

  const codes = items.map(i => i.articleCode);

  // Fetch batch per evitare N+1
  const { rows: productRows } = await pool.query<{ id: string; deleted_at: string | null; name: string }>(
    `SELECT id, deleted_at, name FROM shared.products WHERE id = ANY($1)`,
    [codes],
  );
  const productMap = new Map(productRows.map(r => [r.id, r]));

  const { rows: priceRows } = await pool.query<{ product_id: string; unit_price: string }>(
    `SELECT DISTINCT ON (p.product_id) p.product_id, p.unit_price
     FROM shared.prices p
     JOIN agents.customers c ON c.price_group = p.price_group AND c.user_id = $2
     WHERE p.product_id = ANY($1)
     ORDER BY p.product_id`,
    [codes, userId],
  );
  const priceMap = new Map(priceRows.map(r => [r.product_id, parseFloat(r.unit_price)]));

  const changes: PreflightChange[] = [];

  for (const item of items) {
    const product = productMap.get(item.articleCode);

    if (!product || product.deleted_at) {
      // Articolo discontinuato — cerca alternativa solo se abbiamo il nome
      let alt: { code: string; name: string } | null = null;
      if (product?.name) {
        const { rows: [altRow] } = await pool.query<{ id: string; name: string }>(
          `SELECT id, name FROM shared.products
           WHERE deleted_at IS NULL AND name ILIKE $1 AND id != $2
           LIMIT 1`,
          [`%${product.name}%`, item.articleCode],
        );
        if (altRow) alt = { code: altRow.id, name: altRow.name };
      }
      changes.push({ articleCode: item.articleCode, type: 'discontinued', suggestedAlternative: alt });
      continue;
    }

    const currentPrice = priceMap.get(item.articleCode);
    if (currentPrice !== undefined && Math.abs(currentPrice - item.price) > 0.01) {
      changes.push({
        articleCode: item.articleCode,
        type: 'price_changed',
        oldPrice: item.price,
        newPrice: currentPrice,
      });
    }
  }

  return { changes, checkedAt: new Date().toISOString() };
}
