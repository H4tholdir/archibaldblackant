import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { logger } from '../../logger';

type FetchUrlFn = (url: string) => Promise<{ html: string; finalUrl: string }>;
type SearchWebFn = (query: string) => Promise<Array<{ url: string; title: string; snippet: string }>>;

type WebProductEnrichmentDeps = {
  pool: DbPool;
  fetchUrl: FetchUrlFn;
  searchWeb: SearchWebFn;
};

type ProductInfoRow = {
  name: string;
  catalog_family_code: string | null;
  description_en: string | null;
  web_enriched_at: Date | null;
};

type WebResource = {
  resource_type: 'video' | 'pdf' | 'article';
  url: string;
  title: string;
  snippet: string;
};

type GalleryImage = {
  url: string;
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

function classifyResource(url: string, title: string): 'video' | 'pdf' | 'article' {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'video';
  if (url.endsWith('.pdf') || title.includes('IFU') || title.includes('instructions')) return 'pdf';
  return 'article';
}

function parseKometUkImages(html: string): GalleryImage[] {
  const images: GalleryImage[] = [];
  const imgRegex = /<img[^>]+>/gi;
  const srcRegex = /src=["']([^"']+)["']/i;
  const classRegex = /class=["']([^"']*)["']/i;
  const dataRegex = /data-product-photo/i;

  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const classMatch = classRegex.exec(tag);
    const hasProductPhotoClass = classMatch ? classMatch[1].includes('product-single__photo') : false;
    const hasDataAttr = dataRegex.test(tag);

    if (hasProductPhotoClass || hasDataAttr) {
      const srcMatch = srcRegex.exec(tag);
      if (srcMatch) {
        images.push({ url: srcMatch[1] });
      }
    }
  }

  return images;
}

async function scrapeKometUk(fetchUrl: FetchUrlFn, familyCode: string): Promise<GalleryImage[]> {
  const handle = familyCode.toLowerCase();
  const url = `https://kometuk.com/products/${handle}`;
  try {
    const { html } = await fetchUrl(url);
    return parseKometUkImages(html);
  } catch (err) {
    logger.warn('[web-product-enrichment] Komet UK scrape failed', { familyCode, url, err });
    return [];
  }
}

async function runWebSearches(
  searchWeb: SearchWebFn,
  familyCode: string,
): Promise<WebResource[]> {
  const queries = [
    `"${familyCode} Komet" dental technique OR clinical indication`,
    `"${familyCode} Komet" video tutorial youtube`,
    `"${familyCode} Komet" IFU instructions pdf`,
  ];

  const results = await Promise.allSettled(queries.map((q) => searchWeb(q)));

  const resources: WebResource[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        resources.push({
          resource_type: classifyResource(item.url, item.title),
          url: item.url,
          title: item.title,
          snippet: item.snippet,
        });
      }
    }
  }

  return resources;
}

function createWebProductEnrichmentHandler(deps: WebProductEnrichmentDeps): OperationHandler {
  return async (_context, data, _userId, _onProgress) => {
    const { pool, fetchUrl, searchWeb } = deps;

    const productId = typeof data.productId === 'string' ? data.productId : null;
    if (!productId) {
      logger.warn('[web-product-enrichment] No productId in job data');
      return { scraped: 0, resourcesFound: 0 };
    }

    const { rows } = await pool.query<ProductInfoRow>(
      `SELECT p.name, pd.catalog_family_code, pd.description_en, pd.web_enriched_at
       FROM shared.products p
       LEFT JOIN shared.product_details pd ON pd.product_id = p.id
       WHERE p.id = $1`,
      [productId],
    );

    const row = rows[0];
    if (!row) {
      logger.warn('[web-product-enrichment] Product not found', { productId });
      return { scraped: 0, resourcesFound: 0 };
    }

    const familyCode = row.catalog_family_code ?? productId.split('.')[0];

    const [images, webResources] = await Promise.all([
      scrapeKometUk(fetchUrl, familyCode),
      runWebSearches(searchWeb, familyCode),
    ]);

    let resourcesFound = 0;
    for (const resource of webResources) {
      const result = await pool.query(
        `INSERT INTO shared.product_web_resources
           (product_id, resource_type, url, title, description, source, language)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (product_id, url) DO NOTHING`,
        [
          productId,
          resource.resource_type,
          resource.url,
          resource.title,
          resource.snippet,
          extractDomain(resource.url),
          'en',
        ],
      );
      resourcesFound += result.rowCount ?? 0;
    }

    let scraped = 0;
    for (let i = 0; i < images.length; i++) {
      const result = await pool.query(
        `INSERT INTO shared.product_gallery
           (product_id, url, image_type, source, sort_order)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (product_id, url) DO NOTHING`,
        [productId, images[i].url, 'web', 'kometuk', i],
      );
      scraped += result.rowCount ?? 0;
    }

    await pool.query(
      `INSERT INTO shared.product_details (product_id, web_enriched_at)
       VALUES ($1, NOW())
       ON CONFLICT (product_id) DO UPDATE SET web_enriched_at=NOW(), updated_at=NOW()`,
      [productId],
    );

    return { scraped, resourcesFound };
  };
}

export {
  createWebProductEnrichmentHandler,
  type WebProductEnrichmentDeps,
  type FetchUrlFn,
  type SearchWebFn,
};
