import type { DbPool } from '../../db/pool';
import type { OperationHandler } from '../operation-processor';
import { syncCustomers } from '../../sync/services/customer-sync';
import type { ParsedCustomer as SyncParsedCustomer } from '../../sync/services/customer-sync';
import { logger } from '../../logger';

type SyncCustomersFactoryDeps = {
  pool: DbPool;
  parsePdf: (pdfPath: string) => Promise<Array<Record<string, unknown>>>;
  cleanupFile: (filePath: string) => Promise<void>;
};

type SkipResult = { skip: true; warning: string } | { skip: false };

function shouldSkipSync(currentCount: number, parsedCount: number): SkipResult {
  if (currentCount === 0) return { skip: false };

  if (parsedCount === 0) {
    return { skip: true, warning: `Parser returned 0 customers, existing ${currentCount} preserved` };
  }

  if (currentCount > 10 && parsedCount < currentCount * 0.5) {
    return {
      skip: true,
      warning: `Customer count dropped from ${currentCount} to ${parsedCount} (>50% drop), possible incomplete PDF`,
    };
  }

  return { skip: false };
}

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

async function getCurrentCustomerCount(pool: DbPool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) FROM agents.customers WHERE user_id = $1',
    [userId],
  );
  return Number(rows[0].count);
}

async function logParserWarning(
  pool: DbPool,
  userId: string,
  warning: string,
  currentCount: number,
  parsedCount: number,
): Promise<void> {
  await pool.query(
    'INSERT INTO system.sync_events (user_id, sync_type, event_type, details) VALUES ($1, $2, $3, $4)',
    [userId, 'customers', 'parser_warning', { warning, currentCount, parsedCount }],
  );
}

function createSyncCustomersHandler(
  deps: SyncCustomersFactoryDeps,
  createBot: (userId: string) => { downloadCustomersPDF: (ctx: unknown) => Promise<string> },
): OperationHandler {
  return async (context, _data, userId, onProgress, signal) => {
    let stopped = false;
    signal?.addEventListener('abort', () => { stopped = true; }, { once: true });

    const currentCount = await getCurrentCustomerCount(deps.pool, userId);

    const bot = createBot(userId);
    onProgress(5, 'Download PDF clienti');
    const pdfPath = await bot.downloadCustomersPDF(context);

    onProgress(20, 'Lettura PDF');
    const rawParsed = await deps.parsePdf(pdfPath);
    const parsedCustomers = rawParsed.map(mapCustomer);

    const validation = shouldSkipSync(currentCount, parsedCustomers.length);
    if (validation.skip) {
      logger.warn('Customer sync skipped due to parser validation', {
        userId,
        currentCount,
        parsedCount: parsedCustomers.length,
        warning: validation.warning,
      });
      await logParserWarning(deps.pool, userId, validation.warning, currentCount, parsedCustomers.length);
      await deps.cleanupFile(pdfPath);
      return {
        success: true,
        skipped: true,
        warnings: [validation.warning],
      } as unknown as Record<string, unknown>;
    }

    const result = await syncCustomers(
      {
        pool: deps.pool,
        downloadPdf: async () => pdfPath,
        parsePdf: async () => parsedCustomers,
        cleanupFile: deps.cleanupFile,
      },
      userId,
      onProgress,
      () => stopped,
    );
    return result as unknown as Record<string, unknown>;
  };
}

export { createSyncCustomersHandler, shouldSkipSync };
