import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { syncPrices } from '../../sync/services/price-sync';
import type { ParsedPrice as SyncParsedPrice } from '../../sync/services/price-sync';

type SyncPricesFactoryDeps = {
  pool: DbPool;
  parsePdf: (pdfPath: string) => Promise<Array<Record<string, unknown>>>;
  cleanupFile: (filePath: string) => Promise<void>;
};

function mapPrice(raw: Record<string, unknown>): SyncParsedPrice {
  return {
    productId: String(raw.product_id ?? ''),
    productName: String(raw.product_name ?? ''),
    unitPrice: Number(raw.unit_price ?? 0),
    itemSelection: raw.item_selection != null ? String(raw.item_selection) : undefined,
    packagingDescription: raw.packaging_description != null ? String(raw.packaging_description) : undefined,
    currency: raw.currency != null ? String(raw.currency) : undefined,
    priceValidFrom: raw.price_valid_from != null ? String(raw.price_valid_from) : undefined,
    priceValidTo: raw.price_valid_to != null ? String(raw.price_valid_to) : undefined,
    priceUnit: raw.price_unit != null ? String(raw.price_unit) : undefined,
    accountDescription: raw.account_description != null ? String(raw.account_description) : undefined,
    accountCode: raw.account_code != null ? String(raw.account_code) : undefined,
    priceQtyFrom: raw.price_qty_from != null ? Number(raw.price_qty_from) : undefined,
    priceQtyTo: raw.price_qty_to != null ? Number(raw.price_qty_to) : undefined,
    lastModified: raw.last_modified != null ? String(raw.last_modified) : undefined,
    dataAreaId: raw.data_area_id != null ? String(raw.data_area_id) : undefined,
  };
}

function createSyncPricesHandler(
  deps: SyncPricesFactoryDeps,
  createBot: (userId: string) => { downloadPricesPDF: (ctx: unknown) => Promise<string> },
): OperationHandler {
  return async (context, _data, _userId, onProgress, signal) => {
    let stopped = false;
    signal?.addEventListener('abort', () => { stopped = true; }, { once: true });
    const bot = createBot('service-account');
    const result = await syncPrices(
      {
        pool: deps.pool,
        downloadPdf: () => bot.downloadPricesPDF(context),
        parsePdf: async (pdfPath) => {
          const raw = await deps.parsePdf(pdfPath);
          return raw.map(mapPrice);
        },
        cleanupFile: deps.cleanupFile,
      },
      onProgress,
      () => stopped,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncPricesHandler };
