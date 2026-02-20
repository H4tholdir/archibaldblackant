import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { syncCustomers } from '../../sync/services/customer-sync';
import type { ParsedCustomer as SyncParsedCustomer } from '../../sync/services/customer-sync';

type SyncCustomersFactoryDeps = {
  pool: DbPool;
  parsePdf: (pdfPath: string) => Promise<Array<Record<string, unknown>>>;
  cleanupFile: (filePath: string) => Promise<void>;
};

function mapCustomer(raw: Record<string, unknown>): SyncParsedCustomer {
  return {
    customerProfile: String(raw.customer_profile ?? ''),
    name: String(raw.name ?? ''),
    vatNumber: raw.vat_number != null ? String(raw.vat_number) : undefined,
    fiscalCode: raw.fiscal_code != null ? String(raw.fiscal_code) : undefined,
    sdi: raw.sdi != null ? String(raw.sdi) : undefined,
    pec: raw.pec != null ? String(raw.pec) : undefined,
    phone: raw.phone != null ? String(raw.phone) : undefined,
    mobile: raw.mobile != null ? String(raw.mobile) : undefined,
    email: raw.email != null ? String(raw.email) : undefined,
    url: raw.url != null ? String(raw.url) : undefined,
    attentionTo: raw.attention_to != null ? String(raw.attention_to) : undefined,
    street: raw.street != null ? String(raw.street) : undefined,
    logisticsAddress: raw.logistics_address != null ? String(raw.logistics_address) : undefined,
    postalCode: raw.postal_code != null ? String(raw.postal_code) : undefined,
    city: raw.city != null ? String(raw.city) : undefined,
    customerType: raw.customer_type != null ? String(raw.customer_type) : undefined,
    type: raw.type != null ? String(raw.type) : undefined,
    deliveryTerms: raw.delivery_terms != null ? String(raw.delivery_terms) : undefined,
    description: raw.description != null ? String(raw.description) : undefined,
    lastOrderDate: raw.last_order_date != null ? String(raw.last_order_date) : undefined,
    actualOrderCount: raw.actual_order_count != null ? Number(raw.actual_order_count) : undefined,
    actualSales: raw.actual_sales != null ? Number(raw.actual_sales) : undefined,
    previousOrderCount1: raw.previous_order_count_1 != null ? Number(raw.previous_order_count_1) : undefined,
    previousSales1: raw.previous_sales_1 != null ? Number(raw.previous_sales_1) : undefined,
    previousOrderCount2: raw.previous_order_count_2 != null ? Number(raw.previous_order_count_2) : undefined,
    previousSales2: raw.previous_sales_2 != null ? Number(raw.previous_sales_2) : undefined,
    externalAccountNumber: raw.external_account_number != null ? String(raw.external_account_number) : undefined,
    ourAccountNumber: raw.our_account_number != null ? String(raw.our_account_number) : undefined,
    internalId: raw.internal_id != null ? String(raw.internal_id) : undefined,
  };
}

function createSyncCustomersHandler(
  deps: SyncCustomersFactoryDeps,
  createBot: (userId: string) => { downloadCustomersPDF: (ctx: unknown) => Promise<string> },
): OperationHandler {
  return async (context, _data, userId, onProgress) => {
    const bot = createBot(userId);
    const result = await syncCustomers(
      {
        pool: deps.pool,
        downloadPdf: () => bot.downloadCustomersPDF(context),
        parsePdf: async (pdfPath) => {
          const raw = await deps.parsePdf(pdfPath);
          return raw.map(mapCustomer);
        },
        cleanupFile: deps.cleanupFile,
      },
      userId,
      onProgress,
      () => false,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncCustomersHandler };
