import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { logger } from '../../logger';

type CatalogProductEnrichmentDeps = {
  pool: DbPool;
};

type CatalogEntryRow = {
  catalog_page: number;
  clinical_indications: string | null;
  rpm_max: number | null;
  usage_notes: string | null;
  pictograms: unknown;
  packaging_info: { units_per_pack?: number; sterile?: boolean; single_use?: boolean } | null;
  notes: string | null;
};

function extractFamilyCode(productId: string): string {
  const dotIndex = productId.indexOf('.');
  if (dotIndex <= 0) return productId;
  return productId.slice(0, dotIndex);
}

async function enrichProduct(pool: DbPool, productId: string): Promise<'enriched' | 'not_found'> {
  const familyCode = extractFamilyCode(productId);

  const { rows } = await pool.query<CatalogEntryRow>(
    `SELECT catalog_page,
            clinical_indications, rpm_max, usage_notes, pictograms, packaging_info, notes
     FROM shared.catalog_entries
     WHERE family_codes @> ARRAY[$1]
     LIMIT 1`,
    [familyCode],
  );

  const entry = rows[0];
  if (!entry) {
    logger.warn('[catalog-product-enrichment] No catalog entry found', { productId, familyCode });
    return 'not_found';
  }

  const packagingInfo = entry.packaging_info;
  const packagingUnits = packagingInfo?.units_per_pack ?? null;
  const sterile = packagingInfo?.sterile ?? null;
  const singleUse = packagingInfo?.single_use ?? null;

  await pool.query(
    `INSERT INTO shared.product_details
       (product_id, catalog_family_code, catalog_page,
        clinical_indications, rpm_max, usage_notes,
        pictograms, packaging_units, sterile, single_use, notes, catalog_enriched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
     ON CONFLICT (product_id) DO UPDATE SET
       catalog_family_code=EXCLUDED.catalog_family_code,
       catalog_page=EXCLUDED.catalog_page,
       clinical_indications=EXCLUDED.clinical_indications,
       rpm_max=EXCLUDED.rpm_max,
       usage_notes=EXCLUDED.usage_notes,
       pictograms=EXCLUDED.pictograms,
       packaging_units=EXCLUDED.packaging_units,
       sterile=EXCLUDED.sterile,
       single_use=EXCLUDED.single_use,
       notes=EXCLUDED.notes,
       catalog_enriched_at=NOW(),
       updated_at=NOW()`,
    [
      productId,
      familyCode,
      entry.catalog_page,
      entry.clinical_indications ?? null,
      entry.rpm_max ?? null,
      entry.usage_notes ?? null,
      entry.pictograms ?? null,
      packagingUnits,
      sterile,
      singleUse,
      entry.notes ?? null,
    ],
  );

  return 'enriched';
}

function createCatalogProductEnrichmentHandler(deps: CatalogProductEnrichmentDeps): OperationHandler {
  return async (_context, data, _userId, onProgress) => {
    const { pool } = deps;
    const productId = typeof data.productId === 'string' ? data.productId : null;

    if (productId !== null) {
      onProgress(0, `Enriching product ${productId}`);
      const outcome = await enrichProduct(pool, productId);
      onProgress(100, 'Done');
      return outcome === 'enriched'
        ? { enriched: 1, notFound: 0 }
        : { enriched: 0, notFound: 1 };
    }

    const { rows: products } = await pool.query<{ id: string }>(
      `SELECT p.id FROM shared.products p
       LEFT JOIN shared.product_details pd ON pd.product_id = p.id
       WHERE pd.catalog_enriched_at IS NULL AND p.deleted_at IS NULL`,
    );

    let enriched = 0;
    let notFound = 0;

    for (let i = 0; i < products.length; i++) {
      const outcome = await enrichProduct(pool, products[i].id);
      if (outcome === 'enriched') {
        enriched++;
      } else {
        notFound++;
      }
      if (i % 100 === 0 && i > 0) {
        onProgress(Math.round((i / products.length) * 100), `Enriched ${i}/${products.length}`);
      }
    }

    onProgress(100, 'Done');
    return { enriched, notFound };
  };
}

export { createCatalogProductEnrichmentHandler, type CatalogProductEnrichmentDeps };
