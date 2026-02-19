import type { DbPool } from '../../db/pool';
import { SyncStoppedError } from './customer-sync';

type ParsedPrice = {
  productId: string;
  productName: string;
  unitPrice: number;
  itemSelection?: string;
  packagingDescription?: string;
  currency?: string;
  priceValidFrom?: string;
  priceValidTo?: string;
  priceUnit?: string;
  accountDescription?: string;
  accountCode?: string;
  priceQtyFrom?: number;
  priceQtyTo?: number;
  lastModified?: string;
  dataAreaId?: string;
};

type PriceSyncDeps = {
  pool: DbPool;
  downloadPdf: (userId: string) => Promise<string>;
  parsePdf: (pdfPath: string) => Promise<ParsedPrice[]>;
  cleanupFile: (filePath: string) => Promise<void>;
};

type PriceSyncResult = {
  success: boolean;
  pricesProcessed: number;
  pricesInserted: number;
  pricesUpdated: number;
  pricesSkipped: number;
  duration: number;
  error?: string;
};

async function syncPrices(
  deps: PriceSyncDeps,
  onProgress: (progress: number, label?: string) => void,
  shouldStop: () => boolean,
): Promise<PriceSyncResult> {
  const { pool, downloadPdf, parsePdf, cleanupFile } = deps;
  const startTime = Date.now();
  let pdfPath: string | null = null;

  try {
    if (shouldStop()) throw new SyncStoppedError('start');

    onProgress(5, 'Download PDF prezzi');
    pdfPath = await downloadPdf('service-account');

    if (shouldStop()) throw new SyncStoppedError('download');

    onProgress(20, 'Lettura PDF prezzi');
    const prices = await parsePdf(pdfPath);

    if (shouldStop()) throw new SyncStoppedError('parse');

    onProgress(40, `Aggiornamento ${prices.length} prezzi`);

    let pricesInserted = 0;
    let pricesUpdated = 0;
    let pricesSkipped = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const p of prices) {
      const hash = require('crypto').createHash('md5')
        .update([p.productId, p.unitPrice, p.priceValidFrom, p.priceValidTo, p.priceQtyFrom, p.priceQtyTo].join('|'))
        .digest('hex');

      const { rows: [existing] } = await pool.query<{ hash: string }>(
        'SELECT hash FROM shared.prices WHERE product_id = $1 AND price_valid_from = $2 AND COALESCE(price_qty_from, 0) = $3',
        [p.productId, p.priceValidFrom ?? null, p.priceQtyFrom ?? 0],
      );

      if (!existing) {
        await pool.query(
          `INSERT INTO shared.prices (
            product_id, product_name, unit_price, item_selection,
            packaging_description, currency, price_valid_from, price_valid_to,
            price_unit, account_description, account_code,
            price_qty_from, price_qty_to, last_modified, data_area_id,
            hash, last_sync
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            p.productId, p.productName, p.unitPrice, p.itemSelection ?? null,
            p.packagingDescription ?? null, p.currency ?? null, p.priceValidFrom ?? null, p.priceValidTo ?? null,
            p.priceUnit ?? null, p.accountDescription ?? null, p.accountCode ?? null,
            p.priceQtyFrom ?? null, p.priceQtyTo ?? null, p.lastModified ?? null, p.dataAreaId ?? null,
            hash, now,
          ],
        );
        pricesInserted++;
      } else if (existing.hash !== hash) {
        await pool.query(
          `UPDATE shared.prices SET
            product_name=$2, unit_price=$3, item_selection=$4,
            packaging_description=$5, currency=$6, price_valid_to=$7,
            price_unit=$8, account_description=$9, account_code=$10,
            price_qty_to=$11, last_modified=$12, data_area_id=$13,
            hash=$14, last_sync=$15
          WHERE product_id=$1 AND price_valid_from=$16 AND COALESCE(price_qty_from, 0) = $17`,
          [
            p.productId, p.productName, p.unitPrice, p.itemSelection ?? null,
            p.packagingDescription ?? null, p.currency ?? null, p.priceValidTo ?? null,
            p.priceUnit ?? null, p.accountDescription ?? null, p.accountCode ?? null,
            p.priceQtyTo ?? null, p.lastModified ?? null, p.dataAreaId ?? null,
            hash, now,
            p.priceValidFrom ?? null, p.priceQtyFrom ?? 0,
          ],
        );
        pricesUpdated++;
      } else {
        pricesSkipped++;
      }
    }

    onProgress(100, 'Sincronizzazione prezzi completata');

    return { success: true, pricesProcessed: prices.length, pricesInserted, pricesUpdated, pricesSkipped, duration: Date.now() - startTime };
  } catch (error) {
    return {
      success: false, pricesProcessed: 0, pricesInserted: 0, pricesUpdated: 0, pricesSkipped: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (pdfPath) await cleanupFile(pdfPath);
  }
}

export { syncPrices, type PriceSyncDeps, type PriceSyncResult, type ParsedPrice };
