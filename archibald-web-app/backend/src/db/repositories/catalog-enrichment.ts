import type { DbPool } from '../pool';

type EnrichmentStats = {
  totalCatalogEntries:    number
  totalProductDetails:    number
  pendingCatalogEnrichment: number
  pendingWebEnrichment:   number
  lastIngestedPage:       number | null
  visualIndexCount:       number
};

async function getEnrichmentStats(pool: DbPool): Promise<EnrichmentStats> {
  const [entriesResult, detailsResult, pendingCatalogResult, pendingWebResult, lastPageResult, visualIndexResult] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM shared.catalog_entries'),
    pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM shared.product_details'),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM shared.products p
       LEFT JOIN shared.product_details pd ON pd.product_id = p.id
       WHERE pd.catalog_enriched_at IS NULL AND p.deleted_at IS NULL`,
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM shared.products p
       LEFT JOIN shared.product_details pd ON pd.product_id = p.id
       WHERE pd.web_enriched_at IS NULL AND p.deleted_at IS NULL`,
    ),
    pool.query<{ last_page: number | null }>('SELECT MAX(catalog_page) AS last_page FROM shared.catalog_entries'),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM shared.catalog_family_images WHERE visual_embedding IS NOT NULL`,
    ).catch(() => ({ rows: [{ count: '0' }] })),
  ]);

  return {
    totalCatalogEntries:      parseInt(entriesResult.rows[0]?.count ?? '0', 10),
    totalProductDetails:      parseInt(detailsResult.rows[0]?.count ?? '0', 10),
    pendingCatalogEnrichment: parseInt(pendingCatalogResult.rows[0]?.count ?? '0', 10),
    pendingWebEnrichment:     parseInt(pendingWebResult.rows[0]?.count ?? '0', 10),
    lastIngestedPage:         lastPageResult.rows[0]?.last_page ?? null,
    visualIndexCount:         parseInt(visualIndexResult.rows[0]?.count ?? '0', 10),
  };
}

export { getEnrichmentStats };
export type { EnrichmentStats };
