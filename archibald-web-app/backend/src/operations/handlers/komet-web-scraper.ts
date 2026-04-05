import fs from 'fs';
import path from 'path';
import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { insertGalleryImage } from '../../db/repositories/product-gallery';
import { logger } from '../../logger';

type KometWebScraperDeps = {
  pool:       DbPool;
  assetsDir?: string;
  fetchFn?:   typeof fetch;
};

const KOMET_USER_AGENT = 'Mozilla/5.0 (compatible; ArchibaldBot/1.0)';
const RATE_LIMIT_MS    = 500;

function buildKometImageUrl(productId: string): string | null {
  const parts = productId.split('.');
  if (parts.length !== 3) return null;
  const [family, shank, size] = parts;
  return `https://www.kometdental.com/uploads/03di_${family}_${shank}_${size}_450.png`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createKometWebScraperHandler(deps: KometWebScraperDeps): OperationHandler {
  const { pool } = deps;
  const assetsDir = deps.assetsDir ?? '/app/assets/product-images';
  const fetchFn   = deps.fetchFn ?? fetch;

  return async (_context, _data, _userId, onProgress) => {
    onProgress(0, 'Caricamento lista prodotti...');

    const { rows: products } = await pool.query<{ id: string }>(
      `SELECT id FROM shared.products WHERE id LIKE '%.%.%' ORDER BY id`,
    );

    let downloaded = 0;
    let skipped    = 0;
    let errors     = 0;
    const total    = products.length;

    for (let i = 0; i < products.length; i++) {
      const productId = products[i]!.id;
      const imageUrl  = buildKometImageUrl(productId);
      if (!imageUrl) { skipped++; continue; }

      try {
        const headRes = await fetchFn(imageUrl, {
          method:  'HEAD',
          headers: { 'User-Agent': KOMET_USER_AGENT },
        });

        if (headRes.status === 404) { skipped++; await sleep(RATE_LIMIT_MS); continue; }
        if (headRes.status === 403 || headRes.status === 429) {
          logger.warn('[komet-web-scraper] Rate limited by kometdental.com, stopping', { status: headRes.status });
          break;
        }
        if (!headRes.ok) { skipped++; await sleep(RATE_LIMIT_MS); continue; }

        const imgRes = await fetchFn(imageUrl, {
          headers: { 'User-Agent': KOMET_USER_AGENT },
        });
        if (!imgRes.ok) { skipped++; await sleep(RATE_LIMIT_MS); continue; }

        const buffer   = Buffer.from(await imgRes.arrayBuffer());
        const localDir = path.join(assetsDir, productId.replace(/\./g, '/'));
        fs.mkdirSync(localDir, { recursive: true });
        const localPath = path.join(localDir, 'white_bg.png');
        fs.writeFileSync(localPath, buffer);

        await insertGalleryImage(pool, {
          product_id: productId,
          image_url:  imageUrl,
          local_path: localPath,
          image_type: 'instrument_white_bg',
          source:     'kometdental.com',
          file_size:  buffer.length,
        });

        downloaded++;
      } catch (err) {
        logger.warn('[komet-web-scraper] Error for product', { productId, error: err });
        errors++;
      }

      if (i % 20 === 0) {
        onProgress(Math.floor((i / total) * 100), `${i}/${total} prodotti elaborati`);
      }
      await sleep(RATE_LIMIT_MS);
    }

    return { downloaded, skipped, errors, total };
  };
}

export { createKometWebScraperHandler, buildKometImageUrl };
