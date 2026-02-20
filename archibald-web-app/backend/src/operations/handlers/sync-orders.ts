import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { syncOrders } from '../../sync/services/order-sync';
import type { ParsedOrder as SyncParsedOrder } from '../../sync/services/order-sync';

type SyncOrdersFactoryDeps = {
  pool: DbPool;
  parsePdf: (pdfPath: string) => Promise<Array<Record<string, unknown>>>;
  cleanupFile: (filePath: string) => Promise<void>;
};

function mapOrder(raw: Record<string, unknown>): SyncParsedOrder {
  return {
    id: String(raw.id ?? ''),
    orderNumber: String(raw.order_number ?? ''),
    customerProfileId: raw.customer_profile_id != null ? String(raw.customer_profile_id) : undefined,
    customerName: String(raw.customer_name ?? ''),
    creationDate: String(raw.creation_date ?? ''),
    deliveryDate: raw.delivery_date != null ? String(raw.delivery_date) : undefined,
    salesStatus: raw.sales_status != null ? String(raw.sales_status) : undefined,
    orderType: raw.order_type != null ? String(raw.order_type) : undefined,
    documentStatus: raw.document_status != null ? String(raw.document_status) : undefined,
    salesOrigin: raw.sales_origin != null ? String(raw.sales_origin) : undefined,
    transferStatus: raw.transfer_status != null ? String(raw.transfer_status) : undefined,
    transferDate: raw.transfer_date != null ? String(raw.transfer_date) : undefined,
    completionDate: raw.completion_date != null ? String(raw.completion_date) : undefined,
    discountPercent: raw.discount_percent != null ? String(raw.discount_percent) : undefined,
    grossAmount: raw.gross_amount != null ? String(raw.gross_amount) : undefined,
    totalAmount: raw.total_amount != null ? String(raw.total_amount) : undefined,
    deliveryName: raw.delivery_name != null ? String(raw.delivery_name) : undefined,
    deliveryAddress: raw.delivery_address != null ? String(raw.delivery_address) : undefined,
    remainingSalesFinancial: raw.remaining_sales_financial != null ? String(raw.remaining_sales_financial) : undefined,
    customerReference: raw.customer_reference != null ? String(raw.customer_reference) : undefined,
  };
}

function createSyncOrdersHandler(
  deps: SyncOrdersFactoryDeps,
  createBot: (userId: string) => { downloadOrdersPDF: (ctx: unknown) => Promise<string> },
): OperationHandler {
  return async (context, _data, userId, onProgress, signal) => {
    let stopped = false;
    signal?.addEventListener('abort', () => { stopped = true; }, { once: true });
    const bot = createBot(userId);
    const result = await syncOrders(
      {
        pool: deps.pool,
        downloadPdf: () => bot.downloadOrdersPDF(context),
        parsePdf: async (pdfPath) => {
          const raw = await deps.parsePdf(pdfPath);
          return raw.map(mapOrder);
        },
        cleanupFile: deps.cleanupFile,
      },
      userId,
      onProgress,
      () => stopped,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncOrdersHandler };
