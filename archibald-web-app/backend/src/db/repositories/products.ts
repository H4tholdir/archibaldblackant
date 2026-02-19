import type { DbPool } from '../pool';

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  group_code: string | null;
  search_name: string | null;
  price_unit: string | null;
  product_group_id: string | null;
  product_group_description: string | null;
  package_content: string | null;
  min_qty: number | null;
  multiple_qty: number | null;
  max_qty: number | null;
  price: number | null;
  price_source: string | null;
  price_updated_at: string | null;
  vat: number | null;
  vat_source: string | null;
  vat_updated_at: string | null;
  image_url: string | null;
  image_local_path: string | null;
  image_downloaded_at: string | null;
  deleted_at: string | null;
  hash: string;
  last_sync: number;
  created_at: string | null;
  updated_at: string | null;
};

type ProductUpsertInput = {
  id: string;
  name?: string;
  description?: string | null;
  group_code?: string | null;
  search_name?: string | null;
  price_unit?: string | null;
  product_group_id?: string | null;
  product_group_description?: string | null;
  package_content?: string | null;
  min_qty?: number | null;
  multiple_qty?: number | null;
  max_qty?: number | null;
  price?: number | null;
  image_url?: string | null;
  hash: string;
  last_sync: number;
};

type UpsertResult = {
  inserted: number;
  updated: number;
  unchanged: number;
};

type VariantRow = {
  productId: string;
  variantId: string;
  multiple_qty: number;
  min_qty: number;
  max_qty: number;
  package_content: string;
};

const PRODUCT_COLUMNS = `
  id, name, description, group_code, search_name, price_unit,
  product_group_id, product_group_description, package_content,
  min_qty, multiple_qty, max_qty, price, price_source, price_updated_at,
  vat, vat_source, vat_updated_at, hash, last_sync
`;

async function getProducts(pool: DbPool, searchQuery?: string): Promise<ProductRow[]> {
  if (searchQuery) {
    const normalized = searchQuery.replace(/[.\s-]/g, '').toLowerCase();
    const pattern = `%${normalized}%`;

    const { rows } = await pool.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS}
       FROM shared.products
       WHERE deleted_at IS NULL
         AND (LOWER(REPLACE(REPLACE(REPLACE(name, '.', ''), ' ', ''), '-', '')) LIKE $1
          OR LOWER(REPLACE(REPLACE(REPLACE(id, '.', ''), ' ', ''), '-', '')) LIKE $2
          OR LOWER(REPLACE(REPLACE(REPLACE(search_name, '.', ''), ' ', ''), '-', '')) LIKE $3
          OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(description, ''), '.', ''), ' ', ''), '-', '')) LIKE $4)
       ORDER BY name ASC
       LIMIT 100`,
      [pattern, pattern, pattern, pattern],
    );

    return rows;
  }

  const { rows } = await pool.query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
     FROM shared.products
     WHERE deleted_at IS NULL
     ORDER BY name ASC`,
  );

  return rows;
}

async function getProductById(pool: DbPool, productId: string): Promise<ProductRow | undefined> {
  const { rows } = await pool.query<ProductRow>(
    `SELECT * FROM shared.products WHERE id = $1`,
    [productId],
  );

  return rows[0];
}

