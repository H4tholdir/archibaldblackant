import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { syncProducts } from '../../sync/services/product-sync';
import type { ParsedProduct as SyncParsedProduct } from '../../sync/services/product-sync';

type SyncProductsFactoryDeps = {
  pool: DbPool;
  parsePdf: (pdfPath: string) => Promise<Array<Record<string, unknown>>>;
  cleanupFile: (filePath: string) => Promise<void>;
};

function mapProduct(raw: Record<string, unknown>): SyncParsedProduct {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    searchName: raw.search_name != null ? String(raw.search_name) : undefined,
    groupCode: raw.group_code != null ? String(raw.group_code) : undefined,
    packageContent: raw.package_content != null ? Number(raw.package_content) : undefined,
    description: raw.description != null ? String(raw.description) : undefined,
    priceUnit: raw.price_unit != null ? String(raw.price_unit) : undefined,
    productGroupId: raw.product_group_id != null ? String(raw.product_group_id) : undefined,
    minQty: raw.min_qty != null ? Number(raw.min_qty) : undefined,
    multipleQty: raw.multiple_qty != null ? Number(raw.multiple_qty) : undefined,
    maxQty: raw.max_qty != null ? Number(raw.max_qty) : undefined,
    figure: raw.figure != null ? String(raw.figure) : undefined,
    bulkArticleId: raw.bulk_article_id != null ? String(raw.bulk_article_id) : undefined,
    legPackage: raw.leg_package != null ? String(raw.leg_package) : undefined,
    size: raw.size != null ? String(raw.size) : undefined,
    vat: raw.vat != null ? Number(raw.vat) : undefined,
  };
}

function createSyncProductsHandler(
  deps: SyncProductsFactoryDeps,
  createBot: (userId: string) => { ensureReadyWithContext: (ctx: unknown) => Promise<void>; downloadProductsPDF: (ctx: unknown) => Promise<string> },
): OperationHandler {
  return async (context, _data, _userId, onProgress, signal) => {
    let stopped = false;
    signal?.addEventListener('abort', () => { stopped = true; }, { once: true });
    const bot = createBot('service-account');
    await bot.ensureReadyWithContext(context);
    const result = await syncProducts(
      {
        pool: deps.pool,
        downloadPdf: () => bot.downloadProductsPDF(context),
        parsePdf: async (pdfPath) => {
          const raw = await deps.parsePdf(pdfPath);
          return raw.map(mapProduct);
        },
        cleanupFile: deps.cleanupFile,
      },
      onProgress,
      () => stopped,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncProductsHandler };
