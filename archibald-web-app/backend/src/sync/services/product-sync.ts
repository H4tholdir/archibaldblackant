import type { DbPool } from '../../db/pool';
import { SyncStoppedError } from './customer-sync';
import { copyFile } from 'node:fs/promises';

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
  productGroupDescription?: string;
  configurationId?: string;
  createdBy?: string;
  createdDateField?: string;
  dataAreaId?: string;
  defaultQty?: string;
  displayProductNumber?: string;
  totalAbsoluteDiscount?: string;
  productIdExt?: string;
  lineDiscount?: string;
  modifiedBy?: string;
  modifiedDatetime?: string;
  orderableArticle?: string;
  stopped?: string;
  purchPrice?: string;
  pcsStandardConfigurationId?: string;
  standardQty?: string;
  unitId?: string;
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
    await copyFile(pdfPath, '/app/data/debug-prodotti.pdf').catch(() => {});

    if (shouldStop()) throw new SyncStoppedError('download');

    onProgress(20, 'Lettura PDF prodotti');
    const products = await parsePdf(pdfPath);

    if (shouldStop()) throw new SyncStoppedError('parse');

    onProgress(40, `Aggiornamento ${products.length} prodotti`);

    let newProducts = 0;
    let updatedProducts = 0;
    const now = Math.floor(Date.now() / 1000);

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (i % 500 === 0 && i > 0) {
        const dbProgress = 40 + Math.round((i / products.length) * 55);
        onProgress(dbProgress, `Aggiornamento prodotti ${i}/${products.length}`);
      }
      const { rows: [existing] } = await pool.query<{ id: string }>(
        'SELECT id FROM shared.products WHERE id = $1',
        [p.id],
      );

      if (!existing) {
        await pool.query(
          `INSERT INTO shared.products (
            id, name, search_name, group_code, package_content,
            description, price_unit, product_group_id, product_group_description,
            min_qty, multiple_qty, max_qty, figure,
            bulk_article_id, leg_package, size, vat, last_sync,
            configuration_id, created_by, created_date_field, data_area_id,
            default_qty, display_product_number, total_absolute_discount, product_id_ext,
            line_discount, modified_by, modified_datetime, orderable_article,
            stopped, purch_price, pcs_standard_configuration_id, standard_qty, unit_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)`,
          [
            p.id, p.name, p.searchName ?? null, p.groupCode ?? null, p.packageContent ?? null,
            p.description ?? null, p.priceUnit ?? null, p.productGroupId ?? null, p.productGroupDescription ?? null,
            p.minQty ?? null, p.multipleQty ?? null, p.maxQty ?? null, p.figure ?? null,
            p.bulkArticleId ?? null, p.legPackage ?? null, p.size ?? null, p.vat ?? null, now,
            p.configurationId ?? null, p.createdBy ?? null, p.createdDateField ?? null, p.dataAreaId ?? null,
            p.defaultQty ?? null, p.displayProductNumber ?? null, p.totalAbsoluteDiscount ?? null, p.productIdExt ?? null,
            p.lineDiscount ?? null, p.modifiedBy ?? null, p.modifiedDatetime ?? null, p.orderableArticle ?? null,
            p.stopped ?? null, p.purchPrice ?? null, p.pcsStandardConfigurationId ?? null, p.standardQty ?? null, p.unitId ?? null,
          ],
        );
        newProducts++;
      } else {
        await pool.query(
          `UPDATE shared.products SET
            name=$2, search_name=$3, group_code=$4, package_content=$5,
            description=$6, price_unit=$7, product_group_id=$8, product_group_description=$9,
            min_qty=$10, multiple_qty=$11, max_qty=$12, figure=$13,
            bulk_article_id=$14, leg_package=$15, size=$16, last_sync=$17,
            configuration_id=$18, created_by=$19, created_date_field=$20, data_area_id=$21,
            default_qty=$22, display_product_number=$23, total_absolute_discount=$24, product_id_ext=$25,
            line_discount=$26, modified_by=$27, modified_datetime=$28, orderable_article=$29,
            stopped=$30, purch_price=$31, pcs_standard_configuration_id=$32, standard_qty=$33, unit_id=$34
          WHERE id=$1`,
          [
            p.id, p.name, p.searchName ?? null, p.groupCode ?? null, p.packageContent ?? null,
            p.description ?? null, p.priceUnit ?? null, p.productGroupId ?? null, p.productGroupDescription ?? null,
            p.minQty ?? null, p.multipleQty ?? null, p.maxQty ?? null, p.figure ?? null,
            p.bulkArticleId ?? null, p.legPackage ?? null, p.size ?? null, now,
            p.configurationId ?? null, p.createdBy ?? null, p.createdDateField ?? null, p.dataAreaId ?? null,
            p.defaultQty ?? null, p.displayProductNumber ?? null, p.totalAbsoluteDiscount ?? null, p.productIdExt ?? null,
            p.lineDiscount ?? null, p.modifiedBy ?? null, p.modifiedDatetime ?? null, p.orderableArticle ?? null,
            p.stopped ?? null, p.purchPrice ?? null, p.pcsStandardConfigurationId ?? null, p.standardQty ?? null, p.unitId ?? null,
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
