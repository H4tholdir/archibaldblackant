import type { DbPool } from '../../db/pool';
import { SyncStoppedError } from './customer-sync';

type ParsedProduct = {
  id: string;
  name: string;
  searchName?: string;
  groupCode?: string;
  packageContent?: number;
  description?: string;
  priceUnit?: string;
  productGroupId?: string;
  minQty?: number;
  multipleQty?: number;
  maxQty?: number;
  figure?: string;
  bulkArticleId?: string;
  legPackage?: string;
  size?: string;
  vat?: number;
};

type ProductSyncDeps = {
  pool: DbPool;
  downloadPdf: (userId: string) => Promise<string>;
  parsePdf: (pdfPath: string) => Promise<ParsedProduct[]>;
  cleanupFile: (filePath: string) => Promise<void>;
};

type ProductSyncResult = {
  success: boolean;
  productsProcessed: number;
  newProducts: number;
  updatedProducts: number;
  duration: number;
  error?: string;
};

async function syncProducts(
  deps: ProductSyncDeps,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
): Promise<ProductSyncResult> {
  const { pool, downloadPdf, parsePdf, cleanupFile } = deps;
  const startTime = Date.now();
  let pdfPath: string | null = null;

  try {
    if (shouldStop()) throw new SyncStoppedError('start');

    onProgress(5, 'Download PDF prodotti');
    pdfPath = await downloadPdf('service-account');

    if (shouldStop()) throw new SyncStoppedError('download');

    onProgress(20, 'Lettura PDF prodotti');
    const products = await parsePdf(pdfPath);

    if (shouldStop()) throw new SyncStoppedError('parse');

    onProgress(40, `Aggiornamento ${products.length} prodotti`);

    let newProducts = 0;
    let updatedProducts = 0;
    const now = Math.floor(Date.now() / 1000);

    let loopIndex = 0;
    for (const p of products) {
      if (loopIndex > 0 && loopIndex % 10 === 0 && shouldStop()) {
        throw new SyncStoppedError('db-loop');
      }
      loopIndex++;

      const { rows: [existing] } = await pool.query<{ id: string }>(
        'SELECT id FROM shared.products WHERE id = $1',
        [p.id],
      );

      if (!existing) {
        await pool.query(
          `INSERT INTO shared.products (
            id, name, search_name, group_code, package_content,
            description, price_unit, product_group_id,
            min_qty, multiple_qty, max_qty, figure,
            bulk_article_id, leg_package, size, vat, last_sync
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            p.id, p.name, p.searchName ?? null, p.groupCode ?? null, p.packageContent ?? null,
            p.description ?? null, p.priceUnit ?? null, p.productGroupId ?? null,
            p.minQty ?? null, p.multipleQty ?? null, p.maxQty ?? null, p.figure ?? null,
            p.bulkArticleId ?? null, p.legPackage ?? null, p.size ?? null, p.vat ?? null, now,
          ],
        );
        newProducts++;
      } else {
        await pool.query(
          `UPDATE shared.products SET
            name=$2, search_name=$3, group_code=$4, package_content=$5,
            description=$6, price_unit=$7, product_group_id=$8,
            min_qty=$9, multiple_qty=$10, max_qty=$11, figure=$12,
            bulk_article_id=$13, leg_package=$14, size=$15, vat=$16, last_sync=$17
          WHERE id=$1`,
          [
            p.id, p.name, p.searchName ?? null, p.groupCode ?? null, p.packageContent ?? null,
            p.description ?? null, p.priceUnit ?? null, p.productGroupId ?? null,
            p.minQty ?? null, p.multipleQty ?? null, p.maxQty ?? null, p.figure ?? null,
            p.bulkArticleId ?? null, p.legPackage ?? null, p.size ?? null, p.vat ?? null, now,
          ],
        );
        updatedProducts++;
      }
    }

    onProgress(100, 'Sincronizzazione prodotti completata');

    return { success: true, productsProcessed: products.length, newProducts, updatedProducts, duration: Date.now() - startTime };
  } catch (error) {
    return {
      success: false, productsProcessed: 0, newProducts: 0, updatedProducts: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (pdfPath) await cleanupFile(pdfPath);
  }
}

export { syncProducts, type ProductSyncDeps, type ProductSyncResult, type ParsedProduct };
