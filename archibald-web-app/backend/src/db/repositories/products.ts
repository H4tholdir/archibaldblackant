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
  hash: string;
  last_sync: number;
  figure: string | null;
  bulk_article_id: string | null;
  leg_package: string | null;
  size: string | null;
  configuration_id: string | null;
  created_by: string | null;
  created_date_field: string | null;
  data_area_id: string | null;
  default_qty: string | null;
  display_product_number: string | null;
  total_absolute_discount: string | null;
  product_id_ext: string | null;
  line_discount: string | null;
  modified_by: string | null;
  modified_datetime: string | null;
  orderable_article: string | null;
  stopped: string | null;
  purch_price: string | null;
  pcs_standard_configuration_id: string | null;
  standard_qty: string | null;
  unit_id: string | null;
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
  vat, vat_source, vat_updated_at, hash, last_sync,
  figure, bulk_article_id, leg_package, size,
  configuration_id, created_by, created_date_field, data_area_id,
  default_qty, display_product_number, total_absolute_discount, product_id_ext,
  line_discount, modified_by, modified_datetime, orderable_article,
  stopped, purch_price, pcs_standard_configuration_id, standard_qty, unit_id
`;

type ProductFilters = {
  searchQuery?: string;
  vatFilter?: 'missing';
  priceFilter?: 'zero';
  discountFilter?: 'missing';
  userId?: string;
  limit?: number;
};

async function getProducts(pool: DbPool, searchQueryOrFilters?: string | ProductFilters): Promise<ProductRow[]> {
  const filters: ProductFilters = typeof searchQueryOrFilters === 'string'
    ? { searchQuery: searchQueryOrFilters }
    : searchQueryOrFilters ?? {};

  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.searchQuery) {
    const normalized = filters.searchQuery.replace(/[.\s-]/g, '').toLowerCase();
    const pattern = `%${normalized}%`;
    conditions.push(
      `(LOWER(REPLACE(REPLACE(REPLACE(name, '.', ''), ' ', ''), '-', '')) LIKE $${paramIndex}
       OR LOWER(REPLACE(REPLACE(REPLACE(id, '.', ''), ' ', ''), '-', '')) LIKE $${paramIndex + 1}
       OR LOWER(REPLACE(REPLACE(REPLACE(search_name, '.', ''), ' ', ''), '-', '')) LIKE $${paramIndex + 2}
       OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(description, ''), '.', ''), ' ', ''), '-', '')) LIKE $${paramIndex + 3})`,
    );
    params.push(pattern, pattern, pattern, pattern);
    paramIndex += 4;
  }

  if (filters.vatFilter === 'missing') {
    conditions.push('vat IS NULL');
  }

  if (filters.priceFilter === 'zero') {
    conditions.push('price IS NULL');
  }

  if (filters.discountFilter === 'missing' && filters.userId) {
    conditions.push(
      `NOT EXISTS (
        SELECT 1 FROM agents.fresis_discounts fd
        WHERE fd.article_code = id
          AND fd.user_id = $${paramIndex}
      )`,
    );
    params.push(filters.userId);
    paramIndex += 1;
  }

  const limit = filters.limit ?? (filters.searchQuery ? 100 : undefined);
  const limitClause = limit ? `LIMIT $${paramIndex}` : '';
  if (limit) params.push(limit);

  const { rows } = await pool.query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
     FROM shared.products
     WHERE ${conditions.join(' AND ')}
     ORDER BY name ASC
     ${limitClause}`,
    params,
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
  renames: Map<string, string> = new Map(),
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
    const newId = renames.get(id);
    if (newId) {
      await pool.query(
        `INSERT INTO shared.product_changes
         (product_id, change_type, field_changed, old_value, new_value, changed_at, sync_session_id)
         VALUES ($1, 'updated', $2, $3, $4, $5, $6)`,
        [id, 'id', id, newId, Date.now(), syncSessionId],
      );
    } else {
      await pool.query(
        `INSERT INTO shared.product_changes
         (product_id, change_type, changed_at, sync_session_id)
         VALUES ($1, 'deleted', $2, $3)`,
        [id, Date.now(), syncSessionId],
      );
    }
  }

  return rowCount ?? 0;
}

