import type { DbPool } from '../pool';

type PriceRow = {
  id: number;
  product_id: string;
  product_name: string;
  unit_price: string | null;
  item_selection: string | null;
  packaging_description: string | null;
  currency: string | null;
  price_valid_from: string | null;
  price_valid_to: string | null;
  price_unit: string | null;
  account_description: string | null;
  account_code: string | null;
  price_qty_from: number | null;
  price_qty_to: number | null;
  last_modified: string | null;
  data_area_id: string | null;
  hash: string;
  last_sync: number;
  created_at: string | null;
  updated_at: string | null;
};

type PriceUpsertInput = {
  product_id: string;
  product_name: string;
  unit_price?: string | null;
  item_selection?: string | null;
  packaging_description?: string | null;
  currency?: string | null;
  price_valid_from?: string | null;
  price_valid_to?: string | null;
  price_unit?: string | null;
  account_description?: string | null;
  account_code?: string | null;
  price_qty_from?: number | null;
  price_qty_to?: number | null;
  last_modified?: string | null;
  data_area_id?: string | null;
  hash: string;
  last_sync: number;
};

type SyncStats = {
  total_prices: number;
  last_sync_timestamp: number | null;
  prices_with_null_price: number;
};

type PriceChangeInput = {
  product_id: string;
  product_name: string;
  variant_id?: string | null;
  old_price?: number | null;
  new_price: number;
  percentage_change: number;
  change_type: 'increase' | 'decrease' | 'new';
  sync_date: number;
  source?: string;
};

type PriceChangeRow = {
  id: number;
  product_id: string;
  product_name: string;
  variant_id: string | null;
  old_price: number | null;
  new_price: number;
  percentage_change: number;
  change_type: string;
  sync_date: number;
  source: string;
};

type PriceStatsRow = {
  total_changes: number;
  increases: number;
  decreases: number;
  new_prices: number;
};

async function upsertPrice(
  pool: DbPool,
  priceData: PriceUpsertInput,
): Promise<'inserted' | 'updated' | 'skipped'> {
  const { rows: existing } = await pool.query<{ id: number; hash: string }>(
    `SELECT id, hash FROM shared.prices
     WHERE product_id = $1 AND item_selection IS NOT DISTINCT FROM $2`,
    [priceData.product_id, priceData.item_selection ?? null],
  );

  const existingRow = existing[0];

  if (existingRow) {
    if (existingRow.hash === priceData.hash) {
      return 'skipped';
    }

    await pool.query(
      `UPDATE shared.prices SET
         product_name = $1,
         unit_price = $2,
         packaging_description = $3,
         currency = $4,
         price_valid_from = $5,
         price_valid_to = $6,
         price_unit = $7,
         account_description = $8,
         account_code = $9,
         price_qty_from = $10,
         price_qty_to = $11,
         last_modified = $12,
         data_area_id = $13,
         hash = $14,
         last_sync = $15,
         updated_at = NOW()
       WHERE id = $16`,
      [
        priceData.product_name,
        priceData.unit_price ?? null,
        priceData.packaging_description ?? null,
        priceData.currency ?? null,
        priceData.price_valid_from ?? null,
        priceData.price_valid_to ?? null,
        priceData.price_unit ?? null,
        priceData.account_description ?? null,
        priceData.account_code ?? null,
        priceData.price_qty_from ?? null,
        priceData.price_qty_to ?? null,
        priceData.last_modified ?? null,
        priceData.data_area_id ?? null,
        priceData.hash,
        priceData.last_sync,
        existingRow.id,
      ],
    );

    return 'updated';
  }

  await pool.query(
    `INSERT INTO shared.prices (
       product_id, product_name, unit_price, item_selection, packaging_description,
       currency, price_valid_from, price_valid_to, price_unit,
       account_description, account_code, price_qty_from, price_qty_to,
       last_modified, data_area_id, hash, last_sync
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      priceData.product_id,
      priceData.product_name,
      priceData.unit_price ?? null,
      priceData.item_selection ?? null,
      priceData.packaging_description ?? null,
      priceData.currency ?? null,
      priceData.price_valid_from ?? null,
      priceData.price_valid_to ?? null,
      priceData.price_unit ?? null,
      priceData.account_description ?? null,
      priceData.account_code ?? null,
      priceData.price_qty_from ?? null,
      priceData.price_qty_to ?? null,
      priceData.last_modified ?? null,
      priceData.data_area_id ?? null,
      priceData.hash,
      priceData.last_sync,
    ],
  );

  return 'inserted';
}

async function getPrice(
  pool: DbPool,
  productId: string,
  itemSelection: string | null,
): Promise<PriceRow | undefined> {
  const { rows } = await pool.query<PriceRow>(
    `SELECT * FROM shared.prices
     WHERE product_id = $1 AND item_selection IS NOT DISTINCT FROM $2`,
    [productId, itemSelection],
  );

  return rows[0];
}

async function getPricesByProductId(pool: DbPool, productId: string): Promise<PriceRow[]> {
  const { rows } = await pool.query<PriceRow>(
    `SELECT * FROM shared.prices
     WHERE product_id = $1
     ORDER BY item_selection`,
    [productId],
  );

  return rows;
}

async function getTotalCount(pool: DbPool): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM shared.prices`,
  );

  return rows[0].count;
}

async function getAllPrices(pool: DbPool): Promise<PriceRow[]> {
  const { rows } = await pool.query<PriceRow>(
    `SELECT * FROM shared.prices ORDER BY product_id, item_selection`,
  );

  return rows;
}

async function getSyncStats(pool: DbPool): Promise<SyncStats> {
  const { rows } = await pool.query<SyncStats>(
    `SELECT
       COUNT(*)::int AS total_prices,
       MAX(last_sync) AS last_sync_timestamp,
       COUNT(*) FILTER (WHERE unit_price IS NULL)::int AS prices_with_null_price
     FROM shared.prices`,
  );

  return rows[0];
}

async function recordPriceChange(pool: DbPool, data: PriceChangeInput): Promise<void> {
  await pool.query(
    `INSERT INTO shared.price_history (
       product_id, product_name, variant_id, old_price, new_price,
       percentage_change, change_type, sync_date, source
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      data.product_id,
      data.product_name,
      data.variant_id ?? null,
      data.old_price ?? null,
      data.new_price,
      data.percentage_change,
      data.change_type,
      data.sync_date,
      data.source ?? 'price-sync',
    ],
  );
}

async function getRecentPriceChanges(
  pool: DbPool,
  days: number,
): Promise<{ changes: PriceChangeRow[]; stats: PriceStatsRow }> {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

  const { rows: changes } = await pool.query<PriceChangeRow>(
    `SELECT id, product_id, product_name, variant_id, old_price, new_price,
            percentage_change, change_type, sync_date, source
     FROM shared.price_history
     WHERE sync_date >= $1
     ORDER BY sync_date DESC`,
    [cutoff],
  );

  const { rows: [statsRow] } = await pool.query<PriceStatsRow>(
    `SELECT
       COUNT(*)::int AS total_changes,
       COUNT(*) FILTER (WHERE change_type = 'increase')::int AS increases,
       COUNT(*) FILTER (WHERE change_type = 'decrease')::int AS decreases,
       COUNT(*) FILTER (WHERE change_type = 'new')::int AS new_prices
     FROM shared.price_history
     WHERE sync_date >= $1`,
    [cutoff],
  );

  return { changes, stats: statsRow };
}

async function getPriceHistoryByProduct(
  pool: DbPool,
  productId: string,
  limit?: number,
): Promise<PriceChangeRow[]> {
  const { rows } = await pool.query<PriceChangeRow>(
    `SELECT id, product_id, product_name, variant_id, old_price, new_price,
            percentage_change, change_type, sync_date, source
     FROM shared.price_history
     WHERE product_id = $1
     ORDER BY sync_date DESC
     LIMIT $2`,
    [productId, limit ?? 100],
  );

  return rows;
}

export {
  upsertPrice,
  getPrice,
  getPricesByProductId,
  getTotalCount,
  getAllPrices,
  getSyncStats,
  recordPriceChange,
  getRecentPriceChanges,
  getPriceHistoryByProduct,
  type PriceRow,
  type PriceUpsertInput,
  type SyncStats,
  type PriceChangeInput,
  type PriceChangeRow,
  type PriceStatsRow,
};
