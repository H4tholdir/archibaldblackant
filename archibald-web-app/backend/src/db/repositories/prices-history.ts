import type { DbPool } from '../pool';
import type { PriceHistoryEntry, PriceHistoryStats } from '../../routes/prices';

type PriceHistoryRow = {
  id: number;
  product_id: string;
  product_name: string;
  variant_id: string | null;
  old_price: string | null;
  new_price: string;
  old_price_numeric: number | null;
  new_price_numeric: number;
  price_change: number | null;
  percentage_change: number | null;
  change_type: string;
  source: string;
  currency: string | null;
  changed_at: string;
  created_at: string;
};


type PriceHistoryInsert = {
  productId: string;
  productName: string;
  variantId?: string | null;
  oldPrice?: string | null;
  newPrice: string;
  oldPriceNumeric?: number | null;
  newPriceNumeric: number;
  priceChange?: number | null;
  percentageChange?: number | null;
  changeType: 'increase' | 'decrease' | 'new';
  source: string;
  currency?: string | null;
};

function toEntry(row: PriceHistoryRow): PriceHistoryEntry {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    variantId: row.variant_id,
    oldPrice: row.old_price,
    newPrice: row.new_price,
    oldPriceNumeric: row.old_price_numeric,
    newPriceNumeric: row.new_price_numeric,
    percentageChange: row.percentage_change,
    changeType: row.change_type,
    changedAt: row.changed_at,
    source: row.source,
  };
}

async function recordPriceChange(
  pool: DbPool,
  data: PriceHistoryInsert,
): Promise<PriceHistoryEntry> {
  const { rows } = await pool.query<PriceHistoryRow>(
    `INSERT INTO shared.price_history (
       product_id, product_name, variant_id,
       old_price, new_price, old_price_numeric, new_price_numeric,
       price_change, percentage_change, change_type, source, currency
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      data.productId,
      data.productName,
      data.variantId ?? null,
      data.oldPrice ?? null,
      data.newPrice,
      data.oldPriceNumeric ?? null,
      data.newPriceNumeric,
      data.priceChange ?? 0,
      data.percentageChange ?? 0,
      data.changeType,
      data.source,
      data.currency ?? null,
    ],
  );

  return toEntry(rows[0]);
}

async function getProductHistory(
  pool: DbPool,
  productId: string,
  limit: number = 50,
): Promise<PriceHistoryEntry[]> {
  const { rows } = await pool.query<PriceHistoryRow>(
    `SELECT * FROM shared.price_history
     WHERE product_id = $1
     ORDER BY changed_at DESC
     LIMIT $2`,
    [productId, limit],
  );

  return rows.map(toEntry);
}

async function getRecentChanges(
  pool: DbPool,
  days: number,
): Promise<PriceHistoryEntry[]> {
  const { rows } = await pool.query<PriceHistoryRow>(
    `SELECT * FROM shared.price_history
     WHERE changed_at >= NOW() - make_interval(days => $1)
     ORDER BY changed_at DESC, ABS(percentage_change) DESC`,
    [days],
  );

  return rows.map(toEntry);
}

async function getRecentStats(
  pool: DbPool,
  days: number,
): Promise<PriceHistoryStats> {
  const { rows } = await pool.query<{
    total_changes: number;
    increases: number;
    decreases: number;
    new_prices: number;
    avg_increase: number | null;
    avg_decrease: number | null;
  }>(
    `SELECT
       COUNT(*)::int AS total_changes,
       COUNT(*) FILTER (WHERE change_type = 'increase')::int AS increases,
       COUNT(*) FILTER (WHERE change_type = 'decrease')::int AS decreases,
       COUNT(*) FILTER (WHERE change_type = 'new')::int AS new_prices,
       AVG(percentage_change) FILTER (WHERE change_type = 'increase') AS avg_increase,
       AVG(percentage_change) FILTER (WHERE change_type = 'decrease') AS avg_decrease
     FROM shared.price_history
     WHERE changed_at >= NOW() - make_interval(days => $1)`,
    [days],
  );

  const row = rows[0];

  return {
    totalChanges: row.total_changes,
    increases: row.increases,
    decreases: row.decreases,
    newPrices: row.new_prices,
    avgIncrease: row.avg_increase ?? 0,
    avgDecrease: row.avg_decrease ?? 0,
  };
}

async function getTopIncreases(
  pool: DbPool,
  days: number,
  limit: number = 10,
): Promise<PriceHistoryEntry[]> {
  const { rows } = await pool.query<PriceHistoryRow>(
    `SELECT * FROM shared.price_history
     WHERE change_type = 'increase'
       AND changed_at >= NOW() - make_interval(days => $1)
     ORDER BY percentage_change DESC
     LIMIT $2`,
    [days, limit],
  );

  return rows.map(toEntry);
}

async function getTopDecreases(
  pool: DbPool,
  days: number,
  limit: number = 10,
): Promise<PriceHistoryEntry[]> {
  const { rows } = await pool.query<PriceHistoryRow>(
    `SELECT * FROM shared.price_history
     WHERE change_type = 'decrease'
       AND changed_at >= NOW() - make_interval(days => $1)
     ORDER BY percentage_change ASC
     LIMIT $2`,
    [days, limit],
  );

  return rows.map(toEntry);
}

export {
  recordPriceChange,
  getProductHistory,
  getRecentChanges,
  getRecentStats,
  getTopIncreases,
  getTopDecreases,
  type PriceHistoryRow,
  type PriceHistoryInsert,
};