async function trackProductCreated(pool: DbPool, productId: string, syncSessionId: string): Promise<void> {
  await pool.query(
    `INSERT INTO shared.product_changes (product_id, change_type, changed_at, sync_session_id)
     VALUES ($1, 'created', $2, $3)`,
    [productId, Date.now(), syncSessionId],
  );
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

async function getMissingFresisDiscountCount(pool: DbPool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM shared.products p
     WHERE p.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM agents.fresis_discounts fd
         WHERE fd.article_code = p.id
           AND fd.user_id = $1
       )`,
    [userId],
  );
  return rows[0].count;
}

type ProductChange = {
  productId: string;
  productName: string | null;
  changeType: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedAt: number;
  syncSessionId: string | null;
};

type ProductChangeStats = {
  created: number;
  updated: number;
  deleted: number;
  totalChanges: number;
};

type ProductChangeRow = {
  product_id: string;
  product_name: string | null;
  change_type: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  sync_session_id: string | null;
};

function toProductChange(r: ProductChangeRow): ProductChange {
  return {
    productId: r.product_id,
    productName: r.product_name,
    changeType: r.change_type,
    fieldChanged: r.field_changed,
    oldValue: r.old_value,
    newValue: r.new_value,
    changedAt: Number(r.changed_at),
    syncSessionId: r.sync_session_id,
  };
}

async function getProductChanges(pool: DbPool, productId: string): Promise<ProductChange[]> {
  const { rows } = await pool.query<ProductChangeRow>(
    `SELECT pc.product_id, p.name AS product_name, pc.change_type,
            pc.field_changed, pc.old_value, pc.new_value,
            pc.changed_at, pc.sync_session_id
     FROM shared.product_changes pc
     LEFT JOIN shared.products p ON p.id = pc.product_id
     WHERE pc.product_id = $1
     ORDER BY pc.changed_at DESC`,
    [productId],
  );
  return rows.map(toProductChange);
}

async function getRecentProductChanges(pool: DbPool, days: number, limit: number): Promise<ProductChange[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const { rows } = await pool.query<ProductChangeRow>(
    `SELECT pc.product_id, p.name AS product_name, pc.change_type,
            pc.field_changed, pc.old_value, pc.new_value,
            pc.changed_at, pc.sync_session_id
     FROM shared.product_changes pc
     LEFT JOIN shared.products p ON p.id = pc.product_id
     WHERE pc.changed_at >= $1
     ORDER BY pc.changed_at DESC
     LIMIT $2`,
    [cutoff, limit],
  );
  return rows.map(toProductChange);
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
  const stats = { created: 0, updated: 0, deleted: 0 };
  for (const row of rows) {
    if (row.change_type === 'created') stats.created = row.count;
    else if (row.change_type === 'updated') stats.updated = row.count;
    else if (row.change_type === 'deleted') stats.deleted = row.count;
  }
  return { ...stats, totalChanges: stats.created + stats.updated + stats.deleted };
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

type ProductWithoutVatRow = {
  id: string;
  name: string;
  price: number | null;
  vat: number | null;
  group_code: string | null;
};

async function getProductsWithoutVat(pool: DbPool, limit: number): Promise<ProductWithoutVatRow[]> {
  const { rows } = await pool.query<ProductWithoutVatRow>(
    `SELECT id, name, price, vat, group_code
     FROM shared.products
     WHERE deleted_at IS NULL AND vat IS NULL
     ORDER BY name ASC
     LIMIT $1`,
    [limit],
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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBaseCode(productId: string): string {
  return productId.replace(/[KRkr]$/, '');
}

async function findSiblingVariants(
  pool: DbPool,
  productId: string,
): Promise<ProductRow[]> {
  const baseCode = extractBaseCode(productId);
  const { rows } = await pool.query<ProductRow>(
    `SELECT * FROM shared.products
     WHERE id ~ $1 AND deleted_at IS NULL`,
    [`^${escapeRegex(baseCode)}[KRkr]?$`],
  );
  return rows;
}

async function updateProductVat(
  pool: DbPool,
  productId: string,
  vat: number,
  vatSource: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE shared.products SET
       vat = $2,
       vat_source = $3,
       vat_updated_at = NOW(),
       updated_at = NOW()
     WHERE id = $1`,
    [productId, vat, vatSource],
  );
  return (rowCount ?? 0) > 0;
}

type FuzzySearchResult = {
  product: ProductRow;
  confidence: number;
  matchReason: 'exact' | 'normalized' | 'fuzzy';
};

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function calculateSimilarity(query: string, target: string): number {
  if (query === target) return 1.0;

  const normalizeCode = (str: string) => str.replace(/[.\s-]/g, '').toLowerCase();
  const normalizedQuery = normalizeCode(query);
  const normalizedTarget = normalizeCode(target);

  if (normalizedQuery === normalizedTarget) return 0.98;

  if (normalizedTarget.includes(normalizedQuery)) {
    const ratio = normalizedQuery.length / normalizedTarget.length;
    return 0.7 + ratio * 0.28;
  }
  if (normalizedQuery.includes(normalizedTarget)) {
    const ratio = normalizedTarget.length / normalizedQuery.length;
    return 0.7 + ratio * 0.28;
  }

  const distance = levenshteinDistance(normalizedQuery, normalizedTarget);
  const maxLen = Math.max(normalizedQuery.length, normalizedTarget.length);
  return maxLen === 0 ? 0 : 1 - distance / maxLen;
}