async function getProductCount(pool: DbPool): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM shared.products WHERE deleted_at IS NULL`,
  );

  return rows[0].count;
}

async function getProductVariants(pool: DbPool, articleName: string): Promise<ProductRow[]> {
  const { rows } = await pool.query<ProductRow>(
    `SELECT * FROM shared.products
     WHERE name = $1 AND deleted_at IS NULL
     ORDER BY
       CAST(NULLIF(REGEXP_REPLACE(package_content, '[^0-9]', '', 'g'), '') AS INTEGER) DESC NULLS LAST,
       package_content DESC`,
    [articleName],
  );

  return rows;
}

async function upsertProducts(
  pool: DbPool,
  products: ProductUpsertInput[],
  syncSessionId?: string,
): Promise<UpsertResult> {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const product of products) {
    const { rows: existing } = await pool.query<{ id: string; hash: string; deleted_at: string | null }>(
      `SELECT id, hash, deleted_at FROM shared.products WHERE id = $1`,
      [product.id],
    );

    const existingRow = existing[0];

    if (!existingRow || existingRow.deleted_at !== null) {
      await pool.query(
        `INSERT INTO shared.products (
          id, name, description, group_code, search_name, price_unit,
          product_group_id, product_group_description, package_content,
          min_qty, multiple_qty, max_qty, price, image_url,
          hash, last_sync, deleted_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NULL)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          group_code = EXCLUDED.group_code,
          search_name = EXCLUDED.search_name,
          price_unit = EXCLUDED.price_unit,
          product_group_id = EXCLUDED.product_group_id,
          product_group_description = EXCLUDED.product_group_description,
          package_content = EXCLUDED.package_content,
          min_qty = EXCLUDED.min_qty,
          multiple_qty = EXCLUDED.multiple_qty,
          max_qty = EXCLUDED.max_qty,
          price = EXCLUDED.price,
          image_url = EXCLUDED.image_url,
          hash = EXCLUDED.hash,
          last_sync = EXCLUDED.last_sync,
          deleted_at = NULL,
          updated_at = NOW()`,
        [
          product.id,
          product.name ?? null,
          product.description ?? null,
          product.group_code ?? null,
          product.search_name ?? null,
          product.price_unit ?? null,
          product.product_group_id ?? null,
          product.product_group_description ?? null,
          product.package_content ?? null,
          product.min_qty ?? null,
          product.multiple_qty ?? null,
          product.max_qty ?? null,
          product.price ?? null,
          product.image_url ?? null,
          product.hash,
          product.last_sync,
        ],
      );
      inserted++;

      if (syncSessionId) {
        await pool.query(
          `INSERT INTO shared.product_changes
           (product_id, change_type, changed_at, sync_session_id)
           VALUES ($1, 'created', $2, $3)`,
          [product.id, product.last_sync, syncSessionId],
        );
      }
    } else if (existingRow.hash !== product.hash) {
      await pool.query(
        `INSERT INTO shared.products (
          id, name, description, group_code, search_name, price_unit,
          product_group_id, product_group_description, package_content,
          min_qty, multiple_qty, max_qty, price, image_url,
          hash, last_sync, deleted_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NULL)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          group_code = EXCLUDED.group_code,
          search_name = EXCLUDED.search_name,
          price_unit = EXCLUDED.price_unit,
          product_group_id = EXCLUDED.product_group_id,
          product_group_description = EXCLUDED.product_group_description,
          package_content = EXCLUDED.package_content,
          min_qty = EXCLUDED.min_qty,
          multiple_qty = EXCLUDED.multiple_qty,
          max_qty = EXCLUDED.max_qty,
          price = EXCLUDED.price,
          image_url = EXCLUDED.image_url,
          hash = EXCLUDED.hash,
          last_sync = EXCLUDED.last_sync,
          deleted_at = NULL,
          updated_at = NOW()`,
        [
          product.id,
          product.name ?? null,
          product.description ?? null,
          product.group_code ?? null,
          product.search_name ?? null,
          product.price_unit ?? null,
          product.product_group_id ?? null,
          product.product_group_description ?? null,
          product.package_content ?? null,
          product.min_qty ?? null,
          product.multiple_qty ?? null,
          product.max_qty ?? null,
          product.price ?? null,
          product.image_url ?? null,
          product.hash,
          product.last_sync,
        ],
      );
      updated++;

      if (syncSessionId) {
        await pool.query(
          `INSERT INTO shared.product_changes
           (product_id, change_type, changed_at, sync_session_id)
           VALUES ($1, 'updated', $2, $3)`,
          [product.id, product.last_sync, syncSessionId],
        );
      }
    } else {
      unchanged++;
    }
  }

  return { inserted, updated, unchanged };
}

async function findDeletedProducts(pool: DbPool, currentIds: string[]): Promise<string[]> {
  if (currentIds.length === 0) {
    return [];
  }

  const placeholders = currentIds.map((_, i) => `$${i + 1}`).join(',');

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM shared.products
     WHERE id NOT IN (${placeholders})
       AND deleted_at IS NULL`,
    currentIds,
  );

  return rows.map((r) => r.id);
}

async function softDeleteProducts(
  pool: DbPool,
  ids: string[],
  syncSessionId: string,
): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

  const { rowCount } = await pool.query(
    `UPDATE shared.products
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    ids,
  );

  for (const id of ids) {
    await pool.query(
      `INSERT INTO shared.product_changes
       (product_id, change_type, changed_at, sync_session_id)
       VALUES ($1, 'deleted', $2, $3)`,
      [id, Date.now(), syncSessionId],
    );
  }

  return rowCount ?? 0;
}

async function updateProductPrice(
  pool: DbPool,
  productId: string,
  price: number,
  vat: number | null,
  priceSource: string,
  vatSource: string | null,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE shared.products SET
       price = $2,
       vat = $3,
       price_source = $4,
       vat_source = $5,
       price_updated_at = NOW(),
       vat_updated_at = NOW(),
       updated_at = NOW()
     WHERE id = $1`,
    [productId, price, vat, priceSource, vatSource],
  );

  return (rowCount ?? 0) > 0;
}

async function getLastSyncTime(pool: DbPool): Promise<number | null> {
  const { rows } = await pool.query<{ last_sync: number | null }>(
    `SELECT MAX(last_sync) AS last_sync FROM shared.products`,
  );

  return rows[0]?.last_sync ?? null;
}

async function getZeroPriceCount(pool: DbPool): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM shared.products WHERE deleted_at IS NULL AND price IS NULL`,
  );
  return rows[0].count;
}

async function getNoVatCount(pool: DbPool): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM shared.products WHERE deleted_at IS NULL AND vat IS NULL`,
  );
  return rows[0].count;
}

type ProductChange = {
  productId: string;
  changeType: string;
  changedAt: number;
  syncSessionId: string | null;
};

type ProductChangeStats = {
  created: number;
  updated: number;
  deleted: number;
};

async function getProductChanges(pool: DbPool, productId: string): Promise<ProductChange[]> {
  const { rows } = await pool.query<{ product_id: string; change_type: string; changed_at: number; sync_session_id: string | null }>(
    `SELECT product_id, change_type, changed_at, sync_session_id
     FROM shared.product_changes
     WHERE product_id = $1
     ORDER BY changed_at DESC`,
    [productId],
  );
  return rows.map((r) => ({
    productId: r.product_id,
    changeType: r.change_type,
    changedAt: r.changed_at,
    syncSessionId: r.sync_session_id,
  }));
}

async function getRecentProductChanges(pool: DbPool, days: number, limit: number): Promise<ProductChange[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const { rows } = await pool.query<{ product_id: string; change_type: string; changed_at: number; sync_session_id: string | null }>(
    `SELECT product_id, change_type, changed_at, sync_session_id
     FROM shared.product_changes
     WHERE changed_at >= $1
     ORDER BY changed_at DESC
     LIMIT $2`,
    [cutoff, limit],
  );
  return rows.map((r) => ({
    productId: r.product_id,
    changeType: r.change_type,
    changedAt: r.changed_at,
    syncSessionId: r.sync_session_id,
  }));
}

async function getProductChangeStats(pool: DbPool, days: number): Promise<ProductChangeStats> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const { rows } = await pool.query<{ change_type: string; count: number }>(
    `SELECT change_type, COUNT(*)::int AS count
     FROM shared.product_changes
     WHERE changed_at >= $1
     GROUP BY change_type`,
    [cutoff],
  );
  const stats: ProductChangeStats = { created: 0, updated: 0, deleted: 0 };
  for (const row of rows) {
    if (row.change_type === 'created') stats.created = row.count;
    else if (row.change_type === 'updated') stats.updated = row.count;
    else if (row.change_type === 'deleted') stats.deleted = row.count;
  }
  return stats;
}

async function getAllProducts(pool: DbPool): Promise<ProductRow[]> {
  const { rows } = await pool.query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
     FROM shared.products
     WHERE deleted_at IS NULL
     ORDER BY name ASC`,
  );

  return rows;
}

async function getAllProductVariants(pool: DbPool): Promise<VariantRow[]> {
  const { rows } = await pool.query<VariantRow>(
    `SELECT
       name AS "productId",
       id AS "variantId",
       multiple_qty,
       min_qty,
       max_qty,
       package_content
     FROM shared.products
     WHERE multiple_qty IS NOT NULL AND deleted_at IS NULL
     ORDER BY name, multiple_qty DESC`,
  );

  return rows;
}

export {
  getProducts,
  getProductById,
  getProductCount,
  getZeroPriceCount,
  getNoVatCount,
  getProductVariants,
  upsertProducts,
  findDeletedProducts,
  softDeleteProducts,
  updateProductPrice,
  getLastSyncTime,
  getAllProducts,
  getAllProductVariants,
  getProductChanges,
  getRecentProductChanges,
  getProductChangeStats,
  type ProductRow,
  type ProductUpsertInput,
  type UpsertResult,
  type VariantRow,
  type ProductChange,
  type ProductChangeStats,
};
