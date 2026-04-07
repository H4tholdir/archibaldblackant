import type { DbPool } from '../pool';

type ProductDetailsRow = {
  product_id:           string
  clinical_indications: string | null
  usage_notes:          string | null
  performance_data:     unknown | null
  video_url:            string | null
  pdf_url:              string | null
  source_url:           string | null
  scraped_at:           Date | null
  catalog_enriched_at:  Date | null
  web_enriched_at:      Date | null
  updated_at:           Date
};

async function getProductDetails(pool: DbPool, productId: string): Promise<ProductDetailsRow | null> {
  const { rows } = await pool.query<ProductDetailsRow>(
    `SELECT product_id, clinical_indications, usage_notes, performance_data,
            video_url, pdf_url, source_url, scraped_at,
            catalog_enriched_at, web_enriched_at, updated_at
       FROM shared.product_details
      WHERE product_id = $1`,
    [productId],
  );
  return rows[0] ?? null;
}

export { getProductDetails };
export type { ProductDetailsRow };