async function fuzzySearchProducts(
  pool: DbPool,
  query: string,
  limit: number = 5,
): Promise<FuzzySearchResult[]> {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return [];

  const { rows: allProducts } = await pool.query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
     FROM shared.products
     WHERE deleted_at IS NULL
     ORDER BY name ASC`,
  );

  return allProducts
    .map((product) => {
      const nameScore = calculateSimilarity(normalizedQuery, product.name.toLowerCase());
      const idScore = calculateSimilarity(normalizedQuery, product.id.toLowerCase());
      const confidence = Math.max(nameScore, idScore);
      const matchReason: FuzzySearchResult['matchReason'] =
        confidence >= 0.95 ? 'exact' : confidence >= 0.7 ? 'normalized' : 'fuzzy';
      return { product, confidence, matchReason };
    })
    .filter((r) => r.confidence > 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

async function getDistinctProductNames(
  pool: DbPool, searchQuery?: string, limit: number = 100,
): Promise<string[]> {
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (searchQuery) {
    const normalized = searchQuery.replace(/[.\s-]/g, '').toLowerCase();
    const pattern = `%${normalized}%`;
    conditions.push(
      `(LOWER(REPLACE(REPLACE(REPLACE(name, '.', ''), ' ', ''), '-', '')) LIKE $${paramIndex}
       OR LOWER(REPLACE(REPLACE(REPLACE(id, '.', ''), ' ', ''), '-', '')) LIKE $${paramIndex + 1}
       OR LOWER(REPLACE(REPLACE(REPLACE(search_name, '.', ''), ' ', ''), '-', '')) LIKE $${paramIndex + 2})`,
    );
    params.push(pattern, pattern, pattern);
    paramIndex += 3;
  }

  params.push(limit);

  const { rows } = await pool.query<{ name: string }>(
    `SELECT DISTINCT name FROM shared.products
     WHERE ${conditions.join(' AND ')}
     ORDER BY name ASC
     LIMIT $${paramIndex}`,
    params,
  );

  return rows.map((r) => r.name);
}

async function getDistinctProductNamesCount(
  pool: DbPool, searchQuery?: string,
): Promise<number> {
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (searchQuery) {
    const normalized = searchQuery.replace(/[.\s-]/g, '').toLowerCase();
    const pattern = `%${normalized}%`;
    conditions.push(
      `(LOWER(REPLACE(REPLACE(REPLACE(name, '.', ''), ' ', ''), '-', '')) LIKE $${paramIndex}
       OR LOWER(REPLACE(REPLACE(REPLACE(id, '.', ''), ' ', ''), '-', '')) LIKE $${paramIndex + 1}
       OR LOWER(REPLACE(REPLACE(REPLACE(search_name, '.', ''), ' ', ''), '-', '')) LIKE $${paramIndex + 2})`,
    );
    params.push(pattern, pattern, pattern);
  }

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT name) as count FROM shared.products
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  return parseInt(rows[0].count, 10);
}

async function getVariantPackages(
  pool: DbPool, articleName: string,
): Promise<string[]> {
  const { rows } = await pool.query<{ package_content: string }>(
    `SELECT DISTINCT package_content FROM shared.products
     WHERE name = $1 AND deleted_at IS NULL AND package_content IS NOT NULL`,
    [articleName],
  );

  return rows.map((r) => r.package_content);
}

async function getProductPricesByNames(
  pool: DbPool,
  names: string[],
): Promise<Map<string, { price: number; vat: number } | null>> {
  if (names.length === 0) return new Map();
  const { rows } = await pool.query<{ name: string; price: number | null; vat: number | null }>(
    `SELECT name, price, vat FROM shared.products
     WHERE name = ANY($1::text[]) AND deleted_at IS NULL`,
    [names],
  );
  const result = new Map<string, { price: number; vat: number } | null>(names.map((n) => [n, null]));
  for (const row of rows) {
    if (row.price !== null) {
      result.set(row.name, { price: row.price, vat: row.vat ?? 22 });
    }
  }
  return result;
}

async function getVariantPriceRange(
  pool: DbPool, articleName: string,
): Promise<{ min: number | null; max: number | null }> {
  const { rows } = await pool.query<{ min: number | null; max: number | null }>(
    `SELECT MIN(price) as min, MAX(price) as max FROM shared.products
     WHERE name = $1 AND deleted_at IS NULL AND price IS NOT NULL AND price > 0`,
    [articleName],
  );

  return { min: rows[0]?.min ?? null, max: rows[0]?.max ?? null };
}

export {
  getProducts,
  getProductById,
  getProductCount,
  getZeroPriceCount,
  getNoVatCount,
  getMissingFresisDiscountCount,
  getProductVariants,
  getProductsWithoutVat,
  upsertProducts,
  findDeletedProducts,
  softDeleteProducts,
  trackProductCreated,
  updateProductPrice,
  getLastSyncTime,
  getAllProducts,
  getAllProductVariants,
  getProductChanges,
  getRecentProductChanges,
  getProductChangeStats,
  extractBaseCode,
  findSiblingVariants,
  updateProductVat,
  fuzzySearchProducts,
  calculateSimilarity,
  levenshteinDistance,
  getDistinctProductNames,
  getDistinctProductNamesCount,
  getVariantPackages,
  getVariantPriceRange,
  getProductPricesByNames,
  type ProductRow,
  type ProductWithoutVatRow,
  type ProductUpsertInput,
  type UpsertResult,
  type VariantRow,
  type ProductChange,
  type ProductChangeStats,
};
