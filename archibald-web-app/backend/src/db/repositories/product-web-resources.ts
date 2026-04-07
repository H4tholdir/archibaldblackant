import type { DbPool } from '../pool';

type WebResourceRow = {
  resource_type: string;
  url:           string;
  title:         string | null;
};

async function getProductWebResources(pool: DbPool, productId: string): Promise<WebResourceRow[]> {
  const { rows } = await pool.query<WebResourceRow>(
    `SELECT resource_type, url, title
       FROM shared.product_web_resources
      WHERE product_id = $1`,
    [productId],
  );
  return rows;
}

export { getProductWebResources };
export type { WebResourceRow };
