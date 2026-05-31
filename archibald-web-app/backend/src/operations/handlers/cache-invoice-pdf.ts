import type { OperationHandler } from '../operation-processor';
import type { DbPool } from '../../db/pool';

type CacheInvoicePdfData = {
  invoiceNumber: string;
};

type CacheInvoicePdfBot = {
  downloadInvoicePDF: (orderId: string, invoiceNumber: string) => Promise<Buffer>;
  setProgressCallback: (
    callback: (category: string, metadata?: Record<string, unknown>) => Promise<void>,
  ) => void;
};

type Deps = { pool: DbPool };

async function handleCacheInvoicePdf(
  bot: CacheInvoicePdfBot,
  deps: Deps,
  data: CacheInvoicePdfData,
  userId: string,
  onProgress: (progress: number, label?: string) => void,
): Promise<{ cached: boolean }> {
  bot.setProgressCallback(async (category, metadata) => {
    const progress = typeof metadata?.progress === 'number' ? metadata.progress : 50;
    onProgress(progress, category);
  });

  const { invoiceNumber } = data;
  onProgress(10, `Download PDF ${invoiceNumber}`);

  let buffer: Buffer;
  try {
    buffer = await bot.downloadInvoicePDF('', invoiceNumber);
  } catch {
    // PDF non disponibile nell'ERP (es. fattura troppo vecchia): segna come tentato
    await deps.pool.query(
      `UPDATE agents.order_invoices
       SET invoice_pdf_synced_at = NOW()
       WHERE invoice_number = $1
         AND user_id IN (SELECT id FROM agents.users WHERE id = $2)`,
      [invoiceNumber, userId],
    );
    onProgress(100, 'PDF non disponibile');
    return { cached: false };
  }

  onProgress(80, 'Salvataggio in cache DB');

  await deps.pool.query(
    `UPDATE agents.order_invoices oi
     SET invoice_pdf_data = $1, invoice_pdf_synced_at = NOW()
     FROM agents.order_records o
     WHERE oi.order_id = o.id
       AND o.user_id = $2
       AND oi.invoice_number = $3`,
    [buffer, userId, invoiceNumber],
  );

  onProgress(100, 'PDF in cache');
  return { cached: true };
}

function createCacheInvoicePdfHandler(
  createBot: (userId: string) => CacheInvoicePdfBot,
  deps: Deps,
): OperationHandler {
  return async (context, data, userId, onProgress) => {
    const bot = createBot(userId);
    const typedData = data as unknown as CacheInvoicePdfData;
    return handleCacheInvoicePdf(bot, deps, typedData, userId, onProgress);
  };
}

export {
  handleCacheInvoicePdf,
  createCacheInvoicePdfHandler,
  type CacheInvoicePdfData,
  type CacheInvoicePdfBot,
};
