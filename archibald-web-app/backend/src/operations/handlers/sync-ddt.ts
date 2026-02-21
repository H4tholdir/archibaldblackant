import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { syncDdt } from '../../sync/services/ddt-sync';
import type { ParsedDdt as SyncParsedDdt } from '../../sync/services/ddt-sync';

type SyncDdtFactoryDeps = {
  pool: DbPool;
  parsePdf: (pdfPath: string) => Promise<Array<Record<string, unknown>>>;
  cleanupFile: (filePath: string) => Promise<void>;
};

function mapDdt(raw: Record<string, unknown>): SyncParsedDdt {
  return {
    orderNumber: String(raw.order_number ?? ''),
    ddtNumber: String(raw.ddt_number ?? ''),
    ddtDeliveryDate: raw.ddt_delivery_date != null ? String(raw.ddt_delivery_date) : undefined,
    ddtId: raw.ddt_id != null ? String(raw.ddt_id) : undefined,
    ddtCustomerAccount: raw.ddt_customer_account != null ? String(raw.ddt_customer_account) : undefined,
    ddtSalesName: raw.ddt_sales_name != null ? String(raw.ddt_sales_name) : undefined,
    ddtDeliveryName: raw.ddt_delivery_name != null ? String(raw.ddt_delivery_name) : undefined,
    deliveryTerms: raw.delivery_terms != null ? String(raw.delivery_terms) : undefined,
    deliveryMethod: raw.delivery_method != null ? String(raw.delivery_method) : undefined,
    deliveryCity: raw.delivery_city != null ? String(raw.delivery_city) : undefined,
    attentionTo: raw.attention_to != null ? String(raw.attention_to) : undefined,
    ddtDeliveryAddress: raw.ddt_delivery_address != null ? String(raw.ddt_delivery_address) : undefined,
    ddtTotal: raw.ddt_total != null ? String(raw.ddt_total) : undefined,
    ddtCustomerReference: raw.ddt_customer_reference != null ? String(raw.ddt_customer_reference) : undefined,
    ddtDescription: raw.ddt_description != null ? String(raw.ddt_description) : undefined,
    trackingNumber: raw.tracking_number != null ? String(raw.tracking_number) : undefined,
    trackingUrl: raw.tracking_url != null ? String(raw.tracking_url) : undefined,
    trackingCourier: raw.tracking_courier != null ? String(raw.tracking_courier) : undefined,
  };
}

function createSyncDdtHandler(
  deps: SyncDdtFactoryDeps,
  createBot: (userId: string) => { ensureReadyWithContext: (ctx: unknown) => Promise<void>; downloadDDTPDF: (ctx: unknown) => Promise<string> },
): OperationHandler {
  return async (context, _data, userId, onProgress, signal) => {
    let stopped = false;
    signal?.addEventListener('abort', () => { stopped = true; }, { once: true });
    const bot = createBot(userId);
    await bot.ensureReadyWithContext(context);
    const result = await syncDdt(
      {
        pool: deps.pool,
        downloadPdf: () => bot.downloadDDTPDF(context),
        parsePdf: async (pdfPath) => {
          const raw = await deps.parsePdf(pdfPath);
          return raw.map(mapDdt);
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

export { createSyncDdtHandler };
