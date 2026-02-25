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

export {
  upsertPrice,
  getPrice,
  getPricesByProductId,
  getTotalCount,
  getAllPrices,
  getSyncStats,
  type PriceRow,
  type PriceUpsertInput,
  type SyncStats,
};
